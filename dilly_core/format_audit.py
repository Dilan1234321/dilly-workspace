"""
Format audit: compare pure_resumes (raw PDF text) to parsed_resumes (MTS gold standard)
to find orphaned data: wrong section or duplicated content.

File pairing: pure_resumes/pure_{email}.txt <-> parsed_resumes/{email}.txt
"""

import os
import re
from typing import Dict, List, Optional, Tuple

# Section headers in parsed files: [CONTACT / TOP], [EDUCATION], etc.
_SECTION_HEADER = re.compile(r"^\[([^\]]+)\]\s*$")

# Experience-like: date range, Company/Role/Description labels, job verbs
_RE_DATE_RANGE = re.compile(
    r"(?:\d{4}\s*[–\-]\s*(?:Present|Current|\d{4})|"
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\s*[–\-])",
    re.IGNORECASE,
)
_EXPERIENCE_KEYWORDS = re.compile(
    r"\b(Company|Role|Description|Director|Coordinator|Volunteer|Hostess|Receptionist|"
    r"Organiz(e|ing)|Collaborat(e|es|ing)|Lead(ship)?|Manage(s|ment)?|Responsible for)\b",
    re.IGNORECASE,
)
_EDUCATION_KEYWORDS = re.compile(
    r"\b(University|Major|Minor|GPA|Dean's List|Bachelor|B\.?S\.?|B\.?A\.?|Graduation|Honors?|Phi Eta Sigma)\b",
    re.IGNORECASE,
)
_SKILLS_LIKE = re.compile(
    r"^(Teamwork|Leadership|Communication|Time Management|Critical Thinking|"
    r"Effective Communication|Organization|Problem[- ]Solving)\s*$",
    re.IGNORECASE,
)


def _normalize(s: str) -> str:
    """Normalize for comparison: strip bullets, collapse whitespace, strip N/A."""
    if not s or not s.strip():
        return ""
    s = s.strip()
    for bullet in ("•", "\u2022", "\u00b7", "-", "*"):
        if s.startswith(bullet):
            s = s[len(bullet) :].strip()
            break
    s = re.sub(r"\s+", " ", s)
    if s.upper() in ("N/A", "NA", ""):
        return ""
    return s.strip()


def _section_key(label: str) -> str:
    """Normalize section label for grouping (e.g. 'CONTACT / TOP' -> 'contact')."""
    key = label.strip().lower()
    key = re.sub(r"\s+", " ", key)
    return key


# Canonical section types for heuristics
_EXPERIENCE_SECTIONS = frozenset(
    "professional experience work experience employment experience "
    "campus involvement volunteer experience research".split()
)
_EDUCATION_SECTIONS = frozenset("education academic academics".split())
_SKILLS_SECTIONS = frozenset("skills technical skills core competencies".split())
_HONORS_SECTIONS = frozenset("honors awards certifications".split())
_CONTACT_SECTIONS = frozenset("contact contact / top contact/top".split())


def _looks_like_experience(phrase: str) -> bool:
    if not phrase or len(phrase) < 10:
        return False
    if _RE_DATE_RANGE.search(phrase):
        return True
    if _EXPERIENCE_KEYWORDS.search(phrase):
        return True
    # Long description sentence
    if len(phrase) > 60 and re.search(r"\b(organiz|collaborat|coordinat|facilitat|provid|assist|participat)\w*\b", phrase, re.IGNORECASE):
        return True
    return False


def _looks_like_education(phrase: str) -> bool:
    if not phrase:
        return False
    if _EDUCATION_KEYWORDS.search(phrase):
        return True
    if re.search(r"\b(Expected\s+)?(May|December|Dec)\s+\d{4}\b", phrase, re.IGNORECASE):
        return True
    return False


def _looks_like_skill_line(phrase: str) -> bool:
    """Short line that looks like a skill (Teamwork, Leadership, etc.)."""
    p = _normalize(phrase)
    if not p or len(p) > 60:
        return False
    if _SKILLS_LIKE.match(p):
        return True
    # Short bullet, no date, no Company/Role
    if len(p) < 50 and not _RE_DATE_RANGE.search(p) and "Company" not in p and "Role" not in p:
        if re.match(r"^[A-Za-z\s\-&]+$", p) and len(p.split()) <= 5:
            return True
    return False


def _looks_like_honors(phrase: str) -> bool:
    if not phrase:
        return False
    lower = phrase.lower()
    if "dean's list" in lower or "honor society" in lower or "phi eta sigma" in lower:
        return True
    if re.search(r"dean['\u2019]s\s+list\s+\w+\s+\d{4}", phrase, re.IGNORECASE):
        return True
    return False


