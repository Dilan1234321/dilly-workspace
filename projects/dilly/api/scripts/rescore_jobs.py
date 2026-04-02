"""
rescore_jobs.py — Rescore all active jobs with calibrated competitive S/G/B thresholds.

HOW IT WORKS
────────────
For every active internship in the database we re-derive the required Smart / Grit / Build
scores for each cohort_requirements entry.  Scores represent the COMPETITIVE minimum —
if a student meets all three they are genuinely competitive for the role, not just
"recommended."

Signal stack (applied in order, each layer adjusts the base target):

  1. Company prestige tier  → sets the overall difficulty ceiling
  2. Title seniority level  → intern/analyst vs associate vs senior vs specialist
  3. Description keywords   → GPA-gated, PhD preferred, portfolio required, etc.
  4. Cohort-specific weighting → redistributes the target across S/G/B dimensions
     so the highest-weight dimension always carries the steepest requirement.

TIER TARGETS (competitive dilly_score)
──────────────────────────────────────
  Tier 1  — Goldman, McKinsey, Google, Meta, OpenAI, Stripe, Palantir, SpaceX …
             Target ≈ 84–88  (top ~3 % of students)
  Tier 2  — Airbnb, Coinbase, Robinhood, Datadog, Figma, MongoDB, Cloudflare …
             Target ≈ 75–79  (top ~15 %)
  Tier 3  — Known mid-market: Gusto, Lattice, Toast, Braze, Carta, Klaviyo …
             Target ≈ 67–71  (top ~35 %)
  Tier 4  — Small / unknown / regional employers
             Target ≈ 59–64  (top ~55 %)

USAGE
─────
  python scripts/rescore_jobs.py [--dry-run] [--limit N]

  --dry-run : Print proposed changes without writing to DB
  --limit N : Only process first N jobs (for testing)
"""

from __future__ import annotations
import argparse, json, math, os, re, sys
from typing import Any

_HERE = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE = os.path.normpath(os.path.join(_HERE, "..", "..", "..", ".."))
if _WORKSPACE not in sys.path:
    sys.path.insert(0, _WORKSPACE)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_WORKSPACE, ".env"), override=True)
except ImportError:
    pass

import psycopg2
import psycopg2.extras

from projects.dilly.api.cohort_scoring_weights import COHORT_SCORING_WEIGHTS


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  COMPANY PRESTIGE TIERS
#     Based on: hiring selectivity, brand recognition, offer stats, Glassdoor,
#     LinkedIn data, Wall Street Oasis, Blind, Levels.fyi (April 2026 research)
# ═══════════════════════════════════════════════════════════════════════════════

