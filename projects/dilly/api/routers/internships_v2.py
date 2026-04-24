"""
Internships v2 — Serves personalized internship feed from PostgreSQL.
Uses multi-cohort matching with S/G/B readiness scoring.

GET  /v2/internships/feed      — personalized feed for the signed-in student
GET  /v2/internships/{id}      — single internship detail with readiness breakdown
GET  /v2/internships/stats     — student's match stats (ready/almost/gap counts)
POST /v2/internships/dismiss   — dismiss a listing from feed
POST /v2/internships/save      — save to application tracker

Fallback behaviour
──────────────────
When a student has no row in `students` (new user) the endpoint auto-upserts
a minimal record from the file-based profile store so every authenticated
user can see jobs immediately.

When `match_scores` has no rows for the student (scores not yet pre-computed)
the feed falls back to on-the-fly scoring: it compares the student's S/G/B
directly against `internships.required_smart/grit/build` in SQL.  This is
slightly less rich than pre-computed scores (no cohort_readiness breakdown)
but it always shows *something*.
"""
import os, sys, json, re, uuid as _uuid

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE not in sys.path:
    sys.path.insert(0, _WORKSPACE)

from fastapi import APIRouter, Request, Query, HTTPException
from typing import Optional
import psycopg2
import psycopg2.extras

from projects.dilly.api import deps

router = APIRouter(tags=["internships"])


# Max listings from a single company in one feed response.
# Without this cap, Stripe (~300 open roles) and Figma (~100) dominate
# the top of every user's feed and crowd out every other employer.
# We sort by rank_score first, then walk the list keeping only the
# first N per company — preserves relative ranking while guaranteeing
# variety.
MAX_PER_COMPANY_PER_PAGE = 3


def _cap_per_company(listings: list, max_each: int = MAX_PER_COMPANY_PER_PAGE) -> list:
    """Return a new list with at most `max_each` entries per company
    name. Input order is preserved — so upstream rank remains intact
    for the entries that survive the cap.
    """
    seen: dict[str, int] = {}
    out: list = []
    for row in listings:
        company = str(row.get("company") or row.get("company_name") or "").strip().lower()
        if not company:
            out.append(row)
            continue
        count = seen.get(company, 0)
        if count >= max_each:
            continue
        seen[company] = count + 1
        out.append(row)
    return out


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


# ── Student auto-upsert ────────────────────────────────────────

def _ensure_student(email: str, cur, conn) -> str | None:
    """
    Return the student's PG id, creating the row from file-based profile if needed.
    Returns None if the profile doesn't exist at all.
    """
    cur.execute("SELECT id FROM students WHERE LOWER(email) = LOWER(%s)", (email,))
    row = cur.fetchone()
    if row:
        return row["id"]

    # Load from file store
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists
        from projects.dilly.api.audit_history import get_audits
        p = ensure_profile_exists(email)
    except Exception:
        return None

    # Pull scores from audit_history if not on profile
    smart = p.get("overall_smart")
    grit  = p.get("overall_grit")
    build = p.get("overall_build")
    dilly = p.get("overall_dilly_score")
    if not dilly:
        try:
            audits = get_audits(email)
            if audits:
                latest = audits[-1]
                sc = latest.get("scores") or {}
                smart = smart or sc.get("smart")
                grit  = grit  or sc.get("grit")
                build = build or sc.get("build")
                dilly = dilly or latest.get("final_score")
        except Exception:
            pass

    sid = str(_uuid.uuid4())
    majors = p.get("majors") or ([p["major"]] if p.get("major") else [])
    minors = p.get("minors") or []

    try:
        cur.execute("""
            INSERT INTO students (
                id, email, name, school_id, major, majors, minors,
                track, cohort, profile_status, onboarding_complete,
                smart_score, grit_score, build_score, dilly_score,
                overall_smart, overall_grit, overall_build, overall_dilly_score
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s
            )
            ON CONFLICT (email) DO UPDATE SET
                name = EXCLUDED.name,
                school_id = EXCLUDED.school_id,
                major = EXCLUDED.major,
                majors = EXCLUDED.majors,
                minors = EXCLUDED.minors,
                track = EXCLUDED.track,
                cohort = EXCLUDED.cohort,
                smart_score = EXCLUDED.smart_score,
                grit_score  = EXCLUDED.grit_score,
                build_score = EXCLUDED.build_score,
                dilly_score = EXCLUDED.dilly_score,
                overall_smart = EXCLUDED.overall_smart,
                overall_grit  = EXCLUDED.overall_grit,
                overall_build = EXCLUDED.overall_build,
                overall_dilly_score = EXCLUDED.overall_dilly_score,
                updated_at = now()
            RETURNING id
        """, (
            sid, email,
            p.get("name"),
            p.get("school_id") or p.get("schoolId"),
            majors[0] if majors else None,
            json.dumps(majors),
            json.dumps(minors),
            p.get("track"),
            p.get("cohort"),
            p.get("profileStatus") or p.get("profile_status") or "active",
            bool(p.get("onboarding_complete")),
            float(smart) if smart is not None else None,
            float(grit)  if grit  is not None else None,
            float(build) if build is not None else None,
            float(dilly) if dilly is not None else None,
            float(smart) if smart is not None else None,
            float(grit)  if grit  is not None else None,
            float(build) if build is not None else None,
            float(dilly) if dilly is not None else None,
        ))
        conn.commit()
        inserted = cur.fetchone()
        return inserted["id"] if inserted else sid
    except Exception:
        conn.rollback()
        # Re-fetch in case another request beat us to the upsert
        cur.execute("SELECT id FROM students WHERE LOWER(email) = LOWER(%s)", (email,))
        row = cur.fetchone()
        return row["id"] if row else None


# ── On-the-fly readiness scoring ───────────────────────────────

def _readiness(student_smart, student_grit, student_build,
               req_smart, req_grit, req_build) -> str:
    """
    Determine readiness without pre-computed match_scores.
    ready  — meets every non-null requirement
    almost — misses 1 dimension by ≤ 15 pts, or all nulls
    gap    — misses 2+ dimensions or by > 15 pts
    """
    s = float(student_smart or 0)
    g = float(student_grit  or 0)
    b = float(student_build or 0)
    rs = float(req_smart or 0)
    rg = float(req_grit  or 0)
    rb = float(req_build or 0)

    # if no requirements set → always "almost" (interesting but unverified)
    if rs == 0 and rg == 0 and rb == 0:
        return "almost"

    gaps = []
    if rs > 0 and s < rs: gaps.append(rs - s)
    if rg > 0 and g < rg: gaps.append(rg - g)
    if rb > 0 and b < rb: gaps.append(rb - b)

    if not gaps:
        return "ready"
    if len(gaps) == 1 and gaps[0] <= 15:
        return "almost"
    return "gap"


def _rank_score(student_smart, student_grit, student_build,
                req_smart, req_grit, req_build, quality_score,
                profile_boost: float = 0.0, has_audit: bool = True) -> float:
    """Compute a per-job rank score for a user.

    The Smart/Grit/Build audit has been removed from the product.
    Ranking is now a pure function of two signals:

      1. profile_boost (0-100): how well the posting matches the user's
         EXPRESSED preferences — target companies, goals, skills,
         preferred locations. Derived from profile facts.
      2. quality_score (0-100): per-job quality signal set at ingest
         time (company reputation, role recency, etc.).

    Weights: profile 0.7 + quality 0.3. (Previously there was a
    margin term computed from S/G/B vs job requirements, but with
    scores gone the margin was always zero, so we drop it.)

    The Smart/Grit/Build args are kept in the signature to avoid
    touching every call site; they're ignored. Same for req_smart/
    req_grit/req_build and the has_audit flag.
    """
    del student_smart, student_grit, student_build
    del req_smart, req_grit, req_build, has_audit
    pb = float(profile_boost or 0)
    q  = float(quality_score or 0)
    return round(pb * 0.7 + q * 0.3, 4)


