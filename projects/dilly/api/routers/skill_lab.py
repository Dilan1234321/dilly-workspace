"""
Skill Lab public API. Reads from skill_lab_videos (populated by the nightly
ingest script). Writes to skill_lab_saved_videos (user library).

Mounted in main.py as:
    app.include_router(skill_lab_routes.router)
"""
from __future__ import annotations

import re
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from projects.dilly.api.database import get_db
from projects.dilly.api.deps import require_auth

router = APIRouter(prefix="/skill-lab", tags=["skill-lab"])


# ── Slug ↔ cohort display-name mapping ────────────────────────────────────────
# Kept here (not imported from TS) so the backend is self-contained. Must stay
# in sync with projects/skill-lab/lib/cohorts.ts.
_SLUG_TO_COHORT: dict[str, str] = {
    "software-engineering-cs":          "Software Engineering & CS",
    "data-science-analytics":           "Data Science & Analytics",
    "cybersecurity-it":                 "Cybersecurity & IT",
    "electrical-computer-engineering":  "Electrical & Computer Engineering",
    "mechanical-aerospace-engineering": "Mechanical & Aerospace Engineering",
    "civil-environmental-engineering":  "Civil & Environmental Engineering",
    "chemical-biomedical-engineering":  "Chemical & Biomedical Engineering",
    "finance-accounting":               "Finance & Accounting",
    "consulting-strategy":              "Consulting & Strategy",
    "marketing-advertising":            "Marketing & Advertising",
    "management-operations":            "Management & Operations",
    "entrepreneurship-innovation":      "Entrepreneurship & Innovation",
    "economics-public-policy":          "Economics & Public Policy",
    "healthcare-clinical":              "Healthcare & Clinical",
    "biotech-pharmaceutical":           "Biotech & Pharmaceutical",
    "life-sciences-research":           "Life Sciences & Research",
    "physical-sciences-math":           "Physical Sciences & Math",
    "law-government":                   "Law & Government",
    "media-communications":             "Media & Communications",
    "design-creative-arts":             "Design & Creative Arts",
    "education-human-development":      "Education & Human Development",
    "social-sciences-nonprofit":        "Social Sciences & Nonprofit",
}


SELECT_COLS = (
    "id, title, description, channel_id, channel_title, cohort, "
    "duration_sec, view_count, published_at, thumbnail_url, quality_score, language"
)

SUPPORTED_LANGS: set[str] = {"en", "es", "pt", "hi", "fr", "zh"}


def _clean_lang(lang: str | None) -> str | None:
    """Accept any supported language; return None if unsupported so we don't filter."""
    if not lang:
        return None
    code = lang.strip().lower().split("-")[0]
    return code if code in SUPPORTED_LANGS else None


def _serialize(row: tuple) -> dict:
    (
        vid, title, description, channel_id, channel_title, cohort,
        duration_sec, view_count, published_at, thumbnail_url, quality_score,
        language,
    ) = row
    return {
        "id": vid,
        "title": title,
        "description": description,
        "channel_id": channel_id,
        "channel_title": channel_title,
        "cohort": cohort,
        "duration_sec": int(duration_sec or 0),
        "view_count": int(view_count or 0),
        "published_at": published_at.isoformat() if published_at else None,
        "thumbnail_url": thumbnail_url or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
        "quality_score": float(quality_score or 0),
        "language": language or "en",
    }


_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,24}$")


def _valid_video_id(video_id: str) -> bool:
    return bool(_VIDEO_ID_RE.match(video_id or ""))


# ── Public endpoints ──────────────────────────────────────────────────────────

