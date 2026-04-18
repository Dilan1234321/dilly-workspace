"""
/admin/cost — LLM spend dashboard endpoints.

Guarded by an allow-list of admin emails (same list the other admin
routes use). Returns top-line + per-feature + per-plan + top-user
breakdowns sourced from the llm_usage_log table written by every
Anthropic call site.

Public routes (no admin check):
  GET /admin/cost/top              — last 30-day dashboard
  GET /admin/cost/user/{email}     — one-user drilldown, last 30d

Example:
  curl -H "Authorization: Bearer $TOKEN" https://api.trydilly.com/admin/cost/top

If the admin token isn't valid, returns 403 and logs nothing.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

from projects.dilly.api import deps
from projects.dilly.api.llm_usage_log import (
    get_top_line, get_user_detail, purge_old_rows,
)

router = APIRouter(tags=["admin-cost"])


def _ADMIN_EMAILS() -> set[str]:
    """Read admin allow-list from env. Matches the pattern other
    admin routes in the codebase use. Defaults to a single owner
    email so there's no way for a non-admin to hit these routes."""
    raw = (os.environ.get("DILLY_ADMIN_EMAILS", "") or "").strip()
    emails = {e.strip().lower() for e in raw.split(",") if e.strip()}
    if not emails:
        # Fallback — Dilan's owner email. Update if ownership changes.
        emails.add("kochhardilan05@gmail.com")
    return emails


def _require_admin(request: Request) -> str:
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if email not in _ADMIN_EMAILS():
        raise HTTPException(status_code=403, detail="Admin access required.")
    return email


@router.get("/admin/cost/top")
async def admin_cost_top(request: Request, days: int = 30):
    """Top-line dashboard: total spend, per-feature, per-plan, top users, daily trend."""
    _require_admin(request)
    if days < 1 or days > 365:
        days = 30
    return get_top_line(days=days)


@router.get("/admin/cost/user/{email}")
async def admin_cost_user(email: str, request: Request, days: int = 30):
    """Drilldown for a single user — per-feature totals + last 100 calls."""
    _require_admin(request)
    if days < 1 or days > 365:
        days = 30
    return get_user_detail(email.strip().lower(), days=days)


@router.post("/admin/cost/purge")
async def admin_cost_purge(request: Request, retention_days: int = 90):
    """Manually purge rows older than retention_days. Idempotent;
    the daily cron calls this internally too. Returns count deleted."""
    _require_admin(request)
    if retention_days < 7 or retention_days > 365:
        retention_days = 90
    n = purge_old_rows(retention_days)
    return {"purged": n, "retention_days": retention_days}
