"""
Aggregate full Dilly profile from profile, audits, applications, achievements, etc.
Real-time aggregation — no new persisted document.
Used for GET /profile/dilly and GET /profile/public/{slug}/dilly.
"""

from __future__ import annotations

import json
import os
from typing import Any


def _default_privacy() -> dict[str, bool]:
    """Default: all sections visible to recruiters."""
    return {
        "scores": True,
        "activity": True,
        "applications": True,
        "experience": True,
    }


def _apply_privacy(data: dict[str, Any], privacy: dict[str, bool], for_recruiter: bool) -> dict[str, Any]:
    """Redact sections based on privacy toggles when for_recruiter=True."""
    if not for_recruiter:
        return data
    out = dict(data)
    if not privacy.get("scores", True):
        out.pop("scores", None)
        out.pop("final_score", None)
        out.pop("dilly_take", None)
        out.pop("dilly_take", None)
        out.pop("peer_percentiles", None)
        out.pop("audit_history", None)
    if not privacy.get("activity", True):
        out.pop("applications_summary", None)
        out.pop("achievements", None)
        out.pop("voice_topics_count", None)
    if not privacy.get("applications", True):
        out.pop("applications", None)
        out.pop("applications_summary", None)
    if not privacy.get("experience", True):
        out.pop("structured_experience", None)
        out.pop("skills", None)
    return out


def aggregate_dilly_profile(email: str, for_recruiter: bool = False) -> dict[str, Any]:
    """
    Aggregate full Dilly profile for this user.
    Real-time: pulls from profile, audits, applications, achievements, etc.
    When for_recruiter=True, applies privacy toggles.
    """
    from .profile_store import get_profile, get_profile_slug
    from .audit_history import get_audits
    from .schools import get_school_from_email, SCHOOLS

    email = (email or "").strip().lower()
    if not email:
        return {}

    profile = get_profile(email) or {}
    audits = get_audits(email)
    latest = audits[0] if audits else {}
    scores = latest.get("scores") or {}
    slug = get_profile_slug(email)

    school_id = (profile.get("school_id") or profile.get("schoolId") or "").strip().lower()
    school_config = SCHOOLS.get(school_id) if school_id else get_school_from_email(email)
    school_name = school_config.get("name") if school_config else None
    school_short_name = school_config.get("short_name") if school_config else None

    majors = profile.get("majors") or []
    if not majors and profile.get("major"):
        majors = [profile.get("major")]

    # Applications (read from applications.json in profile folder)
    applications: list[dict] = []
    try:
        from .profile_store import get_profile_folder_path
        folder = get_profile_folder_path(email)
        if folder:
            path = os.path.join(folder, "applications.json")
            if os.path.isfile(path):
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                applications = data.get("applications", data) if isinstance(data, dict) else (data if isinstance(data, list) else [])
    except Exception:
        pass

    apps_summary = {
        "count": len(applications),
        "applied": sum(1 for a in applications if (a.get("status") or "").lower() in ("applied", "interviewing", "offer")),
        "interviewing": sum(1 for a in applications if (a.get("status") or "").lower() == "interviewing"),
        "offer": sum(1 for a in applications if (a.get("status") or "").lower() == "offer"),
        "rejected": sum(1 for a in applications if (a.get("status") or "").lower() == "rejected"),
    }

    # Achievements
    achievements = profile.get("achievements") or {}
    unlocked = [k for k, v in achievements.items() if isinstance(v, dict) and v.get("unlockedAt")]

    # Voice usage (count only, no transcripts)
    voice_memory = profile.get("voice_memory") or []
    voice_topics_count = len(voice_memory) if isinstance(voice_memory, list) else 0

    # Audit history summary
    audit_history = [
        {
            "ts": a.get("ts"),
            "scores": a.get("scores"),
            "final_score": a.get("final_score"),
            "detected_track": a.get("detected_track"),
        }
        for a in audits[:10]
    ]

    # Structured experience (from dilly_profile_txt)
    structured_experience: list[dict] = []
    try:
        from .dilly_profile_txt import get_dilly_profile_txt_content, parse_structured_experience_from_profile_txt
        profile_txt = get_dilly_profile_txt_content(email, max_chars=8000)
        structured_experience = parse_structured_experience_from_profile_txt(profile_txt) if profile_txt else []
    except Exception:
        pass

    # Skills from candidate_index if available
    skills: list[str] = []
    try:
        from .profile_store import get_profile_folder_path
        folder = get_profile_folder_path(email)
        if folder:
            idx_path = os.path.join(folder, "candidate_index.json")
            if os.path.isfile(idx_path):
                with open(idx_path, "r", encoding="utf-8") as f:
                    idx = json.load(f)
                skills = [str(t) for t in (idx.get("skill_tags") or []) if t]
    except Exception:
        pass

    privacy = profile.get("dilly_profile_privacy") or _default_privacy()
    visible_to_recruiters = profile.get("dilly_profile_visible_to_recruiters", True)

    data: dict[str, Any] = {
        "profile_slug": slug,
        "email": email,
        "name": (profile.get("name") or latest.get("candidate_name") or "").strip(),
        "school_id": school_id or None,
        "school_name": school_name,
        "school_short_name": school_short_name,
        "major": (profile.get("major") or "").strip(),
        "majors": majors,
        "minors": [m for m in (profile.get("minors") or []) if m and str(m).strip().upper() not in ("N/A", "NA", "N", "A")],
        "track": (profile.get("track") or latest.get("detected_track") or "").strip(),
        "career_goal": (profile.get("career_goal") or "").strip() or None,
        "application_target": (profile.get("application_target") or "").strip() or None,
        "job_locations": profile.get("job_locations") or [],
        "profile_tagline": (profile.get("profile_tagline") or "").strip() or None,
        "profile_bio": (profile.get("profile_bio") or "").strip() or None,
        "linkedin_url": (profile.get("linkedin_url") or "").strip() or None,
        "profile_background_color": profile.get("profile_background_color") or "#0f172a",
        "scores": scores if scores else None,
        "final_score": latest.get("final_score"),
        "dilly_take": (latest.get("dilly_take") or latest.get("meridian_take") or "").strip() or None,
        "peer_percentiles": latest.get("peer_percentiles"),
        "audit_history": audit_history,
        "audit_count": len(audits),
        "applications": applications[:50],
        "applications_summary": apps_summary,
        "achievements": unlocked,
        "achievements_detail": {k: v for k, v in (achievements or {}).items() if isinstance(v, dict) and v.get("unlockedAt")},
        "voice_topics_count": voice_topics_count,
        "structured_experience": structured_experience[:20],
        "skills": skills,
        "privacy": privacy,
        "dilly_profile_visible_to_recruiters": visible_to_recruiters,
    }

    if for_recruiter and not visible_to_recruiters:
        return {"profile_slug": slug, "name": data["name"], "message": "Full profile not shared with recruiters."}

    return _apply_privacy(data, privacy, for_recruiter)
