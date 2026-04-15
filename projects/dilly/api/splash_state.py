"""
Splash screen copy for app launch (GET /profile/splash-state).
Ultra-personalized based on the user's Dilly Profile, not scores.
"""
from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any

from projects.dilly.api.routers.applications import _load_applications


def _parse_iso_date(s: str | None) -> datetime | None:
    if not s or not isinstance(s, str):
        return None
    t = s.strip()
    if not t:
        return None
    try:
        if t.endswith("Z"):
            t = t[:-1] + "+00:00"
        d = datetime.fromisoformat(t)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(timezone.utc)
    except Exception:
        return None


def _days_until(dt: datetime) -> float:
    now = datetime.now(timezone.utc)
    return (dt - now).total_seconds() / 86400.0


def _nearest_deadline(profile: dict[str, Any]) -> tuple[dict[str, Any], float] | None:
    raw = profile.get("deadlines") or []
    if not isinstance(raw, list):
        return None
    best: tuple[dict[str, Any], float] | None = None
    for d in raw:
        if not isinstance(d, dict) or d.get("completedAt"):
            continue
        dt = _parse_iso_date(d.get("date"))
        if dt is None:
            continue
        days = _days_until(dt)
        if days < 0:
            continue
        if best is None or days < best[1]:
            best = (d, days)
    return best


def _recent_rejection(apps: list[dict[str, Any]]) -> dict[str, Any] | None:
    for a in apps:
        if not isinstance(a, dict):
            continue
        if (a.get("status") or "").lower() != "rejected":
            continue
        dt = _parse_iso_date(a.get("updated_at") or a.get("applied_at"))
        if dt is None:
            continue
        if (datetime.now(timezone.utc) - dt).total_seconds() < 72 * 3600:
            return a
    return None


