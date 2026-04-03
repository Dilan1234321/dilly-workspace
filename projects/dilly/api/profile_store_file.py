"""
File-based profile store. Profiles live in memory/dilly_profiles/{uid}/profile.json.
No Postgres required.
"""

import hashlib
import json
import os
import secrets
import shutil
import threading
import time

_WORKSPACE_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
_PROFILES_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
_PROFILE_PHOTO_FILENAME = "profile_photo"
_ALLOWED_PHOTO_EXT = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif"})
_TRANSCRIPT_FILENAME = "transcript"
_ALLOWED_TRANSCRIPT_EXT = frozenset({".pdf"})

_lock = threading.Lock()


def _user_id(email: str) -> str:
    e = (email or "").strip().lower()
    if not e:
        return ""
    return hashlib.sha256(e.encode("utf-8")).hexdigest()[:16]


def _profile_path(email: str) -> str:
    uid = _user_id(email)
    if not uid:
        return ""
    return os.path.join(_PROFILES_DIR, uid, "profile.json")


def _load_profile(email: str) -> dict | None:
    path = _profile_path(email)
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _write_profile(email: str, data: dict) -> None:
    uid = _user_id(email)
    if not uid:
        return
    folder = os.path.join(_PROFILES_DIR, uid)
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "profile.json")
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def _generate_referral_code() -> str:
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8].lower()


def _school_id_from_email(email: str) -> str | None:
    try:
        from projects.dilly.api.schools import get_school_from_email
        s = get_school_from_email(email)
        return s["id"] if s else None
    except Exception:
        return None


# ── Core CRUD ─────────────────────────────────────────────────────────────────

def get_profile(email: str) -> dict | None:
    email = (email or "").strip().lower()
    if not email:
        return None
    return _load_profile(email)


