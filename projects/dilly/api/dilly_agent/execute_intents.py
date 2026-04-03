"""Intent execution orchestrator for Dilly agent."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from projects.dilly.api.dilly_agent.execute_action import execute_action
from projects.dilly.api.dilly_agent.pending_confirmations import save_pending_confirmation


def _to_date(value: date | str | datetime | None) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except Exception:
            pass
    return date.today()


def confirmation_prompt_for_intent(action: str, extracted: dict[str, Any]) -> str:
    a = str(action or "").strip().upper()
    if a.startswith("DELETE_"):
        thing = str(extracted.get("label") or extracted.get("text") or extracted.get("company") or "this item")
        return f"Got it. Do you want me to delete {thing}?"
    if a == "UPDATE_TRACK":
        return f"Do you want me to change your track to {extracted.get('track')}?"
    if a == "UPDATE_MAJOR":
        return f"Do you want me to update your major to {extracted.get('major')}?"
    return "Do you want me to apply that change?"


def execute_intents(
    intents: list[dict[str, Any]],
    uid: str,
    conv_id: str,
    today: date | str | datetime,
    profile: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    _ = _to_date(today)
    _ = profile
    results: list[dict[str, Any]] = []
    for intent in intents or []:
        if not isinstance(intent, dict):
            continue
        action = str(intent.get("action") or "").strip().upper()
        extracted = intent.get("extracted_data") if isinstance(intent.get("extracted_data"), dict) else {}
        if bool(intent.get("needs_clarification")):
            results.append(
                {
                    "action": action,
                    "status": "needs_clarification",
                    "clarification_question": intent.get("clarification_question") or "Can you clarify that for me?",
                }
            )
            continue
        if str(intent.get("stake_level") or "high").lower() == "high":
            pending = save_pending_confirmation(uid, conv_id, intent)
            prompt = confirmation_prompt_for_intent(action, extracted)
            results.append(
                {
                    "action": action,
                    "status": "pending_confirmation",
                    "result": {"pending_confirmation_id": pending.get("id")},
                    "confirmation_prompt": prompt,
                }
            )
            continue
        try:
            out = execute_action(action, extracted, uid, conv_id=conv_id)
            if out and out.get("skipped"):
                results.append({"action": action, "status": "skipped", "result": out})
            elif out and out.get("guarded"):
                pending = save_pending_confirmation(uid, conv_id, intent)
                results.append(
                    {
                        "action": action,
                        "status": "pending_confirmation",
                        "result": {"pending_confirmation_id": pending.get("id")},
                        "confirmation_prompt": confirmation_prompt_for_intent(action, extracted),
                    }
                )
            else:
                results.append({"action": action, "status": "executed", "result": out})
        except Exception:
            results.append({"action": action, "status": "skipped"})
    return results

