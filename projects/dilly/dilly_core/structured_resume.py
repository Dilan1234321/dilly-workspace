"""
Structured resume output for Meridian.
Builds a labeled, sectioned text file from ParsedResume so the LLM and code
can reliably use which block is which. Writes to projects/meridian/parsed_resumes/.
Applies rule-based cleanup (acronym sections dropped, bullet-only lines merged) for every file.
"""

import os
import re
from typing import Dict, List, Optional

from dilly_core.resume_parser import ParsedResume, get_sections
from dilly_core.auditor import get_track_from_major_and_text

# Section keys that are in-content acronyms/labels, not real sections - skip when building output
SKIP_SECTION_KEYS = frozenset(
    "gpa fl md pa ny ca tx citi rcr hipaa it padi aota apta csm ecss cnhs us usa uk phd bs ba ms ma "
    "ceo cfo cto pm hr pr dei ut ed gcp um".split()
)


def _is_acronym_section_key(key: str) -> bool:
    """True if this key should not be emitted as a section (e.g. gpa, fl, citi)."""
    if not key:
        return True
    k = key.lower().strip()
    k = re.sub(r"[^\w]", "", k)  # strip punctuation for comparison
    if k in SKIP_SECTION_KEYS:
        return True
    if len(k) <= 4 and k.isalpha():
        return True  # short all-caps tokens like "gpa", "fl"
    return False


def clean_section_content(content: str) -> str:
    """
    Rule-based cleanup for section content: remove standalone bullet-only lines,
    merge bullet char with next line, collapse one-word lines into sentences where sensible.
    Applied to every section for every file (current and future).
    """
    if not content or not content.strip():
        return content
    bullet_chars = ("•", "\u2022", "\u00b7", "●", "-", "*")
    lines = content.split("\n")
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        # Drop lines that are only a bullet character or only punctuation
        if not stripped:
            if out and out[-1].strip():
                out.append("")
            i += 1
            continue
        if len(stripped) <= 2 and stripped in bullet_chars:
            # Merge with next line: "• " + next
            if i + 1 < len(lines) and lines[i + 1].strip():
                out.append("• " + lines[i + 1].strip())
                i += 2
                continue
            i += 1
            continue
        # Normalize bullet at start: single "• " prefix
        if stripped and stripped[0] in bullet_chars and not stripped.startswith("• "):
            stripped = "• " + stripped[1:].strip()
        out.append(stripped)
        i += 1
    return "\n".join(out).strip()


# Canonical section order and labels (max readability for developer and AI)
_CANONICAL_ORDER = [
    "contact",
    "summary objective",
    "education",
    "relevant coursework",
    "professional experience",
    "research",
    "campus involvement",
    "volunteer experience",
    "projects",
    "publications presentations",
    "skills",
    "honors",
    "certifications",
]
_CANONICAL_LABELS = {
    "contact": "[CONTACT / TOP]",
    "summary objective": "[SUMMARY / OBJECTIVE]",
    "education": "[EDUCATION]",
    "relevant coursework": "[RELEVANT COURSEWORK]",
    "professional experience": "[PROFESSIONAL EXPERIENCE]",
    "research": "[RESEARCH]",
    "campus involvement": "[CAMPUS INVOLVEMENT]",
    "volunteer experience": "[VOLUNTEER EXPERIENCE]",
    "projects": "[PROJECTS]",
    "publications presentations": "[PUBLICATIONS / PRESENTATIONS]",
    "skills": "[SKILLS]",
    "honors": "[HONORS]",
    "certifications": "[CERTIFICATIONS]",
}
# Parser section key -> canonical section key (for ordering and label)
_PARSER_KEY_TO_CANONICAL = {
    "_top": "contact",
    "contact": "contact",
    "contact details": "contact",
    "contact / top": "contact",
    "education": "education",
    "academic": "education",
    "university of tampa": "education",
    "universityoftampa": "education",
    "experience": "professional experience",
    "work experience": "professional experience",
    "employment": "professional experience",
    "professional experience": "professional experience",
    "relevant experience": "professional experience",
    "leadership": "campus involvement",
    "leadership experience": "campus involvement",
    "activities": "campus involvement",
    "involvement": "campus involvement",
    "community service": "campus involvement",
    "campus involvement": "campus involvement",
    "extracurriculars": "campus involvement",
    "affiliations": "campus involvement",
    "volunteer": "volunteer experience",
    "volunteer experience": "volunteer experience",
    "volunteer work": "volunteer experience",
    "honors & awards": "honors",
    "honors and awards": "honors",
    "honors": "honors",
    "projects": "projects",
    "skills": "skills",
    "skills & activities": "skills",
    "skills and activities": "skills",
    "skills and certifications": "skills",
    "certifications": "certifications",
    "summary": "summary objective",
    "objective": "summary objective",
    "summary / objective": "summary objective",
    "relevant coursework": "relevant coursework",
    "coursework": "relevant coursework",
    "research": "research",
    "research experience": "research",
    "publications": "publications presentations",
    "presentations": "publications presentations",
    "publications / presentations": "publications presentations",
    "references": None,
    "interests": None,
}
# Fallback: parser key contains one of these (substring) -> canonical (for odd headers like "Volunteer | Willing Hearts: Singapore")
# Order matters: "research" before "experience" so "research experience" → research not professional experience
_PARSER_KEY_SUBSTRING_FALLBACK = [
    ("volunteer", "volunteer experience"),
    ("affiliation", "campus involvement"),
    ("research", "research"),
    ("publication", "publications presentations"),
    ("presentation", "publications presentations"),
    ("coursework", "relevant coursework"),
    ("summary", "summary objective"),
    ("objective", "summary objective"),
    ("experience", "professional experience"),
]


