"""
Full leaderboard payload for Dilly /leaderboard UI (GET /leaderboard/page/{track}).
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
_SNAPSHOT_PATH = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_leaderboard_rank_snapshots.json")


def _week_key() -> str:
    """ISO-ish week bucket for snapshot rotation (GMT)."""
    return time.strftime("%G-W%V", time.gmtime())


def _load_snapshots() -> dict:
    if not os.path.isfile(_SNAPSHOT_PATH):
        return {}
    try:
        with open(_SNAPSHOT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_snapshots(data: dict) -> None:
    try:
        os.makedirs(os.path.dirname(_SNAPSHOT_PATH), exist_ok=True)
        with open(_SNAPSHOT_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=0)
    except Exception:
        pass


def _display_from_name(name: str | None) -> str:
    if not name or not str(name).strip():
        return "Student"
    parts = [p for p in str(name).strip().split() if p]
    if len(parts) >= 2:
        return f"{parts[0]} {parts[-1][0]}."
    return parts[0][:14]


def _initials(name: str | None) -> str:
    if not name or not str(name).strip():
        return "??"
    parts = [p for p in str(name).strip().split() if p]
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()[:3]
    return parts[0][:2].upper()


def _synthetic_initials(seed: int) -> str:
    a, b = seed % 26, (seed // 26) % 26
    return chr(65 + a) + chr(65 + b)


def _score_color_bucket(score: float) -> str:
    s = int(round(score))
    if s >= 80:
        return "green"
    if s >= 55:
        return "amber"
    return "coral"


def _leaderboard_cohort_key(track: str) -> str:
    """
    Normalize track strings for leaderboard matching (Pre-Med → pre-health, case-insensitive).
    """
    from projects.dilly.api.schools import get_track_category

    t = (track or "").strip()
    if not t:
        return "humanities"
    cat = get_track_category(t)
    return (cat or t or "Humanities").strip().lower() or "humanities"


def _newest_audit_for_leaderboard_track(audits: list, want_track: str) -> dict | None:
    """
    Audits from get_audits() are newest-first. Use the newest audit whose cohort matches the
    requested board — not only audits[0], so a fresh run in another track does not erase you
    from your usual board.
    """
    if not audits or not isinstance(audits, list):
        return None
    want_key = _leaderboard_cohort_key(want_track)
    for a in audits:
        if not isinstance(a, dict):
            continue
        det = a.get("detected_track") or ""
        if _leaderboard_cohort_key(det) == want_key:
            return a
    return None


def _collect_track_entries(want_track: str) -> list[dict[str, Any]]:
    from projects.dilly.api.audit_history_pg import get_audits as _get_audits
    from projects.dilly.api.profile_store import is_leaderboard_participating

    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
    out: list[dict[str, Any]] = []
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
            latest = _newest_audit_for_leaderboard_track(audits, want_track)
            if latest is None:
                continue
            scores = latest.get("scores") or {}
            fs = float(latest.get("final_score") or 0)
            # score delta vs ~7d ago audit if any (skip the row we used, not necessarily audits[0])
            delta_w: int | None = None
            ts_latest = latest.get("ts")
            lid = str(latest.get("id") or "")
            if ts_latest and len(audits) >= 2:
                cutoff = int(ts_latest) - 7 * 86400
                for a in audits:
                    if lid and str(a.get("id") or "") == lid:
                        continue
                    if (a.get("ts") or 0) <= cutoff:
                        prev = float((a.get("final_score") or 0))
                        delta_w = int(round(fs - prev))
                        break
            grad = prof.get("graduation_year") or prof.get("gradYear") or prof.get("class_year")
            year_s = str(grad).strip() if grad else None
            if year_s and not year_s.isdigit():
                year_s = None
            out.append(
                {
                    "email": email,
                    "name": (prof.get("name") or "").strip() or None,
                    "final_score": fs,
                    "smart": float(scores.get("smart") or 0),
                    "grit": float(scores.get("grit") or 0),
                    "build": float(scores.get("build") or 0),
                    "score_change_this_week": delta_w,
                    "year": year_s,
                    "recommendations": latest.get("recommendations") or [],
                    "audit_findings": latest.get("audit_findings") or [],
                }
            )
        except Exception:
            continue
    out.sort(key=lambda e: e["final_score"], reverse=True)
    return out


_GLOBAL_BOARD_LABEL = "All cohorts"
_GLOBAL_TOP_N = 100


def _collect_global_leaderboard_entries() -> list[dict[str, Any]]:
    """One row per opted-in user: score from newest audit matching their profile cohort (or detected track)."""
    from projects.dilly.api.audit_history_pg import get_audits as _get_audits
    from projects.dilly.api.profile_store import is_leaderboard_participating
    from projects.dilly.api.schools import get_track_category

    out: list[dict[str, Any]] = []
    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
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
            em = (prof.get("email") or "").strip().lower()
            if not em:
                continue
            audits = _get_audits(em)
            if not audits:
                continue
            pt = (prof.get("track") or "").strip()
            if pt:
                cohort_s = str(get_track_category(pt)).strip() or "Humanities"
            else:
                cohort_s = str(
                    get_track_category(str(audits[0].get("detected_track") or "Humanities"))
                ).strip() or "Humanities"
            latest = _newest_audit_for_leaderboard_track(audits, cohort_s)
            if latest is None:
                continue
            scores = latest.get("scores") or {}
            fs = float(latest.get("final_score") or 0)
            delta_w: int | None = None
            ts_latest = latest.get("ts")
            lid = str(latest.get("id") or "")
            if ts_latest and len(audits) >= 2:
                cutoff = int(ts_latest) - 7 * 86400
                for a in audits:
                    if lid and str(a.get("id") or "") == lid:
                        continue
                    if (a.get("ts") or 0) <= cutoff:
                        prev = float((a.get("final_score") or 0))
                        delta_w = int(round(fs - prev))
                        break
            grad = prof.get("graduation_year") or prof.get("gradYear") or prof.get("class_year")
            year_s = str(grad).strip() if grad else None
            if year_s and not year_s.isdigit():
                year_s = None
            out.append(
                {
                    "email": em,
                    "name": (prof.get("name") or "").strip() or None,
                    "final_score": fs,
                    "smart": float(scores.get("smart") or 0),
                    "grit": float(scores.get("grit") or 0),
                    "build": float(scores.get("build") or 0),
                    "score_change_this_week": delta_w,
                    "year": year_s,
                    "recommendations": latest.get("recommendations") or [],
                    "audit_findings": latest.get("audit_findings") or [],
                    "cohort_track": cohort_s,
                }
            )
        except Exception:
            continue
    out.sort(key=lambda e: e["final_score"], reverse=True)
    return out


def build_global_leaderboard_payload(
    *,
    email: str,
    subscribed: bool,
    refresh: bool,
    school_short: str,
) -> dict[str, Any]:
    """
    Same JSON shape as build_leaderboard_page_payload, but board = all cohorts: full pool is every
    opted-in student (one score each, their profile cohort). List shows top _GLOBAL_TOP_N by score.
    """
    email = (email or "").strip().lower()
    track_clean = _GLOBAL_BOARD_LABEL
    full = _collect_global_leaderboard_entries()

    student_in = next((e for e in full if e["email"] == email), None)
    if not student_in and email:
        from projects.dilly.api.audit_history_pg import get_audits as _get_audits
        from projects.dilly.api.profile_store import get_profile
        from projects.dilly.api.schools import get_track_category

        prof = get_profile(email) or {}
        audits = _get_audits(email)
        if audits:
            pt = (prof.get("track") or "").strip()
            if pt:
                cohort_s = str(get_track_category(pt)).strip() or "Humanities"
            else:
                cohort_s = str(
                    get_track_category(str(audits[0].get("detected_track") or "Humanities"))
                ).strip() or "Humanities"
            latest = _newest_audit_for_leaderboard_track(audits, cohort_s)
            if latest is not None:
                scores = latest.get("scores") or {}
                fs = float(latest.get("final_score") or 0)
                delta_w: int | None = None
                ts_latest = latest.get("ts")
                inj_lid = str(latest.get("id") or "")
                if ts_latest and len(audits) >= 2:
                    cutoff = int(ts_latest) - 7 * 86400
                    for a in audits:
                        if inj_lid and str(a.get("id") or "") == inj_lid:
                            continue
                        if (a.get("ts") or 0) <= cutoff:
                            delta_w = int(round(fs - float(a.get("final_score") or 0)))
                            break
                full.append(
                    {
                        "email": email,
                        "name": (prof.get("name") or latest.get("candidate_name") or "").strip() or None,
                        "final_score": fs,
                        "smart": float(scores.get("smart") or 0),
                        "grit": float(scores.get("grit") or 0),
                        "build": float(scores.get("build") or 0),
                        "score_change_this_week": delta_w,
                        "year": None,
                        "recommendations": latest.get("recommendations") or [],
                        "audit_findings": latest.get("audit_findings") or [],
                        "cohort_track": cohort_s,
                    }
                )
                full.sort(key=lambda e: e["final_score"], reverse=True)

    peer_count = len(full)
    top_slice = full[:_GLOBAL_TOP_N]

    if not top_slice:
        return {
            "track": track_clean,
            "school_short": school_short,
            "student_rank": 1,
            "student_rank_last_week": None,
            "rank_change": 0,
            "peer_count": 0,
            "student_score": 0,
            "student_first_name": "You",
            "pts_to_next_rank": 0,
            "move_up_insight": "Run an audit to appear on the global leaderboard.",
            "podium": [],
            "entries": [],
            "weekly_events": [
                {
                    "type": "new_entry",
                    "text": "First week of the semester — scores are being set.",
                    "is_student": False,
                    "dot_color": "amber",
                }
            ],
            "is_free_tier": not subscribed,
            "locked_count": 0,
            "weakest_dimension": "grit",
            "goldman_application_days": 14,
        }

    entries_out: list[dict[str, Any]] = []
    student_rank = 1
    student_score = 0.0
    student_first = "You"
    student_entry: dict | None = None
    weakest = "grit"

    student_idx_full = next((i for i, e in enumerate(full) if e["email"] == email), None)
    if student_idx_full is not None:
        student_rank = student_idx_full + 1
    elif email:
        student_rank = peer_count + 1 if peer_count else 1

    for i, e in enumerate(top_slice):
        rank = i + 1
        is_stu = e["email"] == email
        name = e.get("name")
        if is_stu:
            disp = _display_from_name(name)
        else:
            disp = (_initials(name) + ".") if name else _synthetic_initials(rank * 17 + i) + "."
        ini = _initials(name) if name else _synthetic_initials(rank + i * 3)
        cohort_track = str(e.get("cohort_track") or "Humanities")
        row = {
            "rank": rank,
            "initials": ini,
            "display_name": disp,
            "score": int(round(e["final_score"])),
            "score_change_this_week": e.get("score_change_this_week"),
            "year": e.get("year"),
            "is_student": is_stu,
            "cohort_track": cohort_track,
        }
        entries_out.append(row)

    if student_idx_full is not None:
        se = full[student_idx_full]
        student_score = float(se["final_score"])
        nm = se.get("name")
        student_first = (str(nm).split()[0] if nm and str(nm).split() else "You") or "You"
        student_entry = se
        weakest = _weakest_dim(se)

    pts_to_next = 0
    above_score: float | None = None
    if student_idx_full is not None and student_rank > 1:
        above = full[student_idx_full - 1]
        above_score = float(above["final_score"])
        pts_to_next = max(1, int(round(above_score - student_score + 0.001)))

    top_rec = None
    if student_entry:
        recs = student_entry.get("recommendations") or []
        if isinstance(recs, list) and recs:
            r0 = recs[0]
            if isinstance(r0, dict) and r0.get("title"):
                top_rec = str(r0["title"])[:200]

    if student_entry is None and email:
        move_up = "Run an audit for your cohort to join the global leaderboard and see your rank here."
    else:
        move_up = _move_up_insight(
            student_entry or {"smart": 0, "grit": 0, "build": 0},
            student_rank,
            pts_to_next,
            above_score,
            top_rec,
        )

    snaps = _load_snapshots()
    wk = _week_key()
    key = hashlib.sha256(f"{email}:global".encode()).hexdigest()[:24]
    old_bucket = snaps.get(key) if isinstance(snaps.get(key), dict) else {}
    student_rank_last_week = old_bucket.get("last_rank") if isinstance(old_bucket.get("last_rank"), int) else None
    bucket = dict(old_bucket)
    rank_change = 0
    if refresh:
        bucket = {"week": wk, "week_start_rank": student_rank}
    elif bucket.get("week") != wk:
        bucket = {"week": wk, "week_start_rank": student_rank}
    else:
        wsr = bucket.get("week_start_rank")
        if isinstance(wsr, int):
            rank_change = wsr - student_rank
    bucket["week"] = wk
    bucket["last_rank"] = student_rank
    snaps[key] = bucket
    _save_snapshots(snaps)

    weekly = _weekly_events(top_slice, email, student_first, track_clean)
    if peer_count < 3:
        weekly = [
            {
                "type": "new_entry",
                "text": "First week of the semester — scores are being set.",
                "is_student": False,
                "dot_color": "amber",
            }
        ]

    locked_count = max(0, peer_count - 5)
    is_free = not subscribed

    podium: list[dict[str, Any]] = []
    for j in range(min(3, len(entries_out))):
        row = entries_out[j]
        podium.append(
            {
                "rank": row["rank"],
                "initials": row["initials"],
                "display_name": row["display_name"],
                "score": row["score"],
                "is_student": row["is_student"],
                "medal": j + 1,
                "cohort_track": row.get("cohort_track") or "Humanities",
            }
        )

    entries_for_client = entries_out
    if is_free and len(entries_out) > 5:
        si = next((i for i, er in enumerate(entries_out) if er["is_student"]), 0)
        lo = max(0, si - 2)
        hi = min(len(entries_out), si + 3)
        entries_for_client = entries_out[lo:hi]

    goldman_days = 14

    return {
        "track": track_clean,
        "school_short": school_short,
        "student_rank": student_rank,
        "student_rank_last_week": student_rank_last_week,
        "rank_change": rank_change,
        "peer_count": peer_count,
        "student_score": int(round(student_score)),
        "student_first_name": student_first,
        "pts_to_next_rank": pts_to_next,
        "move_up_insight": move_up,
        "podium": podium,
        "entries": entries_for_client,
        "weekly_events": weekly,
        "is_free_tier": is_free,
        "locked_count": locked_count,
        "weakest_dimension": weakest,
        "goldman_application_days": goldman_days,
    }


def _weakest_dim(scores: dict) -> str:
    sm = float(scores.get("smart") or 0)
    gr = float(scores.get("grit") or 0)
    bu = float(scores.get("build") or 0)
    m = min(("smart", sm), ("grit", gr), ("build", bu), key=lambda x: x[1])
    return m[0]


def _move_up_insight(
    student: dict,
    rank: int,
    pts_to_next: int,
    above_score: float | None,
    top_rec: str | None,
) -> str:
    wk = _weakest_dim(student)
    wlabel = wk.capitalize()
    rec = (top_rec or "").strip()[:160]
    if rank <= 1:
        return f"You are at the top of this board. Keep your {wlabel} evidence sharp so you stay there."
    if rank <= 3 and above_score is not None:
        base = f"You are in the top 3 — {pts_to_next} pts from the next spot up."
    else:
        base = f"{pts_to_next} pts from the next rank up."
    if rec:
        return f"{base} {rec}"
    return f"{base} Tighten your {wlabel} bullets with outcomes and numbers — that is usually the fastest lift."


def _weekly_events(
    entries: list[dict],
    student_email: str,
    student_first: str,
    track: str,
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    # synthetic but grounded: count score improvements
    improved = sum(1 for e in entries if (e.get("score_change_this_week") or 0) > 0)
    if improved >= 3:
        events.append(
            {
                "type": "score_improved",
                "text": f"{improved} students improved their score this week",
                "is_student": False,
                "dot_color": "blue",
            }
        )
    if len(entries) >= 5:
        events.append(
            {
                "type": "new_entry",
                "text": "New students entered the leaderboard this week",
                "is_student": False,
                "dot_color": "amber",
            }
        )
    # find a big mover (not student)
    for e in entries[:15]:
        if e["email"] == student_email:
            continue
        d = e.get("score_change_this_week")
        if d and d >= 5:
            ini = _initials(e.get("name"))
            events.append(
                {
                    "type": "moved_up",
                    "text": f"{ini}. moved up with a +{d} pt week",
                    "is_student": False,
                    "dot_color": "green",
                }
            )
            break
    events.append(
        {
            "type": "student_moved",
            "text": f"{student_first} — check your rank vs last open",
            "is_student": True,
            "dot_color": "green",
        }
    )
    return events[:4]


def build_leaderboard_page_payload(
    *,
    email: str,
    track: str,
    subscribed: bool,
    refresh: bool,
    school_short: str,
) -> dict[str, Any]:
    track_clean = (track or "Humanities").strip() or "Humanities"
    track_lower = track_clean.lower().strip()
    email = (email or "").strip().lower()

    raw = _collect_track_entries(track_clean)

    # Inject current user if they are not already in the pool (e.g. opted out) but have a matching audit
    student_in = next((e for e in raw if e["email"] == email), None)
    if not student_in and email:
        from projects.dilly.api.audit_history_pg import get_audits as _get_audits
        from projects.dilly.api.profile_store import get_profile

        prof = get_profile(email) or {}
        audits = _get_audits(email)
        if audits:
            latest = _newest_audit_for_leaderboard_track(audits, track_clean)
            if latest is not None:
                scores = latest.get("scores") or {}
                fs = float(latest.get("final_score") or 0)
                delta_w = None
                ts_latest = latest.get("ts")
                inj_lid = str(latest.get("id") or "")
                if ts_latest and len(audits) >= 2:
                    cutoff = int(ts_latest) - 7 * 86400
                    for a in audits:
                        if inj_lid and str(a.get("id") or "") == inj_lid:
                            continue
                        if (a.get("ts") or 0) <= cutoff:
                            delta_w = int(round(fs - float(a.get("final_score") or 0)))
                            break
                raw.append(
                    {
                        "email": email,
                        "name": (prof.get("name") or latest.get("candidate_name") or "").strip() or None,
                        "final_score": fs,
                        "smart": float(scores.get("smart") or 0),
                        "grit": float(scores.get("grit") or 0),
                        "build": float(scores.get("build") or 0),
                        "score_change_this_week": delta_w,
                        "year": None,
                        "recommendations": latest.get("recommendations") or [],
                        "audit_findings": latest.get("audit_findings") or [],
                    }
                )
                raw.sort(key=lambda e: e["final_score"], reverse=True)

    peer_count = len(raw)

    entries_out: list[dict[str, Any]] = []
    student_rank = 1
    student_score = 0.0
    student_first = "You"
    student_entry: dict | None = None
    weakest = "grit"

    for i, e in enumerate(raw):
        rank = i + 1
        is_stu = e["email"] == email
        name = e.get("name")
        if is_stu:
            disp = _display_from_name(name)
        else:
            disp = (_initials(name) + ".") if name else _synthetic_initials(rank * 17 + i) + "."
        ini = _initials(name) if name else _synthetic_initials(rank + i * 3)
        row = {
            "rank": rank,
            "initials": ini,
            "display_name": disp,
            "score": int(round(e["final_score"])),
            "score_change_this_week": e.get("score_change_this_week"),
            "year": e.get("year"),
            "is_student": is_stu,
        }
        entries_out.append(row)
        if is_stu:
            student_rank = rank
            student_score = float(e["final_score"])
            student_first = (name.split()[0] if name and name.split() else "You") or "You"
            student_entry = e
            weakest = _weakest_dim(e)

    if not entries_out:
        return {
            "track": track_clean,
            "school_short": school_short,
            "student_rank": 1,
            "student_rank_last_week": None,
            "rank_change": 0,
            "peer_count": 0,
            "student_score": 0,
            "student_first_name": student_first,
            "pts_to_next_rank": 0,
            "move_up_insight": "Run an audit for this track to appear on the leaderboard.",
            "podium": [],
            "entries": [],
            "weekly_events": [
                {
                    "type": "new_entry",
                    "text": "First week of the semester — scores are being set.",
                    "is_student": False,
                    "dot_color": "amber",
                }
            ],
            "is_free_tier": not subscribed,
            "locked_count": 0,
            "weakest_dimension": "grit",
            "goldman_application_days": 14,
        }

    # pts to next rank
    pts_to_next = 0
    above_score: float | None = None
    if student_rank > 1:
        above = raw[student_rank - 2]
        above_score = float(above["final_score"])
        pts_to_next = max(1, int(round(above_score - student_score + 0.001)))

    top_rec = None
    if student_entry:
        recs = student_entry.get("recommendations") or []
        if isinstance(recs, list) and recs:
            r0 = recs[0]
            if isinstance(r0, dict) and r0.get("title"):
                top_rec = str(r0["title"])[:200]

    move_up = _move_up_insight(
        student_entry or {"smart": 0, "grit": 0, "build": 0},
        student_rank,
        pts_to_next,
        above_score,
        top_rec,
    )

    # Rank movement this ISO week: week_start_rank − current (positive ⇒ moved up).
    snaps = _load_snapshots()
    wk = _week_key()
    key = hashlib.sha256(f"{email}:{track_lower}".encode()).hexdigest()[:24]
    old_bucket = snaps.get(key) if isinstance(snaps.get(key), dict) else {}
    student_rank_last_week = old_bucket.get("last_rank") if isinstance(old_bucket.get("last_rank"), int) else None
    bucket = dict(old_bucket)
    rank_change = 0
    if refresh:
        bucket = {"week": wk, "week_start_rank": student_rank}
    elif bucket.get("week") != wk:
        bucket = {"week": wk, "week_start_rank": student_rank}
    else:
        wsr = bucket.get("week_start_rank")
        if isinstance(wsr, int):
            rank_change = wsr - student_rank
    bucket["week"] = wk
    bucket["last_rank"] = student_rank
    snaps[key] = bucket
    _save_snapshots(snaps)

    weekly = _weekly_events(raw, email, student_first, track_clean)
    if peer_count < 3:
        weekly = [
            {
                "type": "new_entry",
                "text": "First week of the semester — scores are being set.",
                "is_student": False,
                "dot_color": "amber",
            }
        ]

    locked_count = max(0, peer_count - 5)
    is_free = not subscribed

    podium = []
    for j in range(min(3, len(entries_out))):
        row = entries_out[j]
        podium.append(
            {
                "rank": row["rank"],
                "initials": row["initials"],
                "display_name": row["display_name"],
                "score": row["score"],
                "is_student": row["is_student"],
                "medal": j + 1,
            }
        )

    entries_for_client = entries_out
    if is_free and len(entries_out) > 5:
        si = next((i for i, er in enumerate(entries_out) if er["is_student"]), 0)
        lo = max(0, si - 2)
        hi = min(len(entries_out), si + 3)
        entries_for_client = entries_out[lo:hi]

    goldman_days = 14

    return {
        "track": track_clean,
        "school_short": school_short,
        "student_rank": student_rank,
        "student_rank_last_week": student_rank_last_week,
        "rank_change": rank_change,
        "peer_count": peer_count,
        "student_score": int(round(student_score)),
        "student_first_name": student_first,
        "pts_to_next_rank": pts_to_next,
        "move_up_insight": move_up,
        "podium": podium,
        "entries": entries_for_client,
        "weekly_events": weekly,
        "is_free_tier": is_free,
        "locked_count": locked_count,
        "weakest_dimension": weakest,
        "goldman_application_days": goldman_days,
    }
