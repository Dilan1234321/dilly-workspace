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
                req_smart, req_grit, req_build, quality_score) -> float:
    s = float(student_smart or 0)
    g = float(student_grit  or 0)
    b = float(student_build or 0)
    rs = float(req_smart or 0)
    rg = float(req_grit  or 0)
    rb = float(req_build or 0)
    margin = (max(s - rs, 0) + max(g - rg, 0) + max(b - rb, 0)) / 3
    return round(margin * 0.6 + float(quality_score or 0) * 0.4, 4)


def _cohort_readiness(
    student_smart, student_grit, student_build,
    student_cohorts: set, cohort_requirements
) -> tuple[list, str | None]:
    """
    Build cohort_readiness list and best cohort-specific readiness label.
    cohort_requirements is a list of {cohort, smart, grit, build} dicts.
    Returns (cohort_readiness_list, best_readiness_or_None).
    """
    if not cohort_requirements:
        return [], None
    if isinstance(cohort_requirements, str):
        try:
            cohort_requirements = json.loads(cohort_requirements)
        except Exception:
            return [], None

    results = []
    for req in (cohort_requirements or []):
        c_name = req.get("cohort", "")
        if c_name not in student_cohorts:
            continue
        rs = float(req.get("smart") or 0)
        rg = float(req.get("grit")  or 0)
        rb = float(req.get("build") or 0)
        rd = _readiness(student_smart, student_grit, student_build, rs, rg, rb)
        results.append({
            "cohort": c_name,
            "readiness": rd,
            "required_smart": rs,
            "required_grit": rg,
            "required_build": rb,
            "student_smart": float(student_smart or 0),
            "student_grit":  float(student_grit  or 0),
            "student_build": float(student_build or 0),
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
):
    """Serve the feed using on-the-fly scoring (no match_scores rows needed)."""
    where = ["i.status = 'active'"]
    params: list = []

    if tab != "all":
        where.append("i.job_type = %s")
        params.append(tab)
    if company_filter:
        where.append("c.name ILIKE %s")
        params.append(f"%{company_filter}%")
    if search:
        where.append("(i.title ILIKE %s OR c.name ILIKE %s OR i.description ILIKE %s)")
        like = f"%{search}%"
        params.extend([like, like, like])
    # Cohort filter: only jobs that list this cohort in cohort_requirements
    if cohort_filter:
        where.append("i.cohort_requirements::text ILIKE %s")
        params.append(f"%{cohort_filter}%")

    where_sql = " AND ".join(where)

    # Fetch all candidates (readiness computed in Python)
    cur.execute(f"""
        SELECT
            i.id, i.title, i.description, i.location_city, i.location_state,
            i.work_mode, i.is_paid, i.apply_url, i.deadline, i.job_type,
            i.posted_date, i.required_smart, i.required_grit, i.required_build,
            i.quality_score, i.cohort_requirements,
            c.name as company_name, c.logo_url, c.website, c.industry
        FROM internships i
        JOIN companies c ON i.company_id = c.id
        WHERE {where_sql}
        ORDER BY i.quality_score DESC NULLS LAST
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

        # Try cohort-specific readiness first; fall back to flat required scores
        cr_list, cohort_rd = _cohort_readiness(
            student_smart, student_grit, student_build,
            student_cohorts, r["cohort_requirements"]
        )
        if cohort_rd:
            rd = cohort_rd
        else:
            rd = _readiness(student_smart, student_grit, student_build,
                            r["required_smart"], r["required_grit"], r["required_build"])

        if readiness_filter and rd != readiness_filter:
            continue

        rk = _rank_score(student_smart, student_grit, student_build,
                         r["required_smart"], r["required_grit"], r["required_build"],
                         r["quality_score"])
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
            "description_preview": re.sub(r"<[^>]+>", "", (r["description"] or ""))[:300].strip(),
        })

    # Sort
    if sort == "readiness":
        order_map = {"ready": 0, "almost": 1, "gap": 2}
        listings.sort(key=lambda x: (order_map.get(x["readiness"], 3), -x["rank_score"]))
    elif sort == "newest":
        listings.sort(key=lambda x: x["posted_date"] or "", reverse=True)
    else:
        listings.sort(key=lambda x: -x["rank_score"])

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
    tab: str = Query("internship", description="internship, entry_level, part_time, or all"),
    readiness: Optional[str] = Query(None),
    cohort: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    search: Optional[str] = Query(None),  # alias used by jobs page
    sort: str = Query("rank"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    search_term = q or search  # accept either param name

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    student_id = _ensure_student(email, cur, conn)
    if not student_id:
        conn.close()
        return {"listings": [], "total": 0, "has_more": False,
                "message": "Complete onboarding to see matches."}

    # Read student scores + cohort for fallback scoring
    cur.execute(
        "SELECT overall_smart, overall_grit, overall_build, cohort, majors, minors FROM students WHERE id = %s",
        (student_id,),
    )
    stu = cur.fetchone()
    s_smart = float(stu["overall_smart"]) if stu and stu["overall_smart"] else 0
    s_grit  = float(stu["overall_grit"])  if stu and stu["overall_grit"]  else 0
    s_build = float(stu["overall_build"]) if stu and stu["overall_build"] else 0
    # Build set of student cohorts (primary + from majors + from minors)
    s_cohort = stu["cohort"] if stu else None
    def _parse_json_list(v):
        if isinstance(v, list): return v
        if isinstance(v, str):
            try: return json.loads(v)
            except Exception: return []
        return []
    s_majors = _parse_json_list(stu["majors"] if stu else [])
    s_minors = _parse_json_list(stu["minors"] if stu else [])
    try:
        from projects.dilly.api.cohort_config import MAJOR_TO_COHORT
        _student_cohorts: set[str] = set()
        if s_cohort:
            _student_cohorts.add(s_cohort)
        for _m in (s_majors + s_minors):
            _c = MAJOR_TO_COHORT.get(str(_m).strip())
            if _c:
                _student_cohorts.add(_c)
    except Exception:
        _student_cohorts = {s_cohort} if s_cohort else set()

    # Check if pre-computed match_scores exist
    cur.execute(
        "SELECT COUNT(*) as cnt FROM match_scores WHERE student_id = %s", (student_id,)
    )
    has_precomputed = cur.fetchone()["cnt"] > 0

    if not has_precomputed:
        result = _fallback_feed(
            cur, student_id, s_smart, s_grit, s_build, _student_cohorts,
            tab, readiness, company, search_term, cohort,
            sort, limit, offset,
        )
        conn.close()
        return {**result, "tab": tab,
                "filters": {"readiness": readiness, "cohort": cohort,
                            "company": company, "q": search_term}}

    # ── Pre-computed path (existing logic) ────────────────────
    where = ["m.student_id = %s", "i.status = 'active'"]
    params: list = [student_id]

    if tab != "all":
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

    where_sql = " AND ".join(where)
    order = "m.rank_score DESC"
    if sort == "readiness":
        order = "CASE m.readiness WHEN 'ready' THEN 0 WHEN 'almost' THEN 1 ELSE 2 END, m.rank_score DESC"
    elif sort == "newest":
        order = "i.created_at DESC"

    cur.execute(f"""
        SELECT COUNT(*) as cnt FROM match_scores m
        JOIN internships i ON m.internship_id = i.id
        JOIN companies c ON i.company_id = c.id
        WHERE {where_sql}
    """, params)
    total = cur.fetchone()["cnt"]

    cur.execute(f"""
        SELECT
            i.id, i.title, i.description, i.location_city, i.location_state,
            i.work_mode, i.is_paid, i.apply_url, i.deadline, i.job_type,
            i.cohort_requirements, i.posted_date,
            c.name as company_name, c.logo_url, c.website, c.industry,
            m.rank_score, m.readiness, m.cohort_readiness,
            m.location_score, m.work_mode_score, m.compensation_score
        FROM match_scores m
        JOIN internships i ON m.internship_id = i.id
        JOIN companies c ON i.company_id = c.id
        WHERE {where_sql}
        ORDER BY {order}
        LIMIT %s OFFSET %s
    """, params + [limit, offset])
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
            "description_preview": re.sub(r"<[^>]+>", "", (r["description"] or ""))[:300].strip(),
        })

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
        "SELECT overall_smart, overall_grit, overall_build, cohort, majors, minors FROM students WHERE id = %s",
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
    s_majors_raw = _pjl(stu["majors"] if stu else [])
    s_minors_raw = _pjl(stu["minors"] if stu else [])
    try:
        from projects.dilly.api.cohort_config import MAJOR_TO_COHORT
        _sc: set[str] = set()
        if s_cohort:
            _sc.add(s_cohort)
        for _m in (s_majors_raw + s_minors_raw):
            _c2 = MAJOR_TO_COHORT.get(str(_m).strip())
            if _c2:
                _sc.add(_c2)
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