def _canonical_section_for_parser_key(key: str) -> Optional[str]:
    """Map parser section key to canonical section, or None to drop. Uses substring fallback for odd headers."""
    if key in _PARSER_KEY_TO_CANONICAL:
        return _PARSER_KEY_TO_CANONICAL[key]
    for sub, canonical in _PARSER_KEY_SUBSTRING_FALLBACK:
        if sub in key:
            return canonical
    return None


# Section keys that are common PDF variants -> canonical label (for display) - legacy
_SECTION_KEY_NORMALIZE = {
    "universityoftampa": "EDUCATION",
    "university of tampa": "EDUCATION",
    "workexperience": "PROFESSIONAL EXPERIENCE",
    "honors & awards": "HONORS",
    "contact details": "CONTACT / TOP",
    "servant leader, & ambitious": "CAMPUS INVOLVEMENT",
    "community service": "CAMPUS INVOLVEMENT",
}


def _section_label(key: str) -> str:
    """Turn section key (e.g. 'work experience', '_top') into explicit label [WORK EXPERIENCE]."""
    if not key or key == "_top":
        return "[CONTACT / TOP]"
    k = key.lower().replace("_", " ").strip()
    if k in _SECTION_KEY_NORMALIZE:
        return "[" + _SECTION_KEY_NORMALIZE[k] + "]"
    clean = key.replace("_", " ").strip()
    return "[" + clean.upper() + "]"


# Date range for experience/project entries: Month YYYY – Present, Month YYYY - Month YYYY, or YYYY – Present
_RE_DATE_RANGE = re.compile(
    r"(?:"
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\s*[–\-]\s*(?:Present|Current|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})"
    r"|"
    r"\d{4}\s*[–\-]\s*(?:Present|Current|\d{4})"
    r")",
    re.IGNORECASE,
)
_RE_LOCATION = re.compile(r"\b([A-Za-z\s]+,\s*[A-Z]{2})\b")


def _parse_experience_entries(content: str) -> List[Dict[str, str]]:
    """
    Split experience/involvement content into entries with Company, Role, Date, Location, Description.
    Heuristic: look for date-range lines (Month YYYY – Present); each date line starts a new entry.
    """
    if not content or not content.strip():
        return []
    entries: List[Dict[str, str]] = []
    lines = content.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        # Check if this line or next contains a date range (e.g. "Org | August 2025 – Present")
        date_match = _RE_DATE_RANGE.search(stripped)
        role_candidate = stripped
        company = ""
        date_str = ""
        location = "N/A"
        if date_match:
            date_str = date_match.group(0).strip()
            # Same line may be "Company | Date" or "Company, Location | Date"
            before_date = stripped[: date_match.start()].strip().rstrip("|,")
            if "|" in before_date:
                parts = [p.strip() for p in before_date.split("|", 1)]
                company = parts[0] or ""
                if len(parts) > 1 and parts[1]:
                    loc_m = _RE_LOCATION.search(parts[1])
                    if loc_m:
                        location = loc_m.group(1).strip()
            else:
                company = before_date
            # Role is often the *previous* non-empty line; when date line is standalone (e.g. "2024 - Present"), company is line before that
            role_candidate = ""
            j = i - 1
            while j >= 0 and not lines[j].strip():
                j -= 1
            if j >= 0 and not _RE_DATE_RANGE.search(lines[j]) and not lines[j].strip().startswith("•"):
                role_candidate = lines[j].strip()
                if role_candidate.lower().startswith("role:"):
                    role_candidate = role_candidate[5:].strip()
                # Standalone date line (no company on same line): company = line before role
                if not company and not role_candidate.startswith("Company:"):
                    k = j - 1
                    while k >= 0 and not lines[k].strip():
                        k -= 1
                    if k >= 0 and not _RE_DATE_RANGE.search(lines[k]) and not lines[k].strip().startswith("•"):
                        company = lines[k].strip()
                        if company.lower().startswith("company:"):
                            company = company[7:].strip()
            if not role_candidate and company:
                role_candidate = company
                company = ""
        else:
            i += 1
            continue
        # Collect description (bullets) until next date line
        desc_lines: List[str] = []
        i += 1
        while i < len(lines):
            ln = lines[i]
            if _RE_DATE_RANGE.search(ln):
                break
            if ln.strip():
                desc_lines.append(ln.strip())
            i += 1
        description = "\n".join(desc_lines) if desc_lines else ""
        if location == "N/A" and desc_lines:
            for d in desc_lines[:3]:
                loc_m = _RE_LOCATION.search(d)
                if loc_m:
                    location = loc_m.group(1).strip()
                    break
        entries.append({
            "company": company or "N/A",
            "role": role_candidate or "N/A",
            "date": date_str,
            "location": location,
            "description": description,
        })
    return entries


def _format_experience_section(content: str) -> str:
    """Format experience/involvement content with Company, Role, Date, Location, Description per entry."""
    entries = _parse_experience_entries(content)
    if not entries:
        return clean_section_content(content)
    out: List[str] = []
    for e in entries:
        out.append("Company: " + (e["company"] or "N/A"))
        out.append("Role: " + (e["role"] or "N/A"))
        out.append("Date: " + (e["date"] or "N/A"))
        out.append("Location: " + (e["location"] or "N/A"))
        out.append("Description: " + (e["description"] if e["description"] else ""))
        out.append("")
    return "\n".join(out).strip()


