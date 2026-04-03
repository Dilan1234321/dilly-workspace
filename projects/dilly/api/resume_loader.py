"""
Shared helper: load parsed resume text for a user (by email). Used by jobs, voice, and audit indexing.
"""
import os
import sys

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)


def load_parsed_resume_for_voice(email: str, max_chars: int = 4000) -> str:
    """
    Load parsed resume text for the given user email.
    Prefers [RESUME] from memory/dilly_profile_txt/{email}.txt when present; else parsed_resumes.
    Returns truncated content for context.
    """
    if not email or not (email or "").strip():
        return ""
    email = (email or "").strip().lower()
    try:
        from projects.dilly.api.dilly_profile_txt import get_resume_from_dilly_profile
        from dilly_core.structured_resume import safe_filename_from_key, read_parsed_resume
        raw = get_resume_from_dilly_profile(email)
        if not raw or not raw.strip():
            _parsed_dir = os.path.join(_WORKSPACE_ROOT, "projects", "dilly", "parsed_resumes")
            filename = safe_filename_from_key(email)
            filepath = os.path.join(_parsed_dir, filename)
            raw = read_parsed_resume(filepath)
        if not raw or not raw.strip():
            return ""
        text = raw.strip()
        if len(text) > max_chars:
            text = text[: max_chars - 80] + "\n\n[... truncated for context ...]"
        return text
    except Exception:
        return ""
