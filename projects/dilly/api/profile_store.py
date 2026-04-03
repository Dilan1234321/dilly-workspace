"""
Postgres-backed profile store. Drop-in replacement for profile_store.py.
Profiles live in the users table. Files (photos, transcripts) still use the filesystem.
"""

import hashlib
import json
import os
import secrets
import shutil
import time
from datetime import datetime

from projects.dilly.api.database import get_db

# ── File paths (photos/transcripts still on disk) ─────────────────────────────
_WORKSPACE_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
_PROFILES_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
_PROFILE_PHOTO_FILENAME = "profile_photo"
_ALLOWED_PHOTO_EXT = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif"})
_TRANSCRIPT_FILENAME = "transcript"
_ALLOWED_TRANSCRIPT_EXT = frozenset({".pdf"})


def _user_id(email: str) -> str:
    """Stable filesystem slug for this email (used for photo/transcript folders)."""
    e = (email or "").strip().lower()
    if not e:
        return ""
    return hashlib.sha256(e.encode("utf-8")).hexdigest()[:16]


def _school_id_from_email(email: str) -> str | None:
    try:
        from projects.dilly.api.schools import get_school_from_email
        s = get_school_from_email(email)
        return s["id"] if s else None
    except Exception:
        return None


def _title_case_name(value: str | None) -> str | None:
    if value is None:
        return None
    s = (value if isinstance(value, str) else str(value)).strip()
    if not s:
        return None
    return " ".join(w.capitalize() for w in s.split())


def _generate_referral_code() -> str:
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8].lower()


# ── 9. update_profile ─────────────────────────────────────────────────────────

# Column names that map directly onto the users table.
_USERS_COLUMNS = frozenset({
    "first_name", "last_name", "full_name", "major", "minor",
    "track", "application_target", "school", "onboarding_complete",
    "has_run_first_audit", "subscribed", "profile_status",
    "leaderboard_opt_in", "referral_code", "voice_avatar_index",
})

# Everything else goes into a JSONB `extra` column (we'll add it lazily if needed,
# but for now we store it all in the users table as direct columns where possible,
# and keep a flat JSON blob in a `profile_json` column for the rest).


def get_profile(email: str) -> dict | None:
    """Return the full profile dict for email, or None."""
    email = (email or "").strip().lower()
    if not email:
        return None
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        if not row:
            return None
        return _row_to_profile(dict(row))