def _parse_project_entries(content: str) -> List[Dict[str, str]]:
    """Split projects content into entries: Project name, Date, Location, Description."""
    if not content or not content.strip():
        return []
    entries = []
    lines = content.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped or stripped.startswith("•"):
            i += 1
            continue
        date_match = _RE_DATE_RANGE.search(stripped)
        project_name = stripped
        date_str = ""
        location = "N/A"
        if date_match:
            date_str = date_match.group(0).strip()
            project_name = stripped[: date_match.start()].strip().rstrip("|,") or stripped
        desc_lines = []
        i += 1
        while i < len(lines):
            ln = lines[i]
            if _RE_DATE_RANGE.search(ln) and not ln.strip().startswith("•"):
                break
            if ln.strip():
                desc_lines.append(ln.strip())
                if location == "N/A":
                    loc_m = _RE_LOCATION.search(ln)
                    if loc_m:
                        location = loc_m.group(1).strip()
            i += 1
        entries.append({
            "project_name": project_name or "N/A",
            "date": date_str or "N/A",
            "location": location,
            "description": "\n".join(desc_lines),
        })
    if not entries:
        return []
    return entries


def _format_projects_section(content: str) -> str:
    """Format projects with Project name, Date, Location, Description per entry."""
    entries = _parse_project_entries(content)
    if not entries:
        return clean_section_content(content)
    out = []
    for e in entries:
        out.append("Project name: " + (e["project_name"] or "N/A"))
        out.append("Date: " + (e["date"] or "N/A"))
        out.append("Location: " + (e["location"] or "N/A"))
        out.append("Description: " + (e["description"] if e.get("description") else ""))
        out.append("")
    return "\n".join(out).strip()


# Patterns for contact field extraction (order matters: more specific first)
_RE_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
# Allow spaces (e.g. "abbistasiuk @ yahoo . com" from PDF extraction) so we still get a filename key
_RE_EMAIL_RELAXED = re.compile(
    r"\b([A-Za-z0-9._%+\-]+)\s*@\s*([A-Za-z0-9.\-]+)\s*\.\s*([A-Za-z]{2,})\b"
)
_RE_PHONE = re.compile(
    r"(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"
    r"|\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b"
)
_RE_LINKEDIN = re.compile(
    r"(?:https?://)?(?:www\.)?linkedin\.com/in/[\w\-./]+",
    re.IGNORECASE,
)
_RE_GPA = re.compile(r"\b(?:GPA|Grade Point Average)[:\s]*([0-4]\.\d{1,2})(?:/\s*4\.0)?\b", re.IGNORECASE)

# Section keys that are considered "contact" - we don't strip contact from these
_CONTACT_SECTION_KEYS = frozenset(("_top", "contact", "contact details", "contact / top"))


def _extract_contact_tokens(text: str) -> tuple:
    """Return (list of email strings, list of phone strings) found in text."""
    emails = list(_RE_EMAIL.findall(text))
    phones = list(_RE_PHONE.findall(text))
    return (emails, phones)


def _remove_contact_from_text(text: str) -> str:
    """Remove all emails and phones from text (so we can strip them from a section)."""
    t = _RE_EMAIL.sub(" ", text)
    t = _RE_PHONE.sub(" ", t)
    return re.sub(r"\s+", " ", t).strip()


def promote_contact_into_top(parsed: ParsedResume) -> None:
    """
    When email/phone appear at end of file or in a non-contact section, move them into _top
    so the structured resume has one clear contact block. Mutates parsed.sections.
    """
    if not parsed.sections:
        return
    top_key = "_top"
    top_content = (parsed.sections.get(top_key) or "").strip()
    top_emails, top_phones = _extract_contact_tokens(top_content)
    seen_emails = set(top_emails)
    seen_phones = set(top_phones)
    added: List[str] = []
    for key, content in list(parsed.sections.items()):
        if key in _CONTACT_SECTION_KEYS or not content.strip():
            continue
        emails, phones = _extract_contact_tokens(content)
        for e in emails:
            if e not in seen_emails:
                seen_emails.add(e)
                added.append(e)
        for p in phones:
            if p not in seen_phones:
                seen_phones.add(p)
                added.append(p)
        if emails or phones:
            new_content = _remove_contact_from_text(content)
            parsed.sections[key] = new_content
    if added:
        parsed.sections[top_key] = (top_content + "\n" + "\n".join(added)).strip()


