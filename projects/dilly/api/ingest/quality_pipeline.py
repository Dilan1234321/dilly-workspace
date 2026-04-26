"""
Ingest quality pipeline.

Four passes over the `internships` table that together make the feed
feel clean without shrinking it artificially:

  1. Fingerprint dedup — collapses the same job ingested from multiple
     sources (Greenhouse + The Muse, etc.) into one row.
  2. Stale pruning — marks anything posted_date > 45 days ago as
     status='expired', excluded from the feed but kept for backfill.
  3. Spam filter — drops obvious MLM / "earn $5k/week" junk.
  4. Level classifier sweep — populates job_type='other' rows that
     were ingested before the classifier landed on that source, so
     the mobile filter chips work consistently across the feed.

Runs in ~30-60s on a 100k-row table. Idempotent — safe to re-run.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime, timedelta, timezone

import psycopg2

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────

def _get_db():
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try:
            pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except Exception:
            pass
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
        database="dilly",
        user="dilly_admin",
        password=pw,
        sslmode="require",
    )


def _ensure_fingerprint_column(conn) -> None:
    """Idempotently add the fingerprint column + index."""
    with conn.cursor() as cur:
        cur.execute("ALTER TABLE internships ADD COLUMN IF NOT EXISTS fingerprint TEXT")
        cur.execute(
            "CREATE INDEX IF NOT EXISTS idx_internships_fingerprint ON internships (fingerprint) WHERE status = 'active'"
        )
    conn.commit()


def _compute_fingerprint(company: str, title: str, apply_url: str) -> str:
    """Stable hash of (lowercased company, lowercased title, url host path).
    Same role posted to multiple ATS systems hashes the same."""
    host = ""
    if apply_url:
        try:
            from urllib.parse import urlparse
            p = urlparse(apply_url if "://" in apply_url else f"https://{apply_url}")
            host = (p.netloc or "").lower().lstrip("www.")
        except Exception:
            pass
    blob = "|".join([
        (company or "").strip().lower(),
        re.sub(r"\s+", " ", (title or "").strip().lower()),
        host,
    ])
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


# ──────────────────────────────────────────────────────────────────────
# Pass 1 — fingerprint dedup
# ──────────────────────────────────────────────────────────────────────

def pass_fingerprint_dedup(conn) -> dict:
    """For each active row: compute fingerprint, then for every group
    with >1 rows, keep the newest (latest posted_date / created_at) and
    mark the rest status='superseded'. The feed filters status='active'
    so superseded rows vanish; they stay in the DB for auditing."""
    _ensure_fingerprint_column(conn)
    stats = {"backfilled": 0, "groups_merged": 0, "rows_superseded": 0}

    # Backfill: every active row without a fingerprint gets one.
    with conn.cursor() as cur:
        cur.execute(
            "SELECT i.id, i.title, i.apply_url, c.name "
            "FROM internships i JOIN companies c ON i.company_id = c.id "
            "WHERE i.status = 'active' AND (i.fingerprint IS NULL OR i.fingerprint = '')"
        )
        rows = cur.fetchall()
    for rid, title, apply_url, company in rows:
        fp = _compute_fingerprint(company or "", title or "", apply_url or "")
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE internships SET fingerprint = %s WHERE id = %s",
                (fp, rid),
            )
        stats["backfilled"] += 1
    conn.commit()

    # Dedup: within each fingerprint group, keep the newest.
    with conn.cursor() as cur:
        cur.execute(
            """
            WITH ranked AS (
                SELECT
                    id,
                    fingerprint,
                    ROW_NUMBER() OVER (
                        PARTITION BY fingerprint
                        ORDER BY
                            CASE WHEN posted_date IS NOT NULL AND posted_date != ''
                                 THEN posted_date ELSE '1970-01-01' END DESC,
                            created_at DESC
                    ) AS rn,
                    COUNT(*) OVER (PARTITION BY fingerprint) AS grp_size
                FROM internships
                WHERE status = 'active' AND fingerprint IS NOT NULL AND fingerprint != ''
            )
            UPDATE internships i
            SET status = 'superseded', updated_at = now()
            FROM ranked r
            WHERE i.id = r.id AND r.rn > 1 AND r.grp_size > 1
            """
        )
        stats["rows_superseded"] = cur.rowcount
        # Count distinct groups that had >1 members
        cur.execute(
            """
            SELECT COUNT(*) FROM (
                SELECT fingerprint FROM internships
                WHERE status IN ('active', 'superseded')
                  AND fingerprint IS NOT NULL AND fingerprint != ''
                GROUP BY fingerprint HAVING COUNT(*) > 1
            ) sub
            """
        )
        stats["groups_merged"] = int(cur.fetchone()[0])
    conn.commit()
    return stats


# ──────────────────────────────────────────────────────────────────────
# Pass 2 — stale pruning
# ──────────────────────────────────────────────────────────────────────

def pass_stale_prune(conn, max_age_days: int = 45) -> dict:
    """Mark anything posted_date older than max_age_days as
    status='expired'. Rows without a posted_date but created_at older
    than 2x max_age_days also get expired — most untagged-date rows
    came from very old crawl runs."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).date().isoformat()
    created_cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days * 2)).isoformat()
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE internships
            SET status = 'expired', updated_at = now()
            WHERE status = 'active'
              AND posted_date IS NOT NULL AND posted_date != ''
              AND posted_date < %s
            """,
            (cutoff,),
        )
        by_posted = cur.rowcount
        cur.execute(
            """
            UPDATE internships
            SET status = 'expired', updated_at = now()
            WHERE status = 'active'
              AND (posted_date IS NULL OR posted_date = '')
              AND created_at < %s
            """,
            (created_cutoff,),
        )
        by_created = cur.rowcount
    conn.commit()
    return {
        "expired_by_posted_date": by_posted,
        "expired_by_created_at": by_created,
        "cutoff_posted_date": cutoff,
        "cutoff_created_at": created_cutoff,
    }


# ──────────────────────────────────────────────────────────────────────
# Pass 3 — spam filter
# ──────────────────────────────────────────────────────────────────────

_SPAM_PATTERNS = [
    re.compile(r"\bmlm\b", re.I),
    re.compile(r"\bmake\s+\$?\d{3,}[kK]?\s+per\s+(?:day|week|month)", re.I),
    re.compile(r"\bearn\s+\$?\d{3,}[kK]?\s+(?:weekly|monthly|per)", re.I),
    re.compile(r"\bwork\s+from\s+home.*(?:earn|cash|profit|income)", re.I),
    re.compile(r"\bpyramid\s+scheme\b", re.I),
    re.compile(r"\bbitcoin\s+trading\s+assistant\b", re.I),
    re.compile(r"\bcrypto.*\bassistant\b.*\bwhatsapp\b", re.I),
    re.compile(r"\bno\s+experience.*\$\d{4,}.*(?:week|month)", re.I),
    re.compile(r"\bunlimited\s+earning\s+potential\b", re.I),
    re.compile(r"\bget\s+paid\s+to\s+(?:post|type|click)\b", re.I),
]


def pass_spam_filter(conn) -> dict:
    """Mark jobs matching any spam pattern as status='spam'. These
    won't resurface if they're re-ingested — the spam classification
    is recomputed on each sweep."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, title, description FROM internships WHERE status = 'active'"
        )
        rows = cur.fetchall()

    spam_ids: list[str] = []
    for rid, title, desc in rows:
        blob = (title or "") + " " + ((desc or "")[:2000])
        if any(p.search(blob) for p in _SPAM_PATTERNS):
            spam_ids.append(rid)

    if spam_ids:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE internships SET status = 'spam', updated_at = now() WHERE id = ANY(%s)",
                (spam_ids,),
            )
        conn.commit()

    return {"scanned": len(rows), "flagged": len(spam_ids)}


