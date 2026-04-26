"""
Parse student transcript (PDF text or plain text) to extract:
- GPA (cumulative/overall only; validated 2.0-4.0)
- BCPM/science GPA when explicitly labeled
- Courses: code, name, term, credits, grade (read-only for profile)
- Honors (Dean's List, Latin honors, etc.)
- Major/minor when clearly stated

MTS: only extract what appears in the document. No inventing.
Quality bar: Mercor-level — strict validation, cumulative-GPA preference, deduplication, no false positives.
"""

import re
from dataclasses import dataclass, field
from typing import Any

# Valid GPA range (4.0 scale). We never store or use values outside this.
GPA_MIN = 2.0
GPA_MAX = 4.0

# Maximum transcript pages we parse (avoid abuse and timeouts).
MAX_TRANSCRIPT_PAGES = 25


@dataclass
class TranscriptCourse:
    """One course row. All optional; only what we reliably parse. No inventing."""
    code: str | None = None
    name: str | None = None
    term: str | None = None
    credits: float | None = None
    grade: str | None = None

    def key(self) -> tuple:
        """Stable key for deduplication: (code, term)."""
        return (self.code or "", self.term or "")


@dataclass
class TranscriptParseResult:
    gpa: float | None = None
    bcpm_gpa: float | None = None
    major: str | None = None
    minor: str | None = None
    school: str | None = None
    honors: list[str] = field(default_factory=list)
    courses: list[TranscriptCourse] = field(default_factory=list)
    # Quality signals for API/UI: only set when we're confident.
    gpa_source: str | None = None  # e.g. "cumulative", "overall"
    warnings: list[str] = field(default_factory=list)  # e.g. "no_cumulative_gpa_found"

    def to_dict(self) -> dict[str, Any]:
        return {
            "gpa": self.gpa,
            "bcpm_gpa": self.bcpm_gpa,
            "major": self.major,
            "minor": self.minor,
            "school": self.school,
            "honors": list(self.honors),
            "courses": [
                {
                    "code": c.code,
                    "name": c.name,
                    "term": c.term,
                    "credits": c.credits,
                    "grade": c.grade,
                }
                for c in self.courses
            ],
            "warnings": list(self.warnings),
        }


def _normalize_text(text: str) -> str:
    """Normalize transcript text: single newlines, collapse runs of space, preserve structure for regex."""
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse multiple spaces/newlines to single newline or single space
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _valid_gpa(value: float) -> float | None:
    """Return value rounded to 2 decimals if in valid range, else None."""
    if value is None:
        return None
    try:
        v = round(float(value), 2)
        if GPA_MIN <= v <= GPA_MAX:
            return v
    except (TypeError, ValueError):
        pass
    return None


# GPA number: 2.0-4.0 with one or two decimal places (e.g. 3.5 or 3.50)
_GPA_NUM = r"([0-4]\.\d{1,2})"

# Patterns that explicitly indicate CUMULATIVE / OVERALL GPA (preferred).
_CUMULATIVE_GPA_PATTERNS = [
    re.compile(r"cumulative\s+gpa\s*[:\s]*" + _GPA_NUM, re.I),
    re.compile(r"overall\s+gpa\s*[:\s]*" + _GPA_NUM, re.I),
    re.compile(r"gpa\s*[:\s]*" + _GPA_NUM + r"\s*\(?\s*cumulative", re.I),
    re.compile(r"grade\s+point\s+average\s*[:\s]*" + _GPA_NUM + r"\s*\(?\s*(?:cumulative|overall)", re.I),
    re.compile(r"(?:cumulative|overall)\s+[:\s]*" + _GPA_NUM, re.I),
]

# Fallback: any GPA-like label (may catch term GPA; we prefer cumulative when both exist).
_ANY_GPA_PATTERNS = [
    re.compile(r"g\.?p\.?a\.?\s*[:\s]*" + _GPA_NUM, re.I),
    re.compile(r"grade\s+point\s+average\s*[:\s]*" + _GPA_NUM, re.I),
    re.compile(r"([0-4]\.\d{1,2})\s*(?:cumulative|overall)?\s*gpa", re.I),
]

# BCPM / science GPA — must be explicitly labeled.
_BCPM_PATTERNS = [
    re.compile(r"(?:science|bcpm)\s+gpa\s*[:\s]*" + _GPA_NUM, re.I),
    re.compile(r"gpa\s*[:\s]*" + _GPA_NUM + r"\s*\(.*science", re.I),
]

# Valid letter grades (US 4.0 scale). Exclude W, WF, I, IP, S, P for GPA purposes.
_VALID_LETTER_GRADES = frozenset(
    "A+ A A- B+ B B- C+ C C- D+ D D- F".split()
)
_GRADE_PATTERN = re.compile(
    r"\b(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F|P|S|W|WF|I|IP)\b"
)