def format_contact_section(content: str) -> tuple:
    """
    Put phone, email, location, LinkedIn, and GPA on separate lines in [CONTACT / TOP].
    Returns (contact_text, education_snippet_or_None). If contact remainder contained
    degree/university/graduation text, education_snippet is that text for [EDUCATION].
    """
    if not content or not content.strip():
        return content
    text = content.strip()
    # Extract fields (first match each)
    email = None
    m = _RE_EMAIL.search(text)
    if m:
        email = m.group(0)
    phone = None
    m = _RE_PHONE.search(text)
    if m:
        phone = m.group(0).strip()
    linkedin = None
    m = _RE_LINKEDIN.search(text)
    if m:
        linkedin = m.group(0)
        if not linkedin.startswith("http"):
            linkedin = "https://" + linkedin
    gpa = None
    m = _RE_GPA.search(text)
    if m:
        gpa = m.group(1)
    # Location: "City, ST" or "City, State" or "City, Country" (often after | or on its own)
    location = None
    for part in re.split(r"[|•\n]", text):
        part = part.strip()
        if not part or "@" in part or _RE_PHONE.match(part) or _RE_LINKEDIN.search(part):
            continue
        if re.match(r"^[A-Za-z\s]+,\s*[A-Za-z]{2}\b$", part) or re.match(r"^[A-Za-z\s]+,\s*[A-Za-z\s]{2,}$", part):
            if 3 < len(part) < 60:
                location = part
                break
    # Build output: name/rest first (strip out extracted bits and label keywords), then labeled lines
    remainder = text
    for val in [email, phone, gpa]:
        if val and val in remainder:
            remainder = remainder.replace(val, " ", 1)
    if linkedin:
        remainder = re.sub(r"https?://(?:www\.)?linkedin\.com[^\s]*|www\.linkedin\.com[^\s]*", " ", remainder, flags=re.IGNORECASE)
    if location and location in remainder:
        remainder = remainder.replace(location, " ", 1)
    for label in ["Phone:", "Email:", "Location:", "LinkedIn:", "GPA:"]:
        remainder = re.sub(re.escape(label) + r"\s*", " ", remainder, flags=re.IGNORECASE)
    remainder = re.sub(r"\s*[|]\s*", " ", remainder)
    remainder = re.sub(r"\s+", " ", remainder).strip().strip("|").strip()

    # If remainder contains degree/university/graduation, pull it out for [EDUCATION] (caller uses it)
    education_snippet = None
    if remainder and re.search(r"\b(?:EDUCATION|Bachelor|B\.?S\.?|B\.?A\.?|University\s+of)\b", remainder, re.IGNORECASE):
        if re.search(r"\b(?:May|Dec|Expected|Graduation)\s*(?:\.\s*)?\d{4}\b", remainder, re.IGNORECASE) or re.search(r"University\s+of", remainder, re.IGNORECASE):
            # Start from "EDUCATION " or first degree/university mention (drop name/location before it)
            m = re.search(
                r"(?:EDUCATION\s+)?(?:Bachelor|B\.?S\.?|B\.?A\.?|University\s+of|The\s+University\s+of).*",
                remainder,
                re.IGNORECASE,
            )
            if m:
                education_snippet = m.group(0).strip()
                # End at next section keyword or cap length
                end_m = re.search(r"\s+(?:EXPERIENCE|WORK\s+EXPERIENCE|SKILLS|PROFILE|INVOLVEMENT|PROJECTS)\s", education_snippet, re.IGNORECASE)
                if end_m:
                    education_snippet = education_snippet[: end_m.start()].strip()
                if len(education_snippet) > 600:
                    education_snippet = education_snippet[:600].rsplit(" ", 1)[0]
                if 20 < len(education_snippet) < 900:
                    remainder = remainder.replace(m.group(0), " ", 1)
                    remainder = re.sub(r"\s+", " ", remainder).strip().strip("|").strip()
                else:
                    education_snippet = None

    out = []
    if remainder:
        out.append(remainder)
    if email:
        out.append(f"Email: {email}")
    if phone:
        out.append(f"Phone: {phone}")
    if location:
        out.append(f"Location: {location}")
    if linkedin:
        out.append(f"LinkedIn: {linkedin}")
    # GPA belongs in Education only (not in Contact)
    contact_text = "\n".join(out) if out else content
    return (contact_text, education_snippet)


def _unglue_education_text(text: str) -> str:
    """Fix common glued words in education block so extraction regexes can match."""
    if not text:
        return text
    t = re.sub(r"TheUniversityof", "The University of ", text, flags=re.IGNORECASE)
    t = re.sub(r"Universityof", "University of ", t, flags=re.IGNORECASE)
    t = re.sub(r"PennsburyHighschool", "Pennsbury High School", t, flags=re.IGNORECASE)
    t = re.sub(r"\bHighschool\b", "High School", t, flags=re.IGNORECASE)
    t = re.sub(r"BSin", "B.S. in ", t, flags=re.IGNORECASE)
    t = re.sub(r"Bachelorof", "Bachelor of ", t, flags=re.IGNORECASE)
    return t


