"""
Wins — user-logged career milestones.

Retention lever: this app is where progress lives. Every application,
interview, offer, or self-defined milestone gets captured to a
timeline the user can look back on. Opening the app to LOG a win
becomes a positive-reinforcement habit, and seeing past wins on Home
gives returning users the emotional payoff that makes them want to
come back.

No LLM calls. All user-authored.

Endpoints:
  POST /wins        → { type, title, note?, company?, date? } -> new entry
  GET  /wins        → recent wins, newest first (default 20, max 100)
  POST /wins/{id}/delete → remove a win (explicit soft-delete via list overwrite)

Storage:
  profile.wins = [
    { id, type: 'applied'|'interview'|'offer'|'milestone', title,
      note?, company?, date: 'YYYY-MM-DD', created_at: ISO }
    ...
  ]
"""

import datetime
import uuid as _uuid

from fastapi import APIRouter, Request

from projects.dilly.api import deps, errors


router = APIRouter(tags=["wins"])


VALID_TYPES = {"applied", "interview", "offer", "milestone"}


def _today_iso() -> str:
    return datetime.date.today().isoformat()


def _now_iso() -> str:
    return datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"


@router.post("/wins")
async def add_win(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}

    win_type = str(body.get("type") or "").strip().lower()
    if win_type not in VALID_TYPES:
        raise errors.bad_request(f"type must be one of {sorted(VALID_TYPES)}")

    title = str(body.get("title") or "").strip()
    if not title:
        raise errors.bad_request("title is required")
    title = title[:140]

    note = str(body.get("note") or "").strip()[:500] or None
    company = str(body.get("company") or "").strip()[:80] or None

    raw_date = str(body.get("date") or "").strip()[:10]
    if raw_date:
        try:
            datetime.date.fromisoformat(raw_date)
            date_str = raw_date
        except Exception:
            date_str = _today_iso()
    else:
        date_str = _today_iso()

    from projects.dilly.api.profile_store import get_profile, save_profile

    profile = get_profile(email) or {}
    wins = profile.get("wins") if isinstance(profile.get("wins"), list) else []

    entry = {
        "id": str(_uuid.uuid4()),
        "type": win_type,
        "title": title,
        "note": note,
        "company": company,
        "date": date_str,
        "created_at": _now_iso(),
    }
    wins.append(entry)

    # Cap at 200 entries — older ones fall off to keep profile bounded.
    if len(wins) > 200:
        wins = wins[-200:]

    save_profile(email, {"wins": wins})

    return {"ok": True, "win": entry, "total": len(wins)}


@router.get("/wins")
async def list_wins(request: Request, limit: int = 20):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile

    profile = get_profile(email) or {}
    wins = profile.get("wins") if isinstance(profile.get("wins"), list) else []

    # Sort by date desc, then created_at desc so same-day wins order
    # by when they were logged.
    sorted_wins = sorted(
        wins,
        key=lambda w: (str(w.get("date") or ""), str(w.get("created_at") or "")),
        reverse=True,
    )
    limit = max(1, min(100, int(limit or 20)))
    recent = sorted_wins[:limit]

    # Aggregate counts per type for the Home card header
    # (e.g. "3 applications · 1 interview this month").
    cutoff = (datetime.date.today() - datetime.timedelta(days=30)).isoformat()
    this_month_counts: dict[str, int] = {}
    for w in wins:
        if str(w.get("date") or "") >= cutoff:
            t = str(w.get("type") or "")
            this_month_counts[t] = this_month_counts.get(t, 0) + 1

    return {
        "ok": True,
        "wins": recent,
        "total": len(wins),
        "this_month": this_month_counts,
    }


@router.post("/wins/{win_id}/delete")
async def delete_win(win_id: str, request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise errors.unauthorized()

    from projects.dilly.api.profile_store import get_profile, save_profile

    profile = get_profile(email) or {}
    wins = profile.get("wins") if isinstance(profile.get("wins"), list) else []
    new_wins = [w for w in wins if isinstance(w, dict) and w.get("id") != win_id]
    if len(new_wins) == len(wins):
        return {"ok": True, "deleted": False}

    save_profile(email, {"wins": new_wins})
    return {"ok": True, "deleted": True, "total": len(new_wins)}