def parse_parsed_into_sections(content: str) -> Dict[str, str]:
    """
    Split parsed resume text into sections by [SECTION LABEL] headers.
    Returns dict: section_key -> section body (text).
    """
    sections: Dict[str, str] = {}
    lines = content.split("\n")
    current_label: Optional[str] = None
    current_lines: List[str] = []

    for line in lines:
        m = _SECTION_HEADER.match(line.strip())
        if m:
            if current_label is not None:
                body = "\n".join(current_lines).strip()
                if body:
                    key = _section_key(current_label)
                    # Allow duplicate section labels (e.g. two PROFESSIONAL EXPERIENCE blocks): append
                    if key in sections:
                        sections[key] = sections[key] + "\n\n" + body
                    else:
                        sections[key] = body
            current_label = m.group(1)
            current_lines = []
        else:
            if current_label is None and line.strip():
                current_label = "_top"
            if current_label is not None:
                current_lines.append(line)

    if current_label is not None:
        body = "\n".join(current_lines).strip()
        if body:
            key = _section_key(current_label)
            if key in sections:
                sections[key] = sections[key] + "\n\n" + body
            else:
                sections[key] = body

    return sections


def _meaningful_phrases(text: str, min_len: int = 15) -> List[str]:
    """Split text into lines/phrases, normalized, that are substantial."""
    out = []
    for line in text.split("\n"):
        n = _normalize(line)
        if not n or len(n) < min_len:
            continue
        # Skip pure labels
        if re.match(r"^(Company|Role|Date|Location|Description|University|Major|Minor|GPA|Honors|Graduation)\s*:\s*$", n, re.IGNORECASE):
            continue
        out.append(n)
    return out


def _find_wrong_section_issues(
    pure_text: str,
    parsed_sections: Dict[str, str],
    email: str,
) -> List[Dict]:
    """
    For phrases that appear in pure and in parsed, check if the section they appear in
    is appropriate. Flag when experience-like text is in education/skills or vice versa.
    """
    issues: List[Dict] = []
    pure_phrases = _meaningful_phrases(pure_text, min_len=10)
    # Map: normalized pure phrase -> set of section_keys where it appears in parsed
    phrase_to_sections: Dict[str, set] = {}
    for section_key, body in parsed_sections.items():
        for line in body.split("\n"):
            n = _normalize(line)
            if not n or len(n) < 10:
                continue
            for p in pure_phrases:
                pn = _normalize(p)
                if not pn:
                    continue
                if pn == n or (len(pn) > 20 and (pn in n or n in pn)):
                    phrase_to_sections.setdefault(pn, set()).add(section_key)

    for phrase in pure_phrases:
        n = _normalize(phrase)
        if not n or n not in phrase_to_sections:
            continue
        for section_key in phrase_to_sections[n]:
            if _looks_like_experience(phrase) and (
                section_key in _EDUCATION_SECTIONS or section_key in _SKILLS_SECTIONS
            ):
                issues.append({
                        "file": email,
                        "issue_type": "wrong_section",
                        "snippet": phrase[:200],
                        "section": section_key,
                        "detail": "Experience-like content in non-experience section (education/skills).",
                    })
            elif _looks_like_education(phrase):
                if section_key in _EXPERIENCE_SECTIONS and "education" not in section_key:
                    issues.append({
                        "file": email,
                        "issue_type": "wrong_section",
                        "snippet": phrase[:200],
                        "section": section_key,
                        "detail": "Education-like content in experience section.",
                    })
            elif _looks_like_honors(phrase):
                if section_key in _EXPERIENCE_SECTIONS:
                    issues.append({
                        "file": email,
                        "issue_type": "wrong_section",
                        "snippet": phrase[:200],
                        "section": section_key,
                        "detail": "Honors-like content in experience section.",
                    })

    return issues


def _find_duplicated_issues(parsed_sections: Dict[str, str], email: str) -> List[Dict]:
    """
    Find content that appears in more than one section (normalized).
    """
    issues: List[Dict] = []
    # Collect (normalized_phrase, section_key) for each meaningful line
    phrase_locations: Dict[str, List[str]] = {}
    for section_key, body in parsed_sections.items():
        for line in body.split("\n"):
            n = _normalize(line)
            if not n or len(n) < 12:
                continue
            # Skip structural labels only (Company: X -> we care about X, not "Company:")
            if n in phrase_locations:
                if section_key not in phrase_locations[n]:
                    phrase_locations[n].append(section_key)
            else:
                phrase_locations[n] = [section_key]

    for phrase, sections in phrase_locations.items():
        if len(sections) > 1:
            issues.append({
                "file": email,
                "issue_type": "duplicated",
                "snippet": phrase[:200],
                "section": ", ".join(sections),
                "detail": f"Same content appears in multiple sections: {', '.join(sections)}",
            })

    return issues


def _find_missing_issues(pure_text: str, parsed_text: str, email: str) -> List[Dict]:
    """
    Find substantial phrases in pure that do not appear in parsed (possible dropped/orphaned).
    """
    issues: List[Dict] = []
    pure_phrases = _meaningful_phrases(pure_text, min_len=20)
    parsed_norm = _normalize(parsed_text)
    for p in pure_phrases:
        n = _normalize(p)
        if not n:
            continue
        # Substring or exact in parsed?
        if n not in parsed_norm and p not in parsed_text:
            # Try without punctuation
            n_flat = re.sub(r"[^\w\s]", "", n).lower()
            parsed_flat = re.sub(r"[^\w\s]", "", parsed_text).lower()
            if n_flat not in parsed_flat:
                issues.append({
                    "file": email,
                    "issue_type": "missing",
                    "snippet": p[:200],
                    "section": "",
                    "detail": "Present in pure resume but not found in parsed (possible dropped).",
                })
    return issues