def _build_profile_signals(email: str) -> dict:
    """Read the user's profile + memory surface, extract ranking
    signals. Zero-LLM. Cheap — runs once per feed request.

    Returns a dict ready to pass into _profile_boost() for each job:
        {
          "target_companies": {"stripe", "ramp", ...},  # lowercased
          "target_keywords":  {"fintech", "devtools", ...},  # goal/industry words
          "user_cities":      {"austin", "nyc", ...},  # lowercased
          "skill_keywords":   {"python", "kubernetes", ...},
        }
    """
    empty = {
        "target_companies": set(),
        "target_keywords": set(),
        "user_cities": set(),
        "skill_keywords": set(),
    }
    try:
        from projects.dilly.api.profile_store import get_profile as _gp
        from projects.dilly.api.memory_surface_store import get_memory_surface
    except Exception:
        return empty
    try:
        prof = _gp(email) or {}
    except Exception:
        prof = {}
    try:
        surface = get_memory_surface(email) or {}
        facts = surface.get("items") or []
    except Exception:
        facts = []

    target_companies: set[str] = set()
    target_keywords: set[str] = set()
    user_cities: set[str] = set()
    skill_keywords: set[str] = set()
    major_keywords: set[str] = set()
    cohort_keywords: set[str] = set()
    # Mode drives what "good" looks like:
    #   student  -> prefer internship, remote-friendly, junior titles
    #   seeker   -> prefer entry-level / new-grad / full-time  entry
    #   holder   -> prefer lateral / senior / staff / mgmt
    # Derived from prof.user_type when set, else infer from fields.
    user_type = (prof.get("user_type") or "").lower().strip()
    if not user_type:
        if prof.get("graduation_year"):
            user_type = "student"
        elif prof.get("current_role") or prof.get("current_company"):
            user_type = "holder"
        else:
            user_type = "seeker"
    mode = "student" if user_type == "student" else ("holder" if user_type in ("holder", "professional") else "seeker")

    # Target companies: both the `target_companies` profile field AND
    # any fact in category=target_company.
    for c in (prof.get("target_companies") or []):
        if c:
            target_companies.add(str(c).strip().lower())
    # Current company is implicitly NOT a target — we'd never surface
    # the user's own employer as a "job match". Track it so the boost
    # can skip it.
    current_company = (prof.get("current_company") or "").strip().lower() or None

    for f in facts:
        cat = (f.get("category") or "").lower()
        label = (f.get("label") or "").lower()
        value = (f.get("value") or "").lower()
        bag = (label + " " + value).replace(",", " ")
        if cat == "target_company":
            raw = (value or label).replace("target:", "").strip()
            if raw:
                target_companies.add(raw)
        elif cat in ("goal", "career_interest"):
            for tok in bag.split():
                tok = tok.strip(".,:;!?()[]").lower()
                if len(tok) >= 4 and tok not in _STOPWORDS:
                    target_keywords.add(tok)
        elif cat in ("skill", "skill_unlisted", "technical_skill", "soft_skill", "project_detail"):
            for tok in bag.split():
                tok = tok.strip(".,:;!?()[]").lower()
                if len(tok) >= 3 and tok not in _STOPWORDS:
                    skill_keywords.add(tok)
        elif cat in ("major", "minor", "academic_major"):
            for tok in bag.split():
                tok = tok.strip(".,:;!?()[]").lower()
                if len(tok) >= 4 and tok not in _STOPWORDS:
                    major_keywords.add(tok)
        elif cat in ("experience", "current_role", "past_role"):
            # Past titles carry a ton of signal for holders/seekers —
            # a user whose history mentions "product manager" should
            # match PM roles even without a listed goal. Treat as
            # keyword source with a slight boost.
            for tok in bag.split():
                tok = tok.strip(".,:;!?()[]").lower()
                if len(tok) >= 4 and tok not in _STOPWORDS:
                    target_keywords.add(tok)

    for field in ("career_goal", "industry_target"):
        val = (prof.get(field) or "").lower()
        for tok in val.replace(",", " ").split():
            tok = tok.strip(".,:;!?()[]")
            if len(tok) >= 4 and tok not in _STOPWORDS:
                target_keywords.add(tok)

    # Majors on the profile (students often list these directly).
    for m in (prof.get("majors") or ([prof.get("major")] if prof.get("major") else [])):
        if not m:
            continue
        for tok in str(m).replace(",", " ").split():
            tok = tok.strip(".,:;!?()[]").lower()
            if len(tok) >= 4 and tok not in _STOPWORDS:
                major_keywords.add(tok)

    # Cohorts (e.g. "Software Engineering", "Investment Banking") are
    # strong signal — if the user is on that track, bias roles that
    # mention the cohort keyword.
    for cohort in (prof.get("cohorts") or []):
        if not cohort:
            continue
        for tok in str(cohort).replace(",", " ").split():
            tok = tok.strip(".,:;!?()[]").lower()
            if len(tok) >= 4 and tok not in _STOPWORDS:
                cohort_keywords.add(tok)

    for city in (prof.get("job_locations") or []):
        if city:
            user_cities.add(str(city).strip().lower())

    return {
        "target_companies": target_companies,
        "target_keywords": target_keywords,
        "user_cities": user_cities,
        "skill_keywords": skill_keywords,
        "major_keywords": major_keywords,
        "cohort_keywords": cohort_keywords,
        "current_company": current_company,
        "mode": mode,
    }


# Very short stopword list — just enough to keep "the", "and" etc.
# from polluting the keyword sets. Kept small on purpose; a longer
# list risks filtering out real signal words.
_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into",
    "have", "want", "need", "them", "they", "your", "yours",
    "work", "role", "roles", "job", "jobs", "a", "an", "i", "me",
    "my", "as", "in", "on", "at", "to", "of", "or", "but", "be",
    "is", "are", "was", "were", "been", "being", "so", "if",
}


_INTERNSHIP_TITLE_HINTS = ("intern", "co-op", "coop")
_ENTRY_TITLE_HINTS = ("new grad", "new-grad", "entry", "junior ", "associate ", "graduate ")
_SENIOR_TITLE_HINTS = ("senior ", "staff ", "principal ", "lead ", "head of ", "director", "manager ")


