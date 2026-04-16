"""LLM extraction + narrative generation for Dilly memory surface."""

from __future__ import annotations

import json
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from dilly_core.llm_client import get_chat_completion
from projects.dilly.api.audit_history import get_audits
from projects.dilly.api.memory_surface_store import (
    get_memory_surface,
    save_memory_surface,
    should_regenerate_narrative,
    upsert_session_capture,
)
from projects.dilly.api.profile_store import get_profile


def _strip_fences(text: str) -> str:
    return re.sub(r"```(?:json)?|```", "", text or "", flags=re.IGNORECASE).strip()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def estimate_score_impact(items: list[dict[str, Any]], latest_audit: dict | None) -> dict[str, Any] | None:
    _ = latest_audit
    total_pts = 0
    primary_dimension = ""
    for item in items:
        action = str(item.get("action_type") or "").strip()
        if action == "open_bullet_practice":
            total_pts += 6
            primary_dimension = "Grit"
        elif action == "open_certifications":
            total_pts += 7
            primary_dimension = "Build"
    if total_pts <= 0:
        return None
    return {"pts": total_pts, "dimension": primary_dimension or "Grit"}


def _existing_memory_for_prompt(items: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [{"category": str(i.get("category") or ""), "label": str(i.get("label") or "")} for i in items]


def extract_memory_items(uid: str, conv_id: str, messages: list[dict[str, Any]], existing_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    system = """You are building a Dilly Profile by extracting everything you can learn about a student from their conversation with Dilly, their AI career coach.

Dilly Profiles capture EVERYTHING about a user — not just career facts, but who they are as a person. The goal is to know the user beyond their resume: what they couldn't fit on one page, what drives them, what they're like to work with, and what a recruiter or advisor would want to know.

Extract ANY new information the student reveals. Be thorough — if they mention something, capture it. Categories:

CAREER (original):
- target_company: companies they want to work at
- concern: worries or anxieties about career/job search
- mentioned_but_not_done: things they said they'd do but haven't
- person_to_follow_up: people they should contact
- deadline: dates, due dates, application deadlines
- achievement: accomplishments, wins, things they're proud of
- preference: career preferences (remote vs office, salary, role type)
- goal: career goals, short or long term
- rejection: companies/roles that rejected them
- interview: upcoming or past interviews
- strength: things they're good at
- weakness: areas they need to improve

PERSONAL (expanded — know them beyond the resume):
- hobby: interests, sports, creative pursuits, activities outside career
- personality: how they communicate, think, handle stress, work style
- soft_skill: teamwork ability, leadership style, empathy, adaptability
- life_context: family situation, financial constraints, where they live/want to live, background story
- motivation: why they chose their field, what excites them, what drives them
- challenge: obstacles, struggles, things blocking their progress
- project_detail: specifics about projects not on their resume (tech stack, impact, what they learned)
- skill_unlisted: skills they mention in conversation that aren't on their resume
- company_culture_pref: startup vs corporate, team size, values, work environment preferences
- availability: when they can start work, internship timing, schedule constraints

Return a JSON array of objects with:
- category: one of the categories above
- label: short display label, max 50 chars
- value: full context with specifics, max 200 chars
- confidence: high | medium | low
- action_type: open_am_i_ready | open_bullet_practice | open_interview_prep | open_templates | open_calendar | open_career_hub | open_voice | open_certifications | open_ats | null
- action_payload: object or null

Action mapping (set action_type only when relevant):
- target_company -> open_am_i_ready with { company: "<name>" }
- concern about interviews -> open_interview_prep
- mentioned_but_not_done for bullets -> open_bullet_practice
- mentioned_but_not_done for certs -> open_certifications
- person_to_follow_up -> open_templates with { person: "<name>", company: "<company>" }
- deadline -> open_calendar with { label: "<name>", date: "<date if present>" }
- weakness -> open_voice with { prompt: "Let's work on <weakness>" }
- For personal categories (hobby, personality, etc.), action_type is usually null.

Be specific. "Likes sports" is bad. "Plays club soccer at UTampa, midfielder, practices 3x/week" is good.
If nothing new was revealed, return [].
Return JSON array only."""
    convo = []
    for m in messages or []:
        if not isinstance(m, dict):
            continue
        role = str(m.get("role") or "").upper()
        content = str(m.get("content") or "").strip()
        if role and content:
            convo.append(f"{role}: {content}")
    user_prompt = f"""Existing memory items (do not duplicate):
{json.dumps(_existing_memory_for_prompt(existing_items), ensure_ascii=True)}

Conversation to analyze:
{chr(10).join(convo)}

Extract new memory items now. Return JSON array only."""
    # Haiku 4.5 handles structured JSON extraction at full quality and ~1/3 the cost
    # of Sonnet. This runs after every chat message — the single biggest line item.
    raw = get_chat_completion(
        system,
        user_prompt,
        model="claude-haiku-4-5-20251001",
        max_tokens=1200,
        temperature=0.2,
    )
    if not raw:
        return []
    try:
        parsed = json.loads(_strip_fences(raw))
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    now = _now_iso()
    out: list[dict[str, Any]] = []
    seen = {(str(i.get("category") or "").lower(), str(i.get("label") or "").strip().lower()) for i in existing_items}
    for row in parsed:
        if not isinstance(row, dict):
            continue
        category = str(row.get("category") or "").strip()
        label = str(row.get("label") or "").strip()[:50]
        value = str(row.get("value") or "").strip()[:200]
        if not category or not label or not value:
            continue
        key = (category.lower(), label.lower())
        if key in seen:
            continue
        seen.add(key)
        confidence = str(row.get("confidence") or "medium").strip().lower()
        if confidence not in {"high", "medium", "low"}:
            confidence = "medium"
        action_type = row.get("action_type")
        action_type = None if action_type in (None, "", "null") else str(action_type).strip()
        action_payload = row.get("action_payload") if isinstance(row.get("action_payload"), dict) else None
        out.append(
            {
                "id": str(uuid.uuid4()),
                "uid": uid,
                "category": category,
                "label": label,
                "value": value,
                "source": "voice",
                "created_at": now,
                "updated_at": now,
                "action_type": action_type,
                "action_payload": action_payload,
                "confidence": confidence,
                "shown_to_user": False,
                "conv_id": conv_id,
            }
        )
    return out


def regenerate_narrative(profile: dict[str, Any], memory_items: list[dict[str, Any]], latest_audit: dict | None, peer_percentile: int | None) -> str:
    system = """You are writing a brief third-person narrative summary of a college student's career situation as understood by their AI coach Dilly.

Rules:
- 3-5 sentences maximum
- Specific — use real names, scores, companies, and timeframes
- Warm but professional tone
- Mention strongest dimension and biggest gap
- Mention near-term goal or deadline if present
- Mention 1-2 things they said they want to do but haven't yet
- Do not use hollow phrases like "passionate about" or "dedicated to"
- Write as if briefing a career advisor meeting this student next."""
    scores = (latest_audit or {}).get("scores") if isinstance((latest_audit or {}).get("scores"), dict) else {}
    memory_lines = "\n".join(f"[{m.get('category')}] {m.get('label')}: {m.get('value')}" for m in memory_items[:40])
    user_prompt = f"""Student profile:
Name: {profile.get("name")}
Track: {profile.get("track")}
Major: {profile.get("major")}
Career goal: {profile.get("career_goal")}
Current score: {(latest_audit or {}).get("final_score")}
Smart: {scores.get("smart")} | Grit: {scores.get("grit")} | Build: {scores.get("build")}
Percentile: {"Top " + str(peer_percentile) + "%" if peer_percentile is not None else "unknown"}

Memory items:
{memory_lines}

Write the narrative now. 3-5 sentences, specific, no hollow phrases."""
    # Short narrative summary — Haiku is plenty for 3–5 sentences.
    raw = get_chat_completion(
        system,
        user_prompt,
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        temperature=0.3,
    )
    return (raw or "").strip()


def run_extraction(uid: str, conv_id: str, messages: list[dict[str, Any]]) -> dict[str, Any]:
    profile = get_profile(uid) or {}
    surface = get_memory_surface(uid)
    existing_items = surface.get("items") or []
    new_items = extract_memory_items(uid, conv_id, messages, existing_items)

    items_all = list(existing_items)
    item_ids: list[str] = []
    if new_items:
        items_all = [*new_items, *existing_items]
        # Deduplicate by category+label.
        dedup: dict[tuple[str, str], dict[str, Any]] = {}
        for item in items_all:
            key = (str(item.get("category") or "").lower(), str(item.get("label") or "").strip().lower())
            if not key[0] or not key[1]:
                continue
            if key not in dedup:
                dedup[key] = item
        items_all = list(dedup.values())[:400]
        item_ids = [str(x.get("id")) for x in new_items]

    latest_audit = (get_audits(uid) or [None])[0]
    peer_percentile = None
    try:
        percs = (latest_audit or {}).get("peer_percentiles") or {}
        vals = [percs.get("smart"), percs.get("grit"), percs.get("build")]
        nums = [float(v) for v in vals if isinstance(v, (int, float))]
        if nums:
            peer_percentile = int(round(max(1, min(100, 100 - (sum(nums) / len(nums))))))
    except Exception:
        peer_percentile = None

    should_regen = should_regenerate_narrative(surface.get("narrative_updated_at"), len(new_items), time.time())
    narrative_updated = False
    narrative = surface.get("narrative")
    narrative_updated_at = surface.get("narrative_updated_at")
    if should_regen:
        candidate = regenerate_narrative(profile, items_all, latest_audit, peer_percentile)
        if candidate:
            narrative = candidate
            narrative_updated_at = _now_iso()
            narrative_updated = True

    save_memory_surface(
        uid,
        items=items_all,
        narrative=narrative,
        narrative_updated_at=narrative_updated_at if narrative_updated else None,
    )

    capture = upsert_session_capture(
        uid,
        conv_id=conv_id,
        item_ids_added=item_ids,
        narrative_updated=narrative_updated,
    )
    impact = estimate_score_impact(new_items, latest_audit)
    return {
        "items_added": len(new_items),
        "item_ids": item_ids,
        "narrative_updated": narrative_updated,
        "session_capture": capture,
        "impact": impact,
    }

