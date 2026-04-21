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
    "duration_sec, view_count, published_at, thumbnail_url, quality_score, language, "
    "summary, summary_source"
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
        language, summary, summary_source,
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
        "summary": summary,
        "summary_source": summary_source,
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


@router.get("/public/{slug}")
def public_skills_profile(
    slug: str,
    context: str | None = Query(None, description="'dilly' when called from the Dilly career profile"),
):
    """
    Unauthenticated, shareable read-only view of a user's Skill Lab
    footprint. Looked up by their Dilly readable_slug (same slug used on
    hellodilly.com/s/{slug} and /p/{slug}).

    Returns *only* what's safe to share: first name, total hours invested,
    cohort breakdown, and counts. No email, no full profile, no session.

    The optional `context=dilly` param is set by Dilly's PublicProfile
    component. We use it to honour the user's skills_show_learning
    opt-out: when false, we zero the aggregates so the Dilly card hides.
    The user's own Skill Lab /u/{slug} page (no context) still renders
    fully.
    """
    from projects.dilly.api.profile_store import get_profile_by_readable_slug

    # The slug lookup honours both s/ (student) and p/ (general) by not
    # passing a prefix — the profile_store matches on the raw slug.
    profile = get_profile_by_readable_slug(slug)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    email = (profile.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Assemble just the public-safe subset
    name = (
        profile.get("full_name")
        or profile.get("name")
        or profile.get("first_name")
        or "Someone on Dilly"
    )
    first_name = (profile.get("first_name") or "").strip() or str(name).split()[0]
    school = profile.get("school") or profile.get("school_id")
    majors = profile.get("majors")
    if not isinstance(majors, list):
        majors = []
    if profile.get("major") and profile.get("major") not in majors:
        majors = [profile["major"], *majors]

    tagline = profile.get("profile_tagline")

    # ── Career cross-link data ────────────────────────────────────────────
    # Canonical rule, mirrored exactly from Dilly's /profile/generate-slug
    # endpoint (projects/dilly/api/routers/profile.py ~line 1599):
    #     user_type = profile.user_type or "student"
    #     is_student = user_type not in ("general", "professional")
    # So a missing user_type defaults to student, and anything labeled
    # 'general' or 'professional' is the /p/{slug} general track.
    user_type = (profile.get("user_type") or "student").strip().lower()
    is_student = user_type not in ("general", "professional")
    dilly_profile_url = (
        f"https://hellodilly.com/{'s' if is_student else 'p'}/{slug}"
    )

    # Privacy flags — both default ON so the ecosystem feels connected
    # out of the box. User can turn either off on their Skill Lab profile.
    #   skills_show_career    : whether the Skill Lab public profile shows
    #                           Dilly career info (goal + target + goals).
    #   skills_show_learning  : whether the Dilly career profile is allowed
    #                           to render the learning card.
    web_settings = profile.get("web_profile_settings") or {}
    if not isinstance(web_settings, dict):
        web_settings = {}
    career_visible = web_settings.get("skills_show_career", True)
    learning_visible = web_settings.get("skills_show_learning", True)

    # Career fields — distilled, not a full profile dump
    career_goal = profile.get("career_goal")
    application_target = (
        profile.get("application_target_label")
        or profile.get("application_target")
    )
    industry_target = profile.get("industry_target")
    goals = profile.get("goals")
    if not isinstance(goals, list):
        goals = []
    goals = [g for g in goals if isinstance(g, str) and g.strip()][:3]

    career_block = (
        {
            "url": dilly_profile_url,
            "career_goal": career_goal,
            "application_target": application_target,
            "industry_target": industry_target,
            "goals": goals,
        }
        if career_visible
        else None
    )

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(seconds_engaged), 0)::BIGINT,
                    COUNT(*)::INTEGER,
                    COUNT(DISTINCT cohort)::INTEGER,
                    COUNT(articulation) FILTER (WHERE articulation IS NOT NULL)::INTEGER
                  FROM skill_lab_learning_receipts
                 WHERE user_email = %s
                """,
                (email,),
            )
            totals = cur.fetchone() or (0, 0, 0, 0)
            cur.execute(
                """
                SELECT cohort, SUM(seconds_engaged)::BIGINT, COUNT(*)::INTEGER
                  FROM skill_lab_learning_receipts
                 WHERE user_email = %s
                 GROUP BY cohort
                 ORDER BY 2 DESC
                """,
                (email,),
            )
            by_cohort = [
                {"cohort": c, "seconds": int(s or 0), "videos": int(v or 0)}
                for (c, s, v) in cur.fetchall()
            ]

    # If the caller is the Dilly career profile AND the user has opted
    # out of showing learning there, zero the aggregates so the card
    # hides via its 'silent when empty' branch. The user's own /u/{slug}
    # Skill Lab page (no context=dilly) is unaffected.
    suppress_for_dilly = (context == "dilly") and not learning_visible
    if suppress_for_dilly:
        total_seconds = 0
        videos_engaged = 0
        cohorts_touched = 0
        articulations = 0
        by_cohort = []
    else:
        total_seconds = int(totals[0] or 0)
        videos_engaged = int(totals[1] or 0)
        cohorts_touched = int(totals[2] or 0)
        articulations = int(totals[3] or 0)

    return {
        "name": name,
        "first_name": first_name,
        "slug": slug,
        "school": school,
        "majors": majors,
        "tagline": tagline,
        "total_seconds": total_seconds,
        "videos_engaged": videos_engaged,
        "cohorts_touched": cohorts_touched,
        "articulations": articulations,
        "by_cohort": by_cohort,
        "career": career_block,  # null if user opted out of career-on-Skills
        "learning_visible": learning_visible,
    }


@router.get("/cohorts/populated")
def populated_cohorts():
    """Returns which cohort display-names have >=1 video. Used by the UI
    to hide empty cohorts from browse/index grids."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT cohort, COUNT(*) AS n
                  FROM skill_lab_videos
                 GROUP BY cohort
                HAVING COUNT(*) > 0
                """
            )
            rows = cur.fetchall()
    # Reverse-map display name → slug
    name_to_slug = {v: k for k, v in _SLUG_TO_COHORT.items()}
    return {
        "cohorts": [
            {
                "slug": name_to_slug.get(cohort, ""),
                "name": cohort,
                "count": int(n),
            }
            for cohort, n in rows
            if name_to_slug.get(cohort)
        ],
    }


@router.get("/ask")
def ask(
    q: str = Query(..., min_length=2, max_length=500),
    limit: int = Query(12, ge=1, le=30),
):
    """
    Free-text situation search. Zero LLM: Postgres full-text matches the
    phrase against (title + channel + cohort + description), ranks with
    ts_rank_cd, blends with quality_score. Also detects cohort intent by
    scoring against skill_lab_cohort_keywords so a phrase like
    "I want to be a data scientist" also surfaces the cohort itself.
    """
    phrase = q.strip()
    # websearch_to_tsquery handles natural-language input — quotes, negatives,
    # OR — without raising on weird punctuation. We build the tsquery once and
    # pass it in twice, then order by a real expression (no alias) to avoid
    # planner ambiguity across Postgres versions.
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {SELECT_COLS}
                  FROM skill_lab_videos
                 WHERE search_doc @@ websearch_to_tsquery('english', %s)
                 ORDER BY (
                    ts_rank_cd(search_doc, websearch_to_tsquery('english', %s)) * 0.6
                  + (quality_score / 100.0) * 0.4
                 ) DESC
                 LIMIT %s
                """,
                (phrase, phrase, limit),
            )
            video_rows = cur.fetchall()

            # Cohort intent: which cohorts' keywords match the user's phrase?
            phrase_lower = phrase.lower()
            cur.execute(
                "SELECT cohort, keyword, weight FROM skill_lab_cohort_keywords"
            )
            cohort_scores: dict[str, float] = {}
            for cohort, kw, w in cur.fetchall():
                if kw.lower() in phrase_lower:
                    cohort_scores[cohort] = cohort_scores.get(cohort, 0.0) + float(w)

    # Rank cohorts by score, keep top 3
    top_cohorts = sorted(cohort_scores.items(), key=lambda x: -x[1])[:3]

    videos = [_serialize(r) for r in video_rows]
    return {
        "videos": videos,
        "cohorts": [
            {"cohort": c, "score": round(s, 2)} for (c, s) in top_cohorts
        ],
    }


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
        base = _serialize(r[:14])
        videos.append({
            **base,
            "saved_at": r[14].isoformat() if r[14] else None,
            "progress_sec": int(r[15] or 0),
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


# ── Learning receipts ─────────────────────────────────────────────────────────
# The evidence trail behind skill claims. One row per (user, video).
# seconds_engaged accumulates across sessions; articulation is the user's
# one-sentence takeaway.

@router.post("/receipts")
def record_receipt(body: dict = Body(...), user: dict = Depends(require_auth)):
    email = (user.get("email") or "").strip().lower()
    video_id = str(body.get("video_id") or "").strip()
    if not _valid_video_id(video_id):
        raise HTTPException(status_code=400, detail="Invalid video id")

    raw_seconds = body.get("seconds_engaged")
    seconds = 0
    try:
        seconds = int(raw_seconds) if raw_seconds is not None else 0
    except (TypeError, ValueError):
        seconds = 0
    # Cap a single beacon at 30 min so a client can't inflate the counter
    seconds = max(0, min(seconds, 30 * 60))

    articulation_raw = body.get("articulation")
    articulation = (
        str(articulation_raw).strip()[:500] if isinstance(articulation_raw, str) else None
    )

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT cohort FROM skill_lab_videos WHERE id = %s",
                (video_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Video not found")
            cohort = row[0]

            cur.execute(
                """
                INSERT INTO skill_lab_learning_receipts (
                    user_email, video_id, cohort, seconds_engaged, articulation
                ) VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (user_email, video_id) DO UPDATE SET
                    seconds_engaged = skill_lab_learning_receipts.seconds_engaged + EXCLUDED.seconds_engaged,
                    articulation = COALESCE(NULLIF(EXCLUDED.articulation, ''), skill_lab_learning_receipts.articulation),
                    last_seen_at = NOW()
                """,
                (email, video_id, cohort, seconds, articulation),
            )
    return {"ok": True}


@router.get("/receipts/me")
def my_receipts(user: dict = Depends(require_auth)):
    """Returns aggregate + per-cohort + per-day rollups of a user's receipts."""
    email = (user.get("email") or "").strip().lower()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(seconds_engaged), 0)::BIGINT AS total_seconds,
                    COUNT(*)::INTEGER AS videos_engaged,
                    COUNT(DISTINCT cohort)::INTEGER AS cohorts_touched,
                    COUNT(articulation) FILTER (WHERE articulation IS NOT NULL)::INTEGER AS articulations
                  FROM skill_lab_learning_receipts
                 WHERE user_email = %s
                """,
                (email,),
            )
            totals = cur.fetchone() or (0, 0, 0, 0)

            cur.execute(
                """
                SELECT cohort,
                       SUM(seconds_engaged)::BIGINT AS seconds,
                       COUNT(*)::INTEGER AS videos
                  FROM skill_lab_learning_receipts
                 WHERE user_email = %s
                 GROUP BY cohort
                 ORDER BY seconds DESC
                """,
                (email,),
            )
            by_cohort = [
                {"cohort": c, "seconds": int(s or 0), "videos": int(v or 0)}
                for (c, s, v) in cur.fetchall()
            ]

            cur.execute(
                """
                SELECT DATE(last_seen_at) AS day,
                       SUM(seconds_engaged)::BIGINT AS seconds
                  FROM skill_lab_learning_receipts
                 WHERE user_email = %s
                   AND last_seen_at > NOW() - INTERVAL '60 days'
                 GROUP BY DATE(last_seen_at)
                 ORDER BY day DESC
                """,
                (email,),
            )
            daily = [
                {"day": d.isoformat(), "seconds": int(s or 0)}
                for (d, s) in cur.fetchall()
            ]

    return {
        "total_seconds": int(totals[0] or 0),
        "videos_engaged": int(totals[1] or 0),
        "cohorts_touched": int(totals[2] or 0),
        "articulations": int(totals[3] or 0),
        "by_cohort": by_cohort,
        "daily": daily,
    }