def save_profile(email: str, data: dict) -> dict:
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")
    with _lock:
        existing = _load_profile(email) or {}
        merged = {**existing, **data}
        merged["email"] = email
        merged["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        # Sync name → first_name / last_name if name provided
        if "name" in data and data["name"]:
            parts = str(data["name"]).strip().split(None, 1)
            merged.setdefault("first_name", parts[0] if parts else None)
            merged.setdefault("last_name", parts[1] if len(parts) > 1 else None)
        _write_profile(email, merged)
    return merged


def ensure_profile_exists(email: str) -> dict:
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")
    existing = get_profile(email)
    if existing is not None:
        if not existing.get("referral_code"):
            return save_profile(email, {"referral_code": _generate_referral_code()})
        return existing
    school_id = _school_id_from_email(email)
    default: dict = {
        "email": email,
        "verified": True,
        "profileStatus": "draft",
        "profile_status": "draft",
        "name": None,
        "major": None,
        "majors": [],
        "minors": [],
        "track": None,
        "goals": [],
        "application_target": None,
        "voice_avatar_index": 0,
        "referral_code": _generate_referral_code(),
        "leaderboard_opt_in": True,
        "onboarding_complete": False,
        "has_run_first_audit": False,
    }
    if school_id:
        default["school_id"] = school_id
        default["schoolId"] = school_id
    return save_profile(email, default)


def ensure_referral_code(email: str) -> str:
    profile = get_profile(email)
    if not profile:
        return ""
    code = profile.get("referral_code") or ""
    if not code or len(code) < 4:
        code = _generate_referral_code()
        save_profile(email, {"referral_code": code})
    return code


def get_profile_slug(email: str) -> str:
    return _user_id((email or "").strip().lower())


def get_profile_by_slug(slug: str) -> dict | None:
    if not slug or len(slug) != 16:
        return None
    path = os.path.join(_PROFILES_DIR, slug, "profile.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path) as f:
            data = json.load(f)
        return data
    except Exception:
        return None


def is_leaderboard_participating(profile: dict | None) -> bool:
    if not profile or not isinstance(profile, dict):
        return False
    return profile.get("leaderboard_opt_in") is not False


# ── File paths ────────────────────────────────────────────────────────────────

def get_profile_folder_path(email: str) -> str:
    uid = _user_id((email or "").strip().lower())
    if not uid:
        return ""
    return os.path.join(_PROFILES_DIR, uid)


def get_profile_photo_path(email: str) -> str | None:
    folder = get_profile_folder_path(email)
    if not folder or not os.path.isdir(folder):
        return None
    for ext in _ALLOWED_PHOTO_EXT:
        path = os.path.join(folder, _PROFILE_PHOTO_FILENAME + ext)
        if os.path.isfile(path):
            return path
    return None


def get_profile_photo_path_by_slug(slug: str) -> str | None:
    if not slug or len(slug) != 16:
        return None
    folder = os.path.join(_PROFILES_DIR, slug)
    for ext in _ALLOWED_PHOTO_EXT:
        path = os.path.join(folder, _PROFILE_PHOTO_FILENAME + ext)
        if os.path.isfile(path):
            return path
    return None


def save_profile_photo(email: str, file_path: str, content_type: str) -> str:
    folder = get_profile_folder_path(email)
    if not folder:
        raise ValueError("Invalid email")
    os.makedirs(folder, exist_ok=True)
    ext = ".jpg"
    if content_type:
        ct = content_type.lower()
        if "png" in ct:
            ext = ".png"
        elif "webp" in ct:
            ext = ".webp"
        elif "gif" in ct:
            ext = ".gif"
    for old_ext in _ALLOWED_PHOTO_EXT:
        old_path = os.path.join(folder, _PROFILE_PHOTO_FILENAME + old_ext)
        if os.path.isfile(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
    dest = os.path.join(folder, _PROFILE_PHOTO_FILENAME + ext)
    shutil.copy2(file_path, dest)
    return dest


def delete_profile_photo(email: str) -> bool:
    path = get_profile_photo_path(email)
    if path and os.path.isfile(path):
        try:
            os.remove(path)
            return True
        except OSError:
            pass
    return False


def get_transcript_path(email: str) -> str | None:
    folder = get_profile_folder_path(email)
    if not folder or not os.path.isdir(folder):
        return None
    for ext in _ALLOWED_TRANSCRIPT_EXT:
        path = os.path.join(folder, _TRANSCRIPT_FILENAME + ext)
        if os.path.isfile(path):
            return path
    return None


def save_transcript_file(email: str, file_path: str, ext: str = ".pdf") -> str:
    folder = get_profile_folder_path(email)
    if not folder:
        raise ValueError("Invalid email")
    os.makedirs(folder, exist_ok=True)
    if ext not in _ALLOWED_TRANSCRIPT_EXT:
        ext = ".pdf"
    for old_ext in _ALLOWED_TRANSCRIPT_EXT:
        old_path = os.path.join(folder, _TRANSCRIPT_FILENAME + old_ext)
        if os.path.isfile(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass
    dest = os.path.join(folder, _TRANSCRIPT_FILENAME + ext)
    shutil.copy2(file_path, dest)
    return dest


def delete_transcript(email: str) -> bool:
    path = get_transcript_path(email)
    removed = False
    if path and os.path.isfile(path):
        try:
            os.remove(path)
            removed = True
        except OSError:
            pass
    save_profile(email, {
        "transcript_uploaded_at": None,
        "transcript_gpa": None,
        "transcript_bcpm_gpa": None,
        "transcript_courses": [],
        "transcript_honors": [],
        "transcript_major": None,
        "transcript_minor": None,
        "transcript_warnings": [],
    })
    return removed


# ── Parent invite ──────────────────────────────────────────────────────────────

def ensure_parent_invite_token(email: str) -> str:
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")
    profile = get_profile(email)
    if not profile:
        raise ValueError("Profile not found")
    token = (profile.get("parent_invite_token") or "").strip()
    if token and len(token) >= 16:
        return token
    token = secrets.token_urlsafe(24)
    save_profile(email, {"parent_invite_token": token})
    return token


def get_email_by_parent_invite_token(token: str) -> str | None:
    token = (token or "").strip()
    if not token or not os.path.isdir(_PROFILES_DIR):
        return None
    for uid in os.listdir(_PROFILES_DIR):
        path = os.path.join(_PROFILES_DIR, uid, "profile.json")
        if not os.path.isfile(path):
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            if data.get("parent_invite_token") == token:
                return data.get("email")
        except Exception:
            continue
    return None


# ── Account deletion ──────────────────────────────────────────────────────────

def delete_account_data(email: str) -> bool:
    email = (email or "").strip().lower()
    if not email:
        return False
    folder = get_profile_folder_path(email)
    if folder and os.path.isdir(folder):
        try:
            shutil.rmtree(folder)
            return True
        except Exception:
            pass
    return False


def delete_draft_profiles_older_than_days(days: int) -> int:
    if not os.path.isdir(_PROFILES_DIR):
        return 0
    cutoff = time.time() - days * 86400
    count = 0
    for uid in os.listdir(_PROFILES_DIR):
        path = os.path.join(_PROFILES_DIR, uid, "profile.json")
        if not os.path.isfile(path):
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            if data.get("profileStatus") == "draft" and os.path.getmtime(path) < cutoff:
                shutil.rmtree(os.path.join(_PROFILES_DIR, uid))
                count += 1
        except Exception:
            continue
    return count
