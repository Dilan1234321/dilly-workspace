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
    company_premium,
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
        base_estimate = seniority_adjustment(yoe, wage["p50"])
        # Apply the company premium if the user's current_company
        # matches a curated tier (FAANG, top banks, prestige
        # consulting, etc.). Falls back to 1.0 for unknown companies
        # so we never INVENT a premium — only surface one we've
        # curated. See dilly_core/bls_wages.py for the table.
        mult, matched_key = company_premium(current_company)
        estimate = int(round(base_estimate * mult))
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
            "company_multiplier":   mult,
            "company_match":        matched_key,
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
    current_company = (
        _str(profile.get("current_company"))
        or _str(profile.get("company"))
    )
    yoe = _years_to_float(profile.get("years_experience"))

    # Fall back to most-recent trajectory role if profile is bare
    if not current_role:
        traj = _collect_trajectory(email)
        if traj:
            current_role = traj[0].get("role") or ""

    # Company premium: same logic as /career-dashboard. The CURRENT
    # wage estimate uses the user's company (their current comp).
    # Ladder targets use 1.0 — a hypothetical move to another role is
    # to an unknown company. This is a more honest delta than
    # multiplying both sides.
    wage = lookup_wage(current_role) if current_role else None
    current_mult, current_match = company_premium(current_company)

    current_block: dict = {
        "role":                 current_role,
        "estimated_wage":       None,
        "estimated_percentile": None,
        "p25":                  None,
        "p50":                  None,
        "p75":                  None,
        "market_count":         None,
        "company_multiplier":   current_mult,
        "company_match":        current_match,
    }

    ladder: list[dict] = []

    if wage:
        base_est_current = seniority_adjustment(yoe, wage["p50"])
        est_current = int(round(base_est_current * current_mult))
        pct_current = percentile_from_estimate(wage, est_current)
        current_block.update({
            "estimated_wage":       est_current,
            "estimated_percentile": pct_current,
            "p25":                  wage["p25"],
            "p50":                  wage["p50"],
            "p75":                  wage["p75"],
        })

        # Build the ladder — comp deltas against current est. Ladder
        # targets don't get a company premium (you'd be moving to an
        # unknown employer), so deltas reflect the pure role change.
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