# Maps company name keywords → tier integer 1–4.
# Matching is case-insensitive substring.  Earlier entries win.
_COMPANY_TIER_RULES: list[tuple[str, int]] = [
    # ── Tier 1: Elite / FAANG / Bulge-bracket / MBB ────────────────────────
    ("Goldman Sachs",           1),
    ("McKinsey",                1),
    ("Bain",                    1),
    ("BCG",                     1),
    ("Boston Consulting",       1),
    ("Oliver Wyman",            1),
    ("Deloitte S&O",            1),
    ("Google",                  1),
    ("Alphabet",                1),
    ("Meta",                    1),
    ("Apple",                   1),
    ("Microsoft",               1),
    ("Amazon",                  1),   # AWS / Prime / HQ
    ("OpenAI",                  1),
    ("Anthropic",               1),
    ("Stripe",                  1),
    ("Palantir",                1),
    ("SpaceX",                  1),
    ("Citadel",                 1),
    ("Jane Street",             1),
    ("DE Shaw",                 1),
    ("Two Sigma",               1),
    ("Renaissance",             1),
    ("Bridgewater",             1),
    ("Morgan Stanley",          1),
    ("J.P. Morgan",             1),
    ("JPMorgan",                1),
    ("BlackRock",               1),
    ("Visa",                    1),   # flagship program highly selective
    ("Mastercard",              1),
    ("Nvidia",                  1),
    ("Tesla",                   1),
    ("Scale AI",                1),
    ("Figma",                   1),
    ("Notion",                  1),
    ("Databricks",              1),
    ("Snowflake",               1),
    ("Mistral AI",              1),

    # ── Tier 2: Strong brands / high-quality unicorns ───────────────────────
    ("Airbnb",                  2),
    ("DoorDash",                2),
    ("Lyft",                    2),
    ("Robinhood",               2),
    ("Coinbase",                2),
    ("Brex",                    2),
    ("Chime",                   2),
    ("Datadog",                 2),
    ("MongoDB",                 2),
    ("Cloudflare",              2),
    ("Okta",                    2),
    ("Twilio",                  2),
    ("Discord",                 2),
    ("Reddit",                  2),
    ("Roblox",                  2),
    ("Riot Games",              2),
    ("Block",                   2),
    ("Square",                  2),
    ("SoFi",                    2),
    ("Carta",                   2),
    ("Betterment",              2),
    ("Affirm",                  2),
    ("Marqeta",                 2),
    ("Mercury",                 2),
    ("Vercel",                  2),
    ("GitLab",                  2),
    ("Grammarly",               2),
    ("Asana",                   2),
    ("Airtable",                2),
    ("Amplitude",               2),
    ("Mixpanel",                2),
    ("Qualtrics",               2),
    ("Intercom",                2),
    ("Braze",                   2),
    ("Klaviyo",                 2),
    ("Sprout Social",           2),
    ("Toast",                   2),
    ("Samsara",                 2),
    ("Verkada",                 2),
    ("Elastic",                 2),
    ("Webflow",                 2),
    ("Dropbox",                 2),
    ("Squarespace",             2),
    ("Duolingo",                2),
    ("Lucid Motors",            2),
    ("Archer Aviation",         2),
    ("Nuro",                    2),
    ("Ginkgo Bioworks",         2),
    ("10x Genomics",            2),
    ("Natera",                  2),
    ("Twist Bioscience",        2),
    ("Velo3D",                  2),
    ("Kaiser Permanente",       2),
    ("Mayo Clinic",             2),
    ("Zocdoc",                  2),
    ("Ro",                      2),
    ("Modern Health",           2),
    ("Collective Health",       2),
    ("One Medical",             2),
    ("Coursera",                2),
    ("Khan Academy",            2),
    ("Duolingo",                2),
    ("Clever",                  2),
    ("2U",                      2),
    ("Newsela",                 2),
    ("Govini",                  2),
    ("Common Cause",            2),
    ("Clearway Energy",         2),
    ("Opendoor",                2),
    ("Everlane",                2),
    ("Sweetgreen",              2),
    ("Justworks",               2),
    ("Gusto",                   2),
    ("Lattice",                 2),
    ("Hootsuite",               2),
    ("Kabam",                   2),

    # ── Tier 3 and 4 fall through to default ───────────────────────────────
]

# Canonical cohort label → key in COHORT_SCORING_WEIGHTS
_LABEL_TO_KEY: dict[str, str] = {
    v["label"]: k for k, v in COHORT_SCORING_WEIGHTS.items()
    if "label" in v
}


def _company_tier(company_name: str) -> int:
    """Return prestige tier 1–4 for a company name."""
    cn = (company_name or "").strip()
    for keyword, tier in _COMPANY_TIER_RULES:
        if keyword.lower() in cn.lower():
            return tier
    return 3   # default: known but not in explicit list


# ── Tier → base competitive dilly_score ────────────────────────────────────────
_TIER_BASE: dict[int, int] = {
    1: 86,   # Goldman / Google / Stripe — very hard to get
    2: 76,   # Airbnb / Robinhood / Coinbase — competitive
    3: 68,   # Mid-market / regional / smaller known brands
    4: 60,   # Small / unknown
}


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  TITLE SENIORITY ADJUSTMENT
# ═══════════════════════════════════════════════════════════════════════════════

def _title_adjustment(title: str) -> int:
    """
    Return ±points added to the base target based on title seniority.
    Negative = easier than reference employer (entry/intern).
    Positive = harder (senior/lead roles students rarely get).
    """
    t = (title or "").lower()

    # Senior / Staff / Principal / Lead / Director
    if re.search(r'\b(director|principal|staff engineer|staff developer|head of)\b', t):
        return +10
    if re.search(r'\b(senior|lead|sr\.)\b', t):
        return +6

    # Intern / Co-op / Part-time → lower bar (you're being trained)
    if re.search(r'\b(intern|co-op|coop|summer analyst|summer associate)\b', t):
        return -8

    # Entry-level / New grad signals
    if re.search(r'\b(associate|entry.level|new grad|graduate|analyst i\b|engineer i\b|developer i\b)\b', t):
        return -4

    # Analyst / Engineer (un-leveled) — reference level
    return 0


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  DESCRIPTION KEYWORD ADJUSTMENTS
# ═══════════════════════════════════════════════════════════════════════════════

