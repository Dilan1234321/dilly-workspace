"""
Dilly profile (full text): one .txt per user in memory/dilly_profile_txt/.
Filename = safe email (e.g. user@example.com.txt). Content = everything Dilly knows.
Write on new/updated data (audit complete, profile/transcript/voice updates).
Optional: read [RESUME] from this file for indexing when present (eventual replacement for parsed_resumes).
"""

import os
import re
import sys

_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

_PROFILE_TXT_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profile_txt")
_PARSED_RESUMES_DIR = os.path.join(_WORKSPACE_ROOT, "projects", "dilly", "parsed_resumes")


def write_dilly_profile_txt(email: str) -> str | None:
    """
    Build and write the full Dilly profile .txt for this user.
    Loads profile, latest audit, and resume from parsed_resumes; writes to memory/dilly_profile_txt/{email}.txt.
    Returns path written, or None on failure.
    """
    email = (email or "").strip().lower()
    if not email:
        return None
    try:
        from dilly_core.structured_resume import safe_filename_from_key, read_parsed_resume
        from dilly_core.dilly_profile_txt import build_dilly_profile_txt
        from projects.dilly.api.profile_store import get_profile
        from projects.dilly.api.audit_history_pg import get_audits
    except Exception as e:
        sys.stderr.write(f"Dilly profile txt: import error: {e}\n")
        return None

    profile = get_profile(email)
    audits = get_audits(email)
    latest_audit = audits[0] if audits else None

    filename = safe_filename_from_key(email)
    resume_path = os.path.join(_PARSED_RESUMES_DIR, filename)
    resume_text = ""
    if os.path.isfile(resume_path):
        resume_text = read_parsed_resume(resume_path) or ""
    # When parsed_resumes has nothing, keep existing [RESUME] from profile file so we don't overwrite with "(No resume on file)"
    if not resume_text.strip():
        resume_text = get_resume_from_dilly_profile(email)

    content = build_dilly_profile_txt(
        email=email,
        profile=profile,
        latest_audit=latest_audit,
        resume_text=resume_text or None,
    )

    os.makedirs(_PROFILE_TXT_DIR, exist_ok=True)
    out_path = os.path.join(_PROFILE_TXT_DIR, filename)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content)
    return out_path


def get_dilly_profile_txt_content(email: str, max_chars: int = 12000) -> str:
    """
    Read the full Dilly profile .txt for this user (everything Dilly knows).
    Used for recruiter matching so embedding reflects profile + voice data, not just resume.
    Returns empty string if no file or read error. Optionally truncates to max_chars.
    """
    email = (email or "").strip().lower()
    if not email:
        return ""
    try:
        from dilly_core.structured_resume import safe_filename_from_key
    except Exception:
        return ""
    path = os.path.join(_PROFILE_TXT_DIR, safe_filename_from_key(email))
    if not os.path.isfile(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
    except Exception:
        return ""
    raw = raw.strip()
    if not raw:
        return ""
    if max_chars and len(raw) > max_chars:
        raw = raw[: max_chars - 80] + "\n\n[... truncated ...]"
    return raw


_TOP_LEVEL_SECTIONS = frozenset({
    "IDENTITY", "RESUME", "AUDIT", "GOALS", "VOICE_CAPTURED",
    "DECISION_LOG", "DEADLINES", "JOB_LOCATIONS", "ACHIEVEMENTS",
    "TRANSCRIPT",
})


def get_resume_from_dilly_profile(email: str) -> str:
    """
    Read resume content from the user's Dilly profile .txt ([RESUME] section).
    Use for indexing when the profile file exists; falls back to empty if no file or no section.
    """
    email = (email or "").strip().lower()
    if not email:
        return ""
    try:
        from dilly_core.structured_resume import safe_filename_from_key
    except Exception:
        return ""
    path = os.path.join(_PROFILE_TXT_DIR, safe_filename_from_key(email))
    if not os.path.isfile(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    # Extract [RESUME] until the next TOP-LEVEL section or EOF.
    # Resume sub-sections like [EDUCATION], [SKILLS], [PROJECTS] must NOT
    # terminate the match — only profile-level sections should.
    top_re = "|".join(re.escape(s) for s in sorted(_TOP_LEVEL_SECTIONS))
    match = re.search(
        rf"\[RESUME\]\s*\n(.*?)(?=\n\[(?:{top_re})\]|\Z)",
        raw,
        re.DOTALL,
    )
    if not match:
        return ""
    text = match.group(1).strip()
    if text == "(No resume on file)":
        return ""
    return text


def parse_structured_experience_from_profile_txt(content: str) -> list[dict]:
    """
    Parse Company/Role/Date/Description blocks from profile txt [PROFESSIONAL EXPERIENCE] section.
    Returns list of {company, role, date, location, bullets}.
    """
    if not content or not content.strip():
        return []
    # Restrict to [PROFESSIONAL EXPERIENCE] so we don't pick up "Company:" from other sections
    match = re.search(r"\[PROFESSIONAL EXPERIENCE\]\s*\n(.*?)(?=\n\[[\w_\s]+\]|\Z)", content, re.DOTALL | re.IGNORECASE)
    content = match.group(1).strip() if match else content
    if not content:
        return []
    out = []
    # Split by newline followed by "Company:" so each block starts with company name
    blocks = re.split(r"\n\s*Company:\s*", content, flags=re.IGNORECASE)
    for i, block in enumerate(blocks):
        if i == 0:
            # First segment is everything before first "Company:"; may contain section headers
            if "Role:" not in block and "Date:" not in block:
                continue
        block = block.strip()
        if not block or len(block) < 3:
            continue
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        raw_first = lines[0] if lines else ""
        company = re.sub(r"^\s*Company:\s*", "", raw_first, flags=re.IGNORECASE).strip()  # First line may be "Company: X" or "X"
        role = ""
        date = ""
        location = ""
        bullets = []
        for line in lines[1:]:
            if line.lower().startswith("role:"):
                role = line[5:].strip()
            elif line.lower().startswith("date:"):
                date = line[5:].strip()
            elif line.lower().startswith("location:"):
                location = line[9:].strip()
            elif line.lower().startswith("description:"):
                continue
            elif line.startswith("-") or line.startswith("•") or re.match(r"^[\*\-]\s*", line):
                bullets.append(line.lstrip("-•* ").strip())
        if company or role or bullets:
            out.append({
                "company": (company or "").strip(),
                "role": role,
                "date": date,
                "location": location,
                "bullets": bullets[:15],
            })
    return out