# ──────────────────────────────────────────────────────────────────────
# Pass 4 — level classifier sweep
# ──────────────────────────────────────────────────────────────────────

# Matches internship signals — title-first, then description fallback.
# Finance-specific: "Summer Analyst", "Summer Associate" are internships.
# Healthcare: "extern" / "externship" = short-term clinical placement.
# Year-prefix variants: "2025 Summer Analyst", "Summer 2025 Associate".
_INTERN_TITLE_RX = re.compile(
    r"\b(intern(?:ship)?|co-?op|extern(?:ship)?|"
    r"summer\s+(?:analyst|associate|fellow|engineer|swe|"
    r"scholar|researcher|student|program)|"
    r"apprentice(?!\s+electrician)|trainee|"
    r"rotational\s+program|rotational\s+analyst)\b",
    re.I,
)
# "Summer Teaching Fellow", "Summer Policy Analyst" — 'summer' anywhere in
# title followed by a typical intern-role word, with optional words between.
_INTERN_SUMMER_TITLE_RX = re.compile(
    r"\bsummer\b.{0,40}\b(fellow|analyst|associate|engineer|researcher|scholar|intern)\b",
    re.I,
)
_INTERN_YEAR_RX = re.compile(
    r"\b(20\d{2}\s+summer\s+(?:analyst|associate|engineer|swe|fellow|intern)|"
    r"summer\s+20\d{2}\s+(?:analyst|associate|engineer|swe|fellow|intern))\b",
    re.I,
)
# Executive / leadership — hard disqualifier for internship or entry-level
_EXEC_RX = re.compile(
    r"\b(managing\s+director|managing\s+partner|director|vice\s+president|"
    r"head\s+of|chief|svp|evp|c-?suite|president(?!\s+club)|partner(?!\s+program))\b",
    re.I,
)
# Senior individual-contributor — disqualifier for internship; maps to full_time
_SENIOR_RX = re.compile(
    r"\b(senior|sr\.?\s|lead(?!\s+generation)|staff\b|principal\b)\b",
    re.I,
)
_ENTRY_RX = re.compile(
    r"\b(new\s*grad(?:uate)?|entry[\s-]?level|junior|jr\.?\s|"
    r"associate(?!\s+(?:director|vp|professor|dean))|"
    r"graduate\s+(?:engineer|analyst|program|hire|rotational)|"
    r"early\s+career|analyst\s+i\b|engineer\s+i\b|level\s+1\b)\b",
    re.I,
)
_PARTTIME_RX = re.compile(r"\bpart[\s-]?time\b", re.I)


