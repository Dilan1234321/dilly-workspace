"""Summary-line builder for conversation outputs."""

from __future__ import annotations

from typing import Any


def _action_route(action_type: str | None, action_payload: dict[str, Any] | None) -> dict[str, str]:
    payload = action_payload if isinstance(action_payload, dict) else {}
    route = str(payload.get("route") or "").strip()
    if not route:
        if action_type == "open_bullet_practice":
            route = "/voice?prompt=bullet_practice"
        elif action_type == "open_certifications":
            route = "/certifications"
        elif action_type == "open_templates":
            route = "/templates"
        elif action_type == "open_ats":
            route = "/ats/overview"
        elif action_type == "open_am_i_ready":
            company = str(payload.get("company") or "").strip()
            route = f"/ready-check/new?company={company}" if company else "/ready-check/new"
        elif action_type == "open_interview_prep":
            route = "/practice?mode=interview"
        else:
            route = "/actions"
    out = {k: str(v) for k, v in payload.items() if isinstance(v, (str, int, float))}
    out["route"] = route
    return out


def build_summary_lines(
    action_items: list[dict[str, Any]],
    deadlines: list[dict[str, Any]],
    profile_updates: list[dict[str, Any]],
    score_impact: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    if action_items:
        top = max(
            [a for a in action_items if isinstance(a, dict)],
            key=lambda x: float(x.get("estimated_pts") or 0),
            default=None,
        )
        action_type = str((top or {}).get("action_type") or "").strip() or None
        action_payload = _action_route(action_type, (top or {}).get("action_payload"))
        lines.append(
            {
                "type": "action",
                "icon_color": "var(--green)",
                "text": f"{len(action_items)} action item{'s' if len(action_items) != 1 else ''} created",
                "action_type": action_type,
                "action_payload": action_payload,
            }
        )

    for deadline in deadlines or []:
        if not isinstance(deadline, dict):
            continue
        label = str(deadline.get("label") or "Deadline").strip()
        lines.append(
            {
                "type": "deadline",
                "icon_color": "var(--amber)",
                "text": f'Saved deadline: "{label}"',
                "action_type": "open_calendar",
                "action_payload": {"route": "/?tab=calendar"},
            }
        )

    for update in profile_updates or []:
        if not isinstance(update, dict):
            continue
        if bool(update.get("confirmed")):
            continue
        field = str(update.get("field") or "profile").strip()
        lines.append(
            {
                "type": "profile",
                "icon_color": "var(--teal)",
                "text": f"Suggested profile update: {field}",
                "action_type": None,
                "action_payload": None,
            }
        )

    if isinstance(score_impact, dict) and int(score_impact.get("total_pts") or 0) > 0:
        breakdown = score_impact.get("dimension_breakdown") if isinstance(score_impact.get("dimension_breakdown"), dict) else {}
        top_dim = max(["smart", "grit", "build"], key=lambda d: int(breakdown.get(d) or 0))
        lines.append(
            {
                "type": "impact",
                "icon_color": "var(--blue)" if top_dim == "smart" else "var(--amber)" if top_dim == "grit" else "var(--indigo)",
                "text": f"Score impact if you act: +{int(score_impact.get('total_pts') or 0)} pts {top_dim.title()}",
                "action_type": None,
                "action_payload": None,
            }
        )
    return lines