@router.get("/holder/raise-brief")
async def holder_raise_brief(request: Request):
    """
    Pre-rendered brief for a raise / comp conversation. Zero-LLM.

    Returns the everything a holder needs to walk into a negotiation
    with a number and a narrative:
      {
        you:          { role, company, years_experience, tenure_months,
                        market_title },
        market:       { p25, p50, p75, your_estimated_wage,
                        your_percentile, company_premium,
                        company_match },
        gap:          { label, usd, pct }         // null if unknown
        the_ask:      { min, target, stretch }    // the 3 numbers
        wins:         [ str ]                     // up to 4 from memory
        why_now:      [ str ]                     // 3 reasons
        opener:       str                         // one-sentence script
      }

    "wins" pulls from memory facts tagged as achievement/win/shipped/
    outcome. If the user hasn't told Dilly any yet, we return an empty
    list so the frontend can prompt them to add some — much better
    than fabricating.
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").lower()
    if not email:
        raise HTTPException(401, "not authenticated")

    # Profile + current role / company / YOE / tenure
    try:
        from projects.dilly.api.profile_store import ensure_profile_exists  # type: ignore
        profile = ensure_profile_exists(email) or {}
    except Exception:
        profile = {}

    name = _str(profile.get("name"))
    current_role = (
        _str(profile.get("current_role"))
        or _str(profile.get("current_job_title"))
        or _str(profile.get("title"))
    )
    current_company = (
        _str(profile.get("current_company"))
        or _str(profile.get("company"))
    )
    yoe = _years_to_float(profile.get("years_experience"))

    # Pull tenure from the first trajectory entry if the user has a
    # parsed resume. Otherwise we're working with only-the-profile.
    trajectory = _collect_trajectory(email)
    if not current_role and trajectory:
        current_role = trajectory[0].get("role") or ""
    if not current_company and trajectory:
        current_company = trajectory[0].get("company") or ""
    tenure_months = (
        _tenure_months_from_date_range(trajectory[0].get("date") or "")
        if trajectory else 0
    )

    # Market math with the company premium applied.
    wage = lookup_wage(current_role) if current_role else None
    market_block: dict = {
        "p25": None, "p50": None, "p75": None,
        "your_estimated_wage": None, "your_percentile": None,
        "company_premium": 1.0, "company_match": None,
    }
    gap_block = None
    the_ask: dict = {"min": None, "target": None, "stretch": None}
    if wage:
        mult, matched_key = company_premium(current_company)
        base_estimate = seniority_adjustment(yoe, wage["p50"])
        your_est = int(round(base_estimate * mult))
        your_pct = percentile_from_estimate(wage, your_est)
        market_block.update({
            "p25": wage["p25"], "p50": wage["p50"], "p75": wage["p75"],
            "your_estimated_wage": your_est,
            "your_percentile": your_pct,
            "company_premium": mult,
            "company_match": matched_key,
        })
        # Gap: how far is the user from the p50 of THIS role at THIS
        # company. Positive = under-paid relative to estimate, which
        # is actually an odd read because your_est IS p50-derived —
        # but we can report the gap to p75 as "ambitious target."
        gap_usd = wage["p75"] * mult - your_est
        gap_pct = (gap_usd / your_est * 100) if your_est else 0
        gap_block = {
            "label": "Gap to P75",
            "usd":   int(gap_usd),
            "pct":   round(gap_pct, 1),
        }
        # Three-number ask anchored off the user's current estimated
        # value. Min = floor (what we wouldn't walk out under),
        # Target = the number we're really after, Stretch = the
        # ambitious ask that leaves room to negotiate down.
        the_ask = {
            "min":     int(round(your_est * 1.05)),
            "target":  int(round(your_est * 1.12)),
            "stretch": int(round(your_est * 1.20)),
        }

    # Wins — pulled from memory facts. We look for category flavors
    # that read as achievements. Memory items have a shown_to_user
    # flag; we include both surfaces so hidden-but-real wins still
    # land in the brief.
    wins: list[str] = []
    try:
        from projects.dilly.api.memory_surface_store import get_memory_surface  # type: ignore
        surface = get_memory_surface(email) or {}
        items = surface.get("items") or []
        for it in items:
            cat = (it.get("category") or "").lower()
            if cat in ("achievement", "achievements", "win", "wins",
                       "shipped", "outcome", "impact", "metric"):
                val = _str(it.get("value") or it.get("label"))
                if val and val not in wins:
                    wins.append(val)
                if len(wins) >= 4:
                    break
    except Exception:
        pass

    # Why now — three reasons computed from what we know. Favor
    # specificity over generic anchors.
    why_now: list[str] = []
    if tenure_months >= 18:
        yrs_in = tenure_months / 12
        why_now.append(
            f"You've been in this role {yrs_in:.1f} year{'s' if yrs_in >= 2 else ''} — past the tenure most managers expect before a comp conversation."
        )
    if wage and market_block.get("your_percentile"):
        pct = market_block["your_percentile"]
        if pct < 50:
            why_now.append(
                f"Your estimated market value sits at P{pct} — below the market median for this role. That's a legitimate anchor."
            )
        elif pct < 75:
            why_now.append(
                f"You're at P{pct} against national market. A raise to P75 is standard once you hit this tenure."
            )
    if wins:
        why_now.append(
            f"You have {len(wins)} concrete win{'s' if len(wins) != 1 else ''} Dilly's heard you talk about — specific outcomes give the conversation weight."
        )
    if not why_now:
        # Fallback so the brief always has something — these are
        # generic but honest.
        why_now = [
            "A year of cost-of-living drift means last year's number is a real-dollar cut.",
            "Most comp cycles leave raises on the table when they're not asked for.",
        ]

    # Opener — short, pre-written, concrete. We don't customise too
    # aggressively because over-personalised scripts sound fake.
    opener = (
        "I wanted to set up time to talk about compensation. "
        "I've looked at what the role pays at my level of experience, "
        "and I want to walk you through where I think I should be."
    )

    return {
        "you": {
            "name":             name,
            "role":             current_role,
            "company":          current_company,
            "years_experience": yoe,
            "tenure_months":    tenure_months,
            "market_title":     wage["title"] if wage else None,
        },
        "market":  market_block,
        "gap":     gap_block,
        "the_ask": the_ask,
        "wins":    wins,
        "why_now": why_now[:3],
        "opener":  opener,
    }


@router.get("/holder/escape-hatch")
async def holder_escape_hatch(request: Request):
    """
    Quiet read on what a holder would walk into if they left their
    current role. Zero pressure, zero apply surface — the whole point
    of this endpoint is giving holders a snapshot they can pull any
    time without it feeling like a job hunt.

    Returns:
      {
        you:      { role, company, estimated_wage },
        doors: [                                 // 4-5 role options
          { move, label, estimated_wage, delta_usd, delta_pct,
            soc, market_count, sample_jobs: [
              { id, title, company, location, apply_url }
            ]
          }
        ],
        total_market: int | null,                // active listings
        updated_at:   iso timestamp,
      }
    """
    user = deps.require_auth(request)
    email = (user.get("email") or "").lower()
    if not email:
        raise HTTPException(401, "not authenticated")

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
    current_company = (
        _str(profile.get("current_company"))
        or _str(profile.get("company"))
    )
    yoe = _years_to_float(profile.get("years_experience"))

    if not current_role:
        traj = _collect_trajectory(email)
        if traj:
            current_role = traj[0].get("role") or ""
            if not current_company:
                current_company = traj[0].get("company") or ""

    wage = lookup_wage(current_role) if current_role else None
    mult, _ = company_premium(current_company)
    est_current = (
        int(round(seniority_adjustment(yoe, wage["p50"]) * mult))
        if wage else None
    )

    # Build the doors. Each door is an adjacent role target. For each
    # we pull a few concrete active listings from the internships
    # table so the user sees real postings, not vibes.
    doors: list[dict] = []
    total_market: int | None = None

    try:
        from projects.dilly.api.routers.internships_v2 import _get_db  # type: ignore
        conn = _get_db()
    except Exception:
        conn = None

    if wage and conn is not None:
        try:
            import psycopg2.extras
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            # Total count across the whole feed — same signal as
            # Market Radar's "N hiring" pill.
            try:
                cur.execute("SELECT COUNT(*) AS n FROM internships")
                row = cur.fetchone()
                total_market = int(row["n"]) if row else None
            except Exception:
                total_market = None

            # Include the user's current role as door 1 so the
            # 'lateral move at a new employer' option is always
            # available. The rest come from the adjacency map.
            targets: list[dict] = [{
                "move":   "Lateral",
                "label":  wage["title"],
                "target": wage["title"],
            }]
            targets.extend(adjacencies_for(wage))

            for adj in targets[:5]:
                tgt_wage = lookup_wage(adj["target"])
                if not tgt_wage:
                    continue
                est_tgt = seniority_adjustment(yoe, tgt_wage["p50"])
                delta_usd = (est_tgt - (est_current or 0))
                delta_pct = (delta_usd / est_current * 100) if est_current else 0

                sample_jobs: list[dict] = []
                # Loose title match — BLS titles and real job titles
                # don't always overlap, so we search by ILIKE on a
                # shortened term. This is intentionally generous; the
                # user can refine in the Market tab.
                try:
                    title_term = (tgt_wage["title"].split()[-2:] or [tgt_wage["title"]])
                    # Build a % pattern from the last 1-2 words of
                    # the title.
                    like_pattern = "%" + " ".join(title_term) + "%"
                    cur.execute("""
                        SELECT i.id, i.title, i.apply_url, i.location_city, i.location_state,
                               c.name AS company
                        FROM internships i
                        JOIN companies c ON i.company_id = c.id
                        WHERE i.title ILIKE %s
                        ORDER BY i.posted_date DESC NULLS LAST, i.quality_score DESC NULLS LAST
                        LIMIT 3
                    """, (like_pattern,))
                    for r in cur.fetchall():
                        loc_parts = [
                            (r.get("location_city") or "").strip(),
                            (r.get("location_state") or "").strip(),
                        ]
                        loc = ", ".join([p for p in loc_parts if p])
                        sample_jobs.append({
                            "id":        str(r.get("id") or ""),
                            "title":     _str(r.get("title")),
                            "company":   _str(r.get("company")),
                            "location":  loc,
                            "apply_url": _str(r.get("apply_url")),
                        })
                except Exception:
                    pass

                doors.append({
                    "move":           adj["move"],
                    "label":          adj["label"],
                    "estimated_wage": est_tgt,
                    "delta_usd":      int(delta_usd),
                    "delta_pct":      round(delta_pct, 1),
                    "soc":            tgt_wage["soc"],
                    "market_count":   len(sample_jobs),
                    "sample_jobs":    sample_jobs,
                })
        finally:
            try: conn.close()
            except Exception: pass

    import datetime as _dt
    return {
        "you": {
            "role":           current_role,
            "company":        current_company,
            "estimated_wage": est_current,
        },
        "doors":        doors,
        "total_market": total_market,
        "updated_at":   _dt.datetime.utcnow().isoformat() + "Z",
    }
