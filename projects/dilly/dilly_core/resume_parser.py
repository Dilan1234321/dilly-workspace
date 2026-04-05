"""
Dilly Resume Parser - Layout-agnostic, high-accuracy extraction for all resume formats.
Handles messy PDF extraction, multi-column layouts, and inconsistent section headers.
Single source of truth for: name, major, GPA, education block, and normalized text.
"""

import os
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass
class ParsedResume:
    """Structured parse result. Use for scoring and display."""
    name: str
    major: str
    gpa: Optional[float]
    education_block: str
    sections: Dict[str, str] = field(default_factory=dict)
    normalized_text: str = ""


# Section headers in many resume formats (case-insensitive match)
SECTION_HEADERS = [
    "education", "academic", "academics", "qualifications",
    "experience", "work experience", "employment", "professional experience", "work history", "job experience",
    "skills", "technical skills", "core competencies", "skills & activities", "skills and activities",
    "summary", "professional summary", "objective", "profile",
    "contact", "references", "projects", "certifications", "honors", "activities", "involvement",
    "research experience", "leadership experience", "awards & certifications", "awards and certifications",
    "publications", "publications & presentations", "publications and presentations",
    "additional information", "extracurriculars", "volunteer",
]
# Short ALL-CAPS lines that are in-content (acronyms, state codes), not section headers
SECTION_HEADER_ACRONYM_BLACKLIST = frozenset(
    "gpa fl md pa ny ca tx citi rcr hipaa it padi aota apta csm ecss cnhs us usa uk phd bs ba ms ma "
    "ceo cfo cto pm hr pr dei ut ed".split()
)
# Lines that are never a candidate name (full phrase or single-word)
_NAME_BLACKLIST_WORDS = (
    "education experience summary objective skills contact profile qualifications "
    "employment references certifications honors activities projects "
    "teamwork communication leadership organization professional "
    "professional summary "
    "pennsbury highschool management time linked school effective communication critical thinking".split()
)
NAME_BLACKLIST = frozenset(_NAME_BLACKLIST_WORDS + [
    "pennsbury highschool", "time management", "linked in", "effective communication", "critical thinking",
    "austin hall",
])
REJECT_WORDS_IN_NAME = frozenset(
    "university college coursework bachelor experience internship relevant expected graduation "
    "phone email linkedin http www teamwork profits revenue sales growth results "
    "solutions customer service quality improvement prediction well-educated finalized "
    "accuracy lease applicants pipeline engine "
    "academic writing osteopathic asbmb accredited whether "
    "introduction statistics calculus program employment "
    "one would resident assistant "
    "management time highschool pennsbury linked school effective communication critical thinking "
    "tampa hills page florida critical thinking".split()
)
# Canonical majors and keyword triggers - University of Tampa catalog (aligned with tracks + scoring).
# More specific entries first where one name contains another (e.g. Communication and Media Studies before Communication).
MAJOR_KEYWORDS: Dict[str, List[str]] = {
    # Pre-Health / Science (double major before single)
    "Biochemistry and Allied Health": ["biochemistry and allied health", "biochemistry and allied health (medical science)"],
    "Biochemistry": ["biochemistry"],
    "Biomedical Sciences": ["biomedical"],
    "Allied Health": ["allied health", "medical science", "occupational therapy sciences", "physical therapy sciences"],
    "Nursing": ["nursing", "bsn"],
    "Public Health": ["public health", "health promotion"],
    "Health Science": ["health science"],
    "Human Performance": ["human performance", "exercise physiology", "exercise and recreation"],
    "Art Therapy": ["art therapy"],
    # Pre-Law
    "Criminology and Criminal Justice": ["criminology and criminal justice", "criminal justice"],
    "Criminology": ["criminology"],
    "Law, Justice and Advocacy": ["law, justice and advocacy", "law justice and advocacy"],
    "Political Science": ["political science", "polisci"],
    "History & International Studies": ["history & international studies", "history and international studies"],
    "History": ["history"],
    "International Studies": ["international studies"],
    "Philosophy": ["philosophy"],
    # Tech
    "Mathematics with Computer Science": ["mathematics with computer science", "math with computer science", "math and computer science"],
    "Business Information Technology": ["business information technology", "business it"],
    "Management Information Systems": ["management information systems", "mis "],
    "Financial Enterprise Systems": ["financial enterprise systems", "financial services operations"],
    "Data Science": ["data science", "analytics"],
    "Computer Science": ["computer science", "software engineering", "computing", "cs "],
    "Cybersecurity": ["cybersecurity", "cyber security"],
    "Mathematics": ["mathematics", " math ", "math,", "math."],
    "Actuarial Science": ["actuarial science", "actuarial"],
    # Science
    "Marine Science": ["marine science", "marine science–biology", "marine science-biology"],
    "Marine Biology": ["marine biology"],
    "Marine Chemistry": ["marine chemistry"],
    "Environmental Studies": ["environmental studies", "environmental studies–", "sustainability"],
    "Environmental Science": ["environmental science", "environmental"],
    "Forensic Science": ["forensic science", "forensic"],
    "Biology": ["biology"],
    "Chemistry": ["chemistry", "chemistry-acs", "acs certified"],
    "Physics": ["physics"],
    "Psychology": ["psychology", "pre-medicine", "pre-med"],
    # Business
    "International Business & Marketing": ["international business & marketing", "international business and marketing"],
    "Marketing & Finance": ["marketing & finance", "marketing and finance", "marketing & finance minor", "bs in marketing & finance"],
    "International Business": ["international business", "international business & economics", "international business and economics"],
    "Sport Management": ["sport management", "sports management"],
    "Entrepreneurship": ["entrepreneurship"],
    "Finance": ["finance", "financial"],
    "Economics": ["economics"],
    "Accounting": ["accounting"],
    "Marketing": ["marketing", "international marketing"],
    "Business Management": ["business management"],
    "Management": ["management"],
    # Communications
    "Communication and Media Studies": ["communication and media studies", "media studies"],
    "Communication and Speech Studies": ["communication and speech studies", "speech studies"],
    "Advertising and Public Relations": ["advertising and public relations", "advertising", "public relations"],
    "Journalism": ["journalism"],
    "Communication": ["communication"],
    # Education
    "Elementary Education": ["elementary education", "education–elementary", "education elementary", "k-6"],
    "Music Education": ["music education", "music education (k-12)", "k-12 music"],
    "Secondary Education": ["secondary education", "education–secondary", "education - mathematics", "education mathematics", "secondary biology", "secondary mathematics", "secondary social science"],
    "Professional Education": ["professional education"],
    # Arts
    "Film and Media Arts": ["film and media arts", "film and media", "media arts"],
    "New Media": ["new media"],
    "Musical Theatre": ["musical theatre", "musical theater"],
    "Graphic Design": ["graphic design"],
    "Museum Studies": ["museum studies"],
    "Visual Arts": ["visual arts"],
    "Animation": ["animation"],
    "Art": ["art"],
    "Design": ["design"],
    "Dance": ["dance"],
    "Music Performance": ["music performance", "performance instrumental", "performance vocal"],
    "Music": ["music", "music–general", "music technology", "music–music technology"],
    "Theatre": ["theatre", "theater"],
    # Humanities
    "Liberal Studies": ["liberal studies", "bls", "bachelor of liberal studies"],
    "Applied Linguistics": ["applied linguistics", "linguistics"],
    "Writing": ["writing", "creative writing", "professional writing", "publishing"],
    "English": ["english"],
    "Sociology": ["sociology", "applied sociology"],
    "Spanish": ["spanish"],
}


