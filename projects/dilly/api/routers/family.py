"""
Family plan: add-student flow (token-based, no Bearer auth).
"""
from fastapi import APIRouter, HTTPException, Request

from projects.dilly.api import errors
from projects.dilly.api.schemas import FamilyAddStudentRequest

router = APIRouter(prefix="/family", tags=["family"])


@router.get("/add", summary="Family add page info")
async def family_add_info(token: str = ""):
    """Return family info for add-student page. Query: token=family_add_token. No auth."""
    if not (token or "").strip():
        raise errors.bad_request("token required.")
    from projects.dilly.api.family_store import get_family_by_add_token
    family = get_family_by_add_token(token.strip())
    if not family:
        raise errors.not_found("Invalid or expired link.")
    students = family.get("student_emails") or []
    slots = family.get("slots") or 3
    return {
        "family_id": family.get("id"),
        "slots_used": len(students),
        "slots_total": slots,
        "student_emails": students,
    }


@router.post("/add-student", summary="Add student to family")
async def family_add_student(request: Request, body: FamilyAddStudentRequest):
    """Add a student to a family. Body: { family_add_token, student_email }. student_email must be .edu. No auth (token is the auth)."""
    token = (body.family_add_token or "").strip()
    student_email = (body.student_email or "").strip().lower()
    if not student_email or ".edu" not in student_email:
        raise errors.validation_error("student_email must be a .edu address.")
    try:
        from projects.dilly.api.family_store import add_student_by_token
        from projects.dilly.api.auth_store_pg import set_subscribed
        from projects.dilly.api.profile_store import ensure_profile_exists, save_profile
        if not add_student_by_token(token, student_email):
            raise errors.bad_request("Invalid token or no slots left.")
        set_subscribed(student_email, True)
        ensure_profile_exists(student_email)
        save_profile(student_email, {"profileStatus": "active"})
        return {"ok": True, "message": f"Added {student_email}. They now have full access."}
    except HTTPException:
        raise
    except Exception:
        raise errors.internal("Could not add student.")
