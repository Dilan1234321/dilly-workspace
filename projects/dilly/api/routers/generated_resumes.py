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

from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List
import psycopg2
import psycopg2.extras
import re

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
    ats_system: Optional[str] = None  # e.g. greenhouse, lever, ashby, workday
    ats_parse_score: Optional[int] = None
    keyword_coverage_pct: Optional[int] = None


@router.post("/generated-resumes")
async def save_generated_resume(request: Request, body: SaveResumeRequest):
    user = deps.require_auth(request)
    email = user.get("email", "")
    student_id = _get_student_id(email)
    if not student_id:
        raise HTTPException(status_code=404, detail="Student not found")

    ats = (body.ats_system or "greenhouse").lower().strip() or "greenhouse"

    # Ensure the extended columns exist before we try to INSERT into them.
    # Idempotent; silently no-ops on repeat.
    try:
        conn0 = _get_db()
        with conn0.cursor() as cur0:
            cur0.execute(
                "ALTER TABLE generated_resumes ADD COLUMN IF NOT EXISTS ats_system TEXT DEFAULT 'greenhouse'"
            )
            cur0.execute(
                "ALTER TABLE generated_resumes ADD COLUMN IF NOT EXISTS ats_parse_score INTEGER DEFAULT 0"
            )
            cur0.execute(
                "ALTER TABLE generated_resumes ADD COLUMN IF NOT EXISTS keyword_coverage_pct INTEGER DEFAULT 0"
            )
        conn0.commit()
        conn0.close()
    except Exception as _e:
        import sys as _s
        _s.stderr.write(f"[save_generated_resume ensure columns] {type(_e).__name__}: {_e}\n")

    conn = _get_db()
    try:
        with conn.cursor() as cur:
            # Try the full INSERT with verification fields first. If it
            # fails (e.g. ancient DB shard with none of the new columns),
            # fall back to the legacy insert so we never break saving.
            try:
                cur.execute(
                    """INSERT INTO generated_resumes
                       (student_id, job_title, company, job_description,
                        sections, cohort, ats_system, ats_parse_score,
                        keyword_coverage_pct)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                       RETURNING id, created_at""",
                    (
                        student_id, body.job_title, body.company, body.job_description,
                        json.dumps(body.sections), body.cohort, ats,
                        int(body.ats_parse_score or 0),
                        int(body.keyword_coverage_pct or 0),
                    ),
                )
                row = cur.fetchone()
            except Exception as _ie:
                conn.rollback()
                import sys as _s
                _s.stderr.write(f"[save_generated_resume full insert failed, falling back] {type(_ie).__name__}: {_ie}\n")
                cur.execute(
                    """INSERT INTO generated_resumes
                       (student_id, job_title, company, job_description,
                        sections, cohort)
                       VALUES (%s, %s, %s, %s, %s, %s)
                       RETURNING id, created_at""",
                    (
                        student_id, body.job_title, body.company, body.job_description,
                        json.dumps(body.sections), body.cohort,
                    ),
                )
                row = cur.fetchone()
            conn.commit()
            return {
                "id": str(row[0]),
                "created_at": row[1].isoformat(),
                "ats_system": ats,
            }
    finally:
        conn.close()


class UpdateResumeRequest(BaseModel):
    """PATCH body for inline resume edits from the mobile preview.

    Only `sections` is typically sent — the user is tweaking bullet
    text, a company name, or a role title in the preview and we
    upsert the whole sections JSON. job_title / company / cohort are
    optional for the rare case where those get edited too."""
    sections: Optional[list[dict]] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    job_description: Optional[str] = None


@router.patch("/generated-resumes/{resume_id}")
async def update_generated_resume(request: Request, resume_id: str, body: UpdateResumeRequest):
    """Update an existing generated resume row. Ownership is enforced
    by the student_id filter in the WHERE clause — callers can only
    touch their own rows. Fields not in the body are left alone."""
    user = deps.require_auth(request)
    email = user.get("email", "")
    student_id = _get_student_id(email)
    if not student_id:
        raise HTTPException(status_code=404, detail="Student not found")

    updates: list[str] = []
    params: list = []
    if body.sections is not None:
        updates.append("sections = %s")
        params.append(json.dumps(body.sections))
    if body.job_title is not None:
        updates.append("job_title = %s")
        params.append(body.job_title)
    if body.company is not None:
        updates.append("company = %s")
        params.append(body.company)
    if body.job_description is not None:
        updates.append("job_description = %s")
        params.append(body.job_description)

    if not updates:
        return {"ok": True, "changed": False}

    sql = f"UPDATE generated_resumes SET {', '.join(updates)} WHERE id = %s AND student_id = %s"
    params.extend([resume_id, student_id])

    conn = _get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            changed = cur.rowcount
        conn.commit()
        if changed == 0:
            raise HTTPException(status_code=404, detail="Resume not found")
        return {"ok": True, "changed": True}
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
            # De-dup by (job_title, company): each time a user
            # regenerates a resume for the same role, a new row gets
            # written. Surfacing every regeneration makes My Resumes
            # look like "5 copies of the same resume". Keep only the
            # newest per job/company pair. DISTINCT ON + matching
            # ORDER BY gives us that in a single query.
            cur.execute(
                """SELECT DISTINCT ON (lower(job_title), lower(company))
                          id, job_title, company, cohort, created_at
                   FROM generated_resumes
                   WHERE student_id = %s
                   ORDER BY lower(job_title), lower(company), created_at DESC""",
                (student_id,)
            )
            rows = cur.fetchall()
            # Re-sort by recency across the de-duped set.
            rows.sort(key=lambda r: r["created_at"], reverse=True)
            return {"resumes": [{
                "id": str(r["id"]),
                "job_title": r["job_title"],
                "company": r["company"],
                "cohort": r["cohort"],
                "created_at": r["created_at"].isoformat(),
            } for r in rows[:50]]}
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
            # Defensive SELECT: some older rows may not have the new
            # columns populated if the migration hasn't run on their
            # DB shard yet. Use COALESCE-by-try pattern: attempt the
            # rich query first, fall back to the legacy column set.
            try:
                cur.execute(
                    """SELECT id, job_title, company, job_description, sections,
                              cohort, ats_system, ats_parse_score,
                              keyword_coverage_pct, created_at
                       FROM generated_resumes
                       WHERE id = %s AND student_id = %s""",
                    (resume_id, student_id),
                )
                row = cur.fetchone()
            except Exception:
                conn.rollback()
                cur.execute(
                    """SELECT id, job_title, company, job_description, sections,
                              cohort, created_at
                       FROM generated_resumes
                       WHERE id = %s AND student_id = %s""",
                    (resume_id, student_id),
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
                "ats_system": row.get("ats_system") or "greenhouse",
                "ats_parse_score": row.get("ats_parse_score") or 0,
                "keyword_coverage_pct": row.get("keyword_coverage_pct") or 0,
                "created_at": row["created_at"].isoformat(),
            }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Download as real PDF or DOCX
