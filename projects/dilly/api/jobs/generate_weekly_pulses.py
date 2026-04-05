"""Weekly cohort pulse generation job."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from dilly_core.llm_client import get_chat_completion, is_llm_available
from projects.dilly.api.audit_history import get_audits
from projects.dilly.api.auth_store import list_active_subscribed_users
from projects.dilly.api.cohort_pulse_store import (
    current_week_start_iso,
    upsert_cohort_pulse,
    upsert_user_pulse,
)
from projects.dilly.api.profile_store import get_profile

_PATTERN_MAP = {
    "grit": "quantifying leadership impact",
    "smart": "highlighting academic signal",
    "build": "adding a relevant certification",
}


def _week_start_date(now: datetime) -> datetime:
    monday = now.date() - timedelta(days=now.weekday())
    return datetime.combine(monday, datetime.min.time(), tzinfo=timezone.utc)


def _score_at_or_before(audits: list[dict], ts_cutoff: float) -> dict | None:
    for row in sorted(audits, key=lambda x: float(x.get("ts") or 0), reverse=True):
        if float(row.get("ts") or 0) <= ts_cutoff:
            return row
    return None


def _llm_commentary(payload: dict[str, Any]) -> str:
    if not is_llm_available():
        return ""
    system = """Write one sentence under 100 chars. Be specific to this student's cohort pulse.