def _profile_boost(job_title: str, job_description: str, job_company: str,
                   job_city: str, job_state: str,
                   signals: dict) -> float:
    """Mode-aware profile-to-job boost, 0-100.

    The scoring spreads weight across more signals than before so a
    typical engaged user with 3-4 profile facts lands in the 50-75
    range (real "Strong" territory) instead of the 20-40 range the
    old formula produced without a target-company match. Zero LLM.

    Per-signal weights (additive, capped at 100):
      Level alignment (role type matches mode)     +18
      Skill keyword hits in title                  +12 each, cap 36
      Skill keyword hits in description            +4 each,  cap 12
      Target company exact                         +40
      (anti-target) User's own current company     -100 (kill)
      Cohort keyword in title                      +15
      Cohort keyword in description                +5  (cap 10)
      Career-goal/past-title keyword in title      +12 each, cap 24
      Career-goal/past-title keyword in desc       +3  each, cap 9
      Major keyword in title or desc               +8
      City or state match                          +10

    Notes:
      - Level alignment prevents "every full-time job for a student"
        and "every internship for a holder" from ever ranking strong.
      - Cohort keyword carries weight because cohorts are Dilly's
        highest-signal field (user told us "I'm on the SWE track").
      - Current-company anti-boost: a user never wants to see their
        own employer ranked. Subtracting 100 buries it.
    """
    if not signals:
        return 0.0
    title = (job_title or "").lower()
    desc = (job_description or "")[:4000].lower()
    company = (job_company or "").lower()
    city = (job_city or "").lower()
    state = (job_state or "").lower()
    mode = signals.get("mode") or "seeker"
    score = 0.0

    # 0. Current-company anti-boost. If the job is at the user's own
    # employer, bury it — this is almost never useful and clutters the
    # feed with noise.
    cur = signals.get("current_company")
    if cur and cur in company:
        return 0.0

    # 1. Level alignment. Strong signal; keeps students seeing
    # internships, seekers seeing entry, holders seeing lateral/senior.
    is_internship = any(h in title for h in _INTERNSHIP_TITLE_HINTS)
    is_entry = any(h in title for h in _ENTRY_TITLE_HINTS)
    is_senior = any(h in title for h in _SENIOR_TITLE_HINTS)
    if mode == "student":
        if is_internship: score += 18
        elif is_senior: score -= 10  # students don't want senior roles
    elif mode == "seeker":
        if is_entry: score += 18
        elif is_internship: score += 10  # internships still fine for early seekers
        elif is_senior: score -= 5
    else:  # holder
        if is_senior: score += 18
        elif is_entry: score -= 5
        elif is_internship: score -= 15  # holders really shouldn't see internships

    # 2. Target company — very strong when it matches. Weight lowered
    # from 60 to 40 so a target match no longer dominates to the point
    # of ranking a bad-level role above everything else.
    for tc in signals["target_companies"]:
        if tc and tc in company:
            score += 40
            break

    # 3. Skill keywords. Weight boosted and separated into title-hit
    # (high) vs desc-hit (low). Cap at 36 total title + 12 desc so a
    # skill-heavy resume doesn't dominate a multi-axis match.
    title_skill_hits = 0
    desc_skill_hits = 0
    for sk in signals["skill_keywords"]:
        if sk in title:
            title_skill_hits += 1
        elif sk in desc:
            desc_skill_hits += 1
    score += min(title_skill_hits * 12, 36)
    score += min(desc_skill_hits * 4, 12)

    # 4. Cohort keywords — highest-signal field after company. If the
    # user told us "I'm on the SWE track" and the job title says
    # Software Engineer, that's a bullseye.
    cohort_title_hit = False
    cohort_desc_hits = 0
    for kw in signals.get("cohort_keywords") or set():
        if kw in title:
            cohort_title_hit = True
        elif kw in desc:
            cohort_desc_hits += 1
    if cohort_title_hit:
        score += 15
    score += min(cohort_desc_hits * 5, 10)

    # 5. Career-goal / past-role keywords.
    title_goal_hits = 0
    desc_goal_hits = 0
    for kw in signals["target_keywords"]:
        if kw in title:
            title_goal_hits += 1
        elif kw in desc:
            desc_goal_hits += 1
    score += min(title_goal_hits * 12, 24)
    score += min(desc_goal_hits * 3, 9)

    # 6. Major keyword — one-shot hit. "CS" / "Finance" in title
    # should nudge the match even when nothing else lines up.
    for mk in signals.get("major_keywords") or set():
        if mk in title or mk in desc:
            score += 8
            break

    # 7. Location.
    for uc in signals["user_cities"]:
        if uc and (uc in city or uc in state):
            score += 10
            break

    return max(0.0, min(score, 100.0))


def _cohort_readiness(
    student_smart, student_grit, student_build,
    student_cohorts: set, cohort_requirements,
    student_cohort_scores: dict | None = None,
) -> tuple[list, str | None]:
    """
    Build cohort_readiness list and best cohort-specific readiness label.
    cohort_requirements is a list of {cohort, smart, grit, build} dicts.
    student_cohort_scores (optional) is the {cohort: {smart, grit, build}} JSONB
    from students.cohort_scores. When present, per-cohort scores are used for
    that cohort's comparison instead of the student's overall scores.
    Returns (cohort_readiness_list, best_readiness_or_None).
    """
    if not cohort_requirements:
        return [], None
    if isinstance(cohort_requirements, str):
        try:
            cohort_requirements = json.loads(cohort_requirements)
        except Exception:
            return [], None
    if isinstance(student_cohort_scores, str):
        try:
            student_cohort_scores = json.loads(student_cohort_scores)
        except Exception:
            student_cohort_scores = None

    # Find the user's PRIMARY cohort scores from cohort_scores. Used as the
    # fallback when this specific job's cohort doesn't have a per-cohort score
    # for the user — we prefer the rubric primary scores over the legacy
    # overall_smart/grit/build, so the app NEVER shows aggregate scores.
    primary_per: dict | None = None
    if student_cohort_scores:
        for _v in student_cohort_scores.values():
            if isinstance(_v, dict) and _v.get("level") == "primary":
                primary_per = _v
                break
        if primary_per is None:
            # No 'level: primary' marker — pick the first entry as fallback
            for _v in student_cohort_scores.values():
                if isinstance(_v, dict):
                    primary_per = _v
                    break

    results = []
    for req in (cohort_requirements or []):
        c_name = req.get("cohort", "")
        if c_name not in student_cohorts:
            continue
        rs = float(req.get("smart") or 0)
        rg = float(req.get("grit")  or 0)
        rb = float(req.get("build") or 0)
        # Resolution order: per-cohort score → primary cohort score → overall (last resort)
        per = (student_cohort_scores or {}).get(c_name) if student_cohort_scores else None
        if per is None:
            per = primary_per
        ss = float(per.get("smart") if per else (student_smart or 0))
        sg = float(per.get("grit")  if per else (student_grit  or 0))
        sb = float(per.get("build") if per else (student_build or 0))
        rd = _readiness(ss, sg, sb, rs, rg, rb)
        results.append({
            "cohort": c_name,
            "readiness": rd,
            "required_smart": rs,
            "required_grit": rg,
            "required_build": rb,
            "student_smart": ss,
            "student_grit":  sg,
            "student_build": sb,
        })

    if not results:
        return [], None

    # Best readiness = highest priority (ready > almost > gap)
    order_map = {"ready": 0, "almost": 1, "gap": 2}
    best = min(results, key=lambda x: order_map.get(x["readiness"], 3))
    return results, best["readiness"]