def _is_short_continuation_line(line: str, bullet_chars: tuple) -> bool:
    """True if line looks like a fragment to merge (one–few words, not a bullet or heading)."""
    if not line or line[0] in bullet_chars:
        return False
    words = line.split()
    if len(words) > 4:
        return False
    if len(line) > 45:
        return False
    # All-caps short line might be a heading
    if line.isupper() and 1 <= len(words) <= 3:
        return False
    return True


def reflow_section_text(text: str) -> str:
    """
    Merge PDF artifact: one word or short phrase per line into readable sentences.
    Joins continuation lines with a space; keeps bullet points and real newlines.
    Standalone bullet-only lines (• ● - *) are merged with the next line.
    Second pass: merge any remaining consecutive short lines (stronger reflow).
    """
    if not text or not text.strip():
        return text
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    if not lines:
        return text.strip()
    bullet_chars = ("•", "\u2022", "\u00b7", "-", "*", "●")
    out: List[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Standalone bullet character → merge with next line as "• next line"
        if len(line) <= 2 and line in bullet_chars and i + 1 < len(lines):
            line = "• " + lines[i + 1]
            i += 1
        # Merge with following lines while they look like continuations
        while i + 1 < len(lines):
            next_ln = lines[i + 1]
            # Next line is a new bullet or new sentence (starts with bullet/cap after period)
            if next_ln and next_ln[0] in bullet_chars:
                break
            if next_ln and len(next_ln) >= 2 and next_ln[0].isupper() and next_ln[1] in ".)" and line.endswith((".", "!", "?")):
                break
            # Current line ends sentence or is long enough → don't merge
            if line.endswith((".", "!", "?", ":")) and len(line) > 20:
                break
            # Next line looks like a new heading (all caps, short)
            if len(next_ln) <= 30 and next_ln.isupper() and len(next_ln.split()) <= 4:
                break
            # Merge: continuation
            line = line + " " + next_ln
            i += 1
        out.append(line)
        i += 1
    # Stronger reflow: merge consecutive short lines that are clearly run-on fragments
    merged: List[str] = []
    j = 0
    while j < len(out):
        line = out[j]
        while j + 1 < len(out) and _is_short_continuation_line(out[j + 1], bullet_chars):
            next_ln = out[j + 1]
            # Don't merge if current line already ends a sentence and next starts with cap (new sentence)
            if line.endswith((".", "!", "?")) and next_ln and next_ln[0].isupper():
                break
            line = line + " " + next_ln
            j += 1
        merged.append(line)
        j += 1
    return "\n".join(merged)


def _inject_section_colon_newlines(text: str) -> str:
    """
    When PDF/Word yields "Education: ... Professional Experience: ..." on one or few lines
    (title case with colon), split so get_sections sees section headers on their own line.
    Only matches label + colon at word boundary to avoid splitting mid-sentence.
    """
    if not text or not text.strip():
        return text
    # Section labels that often appear as "Label:" in resumes (case-insensitive)
    labels = [
        "Education",
        "Professional Experience",
        "Work Experience",
        "Experience",
        "Skills",
        "Honors",
        "Projects",
        "Certifications",
        "Summary",
        "Objective",
        "Activities",
        "Leadership Experience",
        "Community Service",
        "Involvement",
        "References",
        "Relevant Experience",
        "Employment",
    ]
    result = text
    for label in labels:
        # Match " Label: " or "\nLabel: " or at start "^Label: " so header gets its own line
        pat = r"(\s|^)(" + re.escape(label) + r")\s*:\s*"
        result = re.sub(pat, r"\n\2:\n", result, flags=re.IGNORECASE)
    return result


def _inject_section_newlines(text: str) -> str:
    """
    When PDF yields one or few long lines, split on common section phrases
    so get_sections can detect EDUCATION, EXPERIENCE, etc.
    Only split when the phrase is ALL CAPS (avoids "profile views", "increased profile interaction").
    """
    if not text or (text.count("\n") >= 4):
        return text
    # Phrase must appear in ALL CAPS to be treated as section header (avoids mid-sentence "profile")
    phrases = [
        "EDUCATION",
        "PROFILE",
        "PROFESSIONAL EXPERIENCE",
        "WORK EXPERIENCE",
        "EXPERIENCE",
        "INVOLVEMENT",
        "SKILLS & ACTIVITIES",
        "SKILLS AND ACTIVITIES",
        "SKILLS",
        "SUMMARY",
        "OBJECTIVE",
        "PROJECTS",
        "CERTIFICATIONS",
        "HONORS",
        "ACTIVITIES",
        "RESEARCH EXPERIENCE",
        "RESEARCH",
        "LEADERSHIP EXPERIENCE",
        "VOLUNTEER EXPERIENCE",
        "RELEVANT COURSEWORK",
        "COURSEWORK",
        "PRESENTATIONS",
        "VOLUNTEER",
        "AWARDS & CERTIFICATIONS",
        "AWARDS AND CERTIFICATIONS",
        "PUBLICATIONS",
        "ADDITIONAL INFORMATION",
        "TECHNICAL SKILLS",
        "JOB EXPERIENCE",
    ]
    result = text
    for phrase in phrases:
        # Allow flexible spaces between words so "SKILLS  &  ACTIVITIES" matches
        parts = phrase.split()
        pat = r"\s+(" + r"\s+".join(re.escape(p) for p in parts) + r")\s+"
        # Don't split "SKILLS" when it's part of "SKILLS & ACTIVITIES" (already handled earlier in list)
        if phrase == "SKILLS":
            pat = r"\s+(SKILLS)(?!\s+(&|AND)\s+ACTIVITIES)\s+"
        # Don't split "ACTIVITIES" when it's part of "SKILLS & ACTIVITIES" (preceded by " & ")
        elif phrase == "ACTIVITIES":
            pat = r"\s+(?<! & )(ACTIVITIES)\s+"
        result = re.sub(
            pat,
            lambda m: "\n" + m.group(1) + "\n" if m.group(1).replace(" ", "").isupper() or m.group(1).isupper() else m.group(0),
            result,
        )
    return result


def normalize_resume_text(raw: str) -> str:
    """
    Normalize raw PDF/DOCX text for reliable parsing.
    - Unify line endings, collapse excessive spaces
    - Fix common PDF artifact: space between every character (e.g. "D a t a  S c i e n c e")
    """
    if not raw or not raw.strip():
        return ""
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    lines = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            lines.append("")
            continue
        # Collapse internal spaces
        line = re.sub(r"\s+", " ", line)
        words = line.split()
        fixed = []
        i = 0
        while i < len(words):
            w = words[i]
            # Collapse run of single digits: "2", "0", "7" -> "207" (PDF spacing artifact)
            if len(w) == 1 and w.isdigit() and i + 1 < len(words):
                run = [w]
                j = i + 1
                while j < len(words) and len(words[j]) == 1 and words[j].isdigit():
                    run.append(words[j])
                    j += 1
                if len(run) >= 2:
                    fixed.append("".join(run))
                    i = j
                    continue
            # Fix mid-word spaces from PDF (single letters): "B a c h e l o r" -> "Bachelor"
            if len(w) == 1 and w.isalpha() and i + 1 < len(words):
                run = [w]
                j = i + 1
                while j < len(words) and len(words[j]) == 1 and words[j].isalpha():
                    run.append(words[j])
                    j += 1
                if len(run) >= 3:
                    fixed.append("".join(run))
                    i = j
                    continue
            fixed.append(w)
            i += 1
        # Split glued words and fix spaced email
        line = " ".join(fixed)
        line = re.sub(r"Bachelorof\s+", "Bachelor of ", line, flags=re.IGNORECASE)
        line = re.sub(r"Bachelorof([A-Z])", r"Bachelor of \1", line)
        line = re.sub(r"(Minors|Minor)in([A-Z])", r"\1 in \2", line, flags=re.IGNORECASE)
        # "TheUniversityofTampa", "UniversityofTampa" -> "The University of Tampa", "University of Tampa"
        line = re.sub(r"TheUniversityof\s*", "The University of ", line, flags=re.IGNORECASE)
        line = re.sub(r"Universityof\s*", "University of ", line, flags=re.IGNORECASE)
        line = re.sub(r"\bHighschool\b", "High School", line, flags=re.IGNORECASE)
        line = re.sub(r"\bHighSchool\b", "High School", line)
        line = re.sub(r"([a-z])([A-Z])", r"\1 \2", line)
        line = re.sub(r"([A-Z]{2,})([A-Z][a-z])", r"\1 \2", line)  # "GPAX" -> "GPA X"
        # Don't split surname particles: Mc, Mac, De, Del, La, Le, O' (e.g. McLaughlin, DeLoe, O'Brien)
        line = re.sub(r"\b(Mc|Mac|De|Del|La|Le|O')\s+([A-Z]\w*)", r"\1\2", line)
        # Fix spaced email: "x 06 @ gmail . com" -> "x06@gmail.com"
        line = re.sub(r"(\w)\s+(\d+)\s*@\s*", r"\1\2@", line)
        line = re.sub(r"\s*\.\s*(com|edu|org|net)\b", r".\1", line, flags=re.IGNORECASE)
        lines.append(line)
    return "\n".join(lines)


def get_sections(normalized_text: str) -> Dict[str, str]:
    """
    Split resume into sections by common headers. Layout-agnostic.
    Returns dict: section_key_lower -> content (text until next section or end).
    Content is reflowed to fix PDF one-word-per-line artifacts.
    """
    if not normalized_text.strip():
        return {}
    # Always split on "Education:", "Professional Experience:", etc. (title case with colon)
    text = _inject_section_colon_newlines(normalized_text)
    # When text is one or few long lines, also split on ALL CAPS section phrases
    text = _inject_section_newlines(text)
    sections: Dict[str, str] = {}
    lines = text.split("\n")
    current_header: Optional[str] = None
    current_lines: List[str] = []

    def flush():
        nonlocal current_header, current_lines
        if current_header is not None and current_lines:
            key = current_header.lower().strip()
            key = re.sub(r"\s+", " ", key).rstrip(":")
            if key and key not in ("", " "):
                content = "\n".join(current_lines).strip()
                sections[key] = reflow_section_text(content)
        current_lines = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_lines:
                current_lines.append("")
            continue
        # Is this line a section header? (standalone, matches known headers or looks like one)
        lower = stripped.lower().rstrip(":").strip()
        # Exact or prefix match only if line is short (avoid "EXPERIENCE Student Coordinator April 2025..." as header)
        header_by_list = (
            lower in SECTION_HEADERS
            or (len(stripped) <= 45 and any(lower == h or lower.startswith(h + " ") for h in SECTION_HEADERS))
        )
        header_by_caps = len(stripped) < 35 and stripped.isupper() and 1 <= len(stripped.split()) <= 4
        is_header = header_by_list or header_by_caps
        # Don't treat short acronyms / state codes as section headers (GPA, FL, CITI, etc.)
        if is_header and len(stripped) <= 5 and stripped.isupper():
            token = lower.replace(" ", "").rstrip(":")
            if token in SECTION_HEADER_ACRONYM_BLACKLIST:
                is_header = False
        # Don't treat a clear person-name line as a section (e.g. "BRIDGET  E.  KLAUS")
        if is_header and len(stripped) < 35 and stripped.isupper():
            cleaned = _clean_line_for_name(stripped)
            if cleaned and _looks_like_name(cleaned):
                is_header = False
        # Don't treat date-range lines as section headers (e.g. "2024-PRESENT", "2025-PRESENT")
        if is_header and re.match(r"^\d{4}\s*[-–]\s*(?:PRESENT|CURRENT|\d{4})\s*$", stripped, re.IGNORECASE):
            is_header = False
        if is_header:
            flush()
            current_header = stripped.rstrip(":")
            current_lines = []
        else:
            if current_header is None:
                # Content before any section: treat as "header" / contact block
                current_header = "_top"
            current_lines.append(stripped)
    flush()
    return sections


# Trailing tokens to strip from a candidate name (location/artifact)
_NAME_TRAILING_ARTIFACTS = frozenset(
    "page hills forest smithield smithfield".split()
)


def _trim_trailing_name_artifact(candidate: str) -> str:
    """Strip trailing ' (', '(', and known location/artifact words (e.g. 'Forest Hills', 'Page')."""
    if not candidate or not candidate.strip():
        return candidate
    s = candidate.strip().rstrip(" (").strip()
    words = s.split()
    while len(words) >= 2:
        last = words[-1].lower().strip(".")
        if last in _NAME_TRAILING_ARTIFACTS:
            words.pop()
            s = " ".join(words)
            continue
        if len(words) >= 2 and (words[-2] + " " + words[-1]).lower() == "forest hills":
            words = words[:-2]
            s = " ".join(words)
            continue
        break
    return " ".join(words).strip() if words else candidate.strip()


def _clean_line_for_name(line: str) -> str:
    """Remove contact info from a line to get a possible name."""
    for sep in ["|", "\u2022", "\u00b7", "•"]:
        line = line.split(sep)[0].strip()
    line = re.sub(r"\S+@\S+\.\S+", "", line)
    line = re.sub(r"https?://\S+|www\.\S+|linkedin\.com/\S*|linkedin|github", "", line, flags=re.IGNORECASE)
    line = re.sub(r"[\d\s\-\.\(\)]{7,}", " ", line)
    line = re.sub(r"\(?\d{3}\)?\s*\-?\s*\d{3}\s*\-?\s*\d{4}", "", line)
    line = re.sub(r"[A-Za-z\s]+,\s*[A-Z]{2}\b", "", line)
    return re.sub(r"\s+", " ", line).strip()


def _looks_like_name(name: str) -> bool:
    if not name or len(name) < 3 or len(name) > 50:
        return False
    # Reject section headers / bracket labels (e.g. "[PROFESSIONAL EXPERIENCE]")
    s = name.strip()
    if s.startswith("[") or s.endswith("]") or (s.startswith("[") and "]" in s):
        return False
    if s.isupper() and any(
        x in s for x in ("EXPERIENCE", "EDUCATION", "SUMMARY", "OBJECTIVE", "SKILLS", "CONTACT", "PROFILE")
    ):
        return False
    # Reject incomplete / filename artifacts (trailing hyphen)
    if name.rstrip().endswith("-"):
        return False
    # Reject degree/line labels (e.g. "B.s. In Biochemistry Asbmb-accredited")
    lower = name.lower()
    if re.search(r"\bb\.?s\.?\b|\bb\.?a\.?\b|asbmb|accredited\b|bachelor\b|degree\s+in\b", lower):
        return False
    name = name[:50].rstrip(" |\u2022\u00b7,-")
    words = name.split()
    # Require at least 2 words (First Last); single words like "Teamwork" are section/skill labels
    if len(words) < 2 or len(words) > 4:
        return False
    # Reject if any word ends with hyphen (incomplete token)
    if any(w.endswith("-") for w in words):
        return False
    # Reject 3-word name where last word is 2 letters (likely truncation: "Yumna Sweid Ap" -> "Applied")
    if len(words) == 3:
        last = words[-1].strip(".").lower()
        if len(last) == 2 and last not in ("jr", "sr", "ii", "iv", "ph", "md"):
            return False
    # Reject single-letter "names" like "T H" (PDF artifact or initials only)
    if len(words) >= 2 and all(len(w.strip(".")) <= 1 for w in words):
        return False
    # At least one word must be 2+ letters (real name, not "T H" or "A B")
    if not any(len(w.strip(".")) >= 2 for w in words):
        return False
    lower = name.lower()
    if lower in NAME_BLACKLIST:
        return False
    if any(w in lower for w in REJECT_WORDS_IN_NAME):
        return False
    for w in words:
        if not w:
            return False
        cleaned = w.strip(".")
        if not cleaned.replace(".", "").replace("-", "").isalpha():
            return False
    return True


def _standardize_name(name: str) -> str:
    """Title-case name; preserve surname particles (Mc, Mac, De, Del, La, Le, O') so DeLoe, McLaughlin stay intact."""
    if not name or not name.strip():
        return name
    words = name.strip().split()
    result = []
    for w in words:
        if len(w) == 1 or (len(w) == 2 and w.endswith(".")):
            result.append(w.upper())
        else:
            m = re.match(r"^(Mc|Mac|De|Del|La|Le|O')([A-Za-z]+)$", w, re.IGNORECASE)
            if m and m.group(2):
                part1, rest = m.group(1), m.group(2)
                part1 = part1[0].upper() + part1[1:].lower() if len(part1) > 1 else part1.upper()
                rest = rest[0].upper() + rest[1:].lower() if rest else ""
                result.append(part1 + rest)
            else:
                result.append(w.capitalize())
    return " ".join(result)


def _collapse_spaced_letters(text: str) -> str:
    """
    Collapse space-separated single letters into words (e.g. "s y d n e y   r o u x" -> "sydney roux").
    Handles PDFs where the name is visually spaced for layout.
    """
    if not text or not text.strip():
        return text
    tokens = text.strip().split()
    result = []
    current_word = []
    for t in tokens:
        t_clean = t.strip(".").lower()
        if len(t_clean) == 1 and t_clean.isalpha():
            current_word.append(t_clean)
        else:
            if current_word:
                result.append("".join(current_word))
                current_word = []
            result.append(t_clean)
    if current_word:
        result.append("".join(current_word))
    return " ".join(result)


def _name_appears_in_source(name: str, source_text: str) -> bool:
    """
    Source verification: require the name (or its tokens in order) to appear in the document.
    Normalizes and checks substrings so "Bridget E. Klaus" matches "BRIDGET  E.  KLAUS" in PDF text.
    Also tries source with spaced letters collapsed (e.g. "s y d n e y" -> "sydney") for layout-heavy PDFs.
    """
    if not name or not source_text:
        return False
    name_words = name.strip().split()
    if not name_words:
        return False
    norm = re.sub(r"\s+", " ", source_text.lower().strip())
    collapsed = _collapse_spaced_letters(norm)
    for search in (norm, collapsed):
        if not search:
            continue
        pos = 0
        ok = True
        for w in name_words:
            w_clean = w.strip(".").lower()
            if not w_clean:
                continue
            idx = search.find(w_clean, pos)
            if idx == -1:
                ok = False
                break
            pos = idx + len(w_clean)
        if ok:
            return True
    return False


def extract_name(
    normalized_text: str,
    filename: Optional[str] = None,
    sections: Optional[Dict[str, str]] = None,
) -> str:
    """
    Multi-strategy name extraction. Tolerant of:
    - First line being a section header (EDUCATION, etc.)
    - Name + contact on one line
    - Name split across two lines (e.g. FIRST\nLAST)
    - No name in text -> filename fallback
    Section-scoped: when sections is provided, only consider lines from _top (content before first header).
    Source verification: reject any candidate whose tokens do not appear in the name zone (stops hallucinated names).
    """
    if not normalized_text.strip() and not filename:
        return "Unknown"
    all_lines = [ln.strip() for ln in normalized_text.strip().split("\n") if ln.strip()][:25]
    if not all_lines:
        return _name_from_filename(filename) if filename else "Unknown"

    # Section-scoped: restrict to _top only when available so we don't pick "Biology" or a section header as name
    if sections and sections.get("_top", "").strip():
        top_text = sections["_top"].strip()
        lines = [ln.strip() for ln in top_text.split("\n") if ln.strip()][:15]
    else:
        lines = all_lines[:15]
    # Skip leading bracket or label lines (e.g. "[CONTACT / TOP]", "CONTACT")
    while lines and (
        re.match(r"^\[.+\]$", lines[0].strip())
        or lines[0].strip().upper() in ("CONTACT", "CONTACT / TOP", "CONTACT/TOP")
    ):
        lines = lines[1:]
    # Never consider bracket lines or all-caps section headers as name (e.g. "[PROFESSIONAL EXPERIENCE]")
    def _is_section_line(ln: str) -> bool:
        s = ln.strip()
        if re.match(r"^\[.+\]$", s):
            return True
        if s.isupper() and any(x in s for x in ("EXPERIENCE", "EDUCATION", "SUMMARY", "OBJECTIVE", "SKILLS", "CONTACT", "PROFILE")):
            return True
        return False
    lines = [ln for ln in lines if not _is_section_line(ln)]
    # If _top was all section headers, fall back to filtered all_lines so we can still find a name
    if not lines:
        lines = [ln for ln in all_lines[:15] if not _is_section_line(ln)]
    name_search_text = "\n".join(lines) if lines else "\n".join(all_lines[:10])

    def _verified(candidate: str) -> Optional[str]:
        if not candidate:
            return None
        # Hard reject: never accept section headers (bracket lines or all-caps EXPERIENCE/EDUCATION/...)
        c = candidate.strip()
        if c.startswith("[") or c.endswith("]"):
            return None
        if c.isupper() and any(x in c for x in ("EXPERIENCE", "EDUCATION", "SUMMARY", "OBJECTIVE", "SKILLS", "CONTACT", "PROFILE")):
            return None
        # Strip trailing " (", location words (Forest Hills, Page, etc.)
        candidate = _trim_trailing_name_artifact(candidate)
        if not candidate or not _looks_like_name(candidate):
            return None
        if not _name_appears_in_source(candidate, name_search_text):
            return None
        return _standardize_name(candidate)

    # Strategy -0.5: Explicit "Name: ..." line in contact/top (structured resume or corrected file)
    for line in lines[:10]:
        stripped = line.strip()
        if re.match(r"^Name\s*:\s*.+", stripped, re.IGNORECASE):
            candidate = re.sub(r"^Name\s*:\s*", "", stripped, flags=re.IGNORECASE).strip()
            if candidate and _looks_like_name(candidate):
                return _standardize_name(candidate)

    # Strategy 0.5: First line ends with initial (e.g. "Christopher M."); next line is surname (run before Strategy 0)
    if len(lines) >= 2:
        first_cleaned = _clean_line_for_name(lines[0])
        second_cleaned = _clean_line_for_name(lines[1])
        if first_cleaned and second_cleaned:
            first_words = first_cleaned.split()
            # Ends with single letter or "M." style initial
            if len(first_words) >= 2 and len(second_cleaned.split()) == 1 and second_cleaned.isalpha() and len(second_cleaned) >= 2:
                last_first = first_words[-1].strip(".")
                if len(last_first) <= 2:
                    combined = f"{first_cleaned} {second_cleaned}"
                    if 4 <= len(combined) <= 45:
                        out = _verified(combined)
                        if out:
                            return out

    # Strategy 0: First line - use first 2-3 words (middle initial -> take 3: "Kate M. Hicks")
    if lines:
        first_cleaned = _clean_line_for_name(lines[0])
        if first_cleaned:
            words = first_cleaned.split()
            for n in (3, 2):
                if len(words) >= n:
                    candidate = " ".join(words[:n])
                    out = _verified(candidate)
                    if out:
                        return out
        # If first line is a section header (no name at top), prefer filename when available
        first_upper = lines[0].strip().upper()
        section_headers = (
            "EDUCATION", "ACADEMIC", "EXPERIENCE", "EMPLOYMENT", "SUMMARY", "OBJECTIVE", "CONTACT",
            "PROFILE", "CAREER", "SKILLS", "QUALIFICATIONS", "PERSONAL", "OVERVIEW",
        )
        if first_upper in section_headers and filename:
            return _name_from_filename(filename)

    # Strategy 1: First line after cleaning contact info
    for line in lines[:5]:
        cleaned = _clean_line_for_name(line)
        out = _verified(cleaned)
        if out:
            return out

    # Strategy 2: Two-line merge (e.g. "VIR" + "SHAH" or "HUNTUR" + "BROCKENBROUGH")
    for i in range(min(len(lines) - 1, 6)):
        first = _clean_line_for_name(lines[i])
        second = _clean_line_for_name(lines[i + 1])
        if not first or not second:
            continue
        if " " not in first and " " not in second and first.isalpha() and second.isalpha():
            combined = f"{first} {second}"
            if 4 <= len(combined) <= 35:
                out = _verified(combined)
                if out:
                    return out

    # Strategy 2.5: Spaced-letter lines (e.g. "R O U X" / "S Y D N E Y" -> "Sydney Roux")
    collapsed_search = _collapse_spaced_letters(name_search_text)
    if collapsed_search != name_search_text:
        parts = collapsed_search.split()
        if 2 <= len(parts) <= 4 and all(2 <= len(p) <= 20 and p.isalpha() for p in parts):
            # Try both orders; prefer reversed so "Sydney Roux" (first last) wins over "Roux Sydney"
            for candidate in (" ".join(reversed(parts)), " ".join(parts)):
                if 4 <= len(candidate) <= 35:
                    out = _verified(candidate)
                    if out:
                        return out

    # Strategy 3: Any line in name zone that looks like a name (e.g. "Bridget E. Klaus")
    for line in lines[:20]:
        cleaned = _clean_line_for_name(line)
        out = _verified(cleaned)
        if out:
            return out

    # Strategy 4: Exactly two words (each 2+ letters) in first 5 lines (common name format)
    for line in lines[:5]:
        cleaned = _clean_line_for_name(line)
        if not cleaned or len(cleaned) > 40:
            continue
        words = cleaned.split()
        if len(words) == 2 and len(words[0]) >= 2 and len(words[1]) >= 2:
            if words[0].isalpha() and words[1].isalpha():
                if words[0].lower() in REJECT_WORDS_IN_NAME or words[1].lower() in REJECT_WORDS_IN_NAME:
                    continue
                combined = f"{words[0]} {words[1]}"
                if combined.lower() not in NAME_BLACKLIST:
                    out = _verified(combined)
                    if out:
                        return out

    if filename:
        return _name_from_filename(filename)
    return "Unknown"


def _name_from_filename(filename: str) -> str:
    if not filename or not filename.strip():
        return "Unknown"
    base = os.path.basename(filename).strip()
    base, _ = os.path.splitext(base)
    if base.lower().endswith(".docx"):
        base, _ = os.path.splitext(base)
    base = base.replace("_", " ").replace("-", " ")
    base = re.sub(r"\s*\(\d+\)\s*$", "", base)
    base = re.sub(r"\b(resume|résumé|cv)\b", "", base, flags=re.IGNORECASE)
    # Drop generic copy/version tokens so "Resume copy 2" doesn't become a name.
    base = re.sub(r"\bcopy\b", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\b\d+\b", "", base)
    base = re.sub(r"\s+", " ", base).strip()
    if not base or len(base) < 2:
        return "Unknown"
    # "Victoria Logan" from "VictoriaLogan Resume" - insert space before mid-word capital
    if " " not in base and len(base) > 3 and base[0].isupper():
        for i in range(1, len(base) - 1):
            if base[i].isupper():
                base = base[:i] + " " + base[i:]
                break
    return _standardize_name(base[:50].strip())


def _map_to_canonical_major(raw: str) -> Optional[str]:
    if not raw or len(raw.strip()) < 2:
        return None
    # Normalize spaces so "international  business  &  economics" matches "international business"
    lower = re.sub(r"\s+", " ", raw.lower().strip())
    for canonical, keywords in MAJOR_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return canonical
    return None


# Captured "major" that are actually date/role/skill/place words (e.g. "Present", "profits", "europe")
MAJOR_REJECT = frozenset(
    "present current ongoing today expected graduation january february march april may june "
    "july august september october november december jan feb mar apr jun jul aug sep oct nov dec "
    "to from and or the a an profits profit revenue sales growth teamwork communication leadership "
    "organization service quality results solutions customer improvement europe asia africa america "
    "global international region regional local national world linkedin".split()
)
# Substrings that indicate the capture is NOT a major (e.g. activity/role text)
MAJOR_PHRASE_REJECT = frozenset(
    "campus service outreach student volunteer center program development "
    "management leadership activities involvement office assistant coordinator "
    "affairs engagement diversity inclusion".split()
)
# Freeform major only accepted if it contains a degree-like word (rejects "europe", "profits", etc.)
DEGREE_LIKE_WORDS = frozenset(
    "science arts studies engineering education relations administration "
    "psychology biology chemistry mathematics business".split()
)


def _extract_major_from_text(search_lower: str) -> Optional[str]:
    """Run pattern + keyword scan on a single search string. Returns canonical major or None."""
    # Allow graduation date after major (e.g. "Cybersecurity May 2027") so we prefer B.S. in X over "Minor in Y"
    _date_suffix = r"(?:\s+(?:may|january|february|march|april|june|july|august|september|october|november|december)\s+\d{4}|\s+\d{4}|\s*[|\-\n]|\s+expected|\s+graduation|\s*\(|$)"
    patterns = [
        r"(?:bachelor(?:'s)?|b\.?s\.?|b\.?a\.?|bachelors?)\s+of\s+(?:science|arts)\s+in\s+([a-z][a-z\s&\-]{2,50}?)" + _date_suffix,
        r"bachelor\s+of\s+business\s*:\s*([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|\s+may|\s+expected|\s*\(|$)",
        r"(?:b\.?s\.?|b\.?a\.?|bs|ba)\s+in\s+([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|\s+minor|\s+expected|\s*\(|$)",
        r"pursuing\s+(?:a\s+)?(?:b\.?s\.?|b\.?a\.?|bachelor)[\s\w]*?\s+in\s+([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|\s+expected|\s*\(|$)",
        r"major[:\s]+([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|$)",
        r"degree\s+in\s+([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|$)",
        r"concentration[s]?[:\s]+([a-z][a-z\s&\-]{2,40}?)(?:\s*[|\-\n]|$)",
        r"([a-z][a-z\s&\-]{2,40}?)\s*(?:b\.?s\.?|b\.?a\.?|bachelors?\s+of\s+science)\s*(?:\)|,|\n|$)",
        r"(?:in|–|-)\s+([a-z][a-z\s&\-]{2,50}?)(?:\s*[|\-\n]|\s+expected|\s+graduation|\s+present|\s+current|$)",
        r"([a-z][a-z\s&\-]{2,40}?)\s*bachelors?\s+of\s+science",
    ]
    for pat in patterns:
        for m in re.finditer(pat, search_lower, re.IGNORECASE):
            candidate = m.group(1).strip()
            if len(candidate) < 3 or re.match(r"^[\d.\s]+$", candidate):
                continue
            if candidate.lower() in MAJOR_REJECT:
                continue
            c_lower = candidate.lower()
            if "linkedin" in c_lower:
                continue
            if len(candidate) > 35 and " " not in candidate:
                continue
            if any(phrase in c_lower for phrase in MAJOR_PHRASE_REJECT):
                continue
            canonical = _map_to_canonical_major(candidate)
            if canonical:
                # Prefer "International Business & Marketing" when both appear in text
                if canonical == "International Business" and ("& marketing" in search_lower or "and marketing" in search_lower):
                    return "International Business & Marketing"
                return canonical
            word_count = len(candidate.split())
            if word_count < 2 or len(candidate) > 35 or word_count > 4:
                continue
            if not re.match(r"^[a-z\s&\-]+$", candidate, re.I):
                continue
            if not set(c_lower.split()) & DEGREE_LIKE_WORDS:
                continue
            if "linkedin" in c_lower:
                continue
            return candidate.title()

    # Normalize spaces so "international  business  &  economics" matches "international business & economics"
    search_normalized = re.sub(r"\s+", " ", search_lower)
    for canonical, keywords in MAJOR_KEYWORDS.items():
        if any(kw in search_normalized for kw in keywords):
            if "linkedin" in canonical.lower():
                continue
            if canonical == "International Business" and ("& marketing" in search_normalized or "and marketing" in search_normalized):
                return "International Business & Marketing"
            return canonical
    return None


def _major_appears_in_source(major: str, source_text: str) -> bool:
    """
    Source verification: major (canonical or freeform) must appear in the document.
    For canonical majors, check that at least one keyword appears; for freeform, check substring.
    Spaces are normalized so "international  business  &  economics" matches "international business".
    """
    if not major or not source_text:
        return False
    source_lower = re.sub(r"\s+", " ", source_text.lower())
    if major in MAJOR_KEYWORDS:
        return any(kw in source_lower for kw in MAJOR_KEYWORDS[major])
    return major.lower() in source_lower


def extract_major(normalized_text: str, education_block: str) -> str:
    """
    Extract canonical major from education block first, then degree zone (first ~1200 chars), then full-text.
    Education/degree zone priority avoids picking "Computer Science" or "Data Science" from body when degree is "International Business & Economics".
    Source verification: reject any major whose keyword/string does not appear in the verified zone.
    When no education block is found, search a larger head of the doc so "bachelor"/"major" in raw still yield a major.
    """
    edu_lower = (education_block or "").lower()
    head_len = 4000 if not education_block else 2500
    search = (education_block + "\n" + normalized_text[:head_len]) if education_block else normalized_text[:head_len]
    search_lower = search.lower()
    search_normalized = re.sub(r"\s+", " ", search_lower)

    # 1) Education block only - so "B.S. in Business Management" wins over "analytics" in summary
    if education_block:
        major = _extract_major_from_text(re.sub(r"\s+", " ", edu_lower))
        if major and _major_appears_in_source(major, education_block):
            return major

    # 2) Degree zone (first ~1200 chars when no edu block, else ~800) - degree line usually at start
    DEGREE_ZONE_LEN = 1200 if not education_block else 800
    degree_zone = search_normalized[:DEGREE_ZONE_LEN] if len(search_normalized) > DEGREE_ZONE_LEN else search_normalized
    major = _extract_major_from_text(degree_zone)
    if major and _major_appears_in_source(major, degree_zone):
        return major

    # 3) Full search (patterns + keyword scan)
    major = _extract_major_from_text(search_lower)
    if not major:
        return "Unknown"
    # When we have an education block, require major to appear there (avoid pulling from Experience/Summary)
    verify_zone = education_block if education_block else normalized_text[:head_len]
    if not _major_appears_in_source(major, verify_zone):
        return "Unknown"
    return major


# Plausible US GPA range: avoid accepting 1.7 from "1.7%" or 0.5 from body text.
_GPA_MIN = 2.0
_GPA_MAX = 4.0


def extract_gpa(normalized_text: str, education_block: str) -> Optional[float]:
    """Extract GPA from education block or full text. Only accepts values in plausible range (2.0-4.0)
    and rejects numbers that are clearly percentages (e.g. followed by %)."""
    search = (education_block + " " + normalized_text[:2000]) if education_block else normalized_text[:2000]
    # 1) Explicit GPA label - must be in plausible range
    m = re.search(r"(?:gpa|grade point average|cumulative)[:\s]*([0-4]\.\d{2})", search, re.IGNORECASE)
    if m:
        try:
            v = float(m.group(1))
            if _GPA_MIN <= v <= _GPA_MAX:
                return v
        except ValueError:
            pass
    # 2) Number with optional "/ 4.0" or "gpa" - reject if followed by % (e.g. "1.7%" from body)
    m = re.search(r"([0-4]\.\d{1,2})(?!\s*%)\s*(?:/\s*4\.0|\s*gpa)?", search, re.IGNORECASE)
    if m:
        try:
            v = float(m.group(1))
            if _GPA_MIN <= v <= _GPA_MAX:
                return v
        except ValueError:
            pass
    return None


def get_education_block(sections: Dict[str, str], normalized_text: str) -> str:
    """Get concatenated education section content from sections or by scanning for 'education' near 'university'."""
    _degree_signals = ("bachelor", "b.s.", "b.a.", "degree", "major", "university", "gpa", "graduation", "expected")
    for key in ("education", "academic", "academics", "qualifications"):
        if key in sections and sections[key].strip():
            return sections[key].strip()
    # Use _top when it contains degree signals (education sometimes appears in contact/top block)
    if "_top" in sections:
        top = sections["_top"].strip()
        if top and any(x in top.lower() for x in _degree_signals):
            return top
    # Fallback: find block that contains "education"/"academic" and degree-like keywords
    lines = normalized_text.split("\n")
    for i, line in enumerate(lines):
        if "education" in line.lower() or "academic" in line.lower():
            block = "\n".join(lines[i : i + 12])
            if any(x in block.lower() for x in _degree_signals):
                return block
    # Last resort: first 1200 chars if they contain degree signals (captures inline education)
    head = normalized_text[:1200].strip()
    if head and any(x in head.lower() for x in _degree_signals):
        return head
    return ""


def validate_parse(parsed: ParsedResume, normalized_text: str) -> Tuple[bool, List[str]]:
    """
    Lightweight validator: name/major/GPA must pass sanity checks.
    Returns (ok, list of issue descriptions). Used for one-shot correction before return.
    """
    issues: List[str] = []
    # Name: 2-4 words, not a sentence/header, no email
    name = (parsed.name or "").strip()
    if name and name != "Unknown":
        if "@" in name or ".com" in name:
            issues.append("name_looks_like_contact")
        elif any(w in name.lower() for w in ("prediction", "well-educated", "introduction", "summary", "education", "experience")):
            issues.append("name_looks_like_header")
        else:
            words = name.split()
            if len(words) < 2 or len(words) > 4:
                issues.append("name_bad_word_count")
            elif not _looks_like_name(name):
                issues.append("name_fails_heuristic")
    # Major: Unknown or canonical/freeform; reject obvious garbage
    major = (parsed.major or "").strip()
    if major and major != "Unknown":
        low = major.lower()
        if low in MAJOR_REJECT or any(phrase in low for phrase in MAJOR_PHRASE_REJECT):
            issues.append("major_looks_like_garbage")
        elif len(major) > 50:
            issues.append("major_too_long")
    # GPA: None or in range
    if parsed.gpa is not None and (parsed.gpa < 0 or parsed.gpa > 4.5):
        issues.append("gpa_out_of_range")
    return (len(issues) == 0, issues)


def parse_resume(
    raw_text: str,
    filename: Optional[str] = None,
) -> ParsedResume:
    """
    Single entry point: normalize, section, extract name/major/GPA.
    Validate once; if issues, apply one round of corrections (filename for name, Unknown for bad major).
    """
    normalized = normalize_resume_text(raw_text)
    sections = get_sections(normalized)
    education_block = get_education_block(sections, normalized)
    name = extract_name(normalized, filename=filename, sections=sections)
    # Final guard: never keep a section header as name (e.g. "[PROFESSIONAL EXPERIENCE]" from odd PDF layout)
    n = (name or "").strip()
    if n and (
        "[" in n or "]" in n
        or (n.isupper() and any(x in n for x in ("EXPERIENCE", "EDUCATION", "SUMMARY", "OBJECTIVE", "SKILLS", "CONTACT", "PROFILE")))
    ):
        name = _name_from_filename(filename) if filename else "Unknown"
    major = extract_major(normalized, education_block)
    gpa = extract_gpa(normalized, education_block)
    parsed = ParsedResume(
        name=name,
        major=major,
        gpa=gpa,
        education_block=education_block,
        sections=sections,
        normalized_text=normalized,
    )
    ok, issues = validate_parse(parsed, normalized)
    if not ok:
        # One retry: correct name or major from validation feedback
        name_fix = parsed.name
        major_fix = parsed.major
        if any(i.startswith("name_") for i in issues) and filename:
            name_fix = _name_from_filename(filename)
        if any(i.startswith("major_") for i in issues):
            major_fix = "Unknown"
        if name_fix != parsed.name or major_fix != parsed.major:
            parsed = ParsedResume(
                name=name_fix,
                major=major_fix,
                gpa=parsed.gpa,
                education_block=parsed.education_block,
                sections=parsed.sections,
                normalized_text=parsed.normalized_text,
            )
    return parsed