# ---------------------------------------------------------------------------
def _safe_filename(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9 _.-]+", "", name or "").strip()
    return re.sub(r"\s+", "_", s) or "Resume"


@router.get("/generated-resumes/{resume_id}/file")
async def download_generated_resume(
    request: Request,
    resume_id: str,
    format: str = Query("pdf", description="pdf or docx"),
):
    """Serve a real text-layer PDF or DOCX rendered from the stored sections.
    No more PNG screenshots — ATS parsers need actual text bytes."""
    user = deps.require_auth(request)
    email = user.get("email", "")
    student_id = _get_student_id(email)
    if not student_id:
        raise HTTPException(status_code=404, detail="Not found")

    fmt = (format or "pdf").lower().strip()
    if fmt not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="format must be pdf or docx")

    conn = _get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            try:
                cur.execute(
                    """SELECT job_title, company, sections, ats_system
                       FROM generated_resumes
                       WHERE id = %s AND student_id = %s""",
                    (resume_id, student_id),
                )
                row = cur.fetchone()
            except Exception:
                conn.rollback()
                cur.execute(
                    """SELECT job_title, company, sections
                       FROM generated_resumes
                       WHERE id = %s AND student_id = %s""",
                    (resume_id, student_id),
                )
                row = cur.fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Resume not found")

    sections = row["sections"]
    if isinstance(sections, str):
        try:
            sections = json.loads(sections)
        except Exception:
            sections = []
    ats = (row.get("ats_system") if isinstance(row, dict) else None) or "greenhouse"

    # Candidate name for the filename — pull from the contact section
    candidate_name = "Resume"
    try:
        for s in sections or []:
            if isinstance(s, dict) and s.get("key") == "contact":
                nm = ((s.get("contact") or {}).get("name") or "").strip()
                if nm:
                    candidate_name = nm
                break
    except Exception:
        pass

    safe_name = _safe_filename(candidate_name)
    safe_company = _safe_filename(row["company"] or "Company")
    base = f"{safe_name}_{safe_company}_Resume"

    if fmt == "pdf":
        try:
            from projects.dilly.api.ats_resume_builder import build_ats_pdf
            pdf_bytes = build_ats_pdf(sections, ats)
        except Exception as _e:
            import sys as _sys, traceback as _tb
            _sys.stderr.write(f"[pdf_build_error] resume_id={resume_id} ats={ats} sections_len={len(sections) if isinstance(sections, list) else 'N/A'} error={type(_e).__name__}: {_e}\n")
            _tb.print_exc(file=_sys.stderr)
            raise HTTPException(status_code=500, detail=f"PDF build failed: {type(_e).__name__}: {str(_e)[:200]}")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{base}.pdf"',
            },
        )
    else:
        try:
            from projects.dilly.api.ats_resume_docx import build_ats_docx
            docx_bytes = build_ats_docx(sections, ats)
        except Exception as _e:
            import sys as _sys, traceback as _tb
            _sys.stderr.write(f"[docx_build_error] resume_id={resume_id} ats={ats} sections_len={len(sections) if isinstance(sections, list) else 'N/A'} error={type(_e).__name__}: {_e}\n")
            _tb.print_exc(file=_sys.stderr)
            raise HTTPException(status_code=500, detail=f"DOCX build failed: {type(_e).__name__}: {str(_e)[:200]}")
        return Response(
            content=docx_bytes,
            media_type=(
                "application/vnd.openxmlformats-officedocument."
                "wordprocessingml.document"
            ),
            headers={
                "Content-Disposition": f'attachment; filename="{base}.docx"',
            },
        )


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
