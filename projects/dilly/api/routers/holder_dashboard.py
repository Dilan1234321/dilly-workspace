"""
Holder career dashboard — zero-LLM aggregation endpoint that powers
the "My Career" tab for people who already have a job.

GET /holder/career-dashboard

Returns:
  {
    "identity": { name, photo_url, current_role, current_company,
                  years_experience, tenure_months },
    "comp_benchmark": { soc, title, p10, p25, p50, p75, p90,
                        estimated_wage, estimated_percentile,
                        currency, source }  // null if we can't match
    "trajectory": [ { role, company, date, location, bullets[] } ],
    "skills": [ str ]
  }

We pull from existing stores — profile, memory (facts), profile_txt —
and add BLS OES percentiles via the curated wage table. No external
calls, no LLM cost.
"""
from __future__ import annotations
import os
import re
import sys
import time
from typing import Optional

from fastapi import APIRouter, Request, HTTPException

from projects.dilly.api import deps

# Workspace root
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

from projects.dilly.dilly_core.bls_wages import (  # noqa: E402
    lookup_wage,
    seniority_adjustment,
    percentile_from_estimate,
    adjacencies_for,
)

router = APIRouter(tags=["holder"])


def _str(v) -> str:
    return "" if v is None else str(v).strip()


def _years_to_float(v) -> float:
    """Accept '5 years', '5', 5, 5.5, '5+' etc."""
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().lower()
    m = re.search(r"\d+(?:\.\d+)?", s)
    if not m:
        return 0.0
    try:
        return float(m.group(0))
    except Exception:
        return 0.0


def _tenure_months_from_date_range(date_range: str) -> int:
    """
    Parse strings like 'Jan 2022 - Present', '2020 - 2023', '2020 -
    Mar 2024'. Returns months for the first (= current) role; 0 if
    unparseable.
    """
    if not date_range:
        return 0
    s = date_range.strip()
    # Identify start and end tokens on either side of a dash.
    parts = re.split(r"\s*[-–—]\s*", s, maxsplit=1)
    if len(parts) != 2:
        return 0
    start_raw, end_raw = parts[0].strip(), parts[1].strip()

    def parse(tok: str) -> Optional[tuple[int, int]]:
        tok = tok.strip()
        if not tok:
            return None
        if tok.lower() in ("present", "now", "current"):
            t = time.localtime()
            return (t.tm_year, t.tm_mon)
        # 'Jan 2022' or 'January 2022'
        m = re.match(r"^([A-Za-z]{3,9})\s+(\d{4})$", tok)
        if m:
            month_str, year = m.group(1)[:3].lower(), int(m.group(2))
            months = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
                      "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}
            return (year, months.get(month_str, 1))
        # '2022'
        m = re.match(r"^(\d{4})$", tok)
        if m:
            return (int(m.group(1)), 1)
        # '01/2022'
        m = re.match(r"^(\d{1,2})/(\d{4})$", tok)
        if m:
            return (int(m.group(2)), int(m.group(1)))
        return None

    start = parse(start_raw)
    end = parse(end_raw)
    if not start or not end:
        return 0
    (sy, sm), (ey, em) = start, end
    months = (ey - sy) * 12 + (em - sm)
    return max(0, months)


def _collect_skills(email: str) -> list[str]:
    """Pull skill-flavored facts from the memory store. Falls back to
    the profile's self-reported skills array if none."""
    out: list[str] = []
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface  # type: ignore
        surface = get_memory_surface(email) or {}
        items = surface.get("items") or []
        for it in items:
            cat = (it.get("category") or "").lower()
            if cat in ("skill", "skills", "expertise", "tool", "stack"):
                val = _str(it.get("label") or it.get("value"))
                if val and val not in out:
                    out.append(val)
                if len(out) >= 12:
                    break
    except Exception:
        pass
    return out


def _collect_trajectory(email: str) -> list[dict]:
    """Structured work history from the parsed profile txt."""
    try:
        from projects.dilly.api.dilly_profile_txt import (  # type: ignore
            read_profile_txt,
            parse_structured_experience_from_profile_txt,
        )
        txt = read_profile_txt(email) or ""
        rows = parse_structured_experience_from_profile_txt(txt) or []
        cleaned: list[dict] = []
        for r in rows[:10]:
            cleaned.append({
                "role":     _str(r.get("role")),
                "company":  _str(r.get("company")),
                "date":     _str(r.get("date")),
                "location": _str(r.get("location")),
                "bullets":  [_str(b) for b in (r.get("bullets") or [])][:5],
            })
        return cleaned
    except Exception:
        return []


