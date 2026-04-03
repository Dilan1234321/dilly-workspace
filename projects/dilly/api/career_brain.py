"""
Career Brain: Second Brain for Career.
Aggregates applications, audits, beyond_resume, decision_log into timeline, search, connections, progress.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import uuid

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)


def _load_applications(email: str) -> list[dict]:
    try:
        from projects.dilly.api.profile_store import get_profile_folder_path
        folder = get_profile_folder_path(email)
        if not folder:
            return []
        path = os.path.join(folder, "applications.json")
        if not os.path.isfile(path):
            return []
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        apps = data.get("applications", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        return apps if isinstance(apps, list) else []
    except Exception:
        return []


def _get_audits(email: str) -> list[dict]:
    try:
        from projects.dilly.api.audit_history_pg import get_audits
        return get_audits(email)
    except Exception:
        return []


def _get_profile(email: str) -> dict:
    try:
        from projects.dilly.api.profile_store import get_profile
        return get_profile(email) or {}
    except Exception:
        return {}


def _get_profile_txt(email: str, max_chars: int = 15000) -> str:
    try:
        from projects.dilly.api.dilly_profile_txt import get_dilly_profile_txt_content
        return get_dilly_profile_txt_content(email, max_chars=max_chars)
    except Exception:
        return ""


def build_timeline(email: str, limit: int = 100) -> list[dict]:
    """
    Build a unified timeline of career events from applications, audits, beyond_resume, deadlines, decision_log.
    Each event: { id, type, ts, label, detail, company?, role?, status?, ... }
    Sorted by ts descending (newest first).
    """
    email = (email or "").strip().lower()
    if not email:
        return []

    events: list[dict] = []
    profile = _get_profile(email)
    apps = _load_applications(email)
    audits = _get_audits(email)
    beyond = profile.get("beyond_resume") or []
    deadlines = profile.get("deadlines") or []
    decision_log = profile.get("decision_log") or []

    # Applications
    for a in apps:
        if not isinstance(a, dict):
            continue
        app_id = a.get("id") or str(uuid.uuid4())
        company = (a.get("company") or "").strip()
        role = (a.get("role") or "").strip()
        status = a.get("status") or "saved"
        applied_at = a.get("applied_at")
        updated_at = a.get("updated_at") or a.get("created_at")
        notes = (a.get("notes") or "").strip()[:200]

        ts = None
        if applied_at:
            try:
                ts = time.mktime(time.strptime(applied_at[:10], "%Y-%m-%d"))
            except Exception:
                pass
        if ts is None and updated_at:
            try:
                ts = time.mktime(time.strptime(updated_at[:19].replace("T", " "), "%Y-%m-%d %H:%M:%S"))
            except Exception:
                try:
                    ts = time.mktime(time.strptime(updated_at[:10], "%Y-%m-%d"))
                except Exception:
                    pass
        if ts is None:
            ts = time.time()

        status_label = {"saved": "Saved", "applied": "Applied", "interviewing": "Interviewing", "offer": "Offer", "rejected": "Rejected"}.get(status, status)
        label = f"{company or 'Unknown'} – {role or 'Role'}: {status_label}"
        events.append({
            "id": f"app_{app_id}",
            "type": "application",
            "ts": ts,
            "label": label,
            "detail": notes or None,
            "company": company or None,
            "role": role or None,
            "status": status,
            "applied_at": applied_at,
        })

    # Audits (score runs)
    for au in audits[:20]:
        if not isinstance(au, dict):
            continue
        ts = au.get("ts") or 0
        scores = au.get("scores") or {}
        final = au.get("final_score")
        track = (au.get("detected_track") or "").strip()
        s, g, b = scores.get("smart"), scores.get("grit"), scores.get("build")
        label = f"Resume audit: Smart {s or 0:.0f}, Grit {g or 0:.0f}, Build {b or 0:.0f}"
        if track:
            label += f" ({track})"
        events.append({
            "id": f"audit_{au.get('id', '')}",
            "type": "audit",
            "ts": ts,
            "label": label,
            "detail": f"Final score: {final:.0f}" if final is not None else None,
            "scores": scores,
            "final_score": final,
            "track": track or None,
        })

    # Beyond resume (people, companies, events)
    for b in beyond:
        if not isinstance(b, dict):
            continue
        t = (b.get("type") or "").strip().lower()
        text = (b.get("text") or "").strip()
        captured = b.get("captured_at")
        ts = time.time()
        if isinstance(captured, (int, float)):
            ts = captured
        elif isinstance(captured, str) and captured:
            try:
                ts = time.mktime(time.strptime(captured[:19].replace("T", " "), "%Y-%m-%d %H:%M:%S"))
            except Exception:
                try:
                    ts = time.mktime(time.strptime(captured[:10], "%Y-%m-%d"))
                except Exception:
                    pass
        if not text:
            continue
        type_label = {"person": "Met", "company": "Company", "event": "Event", "emotion": "Note"}.get(t, t or "Note")
        label = f"{type_label}: {text[:80]}{'…' if len(text) > 80 else ''}"
        events.append({
            "id": f"beyond_{uuid.uuid4().hex[:8]}",
            "type": f"beyond_{t}" if t else "beyond",
            "ts": ts,
            "label": label,
            "detail": text,
            "beyond_type": t or "other",
        })

    # Deadlines (upcoming or completed)
    for d in deadlines:
        if not isinstance(d, dict):
            continue
        date_str = d.get("date")
        label = (d.get("label") or "").strip()
        completed = d.get("completedAt")
        if not date_str or not label:
            continue
        try:
            ts = time.mktime(time.strptime(date_str[:10], "%Y-%m-%d"))
        except Exception:
            continue
        events.append({
            "id": f"deadline_{d.get('id', '')}",
            "type": "deadline",
            "ts": ts,
            "label": f"Deadline: {label}",
            "detail": date_str,
            "completed": bool(completed),
        })

    # Decision log
    for entry in decision_log:
        if not isinstance(entry, dict):
            continue
        text = (entry.get("text") or "").strip()
        if not text:
            continue
        ts = entry.get("ts") or time.time()
        entry_type = (entry.get("type") or "learning").strip().lower()
        related = entry.get("related_to") or {}
        company = (related.get("company") or "").strip() if isinstance(related, dict) else ""
        role = (related.get("role") or "").strip() if isinstance(related, dict) else ""
        type_label = "Decision" if entry_type == "decision" else "Learning"
        label = f"{type_label}: {text[:80]}{'…' if len(text) > 80 else ''}"
        events.append({
            "id": f"log_{entry.get('id', uuid.uuid4().hex[:8])}",
            "type": "decision_log",
            "ts": ts,
            "label": label,
            "detail": text,
            "log_type": entry_type,
            "company": company or None,
            "role": role or None,
        })

    events.sort(key=lambda e: e.get("ts") or 0, reverse=True)
    return events[:limit]


def search_career_data(email: str, query: str, limit: int = 30) -> list[dict]:
    """
    Search across applications, beyond_resume, decision_log, profile_txt.
    Returns matching snippets with type, label, detail, ts.
    """
    email = (email or "").strip().lower()
    query = (query or "").strip().lower()
    if not email or not query or len(query) < 2:
        return []

    results: list[dict] = []
    q_words = [w for w in re.split(r"\s+", query) if len(w) >= 2]
    if not q_words:
        return []

    profile = _get_profile(email)
    apps = _load_applications(email)
    beyond = profile.get("beyond_resume") or []
    decision_log = profile.get("decision_log") or []
    profile_txt = _get_profile_txt(email, max_chars=8000)

    def _matches(text: str) -> bool:
        if not text:
            return False
        t = text.lower()
        return all(w in t for w in q_words)

    # Applications
    for a in apps:
        if not isinstance(a, dict):
            continue
        company = (a.get("company") or "").strip()
        role = (a.get("role") or "").strip()
        notes = (a.get("notes") or "").strip()
        combined = f"{company} {role} {notes}"
        if _matches(combined):
            applied_at = a.get("applied_at")
            ts = 0
            if applied_at:
                try:
                    ts = time.mktime(time.strptime(applied_at[:10], "%Y-%m-%d"))
                except Exception:
                    pass
            results.append({
                "type": "application",
                "label": f"{company or 'Unknown'} – {role or 'Role'}",
                "detail": notes[:200] if notes else None,
                "ts": ts,
                "company": company or None,
                "role": role or None,
                "status": a.get("status"),
            })

    # Beyond resume
    for b in (profile.get("beyond_resume") or []):
        if not isinstance(b, dict):
            continue
        text = (b.get("text") or "").strip()
        if not text or not _matches(text):
            continue
        t = (b.get("type") or "").strip().lower()
        captured = b.get("captured_at")
        ts = time.time()
        if isinstance(captured, (int, float)):
            ts = captured
        elif isinstance(captured, str) and captured:
            try:
                ts = time.mktime(time.strptime(captured[:19].replace("T", " "), "%Y-%m-%d %H:%M:%S"))
            except Exception:
                try:
                    ts = time.mktime(time.strptime(captured[:10], "%Y-%m-%d"))
                except Exception:
                    pass
        results.append({
            "type": f"beyond_{t}" if t else "beyond",
            "label": f"{t or 'Note'}: {text[:60]}",
            "detail": text,
            "ts": ts,
        })

    # Decision log
    for entry in decision_log:
        if not isinstance(entry, dict):
            continue
        text = (entry.get("text") or "").strip()
        if not text or not _matches(text):
            continue
        ts = entry.get("ts") or time.time()
        results.append({
            "type": "decision_log",
            "label": f"Log: {text[:60]}",
            "detail": text,
            "ts": ts,
        })

    # Profile txt (chunked by section or paragraph)
    if profile_txt and _matches(profile_txt):
        chunks = re.split(r"\n\n+", profile_txt)
        for chunk in chunks[:10]:
            if not chunk.strip() or not _matches(chunk):
                continue
            snippet = chunk.strip()[:300] + ("…" if len(chunk) > 300 else "")
            results.append({
                "type": "profile",
                "label": "Profile note",
                "detail": snippet,
                "ts": 0,
            })

    results.sort(key=lambda r: r.get("ts") or 0, reverse=True)
    return results[:limit]


def get_connections(email: str) -> dict:
    """Extract people and companies from beyond_resume and applications."""
    email = (email or "").strip().lower()
    if not email:
        return {"people": [], "companies": []}

    profile = _get_profile(email)
    apps = _load_applications(email)
    beyond = profile.get("beyond_resume") or []

    people: set[str] = set()
    companies: set[str] = set()

    for b in beyond:
        if not isinstance(b, dict):
            continue
        t = (b.get("type") or "").strip().lower()
        text = (b.get("text") or "").strip()
        if not text:
            continue
        if t == "person":
            people.add(text)
        elif t == "company":
            companies.add(text)

    for a in apps:
        if isinstance(a, dict) and a.get("company"):
            companies.add((a.get("company") or "").strip())

    return {
        "people": sorted(people)[:50],
        "companies": sorted(companies)[:50],
    }


def get_progress(email: str) -> dict:
    """Score trends, application funnel, interview outcomes."""
    email = (email or "").strip().lower()
    if not email:
        return {}

    audits = _get_audits(email)
    apps = _load_applications(email)

    score_trends = []
    for au in audits[:10]:
        if isinstance(au, dict) and au.get("ts"):
            scores = au.get("scores") or {}
            score_trends.append({
                "ts": au["ts"],
                "smart": scores.get("smart"),
                "grit": scores.get("grit"),
                "build": scores.get("build"),
                "final": au.get("final_score"),
            })
    score_trends.sort(key=lambda x: x["ts"], reverse=True)

    try:
        from projects.dilly.api.proactive_nudges import compute_app_funnel_stats
        funnel = compute_app_funnel_stats(apps)
    except Exception:
        funnel = {"applied": 0, "responses": 0, "interviews": 0, "offers": 0, "rejected": 0, "silent_2_weeks": 0}

    return {
        "score_trends": score_trends[:12],
        "funnel": funnel,
        "total_applications": len(apps),
    }
