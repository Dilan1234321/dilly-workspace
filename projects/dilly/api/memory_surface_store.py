"""
Storage for Dilly Profile facts — what Dilly learns about each user.

Primary store: PostgreSQL (profile_facts table).
Fallback: profile.json on disk (if PostgreSQL is unreachable).

All public functions maintain the same signatures and return shapes
as the original file-based implementation so callers are unaffected.
"""

from __future__ import annotations

import json
import time
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

import psycopg2.extras

from projects.dilly.api.profile_store import get_profile, save_profile

def _canonical_memory_category(raw: str) -> str:
    """Lowercase, normalize separators, map common LLM/typo variants to whitelist."""
    c = str(raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    c = c.strip("_")
    aliases = {
        "goals": "goal",
        "career_goal": "goal",
        "target_companies": "target_company",
        "dream_company": "target_company",
        "companies": "target_company",
        "company": "target_company",
        "technical_skill": "skill_unlisted",
        "technical_skills": "skill_unlisted",
        "skills": "skill_unlisted",
        "hard_skill": "skill_unlisted",
        "tools": "skill_unlisted",
        "tool": "skill_unlisted",
        "tech_stack": "skill_unlisted",
        "tech": "skill_unlisted",
        "language": "skill_unlisted",
        "languages": "skill_unlisted",
        "framework": "skill_unlisted",
        "frameworks": "skill_unlisted",
        "anxiety": "concern",
        "anxieties": "concern",
        "fear": "concern",
        "fears": "concern",
        "worry": "concern",
        "worries": "concern",
        "work_experience": "experience",
        "internship": "experience",
        "internships": "experience",
        "job": "experience",
        "role": "experience",
        "projects": "project_detail",
        "side_project": "project_detail",
        "side_projects": "project_detail",
        "people": "person_to_follow_up",
        "contact": "person_to_follow_up",
        "contacts": "person_to_follow_up",
        "person": "person_to_follow_up",
        "recruiter": "person_to_follow_up",
        "mentor": "person_to_follow_up",
        "culture": "company_culture_pref",
        "work_style": "personality",
        "personality_trait": "personality",
        "soft_skills": "soft_skill",
        "interest": "hobby",
        "interests": "hobby",
        "passion": "motivation",
        "passions": "motivation",
        "value": "motivation",
        "values": "motivation",
        "what_drives_me": "motivation",
        "improvement": "weakness",
        "improvements": "weakness",
        "growth_area": "weakness",
        "area_for_improvement": "weakness",
        "pain_point": "challenge",
        "obstacle": "challenge",
        "blocker": "challenge",
        # Certifications/credentials — map to achievement so they're
        # surfaced as durable wins on the profile.
        "certification": "achievement",
        "certifications": "achievement",
        "credential": "achievement",
        "credentials": "achievement",
        "award": "achievement",
        "awards": "achievement",
        # Class / course mentions are treated as education.
        "class": "education",
        "course": "education",
        "courses": "education",
        "classes": "education",
        # Salary / comp prefs.
        "salary": "preference",
        "compensation": "preference",
        "comp": "preference",
        # Schedule / timing.
        "start_date": "availability",
        "graduation": "availability",
        "graduation_date": "availability",
        # Class year / school standing.
        "year": "education",
        "year_in_school": "education",
        "school_year": "education",
        "grade_level": "education",
        "academic_year": "education",
        "graduation_year": "education",
        "major": "education",
        "minor": "education",
        "degree": "education",
        "school": "education",
        "university": "education",
        "college": "education",
        "gpa": "education",
        # Extracurriculars / club / leadership / research.
        "club": "experience",
        "clubs": "experience",
        "extracurricular": "experience",
        "extracurriculars": "experience",
        "activity": "experience",
        "activities": "experience",
        "leadership": "experience",
        "research": "experience",
        "research_experience": "experience",
        "lab": "experience",
        "volunteer": "experience",
        "volunteering": "experience",
        # Current role / position aliases.
        "current_role": "experience",
        "current_position": "experience",
        "current_job": "experience",
        "previous_role": "experience",
        "past_role": "experience",
        "position": "experience",
        # Background / story / fun-fact aliases.
        "background": "life_context",
        "story": "life_context",
        "personal_story": "life_context",
        "origin": "life_context",
        "fun_fact": "personality",
        "unique_trait": "personality",
        "trait": "personality",
        "quirk": "personality",
        # Interest / area / domain aliases.
        "interest_area": "career_interest",
        "industry": "career_interest",
        "domain": "career_interest",
        "field": "career_interest",
        "area_of_interest": "career_interest",
        "specialization": "career_interest",
        # Application / job-search status.
        "application": "interview",
        "applications": "interview",
        "applied": "interview",
        "interview_scheduled": "interview",
        # Mentor / network buckets.
        "network": "person_to_follow_up",
        "connection": "person_to_follow_up",
        "professor": "person_to_follow_up",
        "advisor": "person_to_follow_up",
        # Project alt-names.
        "build": "project_detail",
        "thing_built": "project_detail",
        "portfolio_project": "project_detail",
        # Hobby alt-names.
        "sport": "hobby",
        "creative_pursuit": "hobby",
        "favorite": "hobby",
        # Location.
        "location": "location_pref",
        "city": "location_pref",
        "where_i_live": "location_pref",
        "based_in": "location_pref",
    }
    return aliases.get(c, c)


_MEMORY_CATEGORIES = {
    # Career-specific
    "target_company",
    "concern",
    "mentioned_but_not_done",
    "person_to_follow_up",
    "deadline",
    "achievement",
    "preference",
    "goal",
    "rejection",
    "interview",
    "strength",
    "weakness",
    # Expanded — Dilly Profiles: know the user beyond their resume
    "hobby",
    "personality",
    "soft_skill",
    "life_context",
    "motivation",
    "challenge",
    "project_detail",
    "skill_unlisted",
    "company_culture_pref",
    "availability",
    # Categories the regex extractor (memory_extraction._FACT_PATTERNS)
    # emits. Previously these were not whitelisted so 66% of regex
    # captures silently failed at the normalizer — that was the root of
    # the "talking to Dilly does not add to my profile" complaint.
    # Adding them here lets the regex path's output reach the database.
    "experience",
    "education",
    "skill",
    "project",
    "career_interest",
    "location_pref",
    "interest",
}

_MEMORY_ACTIONS = {
    "open_am_i_ready",
    "open_bullet_practice",
    "open_interview_prep",
    "open_templates",
    "open_calendar",
    "open_career_hub",
    "open_voice",
    "open_certifications",
    "open_ats",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _db_available() -> bool:
    """Quick check if we can import and connect."""
    try:
        from projects.dilly.api.database import get_db
        return True
    except Exception:
        return False


def _get_db():
    from projects.dilly.api.database import get_db
    return get_db()


# ── Normalization (shared by both backends) ──────────────────────────────────

def _normalize_memory_item(email: str, raw: dict[str, Any]) -> dict[str, Any] | None:
    category = _canonical_memory_category(str(raw.get("category") or ""))
    label = str(raw.get("label") or "").strip()
    value = str(raw.get("value") or "").strip()
    # Accept any non-empty category — the LLM decides what's meaningful.
    # Previously this hard-filtered against _MEMORY_CATEGORIES and silently
    # dropped valid categories like 'skill', 'education', 'project', etc.
    if not category or not label or not value:
        return None
    # Reject single-character values — always LLM/parser garbage (e.g. "S", "D", "J").
    # Labels can be 2 chars (real cases: "PM", "C++", "AI", "ML", "UX") so
    # the previous 3-char minimum was eating legitimate skill labels.
    if len(value) < 2 or len(label) < 2:
        return None
    source = str(raw.get("source") or "voice").strip().lower()
    if source not in {"voice", "audit", "profile", "application"}:
        source = "voice"
    confidence = str(raw.get("confidence") or "medium").strip().lower()
    if confidence not in {"high", "medium", "low"}:
        confidence = "medium"
    action_type = raw.get("action_type")
    if action_type is not None:
        action_type = str(action_type).strip()
        if action_type not in _MEMORY_ACTIONS:
            action_type = None
    payload = raw.get("action_payload")
    if not isinstance(payload, dict):
        payload = None
    existing_id = str(raw.get("id") or "").strip()
    now = _now_iso()
    return {
        "id": existing_id or str(uuid.uuid4()),
        "uid": email,
        "category": category,
        "label": label[:80],
        "value": value[:500],
        "source": source,
        "created_at": str(raw.get("created_at") or now),
        "updated_at": str(raw.get("updated_at") or now),
        "action_type": action_type,
        "action_payload": payload,
        "confidence": confidence,
        "shown_to_user": bool(raw.get("shown_to_user", False)),
        "conv_id": str(raw.get("conv_id") or "").strip() or None,
    }


def _row_to_item(row: dict) -> dict[str, Any]:
    """Convert a PostgreSQL row (RealDictRow) to the standard item dict."""
    return {
        "id": str(row["id"]),
        "uid": row["email"],
        "category": row["category"],
        "label": row["label"],
        "value": row["value"],
        "source": row.get("source", "voice"),
        "created_at": row["created_at"].isoformat().replace("+00:00", "Z") if hasattr(row.get("created_at"), "isoformat") else str(row.get("created_at", "")),
        "updated_at": row["updated_at"].isoformat().replace("+00:00", "Z") if hasattr(row.get("updated_at"), "isoformat") else str(row.get("updated_at", "")),
        "action_type": row.get("action_type"),
        "action_payload": row.get("action_payload"),
        "confidence": row.get("confidence", "medium"),
        "shown_to_user": bool(row.get("shown_to_user", False)),
        "conv_id": row.get("conv_id"),
    }


# ── PostgreSQL backend ───────────────────────────────────────────────────────

def _pg_get_items(email: str) -> list[dict[str, Any]]:
    with _get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT * FROM profile_facts WHERE LOWER(email) = LOWER(%s) ORDER BY updated_at DESC LIMIT 400",
            (email,),
        )
        return [_row_to_item(r) for r in cur.fetchall()]


def _pg_get_narrative(email: str) -> tuple[str | None, str | None]:
    with _get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT dilly_narrative, dilly_narrative_updated_at FROM students WHERE LOWER(email) = LOWER(%s)",
            (email,),
        )
        row = cur.fetchone()
        if not row:
            return None, None
        updated = row.get("dilly_narrative_updated_at")
        if hasattr(updated, "isoformat"):
            updated = updated.isoformat().replace("+00:00", "Z")
        return row.get("dilly_narrative"), updated


