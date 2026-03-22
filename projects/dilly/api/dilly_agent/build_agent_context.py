"""Build response-context block from Dilly agent execution results."""

from __future__ import annotations

from typing import Any


def _describe_executed(row: dict[str, Any]) -> str:
    action = str(row.get("action") or "").strip().upper()
    result = row.get("result") if isinstance(row.get("result"), dict) else {}
    if action == "CREATE_DEADLINE":
        return f'Saved deadline "{result.get("label") or "deadline"}" for {result.get("date") or "the selected date"}.'
    if action == "CREATE_ACTION_ITEM":
        return f'Created action item: "{result.get("text") or "new task"}".'
    if action == "ADD_TARGET_COMPANY":
        return f'Added target company "{result.get("label") or result.get("value") or "company"}".'
    if action == "CREATE_APPLICATION":
        return f'Saved application for {result.get("company") or "company"} ({result.get("role") or "role"}).'
    if action == "TRIGGER_AUDIT":
        return "Triggered a fresh resume audit from your saved resume."
    return action.replace("_", " ").title() + " executed."


def build_agent_context_for_response(execution_results: list[dict[str, Any]], today: str | None = None) -> str:
    _ = today
    executed = [r for r in (execution_results or []) if str(r.get("status") or "") == "executed"]
    clarifications = [r for r in (execution_results or []) if str(r.get("status") or "") == "needs_clarification"]
    pending = [r for r in (execution_results or []) if str(r.get("status") or "") == "pending_confirmation"]
    if not executed and not clarifications and not pending:
        return ""
    lines = ["[AGENT CONTEXT — do not repeat this text, use it to inform your response]", ""]
    lines.append("ACTIONS TAKEN THIS MESSAGE:")
    if executed:
        for row in executed[:8]:
            lines.append(f"- {_describe_executed(row)}")
    else:
        lines.append("- None")
    lines.append("")
    lines.append("ASK THIS CLARIFICATION (work it in naturally, one question only):")
    if clarifications:
        lines.append(f"- {clarifications[0].get('clarification_question') or 'Can you clarify that detail?'}")
    else:
        lines.append("- None")
    lines.append("")
    lines.append("AWAITING CONFIRMATION (present naturally, not as a list):")
    if pending:
        lines.append(f"- {pending[0].get('confirmation_prompt') or 'Please confirm before I proceed.'}")
    else:
        lines.append("- None")
    return "\n".join(lines)