@router.get("/videos")
def list_videos(
    cohort: str = Query(..., description="Cohort slug"),
    sort: Literal["best", "newest"] = Query("best"),
    limit: int = Query(48, ge=1, le=100),
    max_duration_min: int | None = Query(None, ge=1, le=600),
    lang: str | None = Query(None, description="ISO language code (e.g. en, es)"),
):
    cohort_name = _SLUG_TO_COHORT.get(cohort)
    if not cohort_name:
        raise HTTPException(status_code=404, detail="Unknown cohort")

    order = "quality_score DESC, view_count DESC" if sort == "best" else "published_at DESC"
    params: list = [cohort_name]
    clauses = ["cohort = %s"]
    if max_duration_min is not None:
        clauses.append("duration_sec <= %s")
        params.append(max_duration_min * 60)
    lang_code = _clean_lang(lang)
    if lang_code:
        clauses.append("language = %s")
        params.append(lang_code)
    where = " AND ".join(clauses)

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {SELECT_COLS}
                  FROM skill_lab_videos
                 WHERE {where}
                 ORDER BY {order}
                 LIMIT %s
                """,
                (*params, limit),
            )
            rows = cur.fetchall()

    # If a language was requested but nothing matched, fall back to English so
    # the page renders useful content instead of a wall of empty states while
    # we grow the library for that language.
    if lang_code and not rows and lang_code != "en":
        with get_db() as conn:
            with conn.cursor() as cur:
                fallback_params = [cohort_name]
                fallback_clauses = ["cohort = %s", "language = %s"]
                fallback_params.append("en")
                if max_duration_min is not None:
                    fallback_clauses.append("duration_sec <= %s")
                    fallback_params.append(max_duration_min * 60)
                cur.execute(
                    f"""
                    SELECT {SELECT_COLS}
                      FROM skill_lab_videos
                     WHERE {" AND ".join(fallback_clauses)}
                     ORDER BY {order}
                     LIMIT %s
                    """,
                    (*fallback_params, limit),
                )
                rows = cur.fetchall()

    return {"videos": [_serialize(r) for r in rows]}


@router.get("/videos/{video_id}")
def get_video(video_id: str):
    if not _valid_video_id(video_id):
        raise HTTPException(status_code=400, detail="Invalid video id")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {SELECT_COLS} FROM skill_lab_videos WHERE id = %s",
                (video_id,),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Video not found")
    return {"video": _serialize(row)}


@router.get("/trending")
def trending(
    limit: int = Query(12, ge=1, le=48),
    lang: str | None = Query(None, description="ISO language code"),
):
    """Top videos across all cohorts, weighted toward recency + signal."""
    lang_code = _clean_lang(lang)
    params: list = []
    clauses = ["published_at > NOW() - INTERVAL '180 days'"]
    if lang_code:
        clauses.append("language = %s")
        params.append(lang_code)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {SELECT_COLS}
                  FROM skill_lab_videos
                 WHERE {" AND ".join(clauses)}
                 ORDER BY quality_score DESC, view_count DESC
                 LIMIT %s
                """,
                (*params, limit),
            )
            rows = cur.fetchall()
    # Fallback to English if the selected language has no trending content yet.
    if lang_code and not rows and lang_code != "en":
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT {SELECT_COLS}
                      FROM skill_lab_videos
                     WHERE published_at > NOW() - INTERVAL '180 days' AND language = 'en'
                     ORDER BY quality_score DESC, view_count DESC
                     LIMIT %s
                    """,
                    (limit,),
                )
                rows = cur.fetchall()
    return {"videos": [_serialize(r) for r in rows]}


# ── User library ──────────────────────────────────────────────────────────────

@router.get("/library")
def list_library(user: dict = Depends(require_auth)):
    email = (user.get("email") or "").strip().lower()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {", ".join("v." + c for c in SELECT_COLS.split(", "))},
                       s.saved_at, s.progress_sec
                  FROM skill_lab_saved_videos s
                  JOIN skill_lab_videos v ON v.id = s.video_id
                 WHERE s.user_id = %s
                 ORDER BY s.saved_at DESC
                """,
                (email,),
            )
            rows = cur.fetchall()
    videos = []
    for r in rows:
        base = _serialize(r[:12])
        videos.append({
            **base,
            "saved_at": r[12].isoformat() if r[12] else None,
            "progress_sec": int(r[13] or 0),
        })
    return {"videos": videos}


@router.post("/save")
def save_video(
    body: dict = Body(...),
    user: dict = Depends(require_auth),
):
    email = (user.get("email") or "").strip().lower()
    video_id = str(body.get("video_id") or "").strip()
    if not _valid_video_id(video_id):
        raise HTTPException(status_code=400, detail="Invalid video id")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM skill_lab_videos WHERE id = %s",
                (video_id,),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Video not found")
            cur.execute(
                """
                INSERT INTO skill_lab_saved_videos (user_id, video_id)
                VALUES (%s, %s)
                ON CONFLICT (user_id, video_id) DO NOTHING
                """,
                (email, video_id),
            )
    return {"ok": True}


@router.delete("/save/{video_id}")
def unsave_video(video_id: str, user: dict = Depends(require_auth)):
    if not _valid_video_id(video_id):
        raise HTTPException(status_code=400, detail="Invalid video id")
    email = (user.get("email") or "").strip().lower()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM skill_lab_saved_videos WHERE user_id = %s AND video_id = %s",
                (email, video_id),
            )
    return {"ok": True}
