"""Stake-level helpers for Dilly agent actions."""

from __future__ import annotations

from projects.dilly.api.dilly_agent.action_types import ALL_ACTIONS, LOW_STAKES


def get_stake_level(action: str) -> str:
    a = str(action or "").strip().upper()
    if a not in ALL_ACTIONS:
        return "high"
    return "low" if a in LOW_STAKES else "high"

