"""
Shared API constants: upload limits, error messages. Used by main (exception handler) and routers (audit, ATS).
"""
_MAX_UPLOAD_MB = 5
MAX_UPLOAD_BYTES = _MAX_UPLOAD_MB * 1024 * 1024

ERR_FILE_TYPE = "Dilly only reads PDF and DOCX files."
ERR_FILE_TOO_BIG = f"That file is too large. Keep it under {_MAX_UPLOAD_MB} MB."
ERR_EXTRACT = "Your resume looks like a scanned image, so Dilly can't read the text. Try uploading the original Word doc (.docx) instead, or re-export it from Google Docs as a PDF."

MIN_RESUME_WORDS = 80
MAX_RESUME_WORDS = 4000
ERR_RESUME_TOO_SHORT = "Your resume doesn't have enough content yet for a meaningful audit. Add your education, experience, and key skills so we can give you real scores and advice."
ERR_RESUME_TOO_LONG = "Dilly works best with 1–2 page resumes. Trim to your strongest content and re-upload so we can give you focused advice."
ERR_RESUME_MISSING_SECTIONS = "Add at least education or experience so we can give you a meaningful audit."

ERR_REPORT_500 = "The report printer jammed. Try again in a few."
ERR_AUDIT_500 = [
    "Something went wrong on our end. Try again in a few.",
    "The audit hit an error. Try again in a few minutes.",
    "That didn't work. Try again?",
    "We're still warming up. Try again in a moment.",
]
ERR_TIMEOUT = "The audit is taking longer than usual. Try again in a moment."
AUDIT_TIMEOUT_SEC = 90

APPLICATION_TARGET_VALUES = frozenset({"internship", "full_time", "exploring"})