def _fallback_feed(
    cur, student_id: str, student_smart, student_grit, student_build,
    student_cohorts: set,
    tab: str, readiness_filter: Optional[str],
    company_filter: Optional[str], search: Optional[str],
    cohort_filter: Optional[str],
    sort: str, limit: int, offset: int,
    s_cohort_scores: dict | None = None,
    no_degree: Optional[bool] = None,
    h1b_sponsor: Optional[bool] = None,
    fair_chance: Optional[bool] = None,
    remote_only: Optional[bool] = None,
    work_mode_filter: Optional[str] = None,
    city_filter: Optional[str] = None,
    profile_signals: Optional[dict] = None,
    has_audit: bool = True,
):
    """Serve the feed using on-the-fly scoring (no match_scores rows needed).

    profile_signals + has_audit are threaded in so _rank_score can
    weight by the user's expressed preferences (target companies,
    goals, skills, cities) — not just Smart/Grit/Build margin.
    """
    where = ["i.status = 'active'", "i.description IS NOT NULL", "length(i.description) > 100"]
    params: list = []

    # Filter: US/Canada only
    # International exclusion for US/Canada feed. Added 'Bangalore'
    # alt-spelling (some postings use that instead of Bengaluru),
    # plus a wider sweep of common international job-posting cities
    # so users don't see "Software Engineer · Bangalore, India" in a
    # supposedly US feed.
    _intl_exclude = [
        'India', 'Bengaluru', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Gurgaon', 'Gurugram', 'Noida', 'Delhi', 'Kolkata',
        'Mumbai', 'Ahmedabad', 'Jaipur',
        'London', 'England', 'United Kingdom', 'UK', 'Manchester', 'Edinburgh',
        'Dublin', 'Ireland', 'Singapore', 'Tokyo', 'Osaka', 'Japan',
        'Berlin', 'Munich', 'Germany', 'Paris', 'Lyon', 'France',
        'Amsterdam', 'Netherlands', 'Sydney', 'Melbourne', 'Australia',
        'Tel Aviv', 'Israel', 'Seoul', 'South Korea',
        'Shanghai', 'Beijing', 'Shenzhen', 'Hong Kong', 'China',
        'Sao Paulo', 'Brazil', 'Mexico City', 'Buenos Aires', 'Argentina',
    ]
    _intl_clauses = " AND ".join([f"COALESCE(i.location_city,'') || ' ' || COALESCE(i.location_state,'') NOT ILIKE %s" for _ in _intl_exclude])
    if _intl_clauses:
        where.append(f"({_intl_clauses})")
        params.extend([f"%{c}%" for c in _intl_exclude])

    # tab filtering: 'opportunities' and 'internship' both include entry_level + research_internship
    if tab == "opportunities" or tab == "internship":
        where.append("i.job_type IN ('internship', 'entry_level', 'research_internship', 'part_time')")
    elif tab == "entry_level":
        where.append("i.job_type IN ('entry_level', 'internship', 'research_internship')")
    elif tab == "part_time":
        where.append("i.job_type = 'part_time'")
    elif tab != "all":
        where.append("i.job_type = %s")
        params.append(tab)
    if company_filter:
        where.append("c.name ILIKE %s")
        params.append(f"%{company_filter}%")
    if search:
        where.append("(i.title ILIKE %s OR c.name ILIKE %s OR i.description ILIKE %s)")
        like = f"%{search}%"
        params.extend([like, like, like])
    if cohort_filter:
        where.append("i.cohort_requirements::text ILIKE %s")
        params.append(f"%{cohort_filter}%")
    if remote_only:
        where.append("(i.remote = true OR i.work_mode = 'remote' OR LOWER(COALESCE(i.location_city,'')) LIKE '%remote%')")
    if work_mode_filter:
        where.append("i.work_mode = %s")
        params.append(work_mode_filter)
    if city_filter:
        where.append("i.location_city ILIKE %s")
        params.append(f"%{city_filter}%")

    # no_degree filter (same logic as the precomputed path): prefer the
    # classified column; fall back to keyword heuristic for NULL rows so
    # freshly-ingested jobs aren't hidden while awaiting classification.
    if no_degree:
        where.append("""(
            i.degree_required IN ('not_required', 'unclear')
            OR (
                i.degree_required IS NULL
                AND (
                    i.description ILIKE '%no degree required%'
                    OR i.description ILIKE '%or equivalent experience%'
                    OR i.description ILIKE '%without a degree%'
                    OR i.description ILIKE '%degree preferred, not required%'
                    OR i.description ILIKE '%self-taught%'
                    OR i.description ILIKE '%equivalent work experience%'
                ) AND NOT (
                    i.description ILIKE '%bachelor''s degree required%'
                    OR i.description ILIKE '%bachelor''s required%'
                    OR i.description ILIKE '%master''s degree required%'
                    OR i.description ILIKE '%master''s required%'
                    OR i.description ILIKE '%phd required%'
                )
            )
        )""")

    # h1b_sponsor filter: jobs where sponsorship is confirmed or at least
    # possible (unclear). Fallback heuristic for NULL: look for explicit
    # "sponsor" / "visa" language.
    if h1b_sponsor:
        where.append("""(
            i.h1b_sponsor IN ('sponsors', 'unclear')
            OR (
                i.h1b_sponsor IS NULL
                AND (
                    i.description ILIKE '%visa sponsorship%'
                    OR i.description ILIKE '%will sponsor%'
                    OR i.description ILIKE '%h-1b%'
                    OR i.description ILIKE '%h1b%'
                ) AND NOT (
                    i.description ILIKE '%no sponsorship%'
                    OR i.description ILIKE '%cannot sponsor%'
                    OR i.description ILIKE '%US citizen only%'
                    OR i.description ILIKE '%security clearance required%'
                )
            )
        )""")

    # fair_chance filter: jobs flagged fair-chance or at minimum not
    # explicitly background-restrictive. Strict: 'unclear' is included
    # so opt-in users see more options, not fewer.
    if fair_chance:
        where.append("""(
            i.fair_chance IN ('fair_chance', 'unclear')
            OR (
                i.fair_chance IS NULL
                AND NOT (
                    i.description ILIKE '%clean background%'
                    OR i.description ILIKE '%no criminal record%'
                    OR i.description ILIKE '%background check required%'
                    OR i.description ILIKE '%security clearance%'
                )
            )
        )""")

    # remote_only filter: strict — "remote" work mode only, hybrid excluded.
    # Also accepts description-level remote signals so jobs with a blank
    # work_mode column but explicit remote language still show up.
    if remote_only:
        where.append("""(
            LOWER(COALESCE(i.work_mode, '')) = 'remote'
            OR LOWER(COALESCE(i.location_city, '')) = 'remote'
            OR (
                COALESCE(i.work_mode, '') = ''
                AND (
                    i.description ILIKE '%fully remote%'
                    OR i.description ILIKE '%100%% remote%'
                    OR i.description ILIKE '%work from anywhere%'
                )
                AND NOT (
                    i.description ILIKE '%hybrid%'
                    OR i.description ILIKE '%in-office%'
                    OR i.description ILIKE '%on-site%'
                    OR i.description ILIKE '%on site%'
                )
            )
        )""")

    where_sql = " AND ".join(where)

    # Fetch all candidates (readiness computed in Python)
    cur.execute(f"""
        SELECT
            i.id, i.title, i.description, i.location_city, i.location_state,
            i.work_mode, i.is_paid, i.apply_url, i.deadline, i.job_type,
            i.posted_date, i.required_smart, i.required_grit, i.required_build,
            i.quality_score, i.cohort_requirements, i.quick_glance,
            c.name as company_name, c.logo_url, c.website, c.industry
        FROM internships i
        JOIN companies c ON i.company_id = c.id
        WHERE {where_sql}
        -- Secondary ORDER BY keys (posted_date, then id) so tied
        -- quality_score rows always come back in the same order.
        -- Without this, Postgres returns arbitrary order among ties,
        -- and the downstream per-company cap keeps different jobs on
        -- every refresh — which shows up as the total match count
        -- drifting up and down.
        ORDER BY i.quality_score DESC NULLS LAST,
                 i.posted_date DESC NULLS LAST,
                 i.id ASC
        LIMIT 2000
    """, params)
    rows = cur.fetchall()

    # Check dismissals
    cur.execute("SELECT internship_id FROM dismissals WHERE student_id = %s", (student_id,))
    dismissed = {r["internship_id"] for r in cur.fetchall()}

    listings = []
    for r in rows:
        if r["id"] in dismissed:
            continue

        # Fallback: derive S/G/B from quality_score when not explicitly set
        if not r["required_smart"] and r["quality_score"]:
            qs = float(r["quality_score"])
            # Split evenly with slight Smart emphasis (most jobs reward this)
            r["required_smart"] = round(qs * 0.38, 1)
            r["required_grit"]  = round(qs * 0.32, 1)
            r["required_build"] = round(qs * 0.30, 1)

        # Try cohort-specific readiness first; fall back to flat required scores
        cr_list, cohort_rd = _cohort_readiness(
            student_smart, student_grit, student_build,
            student_cohorts, r["cohort_requirements"],
            student_cohort_scores=s_cohort_scores,
        )
        if cohort_rd:
            rd = cohort_rd
        else:
            rd = _readiness(student_smart, student_grit, student_build,
                            r["required_smart"], r["required_grit"], r["required_build"])

        if readiness_filter and rd != readiness_filter:
            continue

        # Profile boost: matches this job against target_companies,
        # goals, skills, preferred cities from the user's profile.
        # Zero cost (no LLM, pure string-containment checks on a
        # cap'd description size). 0 when profile_signals wasn't
        # built (defensive no-op).
        pb = _profile_boost(
            r["title"], r["description"], r["company_name"],
            r["location_city"], r["location_state"],
            profile_signals,
        ) if profile_signals else 0.0

        rk = _rank_score(student_smart, student_grit, student_build,
                         r["required_smart"], r["required_grit"], r["required_build"],
                         r["quality_score"],
                         profile_boost=pb,
                         has_audit=has_audit)
        listings.append({
            "id": r["id"],
            "title": r["title"],
            "company": r["company_name"],
            "company_logo": r["logo_url"],
            "company_website": r["website"],
            "industry": r["industry"],
            "location_city": r["location_city"],
            "location_state": r["location_state"],
            "work_mode": r["work_mode"],
            "is_paid": r["is_paid"],
            "apply_url": r["apply_url"],
            "deadline": str(r["deadline"]) if r["deadline"] else None,
            "posted_date": str(r["posted_date"]) if r["posted_date"] else None,
            "job_type": r["job_type"],
            "rank_score": rk,
            "readiness": rd,
            "cohort_readiness": cr_list,
            "cohort_requirements": r["cohort_requirements"] if isinstance(r["cohort_requirements"], list) else (json.loads(r["cohort_requirements"]) if r["cohort_requirements"] else []),
            "required_smart": float(r["required_smart"]) if r["required_smart"] else None,
            "required_grit":  float(r["required_grit"])  if r["required_grit"]  else None,
            "required_build": float(r["required_build"]) if r["required_build"] else None,
            "description": re.sub(r"<[^>]+>", "", (r["description"] or "")).strip(),
            "description_preview": re.sub(r"<[^>]+>", "", (r["description"] or ""))[:300].strip(),
            "quick_glance": json.loads(r.get("quick_glance") or "[]") if isinstance(r.get("quick_glance"), str) else (r.get("quick_glance") or []),
        })

    # Sort
    if sort == "readiness":
        order_map = {"ready": 0, "almost": 1, "gap": 2}
        listings.sort(key=lambda x: (order_map.get(x["readiness"], 3), -x["rank_score"]))
    elif sort == "newest":
        listings.sort(key=lambda x: x["posted_date"] or "", reverse=True)
    else:
        listings.sort(key=lambda x: -x["rank_score"])

    # Diversity cap before paging so a single big employer can't flood
    # the first page. Total count reflects post-cap volume so the
    # "has_more" and count UI stays honest.
    listings = _cap_per_company(listings)
    total = len(listings)
    page = listings[offset: offset + limit]
    return {"listings": page, "total": total, "has_more": (offset + limit) < total}