def _desc_adjustment(desc: str | None, title: str) -> tuple[int, int, int]:
    """
    Return (delta_smart, delta_grit, delta_build) based on job description signals.
    Each delta is in score points.
    """
    text = ((desc or "") + " " + (title or "")).lower()

    ds = dg = db = 0

    # Strong academic signals → harder Smart requirement
    if re.search(r'\bphd\b|\bdoctorate\b|\bgraduate degree\b', text):
        ds += 8
    if re.search(r'\bgpa\s*(of\s*)?(3\.5|3\.6|3\.7|3\.8|3\.9|4\.0)\b', text):
        ds += 5
    elif re.search(r'\bgpa\s*(of\s*)?(3\.3|3\.4)\b', text):
        ds += 3
    elif re.search(r'\bstrong\s+gpa\b|\bhigh\s+gpa\b', text):
        ds += 3
    if re.search(r'\bms\s+in\b|\bmasters\s+in\b', text):
        ds += 4
    if re.search(r'\bcompetitive programming\b|\bleetcode\b|\bhackerrank\b', text):
        ds += 4
    if re.search(r'\bseries\s+[67]\b|\bcfa\b|\bcpa\b|\bcfra\b|\bcfa\s+candidate\b', text):
        ds += 5

    # Persistence / leadership signals → harder Grit requirement
    if re.search(r'\bleadership\s+experience\b|\bproven\s+track\s+record\b', text):
        dg += 4
    if re.search(r'\bmanage\s+(a\s+)?team\b|\bpeople\s+management\b|\bmanaging\s+team\b', text):
        dg += 5
    if re.search(r'\b[23]\+\s+years?\b|\bthree\s+or\s+more\s+years\b', text):
        dg += 5
    if re.search(r'\bhigh-?growth\b|\bfast-?paced\b|\bstartup\b', text):
        dg += 3
    if re.search(r'\bself-?starter\b|\bautonomous\b|\bwithout\s+supervision\b', text):
        dg += 3

    # Portfolio / shipped-work signals → harder Build requirement
    if re.search(r'\bportfolio\b|\bcase\s+stud(y|ies)\b', text):
        db += 6
    if re.search(r'\bgithub\b|\bopen.?source\s+contrib', text):
        db += 5
    if re.search(r'\bproduction\s+(system|environment|deployment)\b', text):
        db += 4
    if re.search(r'\bsystem\s+design\b|\bscalable\s+(system|architecture)\b', text):
        db += 4
    if re.search(r'\bclinical\s+(experience|hours|rotation)\b|\bpracticum\b', text):
        db += 5

    # Cap deltas to reasonable ranges
    ds = min(ds, 12)
    dg = min(dg, 10)
    db = min(db, 12)

    return ds, dg, db


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  CORE SCORING FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════

def _compute_sgb(
    cohort_label: str,
    company_name: str,
    title: str,
    description: str | None,
) -> tuple[int, int, int]:
    """
    Return (required_smart, required_grit, required_build) for this job+cohort.

    Algorithm:
      1. Locate cohort config (weights + recruiter_bar)
      2. Determine company tier → base target score
      3. Add title seniority adjustment
      4. Add description keyword adjustments (per-dimension)
      5. Redistribute total across S/G/B using cohort weights + spread factor
    """
    # ── Find cohort config ─────────────────────────────────────────────────
    key = _LABEL_TO_KEY.get(cohort_label)
    if key is None:
        # Soft match on label substring
        for k, v in COHORT_SCORING_WEIGHTS.items():
            if cohort_label.lower() in (v.get("label") or "").lower():
                key = k
                break
    if key is None:
        # Fallback: use generic 33/33/34 weights
        cfg = {"smart": 33, "grit": 33, "build": 34, "recruiter_bar": 70}
    else:
        cfg = COHORT_SCORING_WEIGHTS[key]

    w_s = cfg.get("smart", 33)
    w_g = cfg.get("grit", 33)
    w_b = cfg.get("build", 34)
    recruiter_bar = cfg.get("recruiter_bar", 70)

    # ── Base target: whichever is higher — tier base OR recruiter_bar ──────
    tier = _company_tier(company_name)
    tier_base = _TIER_BASE[tier]
    base = max(tier_base, recruiter_bar - 5)  # recruiter_bar is already "competitive"

    # ── Title seniority ────────────────────────────────────────────────────
    base += _title_adjustment(title)

    # ── Dimension deltas from description ─────────────────────────────────
    ds, dg, db = _desc_adjustment(description, title)

    # ── Distribute base across S/G/B using cohort weight spread ───────────
    #   Dimension with higher weight → slightly higher threshold
    #   We use: required_d = base + (w_d - mean_w) * spread
    mean_w = (w_s + w_g + w_b) / 3.0  # always ~33.3
    spread = 0.55   # how strongly weights pull each dimension

    raw_s = base + (w_s - mean_w) * spread + ds
    raw_g = base + (w_g - mean_w) * spread + dg
    raw_b = base + (w_b - mean_w) * spread + db

    # Clamp to sensible range [45, 95]
    def _clamp(x: float) -> int:
        return max(45, min(95, round(x)))

    return _clamp(raw_s), _clamp(raw_g), _clamp(raw_b)


