"""
Shared API constants: upload limits, error messages. Used by main (exception handler) and routers (audit, ATS).
"""
_MAX_UPLOAD_MB = 5
MAX_UPLOAD_BYTES = _MAX_UPLOAD_MB * 1024 * 1024

ERR_FILE_TYPE = "Sparty only reads PDF and DOCX. No scrolls."
ERR_FILE_TOO_BIG = f"That file's heavier than a Spartan shield. Keep it under {_MAX_UPLOAD_MB} MB."
ERR_EXTRACT = "Sparty couldn't read that file. Might be a scan or image-only PDF. Try a different file or make sure text is selectable."

MIN_RESUME_WORDS = 80
MAX_RESUME_WORDS = 4000
ERR_RESUME_TOO_SHORT = "Your resume doesn't have enough content yet for a meaningful audit. Add your education, experience, and key skills so we can give you real scores and advice."
ERR_RESUME_TOO_LONG = "Dilly works best with 1–2 page resumes. Trim to your strongest content and re-upload so we can give you focused advice."
ERR_RESUME_MISSING_SECTIONS = "Add at least education or experience so we can give you a meaningful audit."

ERR_REPORT_500 = "The report printer jammed. Try again in a few."
ERR_AUDIT_500 = [
    "Sparty dropped his shield. Give us a sec. Try again in a few.",
    "Even Spartans need a breather. Try again in a few minutes.",
    "That one got past our defenses. Try again?",
    "Sparty's still warming up. Try again in a moment.",
]
ERR_TIMEOUT = "Sparty is taking longer than usual. Try again in a moment."
AUDIT_TIMEOUT_SEC = 90

APPLICATION_TARGET_VALUES = frozenset({"internship", "full_time", "exploring"})