def _fallback_stats(cur, student_id: str, student_smart, student_grit, student_build,
                    student_cohorts: set | None = None):
    cur.execute("""
        SELECT i.id, i.job_type, i.required_smart, i.required_grit, i.required_build,
               i.cohort_requirements
        FROM internships i
        WHERE i.status = 'active'
    """)
    rows = cur.fetchall()
    cur.execute("SELECT internship_id FROM dismissals WHERE student_id = %s", (student_id,))
    dismissed = {r["internship_id"] for r in cur.fetchall()}

    stats = {"total": 0, "ready": 0, "almost": 0, "gap": 0, "by_type": {}, "cohort_counts": {}}
    for r in rows:
        if r["id"] in dismissed:
            continue
        cr_list, cohort_rd = _cohort_readiness(
            student_smart, student_grit, student_build,
            student_cohorts or set(), r.get("cohort_requirements")
        )
        rd = cohort_rd or _readiness(
            student_smart, student_grit, student_build,
            r["required_smart"], r["required_grit"], r["required_build"]
        )
        jt = r["job_type"] or "internship"
        stats["total"] += 1
        stats[rd] = stats.get(rd, 0) + 1
        if jt not in stats["by_type"]:
            stats["by_type"][jt] = {"total": 0, "ready": 0, "almost": 0, "gap": 0}
        stats["by_type"][jt]["total"] += 1
        stats["by_type"][jt][rd] = stats["by_type"][jt].get(rd, 0) + 1
        # Count how many jobs match each of the student's cohorts
        for cr in cr_list:
            cn = cr["cohort"]
            stats["cohort_counts"][cn] = stats["cohort_counts"].get(cn, 0) + 1
    return stats


# ── Personalized Feed ─────────────────────────────────────────

