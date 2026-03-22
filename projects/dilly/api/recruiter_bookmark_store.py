"""
Recruiter bookmarks and collections. Stored per recruiter (hashed API key).
- General bookmarks: list of candidate_ids
- Collections: named lists of candidate_ids
"""

import hashlib
import json
import os

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
_BOOKMARKS_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "recruiter_bookmarks")


def _recruiter_id(api_key: str) -> str:
    """Derive a stable id from the recruiter API key."""
    k = (api_key or "").strip()
    if not k:
        return "default"
    return hashlib.sha256(k.encode()).hexdigest()[:24]


def _path(recruiter_id: str) -> str:
    return os.path.join(_BOOKMARKS_DIR, f"{recruiter_id}.json")


def _load(recruiter_id: str) -> dict:
    p = _path(recruiter_id)
    if not os.path.isfile(p):
        return {"bookmarks": [], "collections": {}}
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "bookmarks": data.get("bookmarks") if isinstance(data.get("bookmarks"), list) else [],
            "collections": data.get("collections") if isinstance(data.get("collections"), dict) else {},
        }
    except Exception:
        return {"bookmarks": [], "collections": {}}


def _save(recruiter_id: str, data: dict) -> bool:
    try:
        os.makedirs(_BOOKMARKS_DIR, exist_ok=True)
        p = _path(recruiter_id)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception:
        return False


def _valid_candidate_id(cid: str) -> bool:
    cid = (cid or "").strip()
    return len(cid) == 16 and all(c in "0123456789abcdef" for c in cid.lower())


def get_all(api_key: str) -> dict:
    """Return { bookmarks: string[], collections: { name: string[] } }."""
    rid = _recruiter_id(api_key)
    return _load(rid)


def add_bookmark(api_key: str, candidate_id: str) -> bool:
    """Add candidate to general bookmarks. Returns True on success."""
    if not _valid_candidate_id(candidate_id):
        return False
    rid = _recruiter_id(api_key)
    data = _load(rid)
    bookmarks = [c for c in data["bookmarks"] if c != candidate_id]
    bookmarks.append(candidate_id)
    data["bookmarks"] = bookmarks
    return _save(rid, data)


def remove_bookmark(api_key: str, candidate_id: str) -> bool:
    """Remove candidate from general bookmarks."""
    if not _valid_candidate_id(candidate_id):
        return False
    rid = _recruiter_id(api_key)
    data = _load(rid)
    data["bookmarks"] = [c for c in data["bookmarks"] if c != candidate_id]
    return _save(rid, data)


def is_bookmarked(api_key: str, candidate_id: str) -> bool:
    rid = _recruiter_id(api_key)
    data = _load(rid)
    return candidate_id in data["bookmarks"]


def create_collection(api_key: str, name: str) -> bool:
    """Create a new empty collection. Name must be non-empty and unique."""
    name = (name or "").strip()
    if not name or len(name) > 80:
        return False
    rid = _recruiter_id(api_key)
    data = _load(rid)
    if name in data["collections"]:
        return True  # already exists
    data["collections"][name] = []
    return _save(rid, data)


def add_to_collection(api_key: str, collection_name: str, candidate_id: str) -> bool:
    """Add candidate to a collection. Creates collection if it doesn't exist."""
    if not _valid_candidate_id(candidate_id):
        return False
    name = (collection_name or "").strip()
    if not name or len(name) > 80:
        return False
    rid = _recruiter_id(api_key)
    data = _load(rid)
    if name not in data["collections"]:
        data["collections"][name] = []
    coll = data["collections"][name]
    if candidate_id not in coll:
        coll.append(candidate_id)
    return _save(rid, data)


def remove_from_collection(api_key: str, collection_name: str, candidate_id: str) -> bool:
    """Remove candidate from a collection."""
    if not _valid_candidate_id(candidate_id):
        return False
    name = (collection_name or "").strip()
    if not name:
        return False
    rid = _recruiter_id(api_key)
    data = _load(rid)
    if name not in data["collections"]:
        return True
    data["collections"][name] = [c for c in data["collections"][name] if c != candidate_id]
    return _save(rid, data)


def rename_collection(api_key: str, old_name: str, new_name: str) -> bool:
    """Rename a collection."""
    old_name = (old_name or "").strip()
    new_name = (new_name or "").strip()
    if not old_name or not new_name or len(new_name) > 80:
        return False
    if old_name == new_name:
        return True
    rid = _recruiter_id(api_key)
    data = _load(rid)
    if old_name not in data["collections"]:
        return False
    if new_name in data["collections"]:
        return False
    data["collections"][new_name] = data["collections"].pop(old_name)
    return _save(rid, data)


def delete_collection(api_key: str, name: str) -> bool:
    """Delete a collection."""
    name = (name or "").strip()
    if not name:
        return False
    rid = _recruiter_id(api_key)
    data = _load(rid)
    if name in data["collections"]:
        del data["collections"][name]
    return _save(rid, data)
