"""
Aggregate JSON for Dilly My Score page (GET /profile/score-page).
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any


_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))


def _initials_from_name(full: str) -> str:
    parts = [p for p in (full or "").strip().split() if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()[:3]
    if parts:
        return parts[0][:2].upper()
    return "ME"


def _synthetic_initials(idx: int) -> str:
    a, b = idx % 26, (idx // 26) % 26
    return chr(65 + a) + chr(65 + b)


def _leaderboard_scores_for_track(track: str) -> list[float]:
    from projects.dilly.api.audit_history_pg import get_audits as _get_audits
    from projects.dilly.api.leaderboard_page import _newest_audit_for_leaderboard_track
    from projects.dilly.api.profile_store import is_leaderboard_participating

    want = (track or "Humanities").strip() or "Humanities"
    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
    out: list[float] = []
    if not os.path.isdir(profiles_dir):
        return out
    for uid in os.listdir(profiles_dir):
        profile_path = os.path.join(profiles_dir, uid, "profile.json")
        if not os.path.isfile(profile_path):
            continue
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                prof = json.load(f)
            if not is_leaderboard_participating(prof):
                continue
            email = (prof.get("email") or "").strip().lower()
            if not email:
                continue
            audits = _get_audits(email)
            if not audits:
                continue
            latest = _newest_audit_for_leaderboard_track(audits, want)
            if latest is None:
                continue
            fs = float(latest.get("final_score") or 0)
            out.append(fs)
        except Exception:
            continue
    return out


def _peer_preview_rows(
    *,
    track: str,
    student_final: int,
    student_display_name: str,
) -> tuple[list[dict[str, Any]], int]:
    pool_raw = _leaderboard_scores_for_track(track)
    pool = sorted({float(s) for s in pool_raw if s and float(s) > 0}, reverse=True)
    student_initials = _initials_from_name(student_display_name)
    sf = float(student_final)

    merged = sorted(set(pool + [sf]), reverse=True)
    student_rank = sum(1 for x in merged if x > sf) + 1

    rows: list[dict[str, Any]] = []
    if len(merged) >= 5:
        idx = merged.index(sf)
        lo = max(0, idx - 2)
        hi_ix = min(len(merged), idx + 3)
        for i in range(lo, hi_ix):
            fs = merged[i]
            rk = i + 1
            is_stu = abs(fs - sf) < 0.25
            rows.append(
                {
                    "initials": student_initials if is_stu else _synthetic_initials(i + rk),
                    "score": int(round(fs)),
                    "rank": rk,
                    "is_student": is_stu,
                }
            )
    else:
        vals = sorted({sf + 7, sf + 3, sf, max(0.0, sf - 4), max(0.0, sf - 9)}, reverse=True)
        r_lo = max(1, student_rank - 2)
        for i, fs in enumerate(vals):
            is_stu = abs(fs - sf) < 0.25
            rows.append(
                {
                    "initials": student_initials if is_stu else _synthetic_initials(i + 11),
                    "score": int(round(fs)),
                    "rank": r_lo + i,
                    "is_student": is_stu,
                }
            )
    return rows, student_rank


def _coerce_float(val: Any, default: float = 0.0) -> float:
    try:
        if val is None:
            return default
        return float(val)
    except (TypeError, ValueError):
        return default


def _derive_scores_and_final(latest: dict) -> tuple[dict[str, float], float] | None:
    """
    Normalize Smart/Grit/Build + final from one audit row.
    Handles missing scores dict but present final_score (legacy rows).
    """
    sc = latest.get("scores")
    fs_raw = latest.get("final_score")
    has_dict = isinstance(sc, dict)
    smart = _coerce_float(sc.get("smart")) if has_dict else 0.0
    grit = _coerce_float(sc.get("grit")) if has_dict else 0.0
    build = _coerce_float(sc.get("build")) if has_dict else 0.0
    fs = _coerce_float(fs_raw, 0.0)
    if has_dict:
        if fs <= 0:
            fs = (smart + grit + build) / 3.0
        return {"smart": smart, "grit": grit, "build": build}, fs
    if fs > 0:
        return {"smart": fs, "grit": fs, "build": fs}, fs
    return None


def _scores_and_final_for_payload(row: dict) -> tuple[dict[str, float], float] | None:
    """
    Scores for the score page: strict derive first, then looser fallbacks so history bars
    and focus-by-id stay consistent for legacy rows (odd `scores` shapes, final_score only).
    """
    d = _derive_scores_and_final(row)
    if d is not None:
        return d
    try:
        fs_only = float(row.get("final_score") or 0)
    except (TypeError, ValueError):
        fs_only = 0.0
    if fs_only > 0:
        return {"smart": fs_only, "grit": fs_only, "build": fs_only}, fs_only
    sc = row.get("scores")
    if isinstance(sc, dict):
        sm = _coerce_float(sc.get("smart"))
        gr = _coerce_float(sc.get("grit"))
        bu = _coerce_float(sc.get("build"))
        if sm > 0 or gr > 0 or bu > 0:
            fs2 = (sm + gr + bu) / 3.0
            return {"smart": sm, "grit": gr, "build": bu}, fs2
    return None


def _pick_audit_for_score_page(audits: list) -> dict | None:
    """Newest-first list: first row with usable score data."""
    for a in audits:
        if isinstance(a, dict) and _scores_and_final_for_payload(a) is not None:
            return a
    return None


class ScorePageAuditNotFound(LookupError):
    """Raised when focus_audit_id is set but not found or has no usable scores for this user."""


def build_score_page_payload(
    email: str,
    subscribed: bool,
    focus_audit_id: str | None = None,
) -> dict[str, Any]:
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.audit_history_pg import get_audits, normalize_audit_id_key
    from projects.dilly.api.schools import get_school_from_email, SCHOOLS
    from projects.dilly.api.peer_benchmark import get_cohort_stats

    email = (email or "").strip().lower()
    profile = get_profile(email) or {}
    audits = get_audits(email) if email else []
    want_id = (focus_audit_id or "").strip() or None
    latest: dict | None = None
    if want_id:
        want_key = normalize_audit_id_key(want_id)
        for a in audits:
            if not isinstance(a, dict):
                continue
            if normalize_audit_id_key(a.get("id")) != want_key:
                continue
            # Id match wins: history can show a bar for legacy rows that fail strict
            # score derivation; 404 only when this audit is not in the user's list.
            latest = a
            break
        if latest is None:
            raise ScorePageAuditNotFound(want_id)
    else:
        latest = _pick_audit_for_score_page(audits)

    if latest is None:
        snap = profile.get("first_audit_snapshot")
        if isinstance(snap, dict):
            sc0 = snap.get("scores")
            if isinstance(sc0, dict):
                latest = {
                    "id": None,
                    "ts": snap.get("ts"),
                    "scores": sc0,
                    "final_score": None,
                    "detected_track": profile.get("track"),
                    "candidate_name": profile.get("name"),
                    "peer_percentiles": None,
                    "audit_findings": [],
                    "major": profile.get("major"),
                }

    name = (profile.get("name") or "").strip() or (latest.get("candidate_name") if latest else "") or "there"
    first_name = name.split()[0] if name else "there"

    track = (latest.get("detected_track") if latest else None) or (profile.get("track") or "Humanities")
    track = str(track).strip() or "Humanities"

    school_short = ""
    sid = (profile.get("schoolId") or "").strip().lower()
    sc = SCHOOLS.get(sid) if sid else get_school_from_email(email)
    if sc:
        school_short = str(sc.get("short_name") or sc.get("name") or "")

    empty = {
        "first_name": first_name,
        "track": track,
        "school_short": school_short,
        "final_score": 0,
        "smart": 0,
        "grit": 0,
        "build": 0,
        "final_percentile": 50,
        "weakest_dimension": "grit",
        "gap_insight": "Run a resume audit to see your Dilly score and how you compare to your track.",
        "nearest_company": "Top firms",
        "nearest_company_bar": 72,
        "nearest_company_gap": 72,
        "audit_history": [],
        "peer_preview": [],
        "student_rank": 1,
        "peer_count": 0,
        "is_free_tier": not subscribed,
        "latest_audit_id": None,
        "audit_ts": None,
    }

    derived = _scores_and_final_for_payload(latest) if latest else None
    if not derived:
        # Focus-by-id: never 404 after a matched row — show best-effort zeros if needed.
        if want_id and latest is not None:
            derived = ({"smart": 0.0, "grit": 0.0, "build": 0.0}, 0.0)
        else:
            return empty

    scores, final = derived
    smart, grit, build = scores["smart"], scores["grit"], scores["build"]
    final_i = int(round(final))
    smart_i, grit_i, build_i = int(round(smart)), int(round(grit)), int(round(build))

    dims = [("smart", smart_i), ("grit", grit_i), ("build", build_i)]
    weakest = min(dims, key=lambda x: x[1])[0]

    pp = latest.get("peer_percentiles") or {}
    best_top = 50
    if isinstance(pp, dict) and pp:
        for k in ("smart", "grit", "build"):
            top_pct = max(1, 100 - int(pp.get(k) or 50))
            best_top = min(best_top, top_pct)
    final_percentile = int(best_top)

    stats = get_cohort_stats(track)
    p75_s, p75_g, p75_b = 70.0, 70.0, 70.0
    peer_count = 0
    if stats and isinstance(stats, dict):
        peer_count = int(stats.get("cohort_n") or 0)
        p75 = stats.get("p75") or {}
        if isinstance(p75, dict):
            p75_s = float(p75.get("smart") or 70)
            p75_g = float(p75.get("grit") or 70)
            p75_b = float(p75.get("build") or 70)

    nearest_company_bar = int(round((p75_s + p75_g + p75_b) / 3))
    nearest_company_bar = max(55, min(92, nearest_company_bar))

    targets = profile.get("target_companies") or []
    nearest_company = "Top firms"
    if isinstance(targets, list) and targets:
        c = str(targets[0]).strip()[:80]
        if c:
            nearest_company = c
    elif isinstance(targets, str) and targets.strip():
        nearest_company = targets.strip()[:80]
    elif (profile.get("target_school") or "").strip():
        nearest_company = str(profile.get("target_school")).strip()[:80]

    nearest_company_gap = max(0, nearest_company_bar - final_i)

    wk_score = {"smart": smart_i, "grit": grit_i, "build": build_i}[weakest]
    dim_bar = int(round({"smart": p75_s, "grit": p75_g, "build": p75_b}[weakest]))
    finding_line = ""
    findings = latest.get("audit_findings") or []
    prefix = weakest.capitalize() + ": "
    if isinstance(findings, list):
        for f in findings:
            if isinstance(f, str) and f.startswith(prefix):
                finding_line = f[len(prefix) :].strip()[:240]
                break
        if not finding_line:
            for f in findings:
                if isinstance(f, str) and f.strip():
                    finding_line = f.strip()[:240]
                    break

    short_co = nearest_company.split()[0] if nearest_company else "Top firms"
    gap_insight = (
        f"Your {weakest.capitalize()} is {wk_score}. {short_co}'s bar for your track is around {dim_bar}. "
        f"{finding_line or 'Sharpen outcomes and proof in that dimension to close the gap.'}"
    )

    audit_history: list[dict[str, Any]] = []
    for a in audits[:12]:
        ts = a.get("ts")
        date_str = ""
        if ts is not None:
            try:
                dt = datetime.fromtimestamp(int(ts), tz=timezone.utc)
                date_str = dt.strftime("%Y-%m-%d")
            except Exception:
                date_str = ""
        try:
            fs = int(round(float(a.get("final_score") or 0)))
        except Exception:
            fs = 0
        aid = a.get("id")
        audit_history.append(
            {
                "score": fs,
                "date": date_str,
                "audit_id": str(aid).strip() if aid is not None and str(aid).strip() else None,
            }
        )

    peer_preview, student_rank = _peer_preview_rows(
        track=track,
        student_final=final_i,
        student_display_name=name,
    )

    latest_id = latest.get("id")
    audit_ts = latest.get("ts")

    return {
        "first_name": first_name,
        "track": track,
        "school_short": school_short,
        "final_score": final_i,
        "smart": smart_i,
        "grit": grit_i,
        "build": build_i,
        "final_percentile": final_percentile,
        "weakest_dimension": weakest,
        "gap_insight": gap_insight,
        "nearest_company": nearest_company,
        "nearest_company_bar": nearest_company_bar,
        "nearest_company_gap": nearest_company_gap,
        "audit_history": audit_history,
        "peer_preview": peer_preview,
        "student_rank": student_rank,
        "peer_count": max(peer_count, len(_leaderboard_scores_for_track(track))),
        "is_free_tier": not subscribed,
        "latest_audit_id": str(latest_id).strip() if latest_id else None,
        "audit_ts": int(audit_ts) if audit_ts is not None else None,
        "dimension_bar_smart": int(round(p75_s)),
        "dimension_bar_grit": int(round(p75_g)),
        "dimension_bar_build": int(round(p75_b)),
    }