def format_education_section(content: str) -> str:
    """
    Put university, major(s), minor(s), graduation date, and honors on separate lines
    under [EDUCATION] / [ACADEMIC] for organization. Rule-based extraction; LLM can refine.
    """
    if not content or not content.strip():
        return content
    text = content.strip()
    text = _unglue_education_text(text)
    out = []
    # Graduation date first (so we can exclude it from university match)
    grad = None
    m = re.search(r"(?:Expected(?:\s+Graduation)?[:\s]*)?(?:May|December|Dec|January|Jan|August|Aug)\s*(?:\.\s*)?\d{4}\b", text, re.IGNORECASE)
    if m:
        grad = m.group(0).strip()
    if not grad:
        m = re.search(r"(?:Graduation|Expected)[:\s]+([A-Za-z]+\s+\d{4})\b", text, re.IGNORECASE)
        if m:
            grad = m.group(1).strip()
    # University: "The University of Tampa" or "University of X" or "X University" (word 3+ chars), optionally ", City, ST"
    university = None
    m = re.search(r"(?:The\s+)?University\s+of\s+[A-Za-z]+(?:\s*,\s*[A-Za-z\s,]+?)?(?=\s+May|\s+Dec|\s+Expected|\s+\d{4}|\s+Bachelor|\s+B\.?S\.?|$)", text, re.IGNORECASE)
    if m:
        university = m.group(0).strip().rstrip("|,")
    if not university:
        m = re.search(r"\b([A-Za-z]{3,}\s+(?:University|College|Institute))(?:\s*,\s*[A-Za-z\s,]+?)?(?=\s+May|\s+Dec|\s+Expected|\s+\d{4}|\s+Bachelor|\s+B\.?S\.?|$)", text)
        if m:
            university = m.group(1).strip().rstrip("|,")
    if university:
        out.append(f"University: {university}")
    # Degree: only fill for Associate's (community college); bachelor's users leave blank
    degree_line = None
    if re.search(r"\bA\.?A\.?|A\.?S\.?|Associate\s+(?:of\s+)?(?:Arts|Science)\b", text, re.IGNORECASE):
        degree_line = "Degree: Associate's"
    if degree_line:
        out.append(degree_line)
    # Location (e.g. Tampa, FL) in education block
    location_edu = None
    loc_m = re.search(r"\b([A-Za-z\s]+,\s*[A-Z]{2})\b", text)
    if loc_m:
        location_edu = loc_m.group(1).strip()
    out.append(f"Location: {location_edu}" if location_edu else "Location: N/A")
    # Major(s): B.S. in X, Bachelor of Science in X - stop at city/state or university or date
    major = None
    m = re.search(
        r"(?:Bachelor(?:\s*\'?s)?\s+(?:of\s+)?(?:Science|Arts|Business)\s+in\s+[A-Za-z\s&()]+?)(?=\s+[A-Za-z]+\s*,\s*[A-Z]{2}\b|\s+University|\s+May|\s+Dec|\s+Minor|\s*[|]|$)",
        text,
        re.IGNORECASE,
    )
    if m:
        major = m.group(0).strip()
    if not major:
        m = re.search(r"\b(?:B\.?S\.?|B\.?A\.?)\s+in\s+([A-Za-z\s&()]+?)(?=\s+[A-Za-z]+\s*,\s*[A-Z]{2}\b|\s+University|\s+May|\s+Dec|\s+Minor|\s*[|]|$)", text, re.IGNORECASE)
        if m:
            major = "B.S. in " + m.group(1).strip() if "B.S" in text[:30] or "science" in text[:60].lower() else "B.A. in " + m.group(1).strip()
    if major:
        out.append(f"Major(s): {major}")
    # Minor(s)
    minor = None
    m = re.search(r"Minor[:\s]+([A-Za-z\s,&\-]+?)(?:\s*[|\n]|\s+Expected|\s+GPA|\s+Cumulative|$)", text, re.IGNORECASE)
    if m:
        minor = m.group(1).strip().rstrip("|,")
    out.append(f"Minor(s): {minor}" if minor else "Minor(s): N/A")
    out.append(f"Graduation date: {grad}" if grad else "Graduation date: N/A")
    # Honors
    honors = []
    if re.search(r"Dean['\u2019]s\s+List", text, re.IGNORECASE):
        honors.append("Dean's List")
    if re.search(r"Presidential\s+Scholarship|Presidential\s+Scholar", text, re.IGNORECASE):
        honors.append("Presidential Scholar/Scholarship")
    if re.search(r"Honors\s+Program|Honors\s+College", text, re.IGNORECASE):
        honors.append("Honors Program")
    if re.search(r"scholarship|fellowship", text, re.IGNORECASE) and not honors:
        honors.append("Scholarship(s)")
    out.append("Honors: " + (", ".join(honors) if honors else "Not honors"))
    # GPA
    gpa_m = re.search(r"(?:GPA|Cumulative)[:\s]*([0-4]\.\d{1,2})(?:\s*/\s*4\.0)?", text, re.IGNORECASE)
    if gpa_m:
        out.append(f"GPA: {gpa_m.group(1)}")
    # Remainder (coursework, etc.)
    remainder = text
    for val in [university, major, minor, grad]:
        if val and val in remainder:
            remainder = remainder.replace(val, " ", 1)
    for label in ["University:", "Degree:", "Location:", "Major(s):", "Minor(s):", "Graduation date:", "Honors:", "GPA:"]:
        remainder = re.sub(re.escape(label) + r"\s*[^\n]*", "", remainder, flags=re.IGNORECASE)
    remainder = re.sub(r"\s+", " ", remainder).strip()
    if remainder and len(remainder) > 10:
        out.append("")
        out.append(remainder)
    return "\n".join(out)


