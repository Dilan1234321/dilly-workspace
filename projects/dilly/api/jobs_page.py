"""
Jobs page payload: readiness-ordered matches, free-tier stubs, applied flags.
GET /jobs/page
"""
from __future__ import annotations

import math
import time
from datetime import datetime, timezone
from typing import Any

_DIMS = ("smart", "grit", "build")


def _parse_posted_ts(job: dict) -> float | None:
    raw = job.get("posted_date") or job.get("scraped_at")
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw) if raw > 1e12 else float(raw)
    s = str(raw).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return None


def _deadline_fields(job: dict) -> tuple[str | None, int | None]:
    """Synthetic apply-by: 28 days after posted date, if known."""
    ts = _parse_posted_ts(job)
    if ts is None:
        return None, None
    close_ts = ts + 28 * 86400
    close_dt = datetime.fromtimestamp(close_ts, tz=timezone.utc)
    deadline = close_dt.strftime("%Y-%m-%d")
    now = time.time()
    days = max(0, int(math.ceil((close_ts - now) / 86400)))
    return deadline, days


def _job_type_label(job: dict) -> str:
    jt = (job.get("job_type") or "").lower()
    title = (job.get("title") or "").lower()
    if "intern" in jt or "intern" in title or "co-op" in title:
        return "internship"
    return "full_time"


def _user_scores(audit: dict | None) -> dict[str, float]:
    if not audit:
        return {"smart": 0.0, "grit": 0.0, "build": 0.0, "final": 0.0}
    sc = audit.get("scores") or {}
    return {
        "smart": float(sc.get("smart") or 0),
        "grit": float(sc.get("grit") or 0),
        "build": float(sc.get("build") or 0),
        "final": float(audit.get("final_score") or 0),
    }


def _compute_readiness(
    required: dict[str, Any] | None,
    user: dict[str, float],
) -> tuple[str, bool, bool, bool, str | None, int | None, str | None]:
    """
    Returns readiness, smart_pass, grit_pass, build_pass, failing_dimension (smart|grit|build|None), gap_pts, gap_insight.
    """
    if not required:
        return "ready", True, True, True, None, None, None

    def need(key: str) -> float | None:
        v = required.get(key)
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    min_s = need("min_smart")
    min_g = need("min_grit")
    min_b = need("min_build")
    min_f = need("min_final_score")

    smart_pass = min_s is None or user["smart"] >= min_s
    grit_pass = min_g is None or user["grit"] >= min_g
    build_pass = min_b is None or user["build"] >= min_b
    final_pass = min_f is None or user["final"] >= min_f

    dim_gaps: list[tuple[str, int]] = []
    if min_s is not None and user["smart"] < min_s:
        dim_gaps.append(("smart", max(0, int(math.ceil(min_s - user["smart"])))))
    if min_g is not None and user["grit"] < min_g:
        dim_gaps.append(("grit", max(0, int(math.ceil(min_g - user["grit"])))))
    if min_b is not None and user["build"] < min_b:
        dim_gaps.append(("build", max(0, int(math.ceil(min_b - user["build"])))))

    if not dim_gaps and final_pass:
        return "ready", True, True, True, None, None, None

    if len(dim_gaps) == 1 and dim_gaps[0][1] <= 15 and final_pass:
        d, g = dim_gaps[0]
        return (
            "close_gap",
            smart_pass,
            grit_pass,
            build_pass,
            d,
            g,
            f"{d.capitalize()} is {g} pts below their bar. You're close.",
        )

    if not dim_gaps and not final_pass and min_f is not None:
        w = min(_DIMS, key=lambda d: user[d])
        g = max(1, int(math.ceil(min_f - user["final"])))
        return (
            "stretch",
            smart_pass,
            grit_pass,
            build_pass,
            w,
            g,
            "Overall score is still below their bar — tighten evidence on your weakest dimension first.",
        )

    if dim_gaps:
        worst = max(dim_gaps, key=lambda x: x[1])
        d, g = worst[0], worst[1]
        return (
            "stretch",
            smart_pass,
            grit_pass,
            build_pass,
            d,
            g,
            f"{d.capitalize()} needs +{g} pts to match their published bar.",
        )

    return "stretch", smart_pass, grit_pass, build_pass, None, None, "Run a fresh audit to align your scores with this posting."


def _dilly_take(
    readiness: str,
    company: str,
    match_pct: float,
    failing_dim: str | None,
    gap_pts: int | None,
    smart_pass: bool,
    grit_pass: bool,
    build_pass: bool,
) -> str:
    c = (company or "this firm").strip()
    if readiness == "ready":
        return f"Your Smart, Grit, and Build scores clear {c}'s published bar. You're in a strong position to apply now."
    if readiness == "close_gap" and failing_dim and gap_pts is not None:
        return f"Your {failing_dim.capitalize()} is about {gap_pts} pts under their bar — one focused fix and you're competitive at {c}."
    parts = []
    if smart_pass:
        parts.append("Smart")
    if grit_pass:
        parts.append("Grit")
    if build_pass:
        parts.append("Build")
    ok = ", ".join(parts) if parts else "your scores"
    return f"{int(match_pct)}% profile match. {ok} may still sit below their hiring bar — tighten evidence before you apply."