# ═══════════════════════════════════════════════════════════════════════════════
# 5.  DB HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _get_db():
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try:
            pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except Exception:
            pass
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
        database="dilly", user="dilly_admin", password=pw, sslmode="require",
    )


def _load_jobs(cur, limit: int | None) -> list[dict]:
    sql = """
        SELECT i.id, i.title, i.description, i.cohort_requirements,
               c.name AS company_name
        FROM internships i
        JOIN companies c ON c.id = i.company_id
        WHERE i.status = 'active'
          AND i.cohort_requirements IS NOT NULL
          AND jsonb_array_length(i.cohort_requirements) > 0
        ORDER BY i.id
    """
    if limit:
        sql += f" LIMIT {int(limit)}"
    cur.execute(sql)
    return cur.fetchall()


# ═══════════════════════════════════════════════════════════════════════════════
# 6.  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Rescore all active job S/G/B requirements")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing to DB")
    parser.add_argument("--limit", type=int, default=None, help="Process only N jobs")
    parser.add_argument("--verbose", action="store_true", help="Print every job's new scores")
    args = parser.parse_args()

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print("Loading jobs …")
    jobs = _load_jobs(cur, args.limit)
    print(f"Loaded {len(jobs)} jobs with cohort_requirements.")

    updates: list[tuple[str, list]] = []  # (job_id, new_cohort_requirements)

    for job in jobs:
        jid        = job["id"]
        title      = job["title"] or ""
        desc       = job["description"]
        company    = job["company_name"] or ""
        old_reqs   = job["cohort_requirements"] or []

        new_reqs = []
        for req in old_reqs:
            cohort_label = req.get("cohort", "")
            if not cohort_label:
                new_reqs.append(req)
                continue

            s, g, b = _compute_sgb(cohort_label, company, title, desc)
            new_reqs.append({
                "cohort": cohort_label,
                "smart":  s,
                "grit":   g,
                "build":  b,
            })

        updates.append((jid, new_reqs))

        if args.verbose:
            tier = _company_tier(company)
            print(f"\n[T{tier}] {company} — {title}")
            for old, new in zip(old_reqs, new_reqs):
                c = old.get("cohort", "?")
                print(f"  {c:<40}  "
                      f"S:{old.get('smart'):>3}→{new['smart']:>3}  "
                      f"G:{old.get('grit'):>3}→{new['grit']:>3}  "
                      f"B:{old.get('build'):>3}→{new['build']:>3}")

    if args.dry_run:
        print(f"\n[DRY RUN] Would update {len(updates)} jobs. Pass without --dry-run to commit.")
        # Show a sample
        print("\nSample (first 5):")
        for jid, reqs in updates[:5]:
            print(f"  {jid}: {json.dumps(reqs)}")
        return

    print(f"\nWriting {len(updates)} updates to DB …")
    written = 0
    for jid, new_reqs in updates:
        cur.execute(
            "UPDATE internships SET cohort_requirements = %s WHERE id = %s",
            (json.dumps(new_reqs), jid),
        )
        written += 1
        if written % 100 == 0:
            conn.commit()
            print(f"  … {written}/{len(updates)} committed")

    conn.commit()
    print(f"\nDone — rescored {written} jobs.")

    # ── Summary stats ──────────────────────────────────────────────────────
    cur.execute("""
        SELECT cr->>'cohort' as cohort,
               AVG((cr->>'smart')::float) as avg_smart,
               AVG((cr->>'grit')::float)  as avg_grit,
               AVG((cr->>'build')::float) as avg_build,
               COUNT(*) as n
        FROM internships i, jsonb_array_elements(cohort_requirements) cr
        WHERE i.status = 'active' AND cohort_requirements IS NOT NULL
        GROUP BY cr->>'cohort'
        ORDER BY n DESC
        LIMIT 25
    """)
    rows = cur.fetchall()
    print("\n── Post-rescore averages ─────────────────────────────────────────────")
    print(f"{'Cohort':<42} {'S':>6} {'G':>6} {'B':>6} {'n':>6}")
    print("─" * 68)
    for r in rows:
        print(f"{r['cohort']:<42} {r['avg_smart']:>6.1f} {r['avg_grit']:>6.1f} {r['avg_build']:>6.1f} {r['n']:>6}")

    conn.close()


if __name__ == "__main__":
    main()