def build_structured_resume_text(parsed: ParsedResume, display_name_override: Optional[str] = None) -> str:
    """
    Build structured text with explicit section labels in canonical order.
    Sections: Contact, Summary/Objective, Education, Relevant coursework, Professional experience,
    Research, Campus involvement, Volunteer experience, Projects, Publications/Presentations,
    Skills, Honors, Certifications. Skips acronym/fake sections.
    Contact found elsewhere is promoted into _top before building.
    display_name_override: when provided (e.g. from existing file), use for "Name: " line so we don't overwrite a corrected full name.
    """
    promote_contact_into_top(parsed)

    # Merge parser sections into canonical sections (multiple keys can map to one)
    canonical_content: Dict[str, List[str]] = {c: [] for c in _CANONICAL_ORDER}
    for key, content in parsed.sections.items():
        if not content or not content.strip() or _is_acronym_section_key(key):
            continue
        canonical = _canonical_section_for_parser_key(key)
        if canonical and canonical in canonical_content:
            canonical_content[canonical].append(content.strip())

    out: List[str] = []
    education_emitted = False
    # Display name for "Name: " line (every file must have one)
    if display_name_override and (display_name_override := display_name_override.strip()) and display_name_override != "Unknown":
        display_name = _normalize_display_name(display_name_override)
    else:
        display_name = (parsed.name or "").strip()
        if not display_name or display_name == "Unknown" or "[Full Name]" in display_name:
            display_name = "Unknown"
        elif "[" in display_name or "]" in display_name or (display_name.isupper() and any(x in display_name for x in ("EXPERIENCE", "EDUCATION", "SUMMARY", "OBJECTIVE", "SKILLS", "CONTACT", "PROFILE"))):
            display_name = "Unknown"  # never use section header as name
        else:
            display_name = _normalize_display_name(display_name)

    # Cohort (track) from major + full text for intent (Pre-Health, Pre-Law, etc.)
    full_text_parts = []
    for c in _CANONICAL_ORDER:
        parts = canonical_content.get(c) or []
        if parts:
            full_text_parts.append("\n\n".join(parts).strip())
    full_text = "\n\n".join(full_text_parts) if full_text_parts else ""
    cohort = get_track_from_major_and_text(parsed.major or "Unknown", full_text)

    for canonical in _CANONICAL_ORDER:
        parts = canonical_content.get(canonical) or []
        merged = "\n\n".join(parts).strip() if parts else ""

        # Contact: may also yield education snippet from remainder; include Cohort
        if canonical == "contact":
            if merged:
                contact_text, education_from_top = format_contact_section(merged)
                contact_text = contact_text.rstrip()
                if cohort:
                    contact_text = contact_text + "\nCohort: " + cohort
                if contact_text and not (display_name_override and display_name_override.strip()):
                    first_line = contact_text.split("\n")[0].strip()
                    if first_line and "[" not in first_line and "]" not in first_line and not (first_line.isupper() and any(x in first_line for x in ("EXPERIENCE", "EDUCATION", "SUMMARY", "OBJECTIVE", "SKILLS", "CONTACT", "PROFILE"))):
                        if _looks_like_full_name(first_line):
                            display_name = _normalize_display_name(first_line)
                out.append("Name: " + display_name)
                out.append("")
                out.append(_CANONICAL_LABELS[canonical])
                out.append(contact_text)
                out.append("")
                if education_from_top and not (canonical_content.get("education") or []):
                    out.append(_CANONICAL_LABELS["education"])
                    out.append(format_education_section(education_from_top))
                    out.append("")
                    education_emitted = True
            elif cohort:
                out.append("Name: " + display_name)
                out.append("")
                out.append(_CANONICAL_LABELS[canonical])
                out.append("Cohort: " + cohort)
                out.append("")
            else:
                out.append("Name: " + display_name)
                out.append("")
            continue

        # Summary / Objective: short paragraph, cleaned block
        if canonical == "summary objective":
            if merged:
                out.append(_CANONICAL_LABELS[canonical])
                out.append(clean_section_content(merged))
                out.append("")
            continue

        # Education
        if canonical == "education":
            if not merged and education_emitted:
                continue
            if merged:
                out.append(_CANONICAL_LABELS[canonical])
                out.append(format_education_section(merged))
                out.append("")
            continue

        # Relevant coursework: list of courses, cleaned block
        if canonical == "relevant coursework":
            if merged:
                out.append(_CANONICAL_LABELS[canonical])
                out.append(clean_section_content(merged))
                out.append("")
            continue

        # Professional experience / Research / Campus involvement / Volunteer experience: entry format
        if canonical in ("professional experience", "research", "campus involvement", "volunteer experience"):
            if merged:
                out.append(_CANONICAL_LABELS[canonical])
                out.append(_format_experience_section(merged))
                out.append("")
            continue

        # Projects: project name, date, location, description
        if canonical == "projects":
            if merged:
                out.append(_CANONICAL_LABELS[canonical])
                out.append(_format_projects_section(merged))
                out.append("")
            continue

        # Publications / Presentations: cleaned block (citations, titles, venues)
        if canonical == "publications presentations":
            if merged:
                out.append(_CANONICAL_LABELS[canonical])
                out.append(clean_section_content(merged))
                out.append("")
            continue

        # Skills, Honors, Certifications: cleaned block
        if canonical in ("skills", "honors", "certifications"):
            if merged:
                out.append(_CANONICAL_LABELS[canonical])
                out.append(clean_section_content(merged))
                out.append("")
            continue

    return "\n".join(out).strip()


def get_parsed_resumes_dir() -> str:
    """Return path to projects/meridian/parsed_resumes (create if needed)."""
    # Resolve from cwd or from this file
    base = os.getcwd()
    if "projects" not in os.listdir(base):
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(base, "projects", "dilly", "parsed_resumes")
    os.makedirs(path, exist_ok=True)
    return path


def safe_filename_from_key(key: str, disambiguator: Optional[int] = None) -> str:
    """Sanitize key (user email or candidate name) for use as filename. Always lowercase for consistency."""
    if not key or not key.strip():
        return "unknown.txt"
    key = key.strip()
    # Email: keep as-is except filename-unsafe chars so we get user@example.com.txt
    if "@" in key:
        s = re.sub(r"[^\w@.-]", "", key)
        s = s.strip("_-.")
        if not s:
            return "unknown.txt"
        if disambiguator is not None:
            s = f"{s}_{disambiguator}"
        return (s + ".txt").lower()
    # Name: word chars, spaces -> underscores
    s = re.sub(r"[^\w\s\-.]", "", key)
    s = re.sub(r"\s+", "_", s).strip("_")
    s = s.strip("_-.")
    if not s:
        return "unknown.txt"
    if disambiguator is not None:
        s = f"{s}_{disambiguator}"
    return (s + ".txt").lower()


