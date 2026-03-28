"""
Internships v2 — Serves personalized internship feed from PostgreSQL.
Uses multi-cohort matching with S/G/B readiness scoring.

GET  /v2/internships/feed      — personalized feed for the signed-in student
GET  /v2/internships/{id}      — single internship detail with readiness breakdown
GET  /v2/internships/stats     — student's match stats (ready/almost/gap counts)
POST /v2/internships/dismiss   — dismiss a listing from feed
POST /v2/internships/save      — save to application tracker
"""
import os, sys, json, re

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
        except:
            pass
    return psycopg2.connect(
        host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
        database="dilly", user="dilly_admin", password=pw, sslmode="require"
    )

# ── Personalized Feed ─────────────────────────────────────────

@router.get("/v2/internships/feed")
async def get_internship_feed(
    request: Request,
    tab: str = Query("internship", description="internship, entry_level, part_time, or all"),
    readiness: Optional[str] = Query(None, description="Filter: ready, almost, gap"),
    cohort: Optional[str] = Query(None, description="Filter by specific cohort"),
    company: Optional[str] = Query(None, description="Filter by company name"),
    q: Optional[str] = Query(None, description="Search query"),
    sort: str = Query("rank", description="rank, readiness, newest"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Return personalized internship feed ranked by multi-cohort match score."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Get student
    cur.execute("SELECT id FROM students WHERE email = %s", (email,))
    student = cur.fetchone()
    if not student:
        conn.close()
        return {"listings": [], "total": 0, "has_more": False, "message": "Complete onboarding to see matches."}

    student_id = student["id"]

    # Build query
    where = ["m.student_id = %s", "i.status = 'active'"]
    params = [student_id]

    if tab != "all":
        where.append("i.job_type = %s")
        params.append(tab)

    if readiness:
        where.append("m.readiness = %s")
        params.append(readiness)

    if company:
        where.append("c.name ILIKE %s")
        params.append(f"%{company}%")

    if q:
        where.append("(i.title ILIKE %s OR c.name ILIKE %s OR i.description ILIKE %s)")
        like = f"%{q}%"
        params.extend([like, like, like])

    if cohort:
        where.append("m.cohort_readiness::text ILIKE %s")
        params.append(f"%{cohort}%")

    where_sql = " AND ".join(where)

    # Sort
    order = "m.rank_score DESC"
    if sort == "readiness":
        order = "CASE m.readiness WHEN 'ready' THEN 0 WHEN 'almost' THEN 1 ELSE 2 END, m.rank_score DESC"
    elif sort == "newest":
        order = "i.created_at DESC"

    # Count
    cur.execute(f"""
        SELECT COUNT(*) as cnt FROM match_scores m
        JOIN internships i ON m.internship_id = i.id
        JOIN companies c ON i.company_id = c.id
        WHERE {where_sql}
    """, params)
    total = cur.fetchone()["cnt"]

    # Fetch
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

    # Check dismissals
    cur.execute("SELECT internship_id FROM dismissals WHERE student_id = %s", (student_id,))
    dismissed = {r["internship_id"] for r in cur.fetchall()}

    listings = []
    for r in rows:
        if r["id"] in dismissed:
            continue

        # Parse cohort readiness
        cr = r["cohort_readiness"]
        if isinstance(cr, str):
            cr = json.loads(cr)

        listing = {
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
        }
        listings.append(listing)

    conn.close()

    return {
        "listings": listings,
        "total": total,
        "has_more": (offset + limit) < total,
        "tab": tab,
        "filters": {"readiness": readiness, "cohort": cohort, "company": company, "q": q},
    }


# ── Match Stats ───────────────────────────────────────────────

@router.get("/v2/internships/stats")
async def get_match_stats(request: Request):
    """Return match statistics for the signed-in student."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT id FROM students WHERE email = %s", (email,))
    student = cur.fetchone()
    if not student:
        conn.close()
        return {"total": 0, "ready": 0, "almost": 0, "gap": 0, "by_type": {}}

    sid = student["id"]

    cur.execute("""
        SELECT m.readiness, i.job_type, COUNT(*) as cnt
        FROM match_scores m
        JOIN internships i ON m.internship_id = i.id
        WHERE m.student_id = %s AND i.status = 'active'
        GROUP BY m.readiness, i.job_type
    """, (sid,))

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
    """Full internship detail with per-cohort readiness breakdown."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Get student
    cur.execute("SELECT id FROM students WHERE email = %s", (email,))
    student = cur.fetchone()
    student_id = student["id"] if student else None

    # Get internship
    cur.execute("""
        SELECT i.*, c.name as company_name, c.logo_url, c.website, c.industry, c.hq_city, c.hq_state
        FROM internships i
        JOIN companies c ON i.company_id = c.id
        WHERE i.id = %s
    """, (internship_id,))
    intern = cur.fetchone()

    if not intern:
        conn.close()
        raise HTTPException(status_code=404, detail="Internship not found.")

    # Get match if student exists
    match_data = None
    if student_id:
        cur.execute("""
            SELECT * FROM match_scores 
            WHERE student_id = %s AND internship_id = %s
        """, (student_id, internship_id))
        match_data = cur.fetchone()

    # Parse cohort requirements
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
        "tags": intern["tags"] if isinstance(intern["tags"], list) else json.loads(intern["tags"] or "[]"),
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
    """Dismiss an internship from the student's feed."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    conn = _get_db()
    cur = conn.cursor()

    cur.execute("SELECT id FROM students WHERE email = %s", (email,))
    student = cur.fetchone()
    if not student:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found.")

    import uuid
    try:
        cur.execute("""
            INSERT INTO dismissals (id, student_id, internship_id)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
        """, (str(uuid.uuid4()), student[0], internship_id))
        conn.commit()
    except:
        pass

    conn.close()
    return {"ok": True}


# ── Save to Tracker ───────────────────────────────────────────

@router.post("/v2/internships/save")
async def save_internship(request: Request, internship_id: str = Query(...)):
    """Save an internship to the student's application tracker."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    conn = _get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("SELECT id FROM students WHERE email = %s", (email,))
    student = cur.fetchone()
    if not student:
        conn.close()
        raise HTTPException(status_code=404, detail="Student not found.")

    # Get internship info for the tracker
    cur.execute("""
        SELECT i.id, i.title, i.apply_url, c.name as company_name
        FROM internships i JOIN companies c ON i.company_id = c.id
        WHERE i.id = %s
    """, (internship_id,))
    intern = cur.fetchone()
    if not intern:
        conn.close()
        raise HTTPException(status_code=404, detail="Internship not found.")

    import uuid, time
    try:
        cur.execute("""
            INSERT INTO applications (id, student_id, internship_id, status,
                company_snapshot, title_snapshot, url_snapshot)
            VALUES (%s, %s, %s, 'saved', %s, %s, %s)
            ON CONFLICT DO NOTHING
        """, (str(uuid.uuid4()), student["id"], internship_id,
              intern["company_name"], intern["title"], intern["apply_url"]))
        conn.commit()
    except:
        pass

    conn.close()
    return {"ok": True, "saved": {"company": intern["company_name"], "title": intern["title"]}}
