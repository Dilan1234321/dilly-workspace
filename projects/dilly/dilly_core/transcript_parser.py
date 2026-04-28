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
    # Singular major/minor kept for backward compat. Lists are the
    # source of truth for transcripts with multiple of either (e.g.
    # double major, double minor).
    major: str | None = None
    minor: str | None = None
    majors: list[str] = field(default_factory=list)
    minors: list[str] = field(default_factory=list)
    honors: list[str] = field(default_factory=list)
    courses: list[TranscriptCourse] = field(default_factory=list)
    # School name extracted from header (e.g. "The University of Tampa").
    school: str | None = None
    # Quality signals for API/UI: only set when we're confident.
    gpa_source: str | None = None  # e.g. "cumulative", "overall"
    warnings: list[str] = field(default_factory=list)  # e.g. "no_cumulative_gpa_found"

    def to_dict(self) -> dict[str, Any]:
        return {
            "gpa": self.gpa,
            "bcpm_gpa": self.bcpm_gpa,
            "major": self.major,
            "minor": self.minor,
            "majors": list(self.majors),
            "minors": list(self.minors),
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
# The Tampa-style table format ("Cumulative: 46.0 72.0 42.0 135.0 3.21")
# puts several numbers between the label and the GPA — the LAST
# number on the line is the GPA. We capture the whole line then post-
# process to take the last decimal.
_CUMULATIVE_GPA_PATTERNS = [
    re.compile(r"cumulative\s+gpa\s*[:\s]*" + _GPA_NUM, re.I),
    re.compile(r"overall\s+gpa\s*[:\s]*" + _GPA_NUM, re.I),
    re.compile(r"gpa\s*[:\s]*" + _GPA_NUM + r"\s*\(?\s*cumulative", re.I),
    re.compile(r"grade\s+point\s+average\s*[:\s]*" + _GPA_NUM + r"\s*\(?\s*(?:cumulative|overall)", re.I),
    re.compile(r"(?:cumulative|overall)\s+[:\s]*" + _GPA_NUM, re.I),
]
# Tampa-style "Cumulative: <numbers>... <gpa>" — the last decimal on
# the cumulative row is the GPA. Captured separately so we can pull
# the last number rather than the first.
_CUMULATIVE_TABLE_ROW = re.compile(
    r"cumulative\s*[:\s]+([\d\s\.]+)$",
    re.I | re.M,
)

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
    # Includes Tampa-style half-grades (AB, BC, CD), transfer (TR),
    # withdraw/incomplete/in-progress, plus standard letter grades.
    # We always pick the LAST match on a line — the grade comes after
    # the course title, and a stray "I" inside a title (e.g. "Calculus I")
    # would otherwise win as the grade.
    r"\b(A\+|A-|AB|A|B\+|B-|BC|B|C\+|C-|CD|C|D\+|D-|D|F|TR|P|S|W|WF|I|IP)\b"
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
# "2024 Fall Semester" / "2025 Spring Semester" (Tampa, year-first form).
_TERM_PATTERN_YEAR_FIRST = re.compile(
    r"\b(20\d{2})\s+(Fall|Spring|Summer|Winter)\s+Semester\b",
    re.I,
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


def _extract_gpa_strict(text: str) -> tuple[float | None, str | None, list[str]]:
    """
    Extract cumulative/overall GPA with preference for explicitly labeled values.
    Returns (gpa, gpa_source, warnings).
    """
    warnings: list[str] = []
    cumulative_val: float | None = None
    any_gpa_vals: list[float] = []

    # 0) Tampa-style table row "Cumulative: 46.0 72.0 42.0 135.0 3.21".
    # The LAST decimal value on the line is the GPA. We look at all
    # cumulative-table rows and take the one with the highest values
    # (that's the most recent / final cumulative row).
    table_gpa_candidates: list[float] = []
    for m in _CUMULATIVE_TABLE_ROW.finditer(text):
        nums = re.findall(r"\d+\.\d+", m.group(1))
        if nums:
            try:
                last = float(nums[-1])
                v = _valid_gpa(last)
                if v is not None:
                    table_gpa_candidates.append(v)
            except ValueError:
                pass
    if table_gpa_candidates:
        # The cumulative row that appears LAST in the document is the
        # most recent / final one — that's the cumulative GPA.
        return (table_gpa_candidates[-1], "cumulative", warnings)

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
    """Extract distinct honors as clean labels. Each entry is a single
    short phrase (e.g. "Dean's List") not a sentence with surrounding
    junk. Earlier we grabbed ±5 chars of context which produced messy
    output like "ng: Dean's List 2025 Spri"."""
    found: list[str] = []
    seen_lower: set[str] = set()

    # Canonical labels we know about. Each keyword maps to a clean
    # display label so we never store "deans list" — it's "Dean's List".
    canonical = {
        "dean's list": "Dean's List",
        "dean’s list": "Dean's List",
        "deans list": "Dean's List",
        "summa cum laude": "Summa Cum Laude",
        "magna cum laude": "Magna Cum Laude",
        "cum laude": "Cum Laude",
        "honors program": "Honors Program",
        "honors college": "Honors College",
        "president's list": "President's List",
        "president’s list": "President's List",
        "chancellor's list": "Chancellor's List",
        "chancellor’s list": "Chancellor's List",
        "honor roll": "Honor Roll",
        "phi beta kappa": "Phi Beta Kappa",
    }
    lower = text.lower()
    for kw, label in canonical.items():
        if kw in lower and label.lower() not in seen_lower:
            found.append(label)
            seen_lower.add(label.lower())

    # Also catch labeled rows like
    #   "Additional Academic Standing: Dean's List"
    #   "Honors: Cum Laude, Phi Beta Kappa"
    for m in re.finditer(
        r"(?:additional\s+academic\s+standing|honors?|distinctions?|awards?)\s*[:\-]\s*([^\n]{2,120})",
        text, re.I,
    ):
        raw = m.group(1).strip().rstrip(".,;")
        # Split on commas / semicolons / "and" so each award is a row.
        for part in re.split(r"\s*(?:,|;|\band\b)\s*", raw):
            part = part.strip().rstrip(".,;")
            if 2 <= len(part) <= 70 and part.lower() not in seen_lower:
                # Skip entries that are just statuses, not honors.
                if part.lower() in ("good standing", "active", "in progress"):
                    continue
                found.append(part)
                seen_lower.add(part.lower())

    return found[:20]


def _extract_school(text: str) -> str | None:
    """First non-empty heading line that looks like a school name."""
    for line in text.split("\n")[:10]:
        line = line.strip()
        if not line:
            continue
        # Strip trailing "Unofficial Transcript" / "Transcript".
        cleaned = re.sub(r"\s*(unofficial\s+)?(transcript|academic\s+record)\s*$", "", line, flags=re.I).strip()
        if 5 <= len(cleaned) <= 120 and re.search(r"university|college|institute|school", cleaned, re.I):
            return cleaned
    return None


def _extract_courses(text: str) -> list[TranscriptCourse]:
    """Extract course rows. Dedupe by (code, term). Walks the text top
    to bottom, tracking the current term context from "<YEAR> Fall
    Semester" style headers, and parses each row using format-aware
    logic (separates trailing credits like "4.0" from the course
    name)."""
    courses: list[TranscriptCourse] = []
    seen: set[tuple] = set()
    lines = text.split("\n")

    current_term: str | None = None

    for line in lines:
        line_stripped = line.strip()
        if len(line_stripped) < 6:
            continue
        # Update term context when we see a section header like
        # "2024 Fall Semester" or "Fall 2024".
        ym = _TERM_PATTERN_YEAR_FIRST.search(line_stripped)
        if ym:
            current_term = f"{ym.group(2).title()} {ym.group(1)}"
            continue
        sm = _TERM_PATTERN.search(line_stripped)
        # Only update term from short inline match if the line is just
        # a header (otherwise it'd hijack term from any course line that
        # mentions a season). Header rows are short.
        if sm and len(line_stripped) < 40:
            current_term = sm.group(1)
            continue
        # Skip header row
        if _COURSE_ROW_BLACKLIST.match(line_stripped):
            continue
        # Skip Term/Cumulative summary rows.
        if re.match(r"^(term|cumulative|attempted|earned|gpa)\b", line_stripped, re.I):
            continue
        # Skip "Test Source: AP — ..." metadata.
        if re.match(r"^test\s+source\s*:", line_stripped, re.I):
            continue

        code_m = _COURSE_CODE_PATTERN.search(line_stripped)
        # Pick the LAST grade match on the line — the grade is the
        # rightmost token. If we used .search (first match), a roman
        # "I" inside "Calculus I" beats the actual TR/A/B grade at
        # the end of the line.
        grade_matches = list(_GRADE_PATTERN.finditer(line_stripped))
        grade_m = grade_matches[-1] if grade_matches else None
        if not code_m or not grade_m:
            continue
        code = f"{code_m.group(1).upper()} {code_m.group(2)}"
        grade = grade_m.group(1).upper()

        # Extract credits — first try the "X cr/credits" suffix form;
        # if that fails, look for a bare decimal between the title and
        # the grade (Tampa style: "Code Title 4.0 A").
        credits: float | None = None
        cred_m = _CREDITS_PATTERN.search(line_stripped)
        if cred_m:
            try:
                v = float(cred_m.group(1))
                if 0.5 <= v <= 99:
                    credits = v
            except ValueError:
                pass

        code_end = code_m.end()
        grade_start = grade_m.start()
        between = line_stripped[code_end:grade_start].strip()
        # Strip leading "-" used by transfer rows ("MAT 260 - Calculus I 3.0 TR").
        between = re.sub(r"^-\s*", "", between).strip()
        # Tampa-style: trailing decimal in the between span IS the
        # credit count. Pull it out so it doesn't end up in the name.
        trailing_credit = re.search(r"\s+(\d{1,2}\.\d)\s*$", between)
        if trailing_credit and credits is None:
            try:
                v = float(trailing_credit.group(1))
                if 0.5 <= v <= 99:
                    credits = v
                    between = between[:trailing_credit.start()].rstrip()
            except ValueError:
                pass
        elif trailing_credit:
            # Already had credits from suffix form — still strip the
            # trailing number from the name.
            between = between[:trailing_credit.start()].rstrip()

        name: str | None = None
        if 2 <= len(between) <= 120 and not re.fullmatch(r"\d+\.?\d*", between):
            name = between[:120]

        course = TranscriptCourse(code=code, name=name or None, term=current_term, credits=credits, grade=grade)
        key = course.key()
        if key in seen:
            continue
        seen.add(key)
        courses.append(course)

    return courses[:200]


def _extract_majors_minors(text: str) -> tuple[list[str], list[str]]:
    """Extract MAJORS + MINORS as separate lists.

    Two passes:
    1. Block parse: find "Program of Study:" / "Degree:" / "Major:"
       label, then read the SAME line and any continuation lines that
       follow until a blank line or new label row. Each line is
       classified — lines containing "Minor" go to minors, others to
       majors.
    2. Inline catch-alls: explicit "Minor:" / "Concentration:" rows.

    Both lists are deduplicated case-insensitively and capped at 5.
    """
    majors: list[str] = []
    minors: list[str] = []

    def _push(target: list[str], text_in: str) -> None:
        cleaned = re.sub(r"\s+", " ", text_in.strip().rstrip(".,;"))
        if not cleaned or len(cleaned) < 2 or len(cleaned) > 80:
            return
        low = cleaned.lower()
        if any(low == x.lower() for x in target):
            return
        # Skip noise tokens.
        if low in ("of study", "study", "n/a", "none", "tba", "tbd"):
            return
        target.append(cleaned)

    def _classify_and_push(s: str) -> None:
        s = s.strip()
        if not s:
            return
        # Strip leading bullets / dashes.
        s = re.sub(r"^[\s\-•·]+", "", s)
        if re.search(r"\bminor\b", s, re.I):
            label = re.sub(r"\s*minor\s*$", "", s, flags=re.I).strip()
            _push(minors, label)
        else:
            # "Data Science BS", "Biology B.S.", "Biology Major", etc.
            label = re.sub(r"\s*major\s*$", "", s, flags=re.I).strip()
            _push(majors, label)

    lines = text.split("\n")

    # Pass 1: block parse from "Program of Study:" labels.
    label_re = re.compile(
        r"^(?:program\s+of\s+study|degree|major|concentration)\s*[:\s]+\s*(.*)$",
        re.I,
    )
    for i, line in enumerate(lines):
        m = label_re.match(line.strip())
        if not m:
            continue
        first = m.group(1).strip()
        if first:
            _classify_and_push(first)
        # Continuation lines: anything that isn't another label, isn't
        # blank, and isn't obviously noise (e.g. "Completion Status:").
        for j in range(i + 1, min(i + 8, len(lines))):
            cont = lines[j].strip()
            if not cont:
                break
            if re.match(r"^[a-z][a-z ]+:\s*", cont, re.I):
                # Only break if it's a NEW label (e.g. "Completion
                # Status:") — but not a continuation that happens to
                # contain a colon.
                if not re.search(r"\b(major|minor|concentration|degree)\b", cont, re.I):
                    break
            # Stop at clearly unrelated headings.
            if re.search(r"\b(semester|cumulative|attempted|earned|term\s+(?:start|end))\b", cont, re.I):
                break
            _classify_and_push(cont)

    # Pass 2: explicit "Minor:" rows anywhere in the doc.
    for m in re.finditer(r"^\s*minor\s*[:\s]+\s*([^\n]{2,80})$", text, re.I | re.M):
        _classify_and_push(m.group(1) + " Minor")

    return majors[:5], minors[:5]


def _extract_major_minor(text: str) -> tuple[str | None, str | None]:
    """Backward-compatible singular accessor — returns (first major,
    first minor) using the new list-based extractor."""
    majors, minors = _extract_majors_minors(text)
    return (majors[0] if majors else None, minors[0] if minors else None)


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
    majors, minors = _extract_majors_minors(text)
    school = _extract_school(text)
    return TranscriptParseResult(
        gpa=gpa,
        bcpm_gpa=bcpm,
        major=(majors[0] if majors else None),
        minor=(minors[0] if minors else None),
        majors=majors,
        minors=minors,
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