def get_email_from_parsed(parsed: ParsedResume) -> Optional[str]:
    """Extract first email from parsed resume (any section or normalized text). Used as filename key when app does not send user_email.
    Tolerates spaces in email (e.g. 'abbistasiuk @ yahoo . com') so PDF extraction quirks still yield email-based filenames."""
    if not parsed:
        return None
    # Search normalized text and all sections so contact-at-bottom still finds email
    text = (parsed.normalized_text or "") + " "
    if getattr(parsed, "sections", None):
        for content in parsed.sections.values():
            if content and isinstance(content, str):
                text += content + " "
    m = _RE_EMAIL.search(text)
    if m:
        return m.group(0)
    m = _RE_EMAIL_RELAXED.search(text)
    if m:
        return f"{m.group(1)}@{m.group(2)}.{m.group(3)}"
    return None


def write_parsed_resume(parsed: ParsedResume, key: str, base_dir: Optional[str] = None, display_name_override: Optional[str] = None) -> str:
    """
    Write structured resume text to parsed_resumes/{key}.txt.
    key: identity string (user email preferred, or candidate name). Will be sanitized for filename.
    display_name_override: when provided (e.g. from existing file), use for "Name: " line.
    Returns path to the written file.
    """
    dir_path = base_dir or get_parsed_resumes_dir()
    filename = safe_filename_from_key(key)
    filepath = os.path.join(dir_path, filename)
    text = build_structured_resume_text(parsed, display_name_override=display_name_override)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(text)
    return filepath


def read_parsed_resume(filepath: str) -> str:
    """Read structured resume content from a file. Returns raw text."""
    if not filepath or not os.path.isfile(filepath):
        return ""
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


# First-line fallback: section headers and labels we never treat as a person's name
_NAME_FALLBACK_BLACKLIST = re.compile(
    r"^(?:\[?CONTACT|EDUCATION|SUMMARY|OBJECTIVE|EXPERIENCE|SKILLS|PROFILE|"
    r"HONORS|CERTIFICATIONS|PROJECTS|RESEARCH|REFERENCES|COHORT)\s*",
    re.IGNORECASE,
)

# Surname particles that should be rejoined with the next word (De Loe -> DeLoe, Mc Laughlin -> McLaughlin)
_SURNAME_PARTICLES = frozenset({"De", "Del", "Mc", "Mac", "La", "Le"})


def _rejoin_surname_particles(name: str) -> str:
    """Rejoin 'De Loe' -> 'DeLoe', 'Mc Laughlin' -> 'McLaughlin' so names display correctly."""
    if not name or not name.strip():
        return name
    words = name.strip().split()
    result: List[str] = []
    i = 0
    while i < len(words):
        w = words[i]
        # O' is special: often "O'Brien" already one token; if we see "O" next word "Brien" rejoin
        if w == "O" and i + 1 < len(words) and words[i + 1] and words[i + 1][0].isupper():
            result.append("O" + words[i + 1].capitalize())
            i += 2
            continue
        if w in _SURNAME_PARTICLES and i + 1 < len(words):
            next_w = words[i + 1]
            if next_w:
                result.append(w + (next_w[0].upper() + next_w[1:].lower() if len(next_w) > 1 else next_w.upper()))
                i += 2
                continue
        result.append(w)
        i += 1
    return " ".join(result)


# Trailing words that are location (city/state), not part of a person's name - strip from end of "name" lines
_LOCATION_TAIL_WORDS = frozenset(
    "Tampa Florida FL NY CA TX NJ IL PA OH GA NC VA MA AZ WA CO TN MO MD MN WI AL SC LA OR OK CT UT NV IA MS AR KS NM WV NE ID HI MT WY AK SD ND "
    "Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Georgia Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana "
    "Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada New Hampshire New Jersey New Mexico New York "
    "North Carolina North Dakota Ohio Oklahoma Oregon Pennsylvania Rhode Island South Carolina South Dakota Tennessee Texas Utah Vermont "
    "Virginia Washington West Virginia Wisconsin Wyoming "
    "Orlando Miami Jacksonville Atlanta Chicago Boston Seattle Denver Phoenix Dallas Houston San Francisco Los Angeles Austin".split()
)


def _strip_location_from_name(line: str) -> str:
    """Remove trailing location (city, state, comma) from a name-like line so 'Nicholas Gardner Tampa, Florida' -> 'Nicholas Gardner'."""
    if not line or not line.strip():
        return line
    s = line.strip().rstrip(",").strip()
    # If there's a comma, take only the part before the last comma; then strip location words from that
    if "," in s:
        parts = [p.strip() for p in s.split(",")]
        s = parts[0].strip() if parts else s
    words = s.split()
    while len(words) > 2 and words[-1] in _LOCATION_TAIL_WORDS:
        words.pop()
    return " ".join(words).strip() or line.strip()


def _normalize_display_name(line: str) -> str:
    """Strip trailing location and rejoin surname particles (De Loe -> DeLoe). Use for all Name: output and reads."""
    return _rejoin_surname_particles(_strip_location_from_name(line))