@router.get("/holder/career-dashboard")
async def holder_career_dashboard(request: Request):
    user = deps.require_auth(request)
    email = (user.get("email") or "").lower()
    if not email:
        raise HTTPException(401, "not authenticated")

    # Profile
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists  # type: ignore
        profile = ensure_profile_exists(email) or {}
    except Exception:
        profile = {}

    name           = _str(profile.get("name"))
    photo_url      = _str(profile.get("photo_url"))
    current_role   = (
        _str(profile.get("current_role"))
        or _str(profile.get("current_job_title"))
        or _str(profile.get("title"))
    )
    current_company = (
        _str(profile.get("current_company"))
        or _str(profile.get("company"))
    )
    yoe = _years_to_float(profile.get("years_experience"))

    trajectory = _collect_trajectory(email)
    skills     = _collect_skills(email)

    # If the profile didn't carry a current role / company, fall back
    # to the most recent trajectory entry. Many holders only give us
    # their resume and nothing else.
    if not current_role and trajectory:
        current_role = trajectory[0].get("role") or ""
    if not current_company and trajectory:
        current_company = trajectory[0].get("company") or ""
    tenure_months = 0
    if trajectory:
        tenure_months = _tenure_months_from_date_range(
            trajectory[0].get("date") or ""
        )

    # Comp benchmark
    wage = lookup_wage(current_role) if current_role else None
    comp_benchmark = None
    if wage:
        estimate = seniority_adjustment(yoe, wage["p50"])
        percentile = percentile_from_estimate(wage, estimate)
        comp_benchmark = {
            "soc":                  wage["soc"],
            "title":                wage["title"],
            "p10":                  wage["p10"],
            "p25":                  wage["p25"],
            "p50":                  wage["p50"],
            "p75":                  wage["p75"],
            "p90":                  wage["p90"],
            "estimated_wage":       estimate,
            "estimated_percentile": percentile,
            "currency":             "USD",
            "source":               "BLS OES (May 2024)",
        }

    return {
        "identity": {
            "name":             name,
            "photo_url":        photo_url,
            "current_role":     current_role,
            "current_company":  current_company,
            "years_experience": yoe,
            "tenure_months":    tenure_months,
        },
        "comp_benchmark": comp_benchmark,
        "trajectory":     trajectory,
        "skills":         skills[:10],
    }


@router.get("/holder/market-radar")
async def holder_market_radar(request: Request):
    """
    Market intelligence tailored for jobholders. Zero-LLM.

    Returns:
      {
        current:    { role, estimated_wage, estimated_percentile,
                      p25, p50, p75, market_count },
        ladder:     [ { move, label, p50, estimated_wage, delta_pct,
                        delta_usd } ],
        active_market: { total, window: 'now' }
      }

    `current.market_count` and `active_market.total` are the same
    number right now (we only have one listings feed). Split fields
    let us swap one for a geo-filtered count later without a client
    change.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").lower()
    if not email:
        raise HTTPException(401, "not authenticated")

    # Profile
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists  # type: ignore
        profile = ensure_profile_exists(email) or {}
    except Exception:
        profile = {}

    current_role = (
        _str(profile.get("current_role"))
        or _str(profile.get("current_job_title"))
        or _str(profile.get("title"))
    )
    yoe = _years_to_float(profile.get("years_experience"))

    # Fall back to most-recent trajectory role if profile is bare
    if not current_role:
        traj = _collect_trajectory(email)
        if traj:
            current_role = traj[0].get("role") or ""

    wage = lookup_wage(current_role) if current_role else None
    current_block: dict = {
        "role":                 current_role,
        "estimated_wage":       None,
        "estimated_percentile": None,
        "p25":                  None,
        "p50":                  None,
        "p75":                  None,
        "market_count":         None,
    }

    ladder: list[dict] = []

    if wage:
        est_current = seniority_adjustment(yoe, wage["p50"])
        pct_current = percentile_from_estimate(wage, est_current)
        current_block.update({
            "estimated_wage":       est_current,
            "estimated_percentile": pct_current,
            "p25":                  wage["p25"],
            "p50":                  wage["p50"],
            "p75":                  wage["p75"],
        })

        # Build the ladder — comp deltas against current est
        for adj in adjacencies_for(wage):
            tgt_wage = lookup_wage(adj["target"])
            if not tgt_wage:
                continue
            est_tgt = seniority_adjustment(yoe, tgt_wage["p50"])
            delta_usd = est_tgt - est_current
            delta_pct = (delta_usd / est_current * 100) if est_current else 0
            ladder.append({
                "move":           adj["move"],
                "label":          adj["label"],
                "p50":            tgt_wage["p50"],
                "estimated_wage": est_tgt,
                "delta_usd":      int(delta_usd),
                "delta_pct":      round(delta_pct, 1),
            })

    # Active market count — cheap direct count against the
    # internships table. Treat any exception as "unavailable" so the
    # rest of the card still renders.
    market_total = None
    try:
        from projects.dilly.api.routers.internships_v2 import _get_db  # type: ignore
        conn = _get_db()
        try:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM internships")
            row = cur.fetchone()
            market_total = int(row[0]) if row else None
        finally:
            conn.close()
    except Exception:
        market_total = None

    if market_total is not None:
        current_block["market_count"] = int(market_total)

    return {
        "current":       current_block,
        "ladder":        ladder,
        "active_market": {"total": market_total, "window": "now"},
    }