_COURSE_CODE_PATTERN = re.compile(
    r"\b([A-Z]{2,5})\s*(\d{3,4}[A-Z]?)\b",
    re.I
)
_CREDITS_PATTERN = re.compile(r"\b(\d{1,2}(?:\.\d)?)\s*(?:cr|credit)s?\b", re.I)
_TERM_PATTERN = re.compile(
    r"\b((?:Fall|Spring|Summer|Winter)\s+20\d{2})\b",
    re.I
)

# Header-like lines we must not treat as courses.
_COURSE_ROW_BLACKLIST = re.compile(
    r"^(course|code|subject|grade|credits?|hours?|term|title)\s*$",
    re.I
)

_HONORS_KEYWORDS = [
    "dean's list", "dean\u2019s list", "deans list",
    "cum laude", "magna cum laude", "summa cum laude",
    "honors program", "honors college",     "president's list",
    "president\u2019s list", "chancellor's list", "scholarship",
    "honor roll", "phi beta kappa",
]

# School extraction: labeled ("Institution: X") or unlabeled header line.
_SCHOOL_LABELED_PAT = re.compile(
    r"(?:institution|school)\s*[:]\s*([A-Za-z][A-Za-z\s,&\-\'\.]{2,79})",
    re.I,
)
_SCHOOL_SUFFIX_PAT = re.compile(
    r"\b(?:university|college|institute of technology|polytechnic institute)\b",
    re.I,
)
_SCHOOL_PREFIX_PAT = re.compile(r"^university of\s+[A-Za-z]", re.I)
_SCHOOL_NOISE_PAT = re.compile(
    r"\b(?:gpa|credit|grade|transcript|official|student|date|page|term|semester|cumulative)\b",
    re.I,
)


def _extract_school(text: str) -> str | None:
    """Extract institution name. Returns None rather than a wrong guess."""
    m = _SCHOOL_LABELED_PAT.search(text)
    if m:
        cand = re.sub(r"\s+", " ", m.group(1).split("\n")[0]).strip()
        if len(cand) >= 4:
            return cand[:100]
    for line in text.split("\n")[:20]:
        line = line.strip()
        if not line or len(line) < 4 or len(line) > 100:
            continue
        if _SCHOOL_NOISE_PAT.search(line):
            continue
        if _SCHOOL_SUFFIX_PAT.search(line) or _SCHOOL_PREFIX_PAT.match(line):
            return re.sub(r"\s+", " ", line).strip()[:100]
    return None


def _extract_gpa_strict(text: str) -> tuple[float | None, str | None, list[str]]:
    """
    Extract cumulative/overall GPA with preference for explicitly labeled values.
    Returns (gpa, gpa_source, warnings).
    """
    warnings: list[str] = []
    cumulative_val: float | None = None
    any_gpa_vals: list[float] = []

    # 1) Prefer cumulative/overall
    for pat in _CUMULATIVE_GPA_PATTERNS:
        for m in pat.finditer(text):
            v = _valid_gpa(float(m.group(1)))
            if v is not None:
                cumulative_val = v
                return (cumulative_val, "cumulative", warnings)

    # 2) Collect all GPA-like values (to avoid using term GPA as cumulative)
    for pat in _ANY_GPA_PATTERNS:
        for m in pat.finditer(text):
            v = _valid_gpa(float(m.group(1)))
            if v is not None:
                any_gpa_vals.append(v)

    if not any_gpa_vals:
        warnings.append("no_gpa_found")
        return (None, None, warnings)

    # 3) If we only have one GPA-like number, use it (with warning that it wasn't labeled cumulative)
    if len(any_gpa_vals) == 1:
        warnings.append("gpa_not_labeled_cumulative")
        return (any_gpa_vals[0], "inferred", warnings)

    # 4) Multiple values: take the highest that's <= 4.0 (often cumulative is the main one; term GPAs can be lower or higher).
    # Many transcripts list "Term GPA" then "Cumulative GPA" — we already tried cumulative. So take max as heuristic for "overall".
    chosen = max(any_gpa_vals)
    warnings.append("multiple_gpa_values_used_highest")
    return (chosen, "inferred", warnings)


def _extract_bcpm(text: str) -> float | None:
    for pat in _BCPM_PATTERNS:
        m = pat.search(text)
        if m:
            return _valid_gpa(float(m.group(1)))
    return None


def _extract_honors(text: str) -> list[str]:
    found: list[str] = []
    lower = text.lower()
    for kw in _HONORS_KEYWORDS:
        if kw in lower:
            idx = lower.find(kw)
            start = max(0, idx - 5)
            end = min(len(text), idx + len(kw) + 40)
            phrase = text[start:end].strip()
            # Clean trailing punctuation/numbers
            phrase = re.sub(r"[\d\.\-,;]+$", "", phrase).strip()
            if len(phrase) >= 3 and phrase not in found:
                found.append(phrase[:70])
    return found[:10]