def _looks_like_full_name(line: str) -> bool:
    """True if line looks like a person name (e.g. 'Victoria Logan'), not a section header or field."""
    if not line or len(line) < 3 or len(line) > 60 or ":" in line:
        return False
    if _NAME_FALLBACK_BLACKLIST.match(line.strip()):
        return False
    # Title-case words, optional hyphen in name (e.g. Mary-Jane), no digits
    cleaned = re.sub(r"[^\w\s\-'.]", "", line).strip()
    parts = re.split(r"[\s\-]+", cleaned)
    if not 2 <= len(parts) <= 5:
        return False
    return all(p and p[0].isupper() and p.replace("'", "").replace(".", "").isalpha() for p in parts)


def get_name_from_parsed_resume_content(content: str) -> Optional[str]:
    """
    Extract candidate name from parsed resume text. Prefer explicit "Name: ..." line;
    otherwise use the first line of the file if it looks like a full name (e.g. "Victoria Logan").
    Ensures the audit interface always shows the name from the text file.
    """
    if not content or not content.strip():
        return None
    lines = [ln.strip() for ln in content.split("\n") if ln.strip()]
    for line in lines:
        if re.match(r"^Name\s*:\s*.+", line, re.IGNORECASE):
            name = re.sub(r"^Name\s*:\s*", "", line, flags=re.IGNORECASE).strip()
            if name and len(name) > 1 and name != "Unknown":
                return _normalize_display_name(name)
    # Fallback: first line that looks like a person's name (so files without "Name:" still work)
    for line in lines:
        if _looks_like_full_name(line):
            return _normalize_display_name(line.strip())
    return None


def update_parsed_resume_cohort(filepath: str, cohort: str) -> None:
    """
    Set or replace the Cohort line in a parsed resume .txt file so it matches the audit result.
    Call after every audit so the file always shows the cohort we used and can be corrected if wrong.
    """
    if not filepath or not cohort or not os.path.isfile(filepath):
        return
    cohort = cohort.strip()
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()
    new_line = f"Cohort: {cohort}\n"
    replaced = False
    for i, line in enumerate(lines):
        if re.match(r"^Cohort\s*:\s*", line, re.IGNORECASE):
            lines[i] = new_line
            replaced = True
            break
    if not replaced:
        # Add Cohort after contact block: after first blank line or after line 8, whichever comes first
        insert_at = 1
        for i, line in enumerate(lines):
            if i > 8:
                insert_at = i
                break
            if i > 0 and line.strip() == "":
                insert_at = i
                break
        lines.insert(insert_at, new_line)
    with open(filepath, "w", encoding="utf-8") as f:
        f.writelines(lines)


# Default section → dimension mapping (hybrid: code fallback; LLM can override per resume)
DEFAULT_SECTIONS_FOR_SMART = ("education", "academic", "honors", "qualifications")
DEFAULT_SECTIONS_FOR_GRIT = ("experience", "work experience", "employment", "leadership", "activities", "extracurriculars")
DEFAULT_SECTIONS_FOR_BUILD = ("projects", "clinical", "research", "skills", "certifications")


def sections_for_dimension(sections: Dict[str, str], dimension: str) -> str:
    """
    Return concatenated content of sections relevant to this dimension (default mapping).
    dimension: 'smart' | 'grit' | 'build'
    """
    if dimension == "smart":
        keys = DEFAULT_SECTIONS_FOR_SMART
    elif dimension == "grit":
        keys = DEFAULT_SECTIONS_FOR_GRIT
    else:
        keys = DEFAULT_SECTIONS_FOR_BUILD
    parts = []
    for k in keys:
        if k in sections and sections[k].strip():
            parts.append(f"[{k.upper().replace('_', ' ')}]\n{sections[k].strip()}")
    # Also include any section whose key contains relevant keywords
    for key, content in sections.items():
        if content.strip() and key not in keys:
            key_lower = key.lower()
            if dimension == "smart" and ("honor" in key_lower or "education" in key_lower or "academic" in key_lower):
                parts.append(f"[{key.upper().replace('_', ' ')}]\n{content.strip()}")
            elif dimension == "grit" and ("leader" in key_lower or "work" in key_lower or "experience" in key_lower or "activit" in key_lower):
                parts.append(f"[{key.upper().replace('_', ' ')}]\n{content.strip()}")
            elif dimension == "build" and ("project" in key_lower or "clinical" in key_lower or "research" in key_lower or "skill" in key_lower):
                parts.append(f"[{key.upper().replace('_', ' ')}]\n{content.strip()}")
    return "\n\n".join(parts) if parts else ""


def get_sections_from_structured_text(structured_text: str) -> Dict[str, str]:
    """
    Parse structured text (with [LABEL] headers) back into section_key -> content.
    Used so we can map sections to dimensions and send only relevant blocks to the LLM.
    """
    sections: Dict[str, str] = {}
    current_label: Optional[str] = None
    current_lines: list = []

    def flush():
        nonlocal current_label, current_lines
        if current_label is not None and current_lines:
            key = current_label.strip("[]").lower().replace(" ", "_")
            if key == "contact_/_top":
                key = "_top"
            sections[key] = "\n".join(current_lines).strip()
        current_lines = []

    for line in structured_text.split("\n"):
        m = re.match(r"^\[([^\]]+)\]$", line.strip())
        if m:
            flush()
            current_label = m.group(1).strip()
        else:
            if current_label is None and line.strip():
                current_label = "CONTACT / TOP"
            current_lines.append(line)
    flush()
    return sections
