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

_INTERN_RX = re.compile(r"\b(intern(?:ship)?|co-?op|summer\s+20\d{2}\s+(?:swe|engineer|analyst))\b", re.I)
_ENTRY_RX = re.compile(r"\b(new\s*grad(?:uate)?|entry[\s-]?level|junior|associate(?!\s+(?:director|vp))|graduate\s+(?:engineer|analyst|program))\b", re.I)
_SENIOR_RX = re.compile(r"\b(senior|staff|principal|lead(?!\s+generation)|head\s+of|director|vp|vice\s+president)\b", re.I)
_PARTTIME_RX = re.compile(r"\bpart[\s-]?time\b", re.I)


def _classify(title: str, description: str) -> str:
    blob = (title + " " + (description or "")[:800]).lower()
    if _INTERN_RX.search(blob):
        return "internship"
    if _PARTTIME_RX.search(blob):
        return "part_time"
    if _SENIOR_RX.search(title or ""):
        return "full_time"
    if _ENTRY_RX.search(blob):
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