@router.get("/v2/internships/feed")
async def get_internship_feed(
    request: Request,
    tab: str = Query("internship", description="internship, entry_level, part_time, all, or opportunities (internship+entry_level+research)"),
    readiness: Optional[str] = Query(None),
    cohort: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    search: Optional[str] = Query(None),  # alias used by jobs page
    sort: str = Query("rank"),
    limit: int = Query(20, ge=1, le=500),
    offset: int = Query(0, ge=0),
    no_degree: Optional[bool] = Query(None, description="If true, only return jobs that do not require a degree."),
    h1b_sponsor: Optional[bool] = Query(None, description="If true, only return jobs where H-1B sponsorship is confirmed or possible."),
    fair_chance: Optional[bool] = Query(None, description="If true, only return jobs that are fair-chance friendly."),
    remote: Optional[bool] = Query(None, description="Filter to remote-only listings"),
    work_mode: Optional[str] = Query(None, description="Filter by work_mode: remote, onsite, hybrid"),
    city: Optional[str] = Query(None, description="Filter by city (partial match)"),
):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    search_term = q or search  # accept either param name

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Cold-start fallback: if the niche sources (NSF REU, USAJobs) have never
    # been ingested on this deploy, run the ingester inline. Cheap no-op once
    # the table is populated. Wrapped in try/except so a source failure never
    # breaks the feed request.
    try:
        from dilly_core.job_source_ingest import ensure_niche_sources_populated
        ensure_niche_sources_populated(conn)
    except Exception:
        pass

    student_id = _ensure_student(email, cur, conn)
    if not student_id:
        conn.close()
        return {"listings": [], "total": 0, "has_more": False,
                "message": "Complete onboarding to see matches."}

    # Read student scores + cohort for fallback scoring
    cur.execute(
        "SELECT overall_smart, overall_grit, overall_build, cohort, cohort_scores, majors, minors, interests FROM students WHERE id = %s",
        (student_id,),
    )
    stu = cur.fetchone()
    s_smart = float(stu["overall_smart"]) if stu and stu["overall_smart"] else 0
    s_grit  = float(stu["overall_grit"])  if stu and stu["overall_grit"]  else 0
    s_build = float(stu["overall_build"]) if stu and stu["overall_build"] else 0
    s_cohort_scores = stu["cohort_scores"] if stu else None
    if isinstance(s_cohort_scores, str):
        try: s_cohort_scores = json.loads(s_cohort_scores)
        except Exception: s_cohort_scores = None
    # Build set of student cohorts (primary + from majors + from minors + from interests)
    s_cohort = stu["cohort"] if stu else None
    def _parse_json_list(v):
        if isinstance(v, list): return v
        if isinstance(v, str):
            try: return json.loads(v)
            except Exception: return []
        return []
    s_majors    = _parse_json_list(stu["majors"]    if stu else [])
    s_minors    = _parse_json_list(stu["minors"]    if stu else [])
    s_interests = _parse_json_list(stu["interests"] if stu else [])
    try:
        from projects.dilly.api.cohort_config import MAJOR_TO_COHORT
        _student_cohorts: set[str] = set()
        if s_cohort:
            _student_cohorts.add(s_cohort)
        for _m in (s_majors + s_minors):
            _c = MAJOR_TO_COHORT.get(str(_m).strip())
            if _c:
                _student_cohorts.add(_c)
        # Interests are stored as cohort label strings — add them directly
        for _i in s_interests:
            if _i and isinstance(_i, str):
                _student_cohorts.add(_i.strip())
    except Exception:
        _student_cohorts = {s_cohort} if s_cohort else set()

    # Check if pre-computed match_scores exist
    cur.execute(
        "SELECT COUNT(*) as cnt FROM match_scores WHERE student_id = %s", (student_id,)
    )
    has_precomputed = cur.fetchone()["cnt"] > 0

    # Build profile signals ONCE per request. Zero-LLM cheap read
    # from memory_surface + profile. These drive the ranker's
    # "match against what the user actually told us they want"
    # logic — target companies, goals, skills, cities.
    _profile_signals = _build_profile_signals(email)

    # Has the user ever completed an audit? If all three S/G/B
    # scores are 0, treat as no-audit and rely on profile signals
    # + quality score for ranking (margin math would be noise).
    _has_audit = bool(s_smart or s_grit or s_build)

    if not has_precomputed:
        result = _fallback_feed(
            cur, student_id, s_smart, s_grit, s_build, _student_cohorts,
            tab, readiness, company, search_term, cohort,
            sort, limit, offset,
            s_cohort_scores=s_cohort_scores,
            no_degree=no_degree,
            h1b_sponsor=h1b_sponsor,
            fair_chance=fair_chance,
            remote_only=remote,
            work_mode_filter=work_mode,
            city_filter=city,
            profile_signals=_profile_signals,
            has_audit=_has_audit,
        )
        conn.close()
        return {**result, "tab": tab,
                "filters": {"readiness": readiness, "cohort": cohort,
                            "company": company, "q": search_term}}

    # ── Pre-computed path (existing logic) ────────────────────
    where = ["m.student_id = %s", "i.status = 'active'"]
    params: list = [student_id]

    # Filter: US/Canada only (exclude international jobs)
    _intl_exclude = [
        'India', 'Bengaluru', 'Mumbai', 'Hyderabad', 'Delhi', 'Pune', 'Chennai',
        'London', 'England', 'United Kingdom', 'UK',
        'Dublin', 'Ireland',
        'Singapore',
        'Tokyo', 'Japan',
        'Berlin', 'Germany', 'Munich',
        'Paris', 'France',
        'Amsterdam', 'Netherlands',
        'Sydney', 'Australia', 'Melbourne',
        'Tel Aviv', 'Israel',
        'Sao Paulo', 'Brazil',
        'Seoul', 'South Korea',
        'Shanghai', 'Beijing', 'China',
    ]
    _intl_clauses = " AND ".join([f"COALESCE(i.location_city,'') || ' ' || COALESCE(i.location_state,'') NOT ILIKE %s" for _ in _intl_exclude])
    if _intl_clauses:
        where.append(f"({_intl_clauses})")
        params.extend([f"%{c}%" for c in _intl_exclude])

    # tab filtering: 'opportunities' and 'internship' both include entry_level + research_internship
    if tab == "opportunities" or tab == "internship":
        where.append("i.job_type IN ('internship', 'entry_level', 'research_internship', 'part_time')")
    elif tab == "entry_level":
        where.append("i.job_type IN ('entry_level', 'internship', 'research_internship')")
    elif tab == "part_time":
        where.append("i.job_type = 'part_time'")
    elif tab != "all":
        where.append("i.job_type = %s")
        params.append(tab)
    if readiness:
        where.append("m.readiness = %s")
        params.append(readiness)
    if company:
        where.append("c.name ILIKE %s")
        params.append(f"%{company}%")
    if search_term:
        where.append("(i.title ILIKE %s OR c.name ILIKE %s OR i.description ILIKE %s)")
        like = f"%{search_term}%"
        params.extend([like, like, like])
    if cohort:
        where.append("m.cohort_readiness::text ILIKE %s")
        params.append(f"%{cohort}%")
    if remote:
        where.append("(i.remote = true OR i.work_mode = 'remote' OR LOWER(COALESCE(i.location_city,'')) LIKE '%remote%')")
    if work_mode:
        where.append("i.work_mode = %s")
        params.append(work_mode)
    if city:
        where.append("i.location_city ILIKE %s")
        params.append(f"%{city}%")

    # "no_degree" filter: prefer the structured `degree_required` column
    # written by the Haiku classifier (see job_classifiers.py). It maps
    # descriptions to one of: 'required' | 'not_required' | 'unclear' |
    # NULL (not yet classified).
    #
    # Show: 'not_required' (confident yes) + 'unclear' (probably fine,
    #   don't hide borderline jobs from an opted-in user).
    # Hide: 'required' (confident no).
    # For NULL (unclassified) rows, fall back to the original keyword
    # heuristic so we don't punish new jobs that haven't been scanned
    # yet — the nightly /cron/classify-jobs run catches up within a day.
    if no_degree:
        where.append("""(
            i.degree_required IN ('not_required', 'unclear')
            OR (
                i.degree_required IS NULL
                AND (
                    i.description ILIKE '%no degree required%'
                    OR i.description ILIKE '%or equivalent experience%'
                    OR i.description ILIKE '%without a degree%'
                    OR i.description ILIKE '%degree preferred, not required%'
                    OR i.description ILIKE '%self-taught%'
                    OR i.description ILIKE '%equivalent work experience%'
                ) AND NOT (
                    i.description ILIKE '%bachelor''s degree required%'
                    OR i.description ILIKE '%bachelor''s required%'
                    OR i.description ILIKE '%master''s degree required%'
                    OR i.description ILIKE '%master''s required%'
                    OR i.description ILIKE '%phd required%'
                )
            )
        )""")

    # h1b_sponsor (same semantics as no_degree)
    if h1b_sponsor:
        where.append("""(
            i.h1b_sponsor IN ('sponsors', 'unclear')
            OR (
                i.h1b_sponsor IS NULL
                AND (
                    i.description ILIKE '%visa sponsorship%'
                    OR i.description ILIKE '%will sponsor%'
                    OR i.description ILIKE '%h-1b%'
                    OR i.description ILIKE '%h1b%'
                ) AND NOT (
                    i.description ILIKE '%no sponsorship%'
                    OR i.description ILIKE '%cannot sponsor%'
                    OR i.description ILIKE '%US citizen only%'
                    OR i.description ILIKE '%security clearance required%'
                )
            )
        )""")

    # fair_chance (same semantics as no_degree)
    if fair_chance:
        where.append("""(
            i.fair_chance IN ('fair_chance', 'unclear')
            OR (
                i.fair_chance IS NULL
                AND NOT (
                    i.description ILIKE '%clean background%'
                    OR i.description ILIKE '%no criminal record%'
                    OR i.description ILIKE '%background check required%'
                    OR i.description ILIKE '%security clearance%'
                )
            )
        )""")

    # remote_only (same semantics as the fallback path)
    if remote_only:
        where.append("""(
            LOWER(COALESCE(i.work_mode, '')) = 'remote'
            OR LOWER(COALESCE(i.location_city, '')) = 'remote'
            OR (
                COALESCE(i.work_mode, '') = ''
                AND (
                    i.description ILIKE '%fully remote%'
                    OR i.description ILIKE '%100%% remote%'
                    OR i.description ILIKE '%work from anywhere%'
                )
                AND NOT (
                    i.description ILIKE '%hybrid%'
                    OR i.description ILIKE '%in-office%'
                    OR i.description ILIKE '%on-site%'
                    OR i.description ILIKE '%on site%'
                )
            )
        )""")

    where_sql = " AND ".join(where)
    # Stable ordering: every sort key ends with `i.id ASC` as a
    # deterministic tiebreaker so the feed returns the same row set
    # across refreshes when nothing has actually changed in the DB.
    # Without this, tied scores come back in arbitrary order and the
    # downstream per-company cap keeps different rows, making the
    # total match count drift up and down between pulls.
    order = "m.rank_score DESC, i.id ASC"
    if sort == "readiness":
        order = "CASE m.readiness WHEN 'ready' THEN 0 WHEN 'almost' THEN 1 ELSE 2 END, m.rank_score DESC, i.id ASC"
    elif sort == "newest":
        order = "i.created_at DESC, i.id ASC"

    cur.execute(f"""
        SELECT COUNT(*) as cnt FROM match_scores m
        JOIN internships i ON m.internship_id = i.id
        JOIN companies c ON i.company_id = c.id
        WHERE {where_sql}
    """, params)
    total = cur.fetchone()["cnt"]

    # Over-fetch so we can re-rank in Python with profile_boost. The
    # SQL `rank_score` is purely S/G/B-margin + quality; it doesn't
    # know about target companies, goals, skills, or cities from the
    # user's profile. Pulling 3x the asked-for limit means the top
    # results after re-ranking include jobs that match the user's
    # profile even when their raw rank_score was mid-pack.
    # Capped at 200 to keep the fetch cheap on big result sets.
    _overfetch_limit = min(200, max(limit * 3, limit + 60))
    cur.execute(f"""
        SELECT
            i.id, i.title, i.description, i.location_city, i.location_state,
            i.work_mode, i.is_paid, i.apply_url, i.deadline, i.job_type,
            i.cohort_requirements, i.posted_date, i.quick_glance,
            c.name as company_name, c.logo_url, c.website, c.industry,
            m.rank_score, m.readiness, m.cohort_readiness,
            m.location_score, m.work_mode_score, m.compensation_score
        FROM match_scores m
        JOIN internships i ON m.internship_id = i.id
        JOIN companies c ON i.company_id = c.id
        WHERE {where_sql}
        ORDER BY {order}
        LIMIT %s OFFSET %s
    """, params + [_overfetch_limit, offset])
    rows = cur.fetchall()

    cur.execute("SELECT internship_id FROM dismissals WHERE student_id = %s", (student_id,))
    dismissed = {r["internship_id"] for r in cur.fetchall()}

    listings = []
    for r in rows:
        if r["id"] in dismissed:
            continue
        cr = r["cohort_readiness"]
        if isinstance(cr, str):
            cr = json.loads(cr)
        # Parse cohort_requirements for S/G/B display on mobile
        cq = r.get("cohort_requirements")
        if isinstance(cq, str):
            try: cq = json.loads(cq)
            except Exception: cq = None
        # Derive flat required_smart/grit/build from first cohort requirement
        first_cq = (cq or [{}])[0] if cq else {}
        # Also try first cohort_readiness entry as fallback
        first_cr = (cr or [{}])[0] if cr else {}
        req_s = first_cq.get("smart") or first_cr.get("required_smart") or 0
        req_g = first_cq.get("grit")  or first_cr.get("required_grit")  or 0
        req_b = first_cq.get("build") or first_cr.get("required_build") or 0
        listings.append({
            "id": r["id"],
            "title": r["title"],
            "company": r["company_name"],
            "company_logo": r["logo_url"],
            "company_website": r["website"],
            "industry": r["industry"],
            "location_city": r["location_city"],
            "location_state": r["location_state"],
            "work_mode": r["work_mode"],
            "is_paid": r["is_paid"],
            "apply_url": r["apply_url"],
            "deadline": str(r["deadline"]) if r["deadline"] else None,
            "posted_date": str(r["posted_date"]) if r["posted_date"] else None,
            "job_type": r["job_type"],
            "rank_score": float(r["rank_score"]) if r["rank_score"] else 0,
            "readiness": r["readiness"],
            "cohort_readiness": cr,
            "cohort_requirements": cq,
            "required_smart": float(req_s) if req_s else None,
            "required_grit": float(req_g) if req_g else None,
            "required_build": float(req_b) if req_b else None,
            "description": re.sub(r"<[^>]+>", "", (r["description"] or "")).strip(),
            "description_preview": re.sub(r"<[^>]+>", "", (r["description"] or ""))[:300].strip(),
            "quick_glance": json.loads(r["quick_glance"]) if isinstance(r.get("quick_glance"), str) else (r.get("quick_glance") or []),
        })

    # Profile-aware re-rank. Combine each listing's pre-computed
    # rank_score (margin + quality) with a profile_boost derived
    # from the user's target_companies, goals, skills, and cities.
    # Jobs at target companies, or matching the user's goal keywords
    # in the title, now bubble to the top even if their raw
    # rank_score was mid-pack. Users with no profile signal at all
    # (boost = 0) still see the original ordering.
    #
    # Weighting kept conservative here (0.6 raw + 0.4 boost) because
    # the pre-computed rank_score already captures the audit-fit
    # dimension well. The fallback path uses a stronger profile
    # weighting because it has no pre-computed baseline.
    if _profile_signals and sort == "rank":
        for listing in listings:
            pb = _profile_boost(
                listing.get("title") or "",
                listing.get("description") or "",
                listing.get("company") or "",
                listing.get("location_city") or "",
                listing.get("location_state") or "",
                _profile_signals,
            )
            # Scale pre-computed score to roughly match the 0-100
            # boost scale. match_scores.rank_score historically sits
            # in the 0-100 range, but we cap defensively.
            base = min(float(listing["rank_score"] or 0), 100.0)
            listing["_composite_rank"] = round(base * 0.6 + pb * 0.4, 4)
            listing["_profile_boost"] = pb
        listings.sort(key=lambda x: -x.get("_composite_rank", 0))
        # Trim back to the caller's requested limit after re-ranking.
        listings = listings[:limit]

    # Diversity cap: no more than MAX_PER_COMPANY_PER_PAGE roles from
    # a single employer in one response. Preserves rank order.
    listings = _cap_per_company(listings)

    conn.close()
    return {
        "listings": listings, "total": total,
        "has_more": (offset + limit) < total,
        "tab": tab,
        "filters": {"readiness": readiness, "cohort": cohort, "company": company, "q": search_term},
    }