def _applied_job_ids(apps: list[dict]) -> set[str]:
    out: set[str] = set()
    for a in apps:
        jid = a.get("job_id")
        if jid:
            out.add(str(jid).strip())
        st = (a.get("status") or "").lower()
        if st in ("applied", "interviewing", "offer") and jid:
            out.add(str(jid).strip())
    return out


def build_jobs_page_payload(*, email: str, subscribed: bool) -> dict[str, Any]:
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.audit_history_pg import get_audits
    from projects.dilly.api.resume_loader import load_parsed_resume_for_voice
    from projects.dilly.api.job_matching import get_recommended_jobs as match_jobs
    from projects.dilly.api.apply_destinations import get_application_email
    from projects.dilly.api.routers.applications import _load_applications

    profile = get_profile(email) or {}
    audits = get_audits(email)
    latest_audit = audits[0] if audits else None
    resume_text = load_parsed_resume_for_voice(email, max_chars=4000)

    user_scores = _user_scores(latest_audit)

    # Pull a larger pool for sorting; location gate may return []
    raw_jobs = match_jobs(
        profile=profile,
        resume_text=resume_text,
        audit=latest_audit,
        limit=40,
        offset=0,
        min_match_pct=0,
        use_llm=True,
    )

    apps = _load_applications(email)
    applied_ids = _applied_job_ids(apps)

    enriched: list[dict[str, Any]] = []
    for j in raw_jobs:
        req = j.get("required_scores")
        readiness, sp, gp, bp, fail_dim, gap_pts, gap_insight = _compute_readiness(
            req if isinstance(req, dict) else None,
            user_scores,
        )
        deadline, days_d = _deadline_fields(j)
        jtype = _job_type_label(j)
        bullets = j.get("why_bullets") or []
        if not isinstance(bullets, list):
            bullets = []
        bullets = [str(b)[:400] for b in bullets[:4] if b]

        jid = str(j.get("id", "")).strip()
        apply_url = (j.get("url") or "").strip() or None
        apply_em = get_application_email(jid) or None

        take = _dilly_take(readiness, str(j.get("company") or ""), float(j.get("match_pct") or 0), fail_dim, gap_pts, sp, gp, bp)

        enriched.append(
            {
                "id": jid,
                "title": (j.get("title") or "Role").strip(),
                "company": (j.get("company") or "Company").strip(),
                "location": (j.get("location") or "").strip() or "—",
                "type": jtype,
                "deadline": deadline,
                "days_until_deadline": days_d,
                "readiness": readiness,
                "match_pct": int(round(float(j.get("match_pct") or 0))),
                "smart_pass": sp,
                "grit_pass": gp,
                "build_pass": bp,
                "failing_dimension": fail_dim if fail_dim in _DIMS else None,
                "gap_pts": gap_pts,
                "gap_insight": gap_insight,
                "why_fit_bullets": bullets[:3] if bullets else [f"Strong {jtype.replace('_', '-')} fit for your track and resume signals."],
                "dilly_take": take[:320],
                "apply_url": apply_url,
                "apply_email": apply_em,
                "applied": jid in applied_ids,
            }
        )

    def sort_key(m: dict) -> tuple[int, int, int]:
        r = m["readiness"]
        rk = 0 if r == "ready" else 1 if r == "close_gap" else 2
        d = m.get("days_until_deadline")
        du = d if isinstance(d, int) else 9999
        return (rk, du, -int(m.get("match_pct") or 0))

    enriched.sort(key=sort_key)

    # Applied jobs sink to bottom within same readiness group
    not_applied = [m for m in enriched if not m.get("applied")]
    did_apply = [m for m in enriched if m.get("applied")]
    enriched = not_applied + did_apply

    total = len(enriched)
    is_free = not subscribed
    locked_count = max(0, total - 2) if is_free else 0

    matches_out: list[dict[str, Any]] = []
    for i, m in enumerate(enriched):
        if is_free and i >= 2:
            matches_out.append(
                {
                    "id": m["id"],
                    "title": m["title"],
                    "company": m["company"],
                    "readiness": m["readiness"],
                }
            )
        else:
            matches_out.append(m)

    return {
        "matches": matches_out,
        "total_matches": total,
        "locked_count": locked_count,
        "is_free_tier": is_free,
        "has_audit": latest_audit is not None,
        "has_location_prefs": bool(
            (profile.get("job_location_scope") or "").strip()
            or (profile.get("job_locations") or [])
        ),
    }