No exclamation marks. Include at least one number."""
    raw = get_chat_completion(
        system,
        str(payload),
        model="claude-sonnet-4-20250514",
        temperature=0.3,
        max_tokens=80,
    )
    text = (raw or "").strip().replace("!", "")
    return text[:100]


def _user_cta(user_change: float, cohort_avg_change: float, gap_to_top25: float, improved_dim: str) -> tuple[str, str, dict[str, str]]:
    if user_change <= 0 and cohort_avg_change > 0:
        route = "/?tab=voice&prompt=" + (
            "help me quantify leadership impact"
            if improved_dim == "grit"
            else "help me highlight my academic signal"
            if improved_dim == "smart"
            else "help me add a relevant certification this week"
        )
        return (
            "cohort_top_fix",
            f"Do what moved cohort {improved_dim.title()}",
            {"route": route},
        )
    if gap_to_top25 <= 5:
        return (
            "proximity_push",
            "Push into Top 25% this week",
            {"route": "/?tab=hiring&view=report"},
        )
    if user_change > 0:
        return (
            "celebrate_share",
            "Share your progress",
            {"route": "/profile"},
        )
    return (
        "audit_refresh",
        "Run a fresh audit",
        {"route": "/?tab=hiring&view=upload"},
    )


def generate_pulse_for_cohort(track: str, school_id: str, students: list[dict[str, Any]], week_start_iso: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    students_total = len(students)
    improved = [s for s in students if s["score_change"] > 0]
    students_improved = len(improved)
    avg_score_change = sum(s["score_change"] for s in students) / students_total
    avg_grit_change = sum(s["grit_change"] for s in students) / students_total
    avg_smart_change = sum(s["smart_change"] for s in students) / students_total
    avg_build_change = sum(s["build_change"] for s in students) / students_total
    avg_current_score = sum(s["current_final"] for s in students) / students_total
    changes = {
        "smart": abs(avg_smart_change),
        "grit": abs(avg_grit_change),
        "build": abs(avg_build_change),
    }
    top_dimension = max(changes.keys(), key=lambda k: changes[k])
    top_pattern = _PATTERN_MAP[top_dimension]
    top_avg_pts = float(
        avg_smart_change if top_dimension == "smart" else avg_grit_change if top_dimension == "grit" else avg_build_change
    )
    headline = f"{students_improved} {track} students improved their {top_dimension.title()} score"
    insight = f"Average gain this week is {avg_score_change:+.1f}. Most common fix: {top_pattern}."
    commentary = f"{top_dimension.title()} moved {top_avg_pts:+.1f} pts on average in {track}."
    cohort = upsert_cohort_pulse(
        {
            "id": str(uuid.uuid4()),
            "week_start": week_start_iso,
            "track": track,
            "school_id": school_id,
            "students_improved": students_improved,
            "students_total": students_total,
            "avg_score_change": round(avg_score_change, 2),
            "avg_grit_change": round(avg_grit_change, 2),
            "avg_smart_change": round(avg_smart_change, 2),
            "avg_build_change": round(avg_build_change, 2),
            "top_improvement_pattern": top_pattern,
            "top_improvement_dimension": top_dimension,
            "top_improvement_avg_pts": round(top_avg_pts, 2),
            "headline": headline,
            "insight": insight,
            "dilly_commentary": commentary,
            "cohort_avg_score": round(avg_current_score, 2),
        }
    )

    ranked = sorted(students, key=lambda s: s["current_final"], reverse=True)
    user_pulses: list[dict[str, Any]] = []
    p75_index = max(0, int(0.25 * len(ranked)) - 1)
    p75_score = ranked[p75_index]["current_final"] if ranked else 0.0
    for idx, s in enumerate(ranked, start=1):
        percentile = int(round((idx / len(ranked)) * 100))
        gap_to_top25 = max(0.0, p75_score - s["current_final"])
        cta_type, cta_label, cta_payload = _user_cta(s["score_change"], avg_score_change, gap_to_top25, top_dimension)
        comment = _llm_commentary(
            {
                "track": track,
                "headline": headline,
                "user_score_change": round(s["score_change"], 1),
                "user_percentile": percentile,
                "gap_to_top25": round(gap_to_top25, 1),
                "top_pattern": top_pattern,
            }
        ) or f"You moved {s['score_change']:+.1f} this week. Gap to Top 25% is {gap_to_top25:.1f}."
        row = upsert_user_pulse(
            {
                "id": str(uuid.uuid4()),
                "uid": s["uid"],
                "pulse_id": cohort["id"],
                "week_start": week_start_iso,
                "user_score": round(s["current_final"], 1),
                "user_score_change": round(s["score_change"], 1),
                "user_grit": round(s["current_grit"], 1),
                "user_smart": round(s["current_smart"], 1),
                "user_build": round(s["current_build"], 1),
                "user_percentile": percentile,
                "cta_type": cta_type,
                "cta_label": cta_label,
                "cta_payload": cta_payload,
                "seen": False,
                "seen_at": None,
                "acted": False,
                "acted_at": None,
                "dilly_commentary": comment[:100],
            }
        )
        user_pulses.append(row)
    return cohort, user_pulses


def generate_weekly_pulses() -> dict[str, int]:
    users = list_active_subscribed_users()
    now = datetime.now(timezone.utc)
    week_start_iso = current_week_start_iso(now)
    cutoff_ts = (now - timedelta(days=7)).timestamp()
    cohorts: dict[tuple[str, str], list[dict[str, Any]]] = {}

    for uid in users:
        profile = get_profile(uid) or {}
        audits = get_audits(uid)
        if not audits:
            continue
        latest = audits[0]
        prior = _score_at_or_before(audits, cutoff_ts) or latest
        latest_scores = latest.get("scores") if isinstance(latest.get("scores"), dict) else {}
        prior_scores = prior.get("scores") if isinstance((prior or {}).get("scores"), dict) else {}
        track = str(profile.get("track") or latest.get("detected_track") or "general").strip().lower()
        school_id = str(profile.get("school_id") or profile.get("schoolId") or "unknown").strip().lower()
        if not track:
            track = "general"
        if not school_id:
            school_id = "unknown"
        cohorts.setdefault((track, school_id), []).append(
            {
                "uid": uid,
                "current_final": float(latest.get("final_score") or 0),
                "score_change": float(latest.get("final_score") or 0) - float((prior or {}).get("final_score") or 0),
                "current_grit": float(latest_scores.get("grit") or 0),
                "current_smart": float(latest_scores.get("smart") or 0),
                "current_build": float(latest_scores.get("build") or 0),
                "grit_change": float(latest_scores.get("grit") or 0) - float(prior_scores.get("grit") or 0),
                "smart_change": float(latest_scores.get("smart") or 0) - float(prior_scores.get("smart") or 0),
                "build_change": float(latest_scores.get("build") or 0) - float(prior_scores.get("build") or 0),
            }
        )

    tracks_processed = 0
    pulses_generated = 0
    users_notified = 0
    for (track, school_id), students in cohorts.items():
        tracks_processed += 1
        if len(students) < 5:
            continue
        _, user_rows = generate_pulse_for_cohort(track, school_id, students, week_start_iso)
        pulses_generated += 1
        users_notified += len(user_rows)
    return {
        "tracks_processed": tracks_processed,
        "pulses_generated": pulses_generated,
        "users_notified": users_notified,
    }