# ── Match Stats ───────────────────────────────────────────────

@router.get("/v2/internships/stats")
async def get_match_stats(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    student_id = _ensure_student(email, cur, conn)
    if not student_id:
        conn.close()
        return {"total": 0, "ready": 0, "almost": 0, "gap": 0, "by_type": {}}

    cur.execute(
        "SELECT overall_smart, overall_grit, overall_build, cohort, majors, minors, interests FROM students WHERE id = %s",
        (student_id,),
    )
    stu = cur.fetchone()
    s_smart = float(stu["overall_smart"]) if stu and stu["overall_smart"] else 0
    s_grit  = float(stu["overall_grit"])  if stu and stu["overall_grit"]  else 0
    s_build = float(stu["overall_build"]) if stu and stu["overall_build"] else 0
    s_cohort = stu["cohort"] if stu else None
    def _pjl(v):
        if isinstance(v, list): return v
        if isinstance(v, str):
            try: return json.loads(v)
            except Exception: return []
        return []
    s_majors_raw    = _pjl(stu["majors"]    if stu else [])
    s_minors_raw    = _pjl(stu["minors"]    if stu else [])
    s_interests_raw = _pjl(stu["interests"] if stu else [])
    try:
        from projects.dilly.api.cohort_config import MAJOR_TO_COHORT
        _sc: set[str] = set()
        if s_cohort:
            _sc.add(s_cohort)
        for _m in (s_majors_raw + s_minors_raw):
            _c2 = MAJOR_TO_COHORT.get(str(_m).strip())
            if _c2:
                _sc.add(_c2)
        for _i in s_interests_raw:
            if _i and isinstance(_i, str):
                _sc.add(_i.strip())
    except Exception:
        _sc = {s_cohort} if s_cohort else set()

    cur.execute(
        "SELECT COUNT(*) as cnt FROM match_scores WHERE student_id = %s", (student_id,)
    )
    has_precomputed = cur.fetchone()["cnt"] > 0

    if not has_precomputed:
        stats = _fallback_stats(cur, student_id, s_smart, s_grit, s_build, _sc)
        conn.close()
        return stats

    cur.execute("""
        SELECT m.readiness, i.job_type, COUNT(*) as cnt
        FROM match_scores m
        JOIN internships i ON m.internship_id = i.id
        WHERE m.student_id = %s AND i.status = 'active'
        GROUP BY m.readiness, i.job_type
    """, (student_id,))

    stats = {"total": 0, "ready": 0, "almost": 0, "gap": 0, "by_type": {}}
    for row in cur.fetchall():
        r = row["readiness"] or "unknown"
        jt = row["job_type"] or "internship"
        cnt = row["cnt"]
        stats["total"] += cnt
        if r in stats:
            stats[r] += cnt
        if jt not in stats["by_type"]:
            stats["by_type"][jt] = {"total": 0, "ready": 0, "almost": 0, "gap": 0}
        stats["by_type"][jt]["total"] += cnt
        if r in stats["by_type"][jt]:
            stats["by_type"][jt][r] += cnt

    conn.close()
    return stats


# ── Single Internship Detail ──────────────────────────────────

@router.get("/v2/internships/{internship_id}")
async def get_internship_detail(request: Request, internship_id: str):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    student_id = _ensure_student(email, cur, conn)

    cur.execute("""
        SELECT i.*, c.name as company_name, c.logo_url, c.website, c.industry,
               c.hq_city, c.hq_state
        FROM internships i
        JOIN companies c ON i.company_id = c.id
        WHERE i.id = %s
    """, (internship_id,))
    intern = cur.fetchone()

    if not intern:
        conn.close()
        raise HTTPException(status_code=404, detail="Internship not found.")

    match_data = None
    if student_id:
        cur.execute("""
            SELECT * FROM match_scores
            WHERE student_id = %s AND internship_id = %s
        """, (student_id, internship_id))
        match_data = cur.fetchone()

    cr = intern["cohort_requirements"]
    if isinstance(cr, str):
        cr = json.loads(cr)

    result = {
        "id": intern["id"],
        "title": intern["title"],
        "description": intern["description"],
        "requirements": intern["requirements"],
        "preferred_qualifications": intern["preferred_qualifications"],
        "company": {
            "name": intern["company_name"],
            "logo_url": intern["logo_url"],
            "website": intern["website"],
            "industry": intern["industry"],
            "hq": f"{intern['hq_city']}, {intern['hq_state']}" if intern["hq_city"] else None,
        },
        "location_city": intern["location_city"],
        "location_state": intern["location_state"],
        "work_mode": intern["work_mode"],
        "is_paid": intern["is_paid"],
        "compensation_min": float(intern["compensation_min"]) if intern["compensation_min"] else None,
        "compensation_max": float(intern["compensation_max"]) if intern["compensation_max"] else None,
        "compensation_type": intern["compensation_type"],
        "apply_url": intern["apply_url"],
        "deadline": str(intern["deadline"]) if intern["deadline"] else None,
        "posted_date": str(intern["posted_date"]) if intern["posted_date"] else None,
        "job_type": intern["job_type"],
        "cohort_requirements": cr,
        "tags": intern["tags"] if isinstance(intern["tags"], list)
                else json.loads(intern["tags"] or "[]"),
    }

    if match_data:
        mcr = match_data["cohort_readiness"]
        if isinstance(mcr, str):
            mcr = json.loads(mcr)
        result["match"] = {
            "rank_score": float(match_data["rank_score"]) if match_data["rank_score"] else 0,
            "readiness": match_data["readiness"],
            "cohort_readiness": mcr,
        }

    conn.close()
    return result


# ── Dismiss ───────────────────────────────────────────────────

@router.post("/v2/internships/dismiss")
async def dismiss_internship(request: Request, internship_id: str = Query(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    student_id = _ensure_student(email, cur, conn)
    if not student_id:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found.")

    try:
        cur.execute("""
            INSERT INTO dismissals (id, student_id, internship_id)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
        """, (str(_uuid.uuid4()), student_id, internship_id))
        conn.commit()
    except Exception:
        conn.rollback()

    conn.close()
    return {"ok": True}


# ── Save to Tracker ───────────────────────────────────────────

@router.post("/v2/internships/save")
async def save_internship(request: Request, internship_id: str = Query(...)):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    student_id = _ensure_student(email, cur, conn)
    if not student_id:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found.")

    cur.execute("""
        SELECT i.id, i.title, i.apply_url, c.name as company_name
        FROM internships i JOIN companies c ON i.company_id = c.id
        WHERE i.id = %s
    """, (internship_id,))
    intern = cur.fetchone()
    if not intern:
        conn.close()
        raise HTTPException(status_code=404, detail="Internship not found.")

    try:
        cur.execute("""
            INSERT INTO applications (id, student_id, internship_id, status,
                company_snapshot, title_snapshot, url_snapshot)
            VALUES (%s, %s, %s, 'saved', %s, %s, %s)
            ON CONFLICT DO NOTHING
        """, (str(_uuid.uuid4()), student_id, internship_id,
              intern["company_name"], intern["title"], intern["apply_url"]))
        conn.commit()
    except Exception:
        conn.rollback()

    conn.close()
    return {"ok": True, "saved": {"company": intern["company_name"], "title": intern["title"]}}
