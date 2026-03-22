"""LLM message generation for proactive push notifications."""

from __future__ import annotations

import json
from typing import Any

from dilly_core.llm_client import get_chat_completion
from projects.dilly.api.validate_notification_message import validate_message


def generate_notification_message(
    uid: str,
    trigger_id: str,
    trigger_data: dict[str, Any],
    ctx: dict[str, Any],
) -> str | None:
    system = """You are Dilly, an AI career coach for college students.
You are generating a single push notification message for a student.

RULES — follow every one exactly:
- One sentence only
- Maximum 110 characters including spaces
- Must be specific; include real numbers, names, and timeframes from the data
- Must sound like a coach who knows this student personally
- Must create urgency or emotion without manipulation
- Never use exclamation marks
- Never start with "Hey" or "Hi"
- Never be generic
- Write in second person ("you", "your")
- No emoji"""

    profile = ctx.get("profile") or {}
    latest_audit = ctx.get("latest_audit") or {}
    percentile = ctx.get("peer_percentile")
    last_messages = ctx.get("last_7_notifications") or []
    last_3 = "\n".join(
        f"- {(row or {}).get('message', '')}" for row in last_messages[:3] if (row or {}).get("message")
    ) or "None"

    user_prompt = f"""
Student profile:
- Name: {profile.get("name") or "the student"}
- Track: {profile.get("track") or "undeclared"}
- Career goal: {profile.get("career_goal") or "not set"}
- Current score: {latest_audit.get("final_score") if latest_audit else "no audit yet"}
- Top percentile: {"Top " + str(percentile) + "%" if percentile is not None else "unknown"}

Trigger that fired: {trigger_id}
Trigger data: {json.dumps(trigger_data, ensure_ascii=True)}

Last 3 notifications sent (do not repeat):
{last_3}

Write the notification message now. One sentence, max 110 chars, no emoji, no exclamation marks.
"""
    text = get_chat_completion(
        system,
        user_prompt,
        model="claude-sonnet-4-20250514",
        max_tokens=60,
        temperature=0.5,
    )
    if not text:
        return None
    message = " ".join(text.strip().split())
    if len(message) > 120:
        message = message[:120].rstrip()
    if not validate_message(message):
        return None
    return message

