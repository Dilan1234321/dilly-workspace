"""
Generated Resumes API — save, list, and retrieve AI-generated resumes.

POST /generated-resumes         — save a new generated resume
GET  /generated-resumes         — list all resumes for the user (newest first)
GET  /generated-resumes/{id}    — get a specific resume by ID
DELETE /generated-resumes/{id}  — delete a resume
"""
import os, sys, json

_ROUTER_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE = os.path.normpath(os.path.join(_ROUTER_DIR, "..", "..", "..", ".."))
if _WORKSPACE not in sys.path:
    sys.path.insert(0, _WORKSPACE)

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import psycopg2
import psycopg2.extras

from projects.dilly.api import deps

router = APIRouter(tags=["generated-resumes"])


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


def _get_student_id(email: str) -> Optional[str]:
    conn = _get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM students WHERE email = %s", (email,))
            row = cur.fetchone()
            return str(row[0]) if row else None
    finally:
        conn.close()


class SaveResumeRequest(BaseModel):
    job_title: str
    company: str
    job_description: Optional[str] = None
    sections: list
    cohort: Optional[str] = None


@router.post("/generated-resumes")
async def save_generated_resume(request: Request, body: SaveResumeRequest):
    user = deps.require_auth(request)
    email = user.get("email", "")
    student_id = _get_student_id(email)
    if not student_id:
        raise HTTPException(status_code=404, detail="Student not found")

    conn = _get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO generated_resumes (student_id, job_title, company, job_description, sections, cohort)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING id, created_at""",
                (student_id, body.job_title, body.company, body.job_description,
                 json.dumps(body.sections), body.cohort)
            )
            row = cur.fetchone()
            conn.commit()
            return {"id": str(row[0]), "created_at": row[1].isoformat()}
    finally:
        conn.close()


@router.get("/generated-resumes")
async def list_generated_resumes(request: Request):
    user = deps.require_auth(request)
    email = user.get("email", "")
    student_id = _get_student_id(email)
    if not student_id:
        return {"resumes": []}

    conn = _get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT id, job_title, company, cohort, created_at
                   FROM generated_resumes
                   WHERE student_id = %s
                   ORDER BY created_at DESC
                   LIMIT 50""",
                (student_id,)
            )
            rows = cur.fetchall()
            return {"resumes": [{
                "id": str(r["id"]),
                "job_title": r["job_title"],
                "company": r["company"],
                "cohort": r["cohort"],
                "created_at": r["created_at"].isoformat(),
            } for r in rows]}
    finally:
        conn.close()


@router.get("/generated-resumes/{resume_id}")
async def get_generated_resume(request: Request, resume_id: str):
    user = deps.require_auth(request)
    email = user.get("email", "")
    student_id = _get_student_id(email)
    if not student_id:
        raise HTTPException(status_code=404, detail="Not found")

    conn = _get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """SELECT id, job_title, company, job_description, sections, cohort, created_at
                   FROM generated_resumes
                   WHERE id = %s AND student_id = %s""",
                (resume_id, student_id)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Resume not found")
            return {
                "id": str(row["id"]),
                "job_title": row["job_title"],
                "company": row["company"],
                "job_description": row["job_description"],
                "sections": row["sections"],
                "cohort": row["cohort"],
                "created_at": row["created_at"].isoformat(),
            }
    finally:
        conn.close()


@router.delete("/generated-resumes/{resume_id}")
async def delete_generated_resume(request: Request, resume_id: str):
    user = deps.require_auth(request)
    email = user.get("email", "")
    student_id = _get_student_id(email)
    if not student_id:
        raise HTTPException(status_code=404, detail="Not found")

    conn = _get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM generated_resumes WHERE id = %s AND student_id = %s",
                (resume_id, student_id)
            )
            conn.commit()
            return {"deleted": True}
    finally:
        conn.close()