def _extract_courses(text: str) -> list[TranscriptCourse]:
    """Extract course rows. Dedupe by (code, term). Exclude header-like lines. MTS: only what appears."""
    courses: list[TranscriptCourse] = []
    seen: set[tuple] = set()
    lines = text.split("\n")

    for line in lines:
        line_stripped = line.strip()
        if len(line_stripped) < 6:
            continue
        # Skip header row
        if _COURSE_ROW_BLACKLIST.match(line_stripped):
            continue
        code_m = _COURSE_CODE_PATTERN.search(line_stripped)
        grade_m = _GRADE_PATTERN.search(line_stripped)
        if not code_m or not grade_m:
            continue
        code = f"{code_m.group(1).upper()} {code_m.group(2)}"
        grade = grade_m.group(1).upper().replace("+", "+").replace("-", "-")
        term_m = _TERM_PATTERN.search(line_stripped)
        term = term_m.group(1) if term_m else None
        cred_m = _CREDITS_PATTERN.search(line_stripped)
        credits: float | None = None
        if cred_m:
            try:
                credits = float(cred_m.group(1))
                if not (0.5 <= credits <= 99):
                    credits = None
            except ValueError:
                pass
        code_end = code_m.end()
        grade_start = grade_m.start()
        between = line_stripped[code_end:grade_start].strip()
        name = None
        if 3 <= len(between) <= 100 and not re.match(r"^\d+\.?\d*$", between):
            name = between[:100]

        course = TranscriptCourse(code=code, name=name or None, term=term, credits=credits, grade=grade)
        key = course.key()
        if key in seen:
            continue
        seen.add(key)
        courses.append(course)

    return courses[:200]


def _extract_major_minor(text: str) -> tuple[str | None, str | None]:
    major = None
    for prefix in ("major", "program", "degree", "concentration"):
        m = re.search(rf"{re.escape(prefix)}\s*[:\s]+\s*([A-Za-z][A-Za-z\s,&\-\']{{2,60}})", text, re.I)
        if m:
            cand = m.group(1).strip()
            cand = re.sub(r"\s+", " ", cand)
            if len(cand) >= 2 and "gpa" not in cand.lower() and "credit" not in cand.lower():
                major = cand[:80]
                break
    minor = None
    m = re.search(r"minor\s*[:\s]+\s*([A-Za-z][A-Za-z\s,&\-\']{2,60})", text, re.I)
    if m:
        cand = m.group(1).strip()
        cand = re.sub(r"\s+", " ", cand)
        if len(cand) >= 2 and "gpa" not in cand.lower():
            minor = cand[:80]
    return major, minor


def parse_transcript_text(text: str) -> TranscriptParseResult:
    """
    Parse transcript plain text. Strict validation; cumulative GPA preferred.
    MTS: no inventing. Returns warnings when confidence is lower.
    """
    if not (text or "").strip():
        return TranscriptParseResult(warnings=["empty_text"])
    text = _normalize_text(text)
    gpa, gpa_source, gpa_warnings = _extract_gpa_strict(text)
    bcpm = _extract_bcpm(text)
    honors = _extract_honors(text)
    courses = _extract_courses(text)
    major, minor = _extract_major_minor(text)
    school = _extract_school(text)
    return TranscriptParseResult(
        gpa=gpa,
        bcpm_gpa=bcpm,
        major=major,
        minor=minor,
        school=school,
        honors=honors,
        courses=courses,
        gpa_source=gpa_source,
        warnings=gpa_warnings,
    )


def parse_transcript_pdf(pdf_path: str) -> TranscriptParseResult:
    """
    Extract text from PDF (up to MAX_TRANSCRIPT_PAGES), then parse.
    Returns empty result with warning if PDF unreadable.
    """
    text = ""
    try:
        from pypdf import PdfReader
        reader = PdfReader(pdf_path)
        num_pages = len(reader.pages)
        if num_pages > MAX_TRANSCRIPT_PAGES:
            return TranscriptParseResult(
                warnings=[f"pdf_too_long_max_{MAX_TRANSCRIPT_PAGES}_pages_parsed"]
            )
        for i, page in enumerate(reader.pages):
            if i >= MAX_TRANSCRIPT_PAGES:
                break
            t = page.extract_text()
            if t:
                text += t + "\n"
    except ImportError:
        return TranscriptParseResult(warnings=["pypdf_not_available"])
    except Exception:
        return TranscriptParseResult(warnings=["pdf_extract_failed"])

    if not text.strip():
        return TranscriptParseResult(warnings=["pdf_no_text_extracted"])
    return parse_transcript_text(text)