def _pg_save_narrative(email: str, narrative: str | None, updated_at: str | None) -> None:
    with _get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE students SET dilly_narrative = %s, dilly_narrative_updated_at = %s WHERE LOWER(email) = LOWER(%s)",
            (narrative, updated_at, email),
        )


def _pg_get_session_captures(email: str) -> list[dict]:
    with _get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT voice_session_captures FROM students WHERE LOWER(email) = LOWER(%s)",
            (email,),
        )
        row = cur.fetchone()
        if not row:
            return []
        caps = row.get("voice_session_captures")
        if isinstance(caps, str):
            caps = json.loads(caps)
        return caps if isinstance(caps, list) else []


def _pg_save_session_captures(email: str, captures: list[dict]) -> None:
    with _get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE students SET voice_session_captures = %s::jsonb WHERE LOWER(email) = LOWER(%s)",
            (json.dumps(captures), email),
        )


def _pg_upsert_item(email: str, item: dict[str, Any]) -> dict[str, Any]:
    """Insert or update on (email, category, label) uniqueness."""
    with _get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            INSERT INTO profile_facts (id, email, category, label, value, source, confidence, action_type, action_payload, shown_to_user, conv_id, created_at, updated_at)
            VALUES (%s, LOWER(%s), %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s::timestamptz, %s::timestamptz)
            ON CONFLICT (email, category, label) DO UPDATE SET
                value = EXCLUDED.value,
                confidence = EXCLUDED.confidence,
                action_type = EXCLUDED.action_type,
                action_payload = EXCLUDED.action_payload,
                conv_id = EXCLUDED.conv_id,
                updated_at = EXCLUDED.updated_at
            RETURNING *
        """, (
            item["id"], email, item["category"], item["label"], item["value"],
            item["source"], item["confidence"], item.get("action_type"),
            json.dumps(item["action_payload"]) if item.get("action_payload") else None,
            item.get("shown_to_user", False), item.get("conv_id"),
            item["created_at"], item["updated_at"],
        ))
        row = cur.fetchone()
        return _row_to_item(row) if row else item


def _pg_delete_item(email: str, item_id: str) -> bool:
    with _get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM profile_facts WHERE id = %s::uuid AND LOWER(email) = LOWER(%s)",
            (item_id, email),
        )
        return cur.rowcount > 0


def _pg_update_item(email: str, item_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    sets = []
    params = []
    now = _now_iso()
    if "label" in patch and patch["label"] is not None:
        sets.append("label = %s")
        params.append(str(patch["label"])[:80])
    if "value" in patch and patch["value"] is not None:
        sets.append("value = %s")
        params.append(str(patch["value"])[:500])
    if "shown_to_user" in patch:
        sets.append("shown_to_user = %s")
        params.append(bool(patch["shown_to_user"]))
    if "action_type" in patch:
        at = patch.get("action_type")
        if at is None or str(at).strip() not in _MEMORY_ACTIONS:
            sets.append("action_type = NULL")
        else:
            sets.append("action_type = %s")
            params.append(str(at).strip())
    if "action_payload" in patch:
        pl = patch.get("action_payload")
        sets.append("action_payload = %s::jsonb")
        params.append(json.dumps(pl) if isinstance(pl, dict) else None)
    if not sets:
        return None
    sets.append("updated_at = %s::timestamptz")
    params.append(now)
    params.extend([item_id, email])

    with _get_db() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            f"UPDATE profile_facts SET {', '.join(sets)} WHERE id = %s::uuid AND LOWER(email) = LOWER(%s) RETURNING *",
            params,
        )
        row = cur.fetchone()
        return _row_to_item(row) if row else None


def _pg_mark_seen(email: str, item_ids: list[str]) -> int:
    if not item_ids:
        return 0
    with _get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE profile_facts SET shown_to_user = true, updated_at = %s::timestamptz "
            "WHERE LOWER(email) = LOWER(%s) AND id = ANY(%s::uuid[]) AND shown_to_user = false",
            (_now_iso(), email, item_ids),
        )
        return cur.rowcount


# ── File-based fallback (original implementation) ────────────────────────────

def _file_get_memory_surface(email: str) -> dict[str, Any]:
    profile = get_profile(email) or {}
    items_raw = profile.get("dilly_memory_items")
    if not isinstance(items_raw, list):
        items_raw = []
    items: list[dict[str, Any]] = []
    for item in items_raw:
        if not isinstance(item, dict):
            continue
        norm = _normalize_memory_item(email, item)
        if norm:
            items.append(norm)
    items.sort(key=lambda x: x.get("updated_at") or x.get("created_at") or "", reverse=True)
    return {
        "narrative": profile.get("dilly_narrative"),
        "narrative_updated_at": profile.get("dilly_narrative_updated_at"),
        "items": items,
        "session_captures": profile.get("voice_session_captures") if isinstance(profile.get("voice_session_captures"), list) else [],
    }


_SENTINEL = object()


def _file_save_memory_surface(
    email: str,
    *,
    items: list[dict[str, Any]] | None = None,
    narrative: str | None | object = _SENTINEL,
    narrative_updated_at: str | None = None,
    session_captures: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    update: dict[str, Any] = {}
    if items is not None:
        normalized: list[dict[str, Any]] = []
        for row in items:
            if not isinstance(row, dict):
                continue
            norm = _normalize_memory_item(email, row)
            if norm:
                normalized.append(norm)
        update["dilly_memory_items"] = normalized[-400:]
    if narrative is not _SENTINEL:
        update["dilly_narrative"] = narrative
    if narrative_updated_at is not None:
        update["dilly_narrative_updated_at"] = narrative_updated_at
    if session_captures is not None:
        clean = [row for row in session_captures if isinstance(row, dict)]
        clean.sort(key=lambda x: str(x.get("captured_at") or ""), reverse=True)
        update["voice_session_captures"] = clean[:120]
    return save_profile(email, update)


# ── Public API (PostgreSQL primary, file fallback) ───────────────────────────

def get_memory_surface(email: str) -> dict[str, Any]:
    try:
        items = _pg_get_items(email)
        narrative, narrative_updated_at = _pg_get_narrative(email)
        captures = _pg_get_session_captures(email)
        return {
            "narrative": narrative,
            "narrative_updated_at": narrative_updated_at,
            "items": items,
            "session_captures": captures,
        }
    except Exception:
        traceback.print_exc()
        return _file_get_memory_surface(email)


def save_memory_surface(
    email: str,
    *,
    items: list[dict[str, Any]] | None = None,
    narrative: str | None | object = _SENTINEL,
    narrative_updated_at: str | None = None,
    session_captures: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    try:
        _saved = 0
        if items is not None:
            for row in items:
                if not isinstance(row, dict):
                    continue
                norm = _normalize_memory_item(email, row)
                if norm:
                    _pg_upsert_item(email, norm)
                    _saved += 1
            # Diagnostic — persist count to stderr so we can see writes
            # land vs silently fail. Helps diagnose "Dilly says she
            # learned 5 things but my profile didn't grow."
            try:
                import sys as _sys
                _sys.stderr.write(
                    f"[save_memory_surface] uid={email[:6]}*** "
                    f"requested={len(items)} normalized_saved={_saved}\n"
                )
            except Exception:
                pass
        if narrative is not _SENTINEL:
            _pg_save_narrative(email, narrative, narrative_updated_at)
        elif narrative_updated_at is not None:
            _pg_save_narrative(email, None, narrative_updated_at)
        if session_captures is not None:
            clean = [row for row in session_captures if isinstance(row, dict)]
            clean.sort(key=lambda x: str(x.get("captured_at") or ""), reverse=True)
            _pg_save_session_captures(email, clean[:120])
        return get_memory_surface(email)
    except Exception:
        traceback.print_exc()
        return _file_save_memory_surface(
            email, items=items, narrative=narrative,
            narrative_updated_at=narrative_updated_at, session_captures=session_captures,
        )


def add_memory_item(email: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    item = _normalize_memory_item(email, payload)
    if not item:
        return None
    try:
        return _pg_upsert_item(email, item)
    except Exception:
        traceback.print_exc()
        surface = _file_get_memory_surface(email)
        items = list(surface["items"])
        items.insert(0, item)
        _file_save_memory_surface(email, items=items)
        return item


def update_memory_item(email: str, item_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    target = (item_id or "").strip()
    if not target:
        return None
    try:
        return _pg_update_item(email, target, patch)
    except Exception:
        traceback.print_exc()
        # File fallback
        surface = _file_get_memory_surface(email)
        items = list(surface["items"])
        now = _now_iso()
        out = None
        for row in items:
            if row.get("id") != target:
                continue
            if "label" in patch and patch.get("label") is not None:
                row["label"] = str(patch["label"])[:80]
            if "value" in patch and patch.get("value") is not None:
                row["value"] = str(patch["value"])[:500]
            if "shown_to_user" in patch:
                row["shown_to_user"] = bool(patch["shown_to_user"])
            row["updated_at"] = now
            out = row
            break
        if out:
            _file_save_memory_surface(email, items=items)
        return out


def delete_memory_item(email: str, item_id: str) -> bool:
    target = (item_id or "").strip()
    if not target:
        return False
    try:
        return _pg_delete_item(email, target)
    except Exception:
        traceback.print_exc()
        surface = _file_get_memory_surface(email)
        items = list(surface["items"])
        before = len(items)
        items = [row for row in items if row.get("id") != target]
        if len(items) == before:
            return False
        _file_save_memory_surface(email, items=items)
        return True


def mark_items_seen(email: str, item_ids: list[str]) -> int:
    ids = [str(x).strip() for x in (item_ids or []) if str(x).strip()]
    if not ids:
        return 0
    try:
        return _pg_mark_seen(email, ids)
    except Exception:
        traceback.print_exc()
        surface = _file_get_memory_surface(email)
        changed = 0
        now = _now_iso()
        items = list(surface["items"])
        for row in items:
            if row.get("id") in set(ids) and not row.get("shown_to_user"):
                row["shown_to_user"] = True
                row["updated_at"] = now
                changed += 1
        if changed > 0:
            _file_save_memory_surface(email, items=items)
        return changed


def get_session_capture(email: str, conv_id: str) -> dict[str, Any] | None:
    target = (conv_id or "").strip()
    if not target:
        return None
    captures = get_memory_surface(email).get("session_captures") or []
    for cap in captures:
        if str(cap.get("conv_id") or "").strip() == target:
            return cap
    return None


def upsert_session_capture(
    email: str,
    *,
    conv_id: str,
    item_ids_added: list[str],
    narrative_updated: bool,
) -> dict[str, Any]:
    conv = (conv_id or "").strip()
    surface = get_memory_surface(email)
    captures = list(surface.get("session_captures") or [])
    existing_idx = next((i for i, row in enumerate(captures) if str(row.get("conv_id") or "").strip() == conv), None)
    now = _now_iso()
    ids = [str(x).strip() for x in item_ids_added if str(x).strip()]
    if existing_idx is None:
        row = {
            "id": str(uuid.uuid4()),
            "uid": email,
            "conv_id": conv,
            "captured_at": now,
            "items_added": ids,
            "narrative_updated": bool(narrative_updated),
        }
        captures.insert(0, row)
    else:
        row = captures[existing_idx]
        merged = list(dict.fromkeys([*(row.get("items_added") or []), *ids]))
        row["items_added"] = merged
        row["captured_at"] = now
        row["narrative_updated"] = bool(row.get("narrative_updated")) or bool(narrative_updated)
        captures[existing_idx] = row

    try:
        _pg_save_session_captures(email, captures[:120])
    except Exception:
        traceback.print_exc()
        _file_save_memory_surface(email, session_captures=captures[:120])
    return row


def should_regenerate_narrative(last_updated_at: str | None, new_items_count: int, now_ts: float | None = None) -> bool:
    """
    Decide whether to regenerate the narrative summary.
    More aggressive than before — the narrative should feel alive, not stale.

    Triggers:
    1. Never generated → always regenerate
    2. 3+ new facts in this extraction → regenerate (significant new info)
    3. Any new facts AND narrative older than 2 hours → regenerate
    4. Narrative older than 3 days → regenerate regardless
    5. Narrative older than 7 days → always regenerate (safety net)
    """
    now = now_ts if now_ts is not None else time.time()
    if not last_updated_at:
        return True
    try:
        last_ts = datetime.fromisoformat(str(last_updated_at).replace("Z", "+00:00")).timestamp()
    except Exception:
        return True
    age = now - last_ts
    # Safety net: always regen if very old
    if age > 7 * 86400:
        return True
    # Stale: regen if older than 3 days even with no new items
    if age > 3 * 86400:
        return True
    # Significant new info: 5+ facts means the profile changed meaningfully.
    # Bumped from 3 -> 5 during cost cleanup. Narratives aren't user-facing
    # outside of My Dilly + recruiter views; regen on every 3rd fact was
    # burning ~$0.0008 per chat × a lot of chats.
    if new_items_count >= 5:
        return True
    # Fresh new info + time passed: regen after 12 hours. Was 2 hours;
    # bumped to 12 because the narrative summary rarely changes shape
    # within a day unless a lot of new facts come in, which the branch
    # above already covers. Users never "feel" a 10-hour staleness on a
    # summary they read once a week.
    if new_items_count > 0 and age > 12 * 3600:
        return True
    return False