def audit_formatting(
    pure_dir: Optional[str] = None,
    parsed_dir: Optional[str] = None,
    pair: Optional[Tuple[str, str]] = None,
    *,
    check_wrong_section: bool = True,
    check_duplicated: bool = True,
    check_missing: bool = True,
) -> Tuple[List[Dict], str]:
    """
    Audit parsed resumes against pure (raw) resumes for orphaned data.

    File pairing: pure_resumes/pure_{email}.txt <-> parsed_resumes/{email}.txt

    Args:
        pure_dir: Directory containing pure_*.txt files (default: projects/dilly/pure_resumes).
        parsed_dir: Directory containing {email}.txt parsed files (default: projects/dilly/parsed_resumes).
        pair: Optional (pure_path, parsed_path) to run on a single pair instead of scanning dirs.
        check_wrong_section: Flag content in heuristically wrong sections.
        check_duplicated: Flag same normalized content in multiple sections.
        check_missing: Flag substantial pure content not found in parsed.

    Returns:
        (issues, summary_string)
        issues: list of dicts with keys file, issue_type, snippet, section, detail.
        summary_string: human-readable summary.
    """
    def _default_pure_dir() -> str:
        base = os.getcwd()
        if "projects" not in os.listdir(base):
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base, "projects", "dilly", "pure_resumes")

    def _default_parsed_dir() -> str:
        base = os.getcwd()
        if "projects" not in os.listdir(base):
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base, "projects", "dilly", "parsed_resumes")

    issues: List[Dict] = []
    pairs_to_run: List[Tuple[str, str, str]] = []  # (pure_path, parsed_path, email)

    if pair is not None:
        pure_path, parsed_path = pair
        if not os.path.isfile(pure_path) or not os.path.isfile(parsed_path):
            return issues, "Missing file(s) for single pair."
        email = os.path.basename(parsed_path).replace(".txt", "")
        pairs_to_run.append((pure_path, parsed_path, email))
    else:
        pdir = parsed_dir or _default_parsed_dir()
        udir = pure_dir or _default_pure_dir()
        if not os.path.isdir(pdir):
            return issues, f"Parsed dir not found: {pdir}"
        for name in os.listdir(pdir):
            if not name.endswith(".txt"):
                continue
            email = name[:-4]
            pure_name = f"pure_{email}.txt"
            pure_path = os.path.join(udir, pure_name)
            parsed_path = os.path.join(pdir, name)
            if not os.path.isfile(parsed_path):
                continue
            if not os.path.isfile(pure_path):
                issues.append({
                    "file": email,
                    "issue_type": "missing_pure",
                    "snippet": "",
                    "section": "",
                    "detail": f"No pure file: {pure_name}",
                })
                continue
            pairs_to_run.append((pure_path, parsed_path, email))

    for pure_path, parsed_path, email in pairs_to_run:
        try:
            with open(pure_path, "r", encoding="utf-8", errors="replace") as f:
                pure_text = f.read()
            with open(parsed_path, "r", encoding="utf-8", errors="replace") as f:
                parsed_text = f.read()
        except Exception as e:
            issues.append({
                "file": email,
                "issue_type": "read_error",
                "snippet": str(e),
                "section": "",
                "detail": f"Could not read files: {e}",
            })
            continue

        parsed_sections = parse_parsed_into_sections(parsed_text)

        if check_wrong_section:
            issues.extend(_find_wrong_section_issues(pure_text, parsed_sections, email))
        if check_duplicated:
            issues.extend(_find_duplicated_issues(parsed_sections, email))
        if check_missing:
            issues.extend(_find_missing_issues(pure_text, parsed_text, email))

    summary_lines = [
        f"Format audit: {len(pairs_to_run)} pair(s) checked, {len(issues)} issue(s) found.",
    ]
    by_type: Dict[str, int] = {}
    for i in issues:
        t = i.get("issue_type", "unknown")
        by_type[t] = by_type.get(t, 0) + 1
    for t, count in sorted(by_type.items()):
        summary_lines.append(f"  - {t}: {count}")
    summary = "\n".join(summary_lines)

    return issues, summary


if __name__ == "__main__":
    import sys
    issues, summary = audit_formatting()
    print(summary)
    if issues and sys.argv[1:2] == ["--verbose"]:
        for i in issues:
            print(f"  [{i['issue_type']}] {i['file']}: {i.get('detail', '')}")
            if i.get("snippet"):
                print(f"    snippet: {i['snippet'][:100]}...")
    sys.exit(0 if not issues else 1)