def build_splash_state(email: str, profile: dict[str, Any], subscribed: bool) -> dict[str, Any]:
    _ = subscribed
    apps = _load_applications(email)

    first_name = (profile.get("name") or "").strip().split()[0] if profile.get("name") else ""
    majors = profile.get("majors") or []
    major = majors[0] if majors else ""
    school = profile.get("school") or ""
    cities = profile.get("job_locations") or []
    user_type = profile.get("user_type") or "student"
    is_student = user_type not in ("general", "professional")
    career_fields = profile.get("career_fields") or []
    cohorts = profile.get("cohorts") or []

    # Count profile facts
    fact_count = 0
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface
        surface = get_memory_surface(email)
        fact_count = len(surface.get("items") or [])
    except Exception:
        pass

    app_count = len(apps)
    applied_count = sum(1 for a in apps if (a.get("status") or "") in ("applied", "interviewing", "offer"))

    # --- Brand new user (no profile facts) ---
    if fact_count == 0:
        greetings = [
            {
                "headline": f"Hey{' ' + first_name if first_name else ''}. I'm Dilly.",
                "headline_gold": "I'm Dilly.",
                "sub": "Tell me about yourself and I'll help you figure out what's next.",
            },
            {
                "headline": f"Welcome{' ' + first_name if first_name else ''}.",
                "headline_gold": f"{first_name or 'Welcome'}.",
                "sub": "The more I know about you, the better I can help. Let's start talking.",
            },
        ]
        g = random.choice(greetings)
        return {
            "state": "new_user",
            "eyebrow": "YOUR CAREER CENTER",
            "eyebrow_color": "gold",
            "eyebrow_pulse": False,
            **g,
            "cta_primary": "Talk to Dilly",
            "cta_route": "/(app)",
            "cta_context": "",
            "glow_color": "gold",
            "voice_prompt": None,
        }

    # --- Thin profile (< 5 facts) ---
    if fact_count < 5:
        return {
            "state": "thin_profile",
            "eyebrow": f"{fact_count} FACTS IN YOUR PROFILE",
            "eyebrow_color": "gold",
            "eyebrow_pulse": False,
            "headline": f"I'm still getting to know you{', ' + first_name if first_name else ''}.",
            "headline_gold": "getting to know you.",
            "sub": "The students who get the most out of Dilly are the ones who talk to it. Tell me more.",
            "cta_primary": "Talk to Dilly",
            "cta_route": "/(app)",
            "cta_context": "",
            "glow_color": "gold",
            "voice_prompt": "I want to add more to my profile. Ask me about my experiences and skills.",
        }

    # --- Interview within 24 hours ---
    nd = _nearest_deadline(profile)
    if nd:
        drow, ddays = nd
        label = (drow.get("label") or "").lower()
        if ddays <= 1 and ("interview" in label or "onsite" in label or "screen" in label):
            co = drow.get("company") or drow.get("label", "Interview").strip().split("\n")[0]
            return {
                "state": "interview_tomorrow",
                "eyebrow": f"{co} INTERVIEW",
                "eyebrow_color": "amber",
                "eyebrow_pulse": True,
                "headline": "Tonight is your prep window.",
                "headline_gold": "prep window.",
                "sub": "I know your profile inside and out. Let me run you through the questions they'll probably ask.",
                "cta_primary": "Prep with Dilly",
                "cta_route": "/(app)/interview-practice",
                "cta_context": "",
                "glow_color": "gold",
                "voice_prompt": f"I have an interview very soon for {co}. Run a tight prep pass based on my profile.",
            }

    # --- Recent rejection ---
    rej = _recent_rejection(apps)
    if rej:
        co = (rej.get("company") or "That company").strip()
        return {
            "state": "rejected",
            "eyebrow": f"{co}",
            "eyebrow_color": "muted",
            "eyebrow_pulse": False,
            "headline": f"I saw the update{', ' + first_name if first_name else ''}.",
            "headline_gold": "the update.",
            "sub": "It was not wasted. Let me show you what to do differently next time.",
            "cta_primary": "Talk to Dilly",
            "cta_route": "/(app)",
            "cta_context": "",
            "glow_color": "gold",
            "voice_prompt": f"I was rejected from {co}. Help me understand what I can do better next time.",
        }

    # --- Deadline within 5 days ---
    if nd:
        drow, ddays = nd
        if ddays <= 5:
            co = drow.get("company") or drow.get("label", "Application").strip().split("\n")[0]
            days_left = max(1, int(round(ddays)))
            return {
                "state": "deadline_soon",
                "eyebrow": f"{co} IN {days_left} DAY{'S' if days_left != 1 else ''}",
                "eyebrow_color": "amber",
                "eyebrow_pulse": True,
                "headline": f"Let's make sure you're ready{', ' + first_name if first_name else ''}.",
                "headline_gold": "you're ready.",
                "sub": f"You have {days_left} day{'s' if days_left != 1 else ''}. I can help you prep your application right now.",
                "cta_primary": "Prep with Dilly",
                "cta_route": "/(app)",
                "cta_context": "",
                "glow_color": "gold",
                "voice_prompt": f"I have {days_left} days before {co}. Help me prepare.",
            }

    # --- Personalized greetings based on profile data ---
    greetings = []

    # Major-specific
    if major and is_student:
        greetings.append({
            "headline": f"Hey {first_name or 'there'}. Your {major} profile is looking strong.",
            "headline_gold": "looking strong.",
            "sub": f"{fact_count} facts. {app_count} job{'s' if app_count != 1 else ''} saved. Let's keep building.",
        })

    # City-specific
    if cities:
        city_short = cities[0].split(",")[0].strip()
        greetings.append({
            "headline": f"{city_short} is hiring{', ' + first_name if first_name else ''}.",
            "headline_gold": f"{city_short} is hiring.",
            "sub": "I found new roles that match your profile. Want to take a look?",
        })

    # Application momentum
    if applied_count > 0:
        greetings.append({
            "headline": f"You've applied to {applied_count} role{'s' if applied_count != 1 else ''}{', ' + first_name if first_name else ''}.",
            "headline_gold": f"{applied_count} role{'s' if applied_count != 1 else ''}.",
            "sub": "Momentum matters. Let's keep the pipeline moving.",
        })

    # Career fields (non-students)
    if career_fields and not is_student:
        field = career_fields[0]
        greetings.append({
            "headline": f"The {field} market is moving{', ' + first_name if first_name else ''}.",
            "headline_gold": "is moving.",
            "sub": "I have new insights based on your profile. Let's talk.",
        })

    # Profile strength
    if fact_count >= 15:
        greetings.append({
            "headline": f"I know you well{', ' + first_name if first_name else ''}.",
            "headline_gold": f"{first_name or 'you'} well.",
            "sub": f"{fact_count} things in your Dilly Profile. That's a strong foundation. Let's put it to work.",
        })

    # School pride
    if school and is_student:
        school_short = school.replace("University of ", "").replace("University", "").strip()
        greetings.append({
            "headline": f"Good to see you{', ' + first_name if first_name else ''}.",
            "headline_gold": f"{first_name or 'you'}.",
            "sub": f"Representing {school_short}. Let's show them what you've got.",
        })

    # Generic personalized fallbacks
    greetings.append({
        "headline": f"Welcome back{', ' + first_name if first_name else ''}.",
        "headline_gold": f"{first_name or 'back'}.",
        "sub": "Your Dilly Profile is ready. What are we working on today?",
    })

    g = random.choice(greetings)
    return {
        "state": "personalized",
        "eyebrow": "YOUR CAREER CENTER",
        "eyebrow_color": "gold",
        "eyebrow_pulse": False,
        **g,
        "cta_primary": "Talk to Dilly",
        "cta_route": "/(app)",
        "cta_context": "",
        "glow_color": "gold",
        "voice_prompt": None,
    }
