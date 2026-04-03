"""
Recruiter notes on candidates. Stored per recruiter (hashed API key).
Notes are entries (list of {text, at}) appended over time.
Private and persist across sessions. Shared across recruiters on the same team
if they use the same API key.
"""

import hashlib
import json
import os
import time

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
_NOTES_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "recruiter_notes")


def _recruiter_id(api_key: str) -> str:
    k = (api_key or "").strip()
    if not k:
        return "default"
    return hashlib.sha256(k.encode()).hexdigest()[:24]


def _path(recruiter_id: str) -> str:
    return os.path.join(_NOTES_DIR, f"{recruiter_id}.json")


def _load(recruiter_id: str) -> dict:
    p = _path(recruiter_id)
    if not os.path.isfile(p):
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save(recruiter_id: str, data: dict) -> bool:
    try:
        os.makedirs(_NOTES_DIR, exist_ok=True)
        p = _path(recruiter_id)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception:
        return False


def _valid_candidate_id(cid: str) -> bool:
    cid = (cid or "").strip()
    return len(cid) == 16 and all(c in "0123456789abcdef" for c in cid.lower())


def _migrate_legacy(val: object) -> list[dict]:
    """Migrate legacy single-note format to entries list."""
    if isinstance(val, list):
        return [e for e in val if isinstance(e, dict) and (e.get("text") or e.get("note"))]
    if isinstance(val, str) and (val or "").strip():
        return [{"text": val.strip()[:4000], "at": int(time.time())}]
    return []


def list_candidates_with_notes(api_key: str) -> list[dict]:
    """Return list of {candidate_id, count} for all candidates this recruiter has notes on."""
    rid = _recruiter_id(api_key)
    data = _load(rid)
    out = []
    for cid, raw in data.items():
        if not _valid_candidate_id(cid):
            continue
        entries = _migrate_legacy(raw)
        count = sum(1 for e in entries if (e.get("text") or e.get("note") or "").strip())
        if count > 0:
            out.append({"candidate_id": cid, "count": count})
    return sorted(out, key=lambda x: -x["count"])


def get_entries(api_key: str, candidate_id: str) -> list[dict]:
    """Return list of note entries for candidate. Each: {text, at}."""
    if not _valid_candidate_id(candidate_id):
        return []
    rid = _recruiter_id(api_key)
    data = _load(rid)
    raw = data.get(candidate_id)
    entries = _migrate_legacy(raw)
    # Ensure each has text and at
    out = []
    for e in entries:
        t = (e.get("text") or e.get("note") or "").strip()
        if not t:
            continue
        out.append({"text": t[:4000], "at": e.get("at") or int(time.time())})
    return sorted(out, key=lambda x: x["at"])


def add_entry(api_key: str, candidate_id: str, text: str) -> dict | None:
    """Append a note entry. Returns the new entry or None on failure."""
    if not _valid_candidate_id(candidate_id):
        return None
    text_trimmed = (text or "").strip()
    if not text_trimmed:
        return None
    rid = _recruiter_id(api_key)
    data = _load(rid)
    entries = _migrate_legacy(data.get(candidate_id))
    entry = {"text": text_trimmed[:4000], "at": int(time.time())}
    entries.append(entry)
    data[candidate_id] = entries
    if not _save(rid, data):
        return None
    return entry


def get_note(api_key: str, candidate_id: str) -> str:
    """Legacy: return concatenated note text (last entry or legacy single note)."""
    entries = get_entries(api_key, candidate_id)
    if not entries:
        return ""
    return entries[-1]["text"]


def set_note(api_key: str, candidate_id: str, note: str) -> bool:
    """Legacy: set note (adds as new entry if non-empty, else no-op for compat)."""
    if not (note or "").strip():
        return True
    return add_entry(api_key, candidate_id, note) is not None