def _classify(title: str, description: str) -> str:
    title = title or ""
    tl = title.lower()

    # Exec titles are always full_time — check title only to avoid false
    # positives from descriptions ("reports to the Director of...").
    if _EXEC_RX.search(tl):
        return "full_time"

    # Senior IC signals in title → full_time (before checking intern so
    # "Senior Intern Program Manager" doesn't slip through as internship).
    if _SENIOR_RX.search(tl):
        return "full_time"

    # Internship — title wins over description to prevent sentences like
    # "manage our intern class" from tagging a Director role as internship.
    if _INTERN_TITLE_RX.search(tl) or _INTERN_YEAR_RX.search(tl) or _INTERN_SUMMER_TITLE_RX.search(tl):
        return "internship"

    # Part-time before we check description-level signals
    if _PARTTIME_RX.search(tl):
        return "part_time"

    # Description-level exec/senior guard (rare: "Vice President" buried
    # in first 400 chars of a job that has a vague title like "Analyst").
    desc_snippet = (description or "")[:400].lower()
    if _EXEC_RX.search(desc_snippet) and not _ENTRY_RX.search(tl):
        return "full_time"

    # Entry-level signals in title or first 400 chars of description
    blob = tl + " " + desc_snippet
    if _ENTRY_RX.search(blob):
        return "entry_level"

    # Experience-years heuristic in description
    exp = re.search(r"(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)", blob)
    if exp:
        years = int(exp.group(1))
        if years >= 5:
            return "full_time"
        if years <= 2:
            return "entry_level"

    return "full_time"


def pass_reclassify_levels(conn) -> dict:
    """Populate job_type for any row where it's NULL or 'other'. Leaves
    already-classified rows alone so a bad regex run doesn't wipe
    correct upstream tags."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, title, description FROM internships "
            "WHERE status = 'active' AND (job_type IS NULL OR job_type = 'other' OR job_type = '')"
        )
        rows = cur.fetchall()

    updated = 0
    for rid, title, desc in rows:
        new_type = _classify(title or "", desc or "")
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE internships SET job_type = %s, updated_at = now() WHERE id = %s",
                (new_type, rid),
            )
        updated += 1

    conn.commit()
    return {"scanned": len(rows), "updated": updated}


def pass_reclassify_all_levels(conn) -> dict:
    """Re-classify job_type for ALL active rows using the current rules.
    Unlike pass_reclassify_levels which only fills NULL/other rows, this
    overwrites every active row — intended for backfills after classifier
    improvements. Returns before/after distribution counts."""
    with conn.cursor() as cur:
        # Before distribution
        cur.execute(
            "SELECT job_type, COUNT(*) FROM internships WHERE status='active' GROUP BY job_type"
        )
        before = {(row[0] or "null"): int(row[1]) for row in cur.fetchall()}

        cur.execute("SELECT id, title, description FROM internships WHERE status='active'")
        rows = cur.fetchall()

    buckets: dict[str, int] = {"internship": 0, "entry_level": 0, "full_time": 0, "part_time": 0}
    changed = 0
    for rid, title, desc in rows:
        new_type = _classify(title or "", desc or "")
        buckets[new_type] = buckets.get(new_type, 0) + 1
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE internships SET job_type=%s, updated_at=now() WHERE id=%s AND job_type IS DISTINCT FROM %s",
                (new_type, rid, new_type),
            )
            changed += cur.rowcount

    conn.commit()
    return {"scanned": len(rows), "changed": changed, "before": before, "after": buckets}


# ──────────────────────────────────────────────────────────────────────
# Runner
# ──────────────────────────────────────────────────────────────────────

def run_all() -> dict:
    """Execute all four passes. Returns per-pass stats + active count."""
    conn = _get_db()
    try:
        dedup = pass_fingerprint_dedup(conn)
        stale = pass_stale_prune(conn)
        spam = pass_spam_filter(conn)
        reclass = pass_reclassify_levels(conn)
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM internships WHERE status = 'active'")
            active = int(cur.fetchone()[0] or 0)
        return {
            "dedup": dedup,
            "stale": stale,
            "spam": spam,
            "reclassify": reclass,
            "active_count_after": active,
        }
    finally:
        conn.close()