def save_profile(email: str, data: dict) -> dict:
    """
    Upsert profile for email. Merges with existing.
    Structured fields update their dedicated columns; everything else
    goes into profile_json (JSONB extra blob on the users table).
    Returns the saved profile.
    """
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")

    if "name" in data:
        data = {**data, "name": _title_case_name(data.get("name"))}

    school_id = _school_id_from_email(email)

    # Separate known columns from the JSON blob
    col_updates: dict = {}
    blob_updates: dict = {}

    _FIELD_MAP = {
        "major": "major",
        "minor": "minor",
        "majors": "majors",
        "minors": "minors",
        "pre_professional_track": "pre_professional_track",
        "track": "track",
        "application_target": "application_target",
        "onboarding_complete": "onboarding_complete",
        "has_run_first_audit": "has_run_first_audit",
        "subscribed": "subscribed",
        "profile_status": "profile_status",
        "profileStatus": "profile_status",
        "leaderboard_opt_in": "leaderboard_opt_in",
        "referral_code": "referral_code",
        "voice_avatar_index": "voice_avatar_index",
    }

    # Split name → first_name / last_name / full_name
    if "name" in data:
        name = data["name"] or ""
        parts = name.strip().split(None, 1)
        col_updates["first_name"] = parts[0] if parts else None
        col_updates["last_name"] = parts[1] if len(parts) > 1 else None
        col_updates["full_name"] = name or None
        blob_updates["name"] = name

    for src_key, col in _FIELD_MAP.items():
        if src_key in data:
            col_updates[col] = data[src_key]

    if school_id:
        col_updates["school"] = school_id
        blob_updates["school_id"] = school_id
        blob_updates["schoolId"] = school_id

    # Everything else goes into the blob
    skip = set(_FIELD_MAP.keys()) | {"name"}
    for k, v in data.items():
        if k not in skip:
            blob_updates[k] = v

    blob_updates["email"] = email
    blob_updates["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    with get_db() as conn:
        cur = conn.cursor()
        # Ensure the row exists
        cur.execute(
            """
            INSERT INTO users (email, referral_code)
            VALUES (%s, %s)
            ON CONFLICT (email) DO NOTHING
            """,
            (email, _generate_referral_code()),
        )
        # Fetch current profile_json
        cur.execute("SELECT profile_json FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        existing_blob = {}
        if row and row["profile_json"]:
            existing_blob = dict(row["profile_json"]) if isinstance(row["profile_json"], dict) else json.loads(row["profile_json"])

        merged_blob = {**existing_blob, **blob_updates}

        # Build SET clause for known columns
        set_parts = ["profile_json = %s::jsonb", "updated_at = now()"]
        params: list = [json.dumps(merged_blob)]

        _JSONB_COLS = {"majors", "minors"}
        for col, val in col_updates.items():
            if col in _JSONB_COLS:
                set_parts.append(f"{col} = %s::jsonb")
                params.append(json.dumps(val if val is not None else []))
            else:
                set_parts.append(f"{col} = %s")
                params.append(val)

        params.append(email)
        cur.execute(
            f"UPDATE users SET {', '.join(set_parts)} WHERE email = %s",
            params,
        )
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        return _row_to_profile(dict(cur.fetchone()))


def ensure_profile_exists(email: str) -> dict:
    email = (email or "").strip().lower()
    if not email:
        raise ValueError("Email required")
    existing = get_profile(email)
    if existing is not None:
        # Backfill referral_code if missing
        if not existing.get("referral_code"):
            return save_profile(email, {"referral_code": _generate_referral_code()})
        return existing
    school_id = _school_id_from_email(email)
    default: dict = {
        "email": email,
        "verified": True,
        "profileStatus": "draft",
        "name": None,
        "major": None,
        "majors": [],
        "minors": [],
        "preProfessional": False,
        "track": None,
        "goals": [],
        "application_target": None,
        "voice_avatar_index": 0,
        "referral_code": _generate_referral_code(),
        "push_token": None,
        "notification_prefs": {
            "enabled": True,
            "quiet_hours_start": 22,
            "quiet_hours_end": 8,
            "timezone": "America/New_York",
        },
        "last_deep_dive_at": None,
        "weekly_review_day": 0,
        "dilly_narrative": None,
        "dilly_narrative_updated_at": None,
        "dilly_memory_items": [],
        "voice_session_captures": [],
        "leaderboard_opt_in": True,
        "onboarding_complete": False,
        "has_run_first_audit": False,
    }
    if school_id:
        default["school_id"] = school_id
        default["schoolId"] = school_id
    return save_profile(email, default)


def is_leaderboard_participating(profile: dict | None) -> bool:
    if not profile or not isinstance(profile, dict):
        return False
    return profile.get("leaderboard_opt_in") is not False


def get_profile_slug(email: str) -> str:
    return _user_id((email or "").strip().lower())


def get_profile_by_slug(slug: str) -> dict | None:
    if not slug or len(slug) != 16:
        return None
    # slug is sha256[:16] of email — need to scan (or store slug column)
    # Fall back to filesystem for now if not found via DB
    path = os.path.join(_PROFILES_DIR, slug, "profile.json")
    if os.path.isfile(path):
        try:
            import json as _json
            with open(path) as f:
                data = _json.load(f)
            email = data.get("email", "")
            if email:
                return get_profile(email)
        except Exception:
            pass
    return None


# ── Profile photo helpers (unchanged — still filesystem) ───────────────────────

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
            break
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


def get_profile_photo_path_by_slug(slug: str) -> str | None:
    if not slug or len(slug) != 16:
        return None
    folder = os.path.join(_PROFILES_DIR, slug)
    if not os.path.isdir(folder):
        return None
    for ext in _ALLOWED_PHOTO_EXT:
        path = os.path.join(folder, _PROFILE_PHOTO_FILENAME + ext)
        if os.path.isfile(path):
            return path
    return None


# ── Transcript helpers (unchanged — still filesystem) ─────────────────────────

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
    if not token:
        return None
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT email FROM users WHERE profile_json->>'parent_invite_token' = %s",
            (token,),
        )
        row = cur.fetchone()
        return row["email"] if row else None


def ensure_referral_code(email: str) -> str:
    profile = get_profile(email)
    if not profile:
        return ""
    code = profile.get("referral_code") or ""
    if not code or not isinstance(code, str) or len(code) < 4:
        code = _generate_referral_code()
        save_profile(email, {"referral_code": code})
    return code


def delete_account_data(email: str) -> bool:
    email = (email or "").strip().lower()
    if not email:
        return False
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE email = %s", (email,))
        deleted = (cur.rowcount or 0) > 0
    # Also remove file-based folder
    folder = get_profile_folder_path(email)
    if folder and os.path.isdir(folder):
        try:
            shutil.rmtree(folder)
        except Exception:
            pass
    return deleted


def delete_draft_profiles_older_than_days(days: int) -> int:
    cutoff = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            DELETE FROM users
            WHERE profile_status = 'draft'
              AND updated_at < now() - interval '%s days'
            """,
            (days,),
        )
        return cur.rowcount or 0


# ── Internal helper ───────────────────────────────────────────────────────────

def _row_to_profile(row: dict) -> dict:
    """Merge users table row with its profile_json blob into a single flat dict."""
    blob = {}
    if row.get("profile_json"):
        raw = row["profile_json"]
        blob = dict(raw) if isinstance(raw, dict) else json.loads(raw)

    # Structured columns win over blob
    profile = {**blob}
    profile["email"] = row.get("email") or blob.get("email", "")
    profile["subscribed"] = bool(row.get("subscribed", False))
    profile["onboarding_complete"] = bool(row.get("onboarding_complete", False))
    profile["has_run_first_audit"] = bool(row.get("has_run_first_audit", False))
    profile["leaderboard_opt_in"] = row.get("leaderboard_opt_in") if row.get("leaderboard_opt_in") is not None else blob.get("leaderboard_opt_in", True)
    profile["profile_status"] = row.get("profile_status") or blob.get("profileStatus") or "draft"
    profile["profileStatus"] = profile["profile_status"]
    if row.get("track"):
        profile["track"] = row["track"]
    if row.get("major"):
        profile["major"] = row["major"]
    if row.get("application_target"):
        profile["application_target"] = row["application_target"]
    if row.get("referral_code"):
        profile["referral_code"] = row["referral_code"]
    if row.get("voice_avatar_index") is not None:
        profile["voice_avatar_index"] = row["voice_avatar_index"]
    if row.get("full_name"):
        profile["name"] = row["full_name"]
    # Multi-major / minor / pre-professional track — dedicated columns win over blob
    if row.get("majors") is not None:
        raw_m = row["majors"]
        profile["majors"] = list(raw_m) if isinstance(raw_m, list) else (json.loads(raw_m) if isinstance(raw_m, str) else [])
    elif "majors" not in profile:
        profile["majors"] = []
    if row.get("minors") is not None:
        raw_mi = row["minors"]
        profile["minors"] = list(raw_mi) if isinstance(raw_mi, list) else (json.loads(raw_mi) if isinstance(raw_mi, str) else [])
    elif "minors" not in profile:
        profile["minors"] = []
    if "pre_professional_track" in row:
        profile["pre_professional_track"] = row.get("pre_professional_track")
    return profile
