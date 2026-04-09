"""
LinkedIn PDF import - parse a LinkedIn "Save to PDF" export into
structured resume sections that slot directly into the resume editor.

LinkedIn PDFs follow a consistent format:
  - Name (large, top)
  - Headline / tagline
  - Location
  - Contact Info block
  - Summary / About
  - Experience (company, role, dates, bullets)
  - Education (university, degree, dates)
  - Skills
  - Certifications, Honors, Publications, etc.

We extract text from the PDF, then use regex + heuristics to identify
sections. No LLM needed - LinkedIn's format is predictable enough for
deterministic parsing.

Also handles raw pasted text from a LinkedIn profile (for users who
copy-paste instead of downloading the PDF).

Entry point: parse_linkedin_pdf(pdf_bytes) -> dict with { sections, name, email }
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Dict, List, Optional


def _uid() -> str:
    return uuid.uuid4().hex[:8]


def _extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from a PDF file. Tries pymupdf first, falls back to pypdf."""
    text = ""
    try:
        import fitz  # pymupdf
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        for page in doc:
            text += page.get_text() + "\n"
        doc.close()
        return text
    except Exception:
        pass
    try:
        from pypdf import PdfReader
        from io import BytesIO
        reader = PdfReader(BytesIO(pdf_bytes))
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
        return text
    except Exception:
        pass
    return text


# ── Section header patterns ───────────────────────────────────────────────
# LinkedIn PDFs use these exact headings (case-insensitive)

_SECTION_HEADERS = {
    "experience": re.compile(r"^\s*experience\s*$", re.IGNORECASE),
    "education": re.compile(r"^\s*education\s*$", re.IGNORECASE),
    "skills": re.compile(r"^\s*(?:skills|top skills)\s*$", re.IGNORECASE),
    "summary": re.compile(r"^\s*(?:summary|about)\s*$", re.IGNORECASE),
    "certifications": re.compile(r"^\s*(?:certifications?|licenses? & certifications?)\s*$", re.IGNORECASE),
    "honors": re.compile(r"^\s*(?:honors|honors & awards|awards)\s*$", re.IGNORECASE),
    "publications": re.compile(r"^\s*publications?\s*$", re.IGNORECASE),
    "projects": re.compile(r"^\s*projects?\s*$", re.IGNORECASE),
    "languages": re.compile(r"^\s*languages?\s*$", re.IGNORECASE),
    "volunteer": re.compile(r"^\s*(?:volunteer|volunteering)\s*$", re.IGNORECASE),
    "contact": re.compile(r"^\s*contact\s*$", re.IGNORECASE),
}

# Date patterns: "Jan 2024 - Present", "2023 - 2024", "Sep 2022 - May 2023"
_DATE_RE = re.compile(
    r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\s*\d{4}\s*[-–]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\s*\d{4}|Present)",
    re.IGNORECASE,
)


def _split_into_sections(text: str) -> Dict[str, str]:
    """Split LinkedIn text into named sections based on header detection."""
    lines = text.split("\n")
    sections: Dict[str, List[str]] = {}
    current_section = "header"
    sections[current_section] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Check if this line is a section header
        matched = False
        for sec_name, pattern in _SECTION_HEADERS.items():
            if pattern.match(stripped):
                current_section = sec_name
                if current_section not in sections:
                    sections[current_section] = []
                matched = True
                break

        if not matched:
            if current_section not in sections:
                sections[current_section] = []
            sections[current_section].append(stripped)

    return {k: "\n".join(v) for k, v in sections.items()}


def _parse_experience_block(text: str) -> List[Dict[str, Any]]:
    """Parse the Experience section into structured entries."""
    entries: List[Dict[str, Any]] = []
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    current: Optional[Dict[str, Any]] = None
    for line in lines:
        # Check for a date line - signals a new entry or subentry
        date_match = _DATE_RE.search(line)

        # Heuristic: if line is short (<60 chars) and doesn't start with
        # common bullet prefixes, it's likely a company or role name
        is_bullet = line.startswith(("- ", "• ", "* ", "· ")) or (len(line) > 80 and not date_match)

        if date_match and not is_bullet:
            if current is None:
                current = {"company": "", "role": "", "date": "", "location": "", "bullets": []}
            date_str = date_match.group(0).strip()
            remaining = line.replace(date_str, "").strip().strip("-·•").strip()
            if current["date"]:
                # This is a sub-entry (new role at same company)
                entries.append(current)
                current = {"company": current["company"], "role": remaining, "date": date_str, "location": "", "bullets": []}
            else:
                current["date"] = date_str
                if remaining and not current["role"]:
                    current["role"] = remaining
        elif is_bullet and current:
            bullet_text = re.sub(r"^[-•*·]\s*", "", line).strip()
            if bullet_text and len(bullet_text) > 10:
                current["bullets"].append(bullet_text)
        elif current is not None:
            # Short line without date - likely company or role
            if not current["company"]:
                current["company"] = line
            elif not current["role"]:
                current["role"] = line
            elif not current["location"] and len(line) < 50:
                current["location"] = line
        else:
            # First line before any date - company or role name
            current = {"company": line, "role": "", "date": "", "location": "", "bullets": []}

    if current and (current["company"] or current["role"]):
        entries.append(current)

    return entries


def _parse_education_block(text: str) -> Dict[str, Any]:
    """Parse the Education section. Returns the first/primary entry."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    edu = {"university": "", "major": "", "graduation": "", "gpa": "", "location": "", "honors": "", "minor": ""}

    for i, line in enumerate(lines):
        if not edu["university"] and len(line) > 3:
            edu["university"] = line
        elif not edu["major"] and ("bachelor" in line.lower() or "master" in line.lower() or "b.s" in line.lower() or "b.a" in line.lower() or "m.s" in line.lower() or "ph.d" in line.lower() or "major" in line.lower() or "degree" in line.lower()):
            edu["major"] = line
        elif _DATE_RE.search(line):
            edu["graduation"] = _DATE_RE.search(line).group(0).strip()
        elif "gpa" in line.lower():
            gpa_match = re.search(r"(\d\.\d+)", line)
            if gpa_match:
                edu["gpa"] = gpa_match.group(1)
        elif not edu["major"] and i <= 2:
            edu["major"] = line

    return edu


def parse_linkedin_pdf(pdf_bytes: bytes) -> Dict[str, Any]:
    """
    Parse a LinkedIn PDF export into structured resume sections.

    Returns:
        {
            "sections": [...],  # matches the resume editor's ResumeSection shape
            "name": str,
            "email": str,
            "headline": str,
        }
    """
    raw_text = _extract_text_from_pdf(pdf_bytes)
    return parse_linkedin_text(raw_text)


def parse_linkedin_text(text: str) -> Dict[str, Any]:
    """
    Parse raw LinkedIn profile text (from PDF or copy-paste) into
    structured resume sections.
    """
    if not text or len(text.strip()) < 50:
        return {"sections": [], "name": "", "email": "", "headline": ""}

    sections_raw = _split_into_sections(text)
    header = sections_raw.get("header", "")

    # Extract name (first non-empty line in the header)
    header_lines = [l.strip() for l in header.split("\n") if l.strip()]
    name = header_lines[0] if header_lines else ""
    headline = header_lines[1] if len(header_lines) > 1 else ""
    location = ""
    for hl in header_lines[2:5]:
        if any(kw in hl.lower() for kw in ["area", "city", "state", "united", "remote", ","]):
            location = hl
            break

    # Extract email from contact section
    email = ""
    contact_text = sections_raw.get("contact", "")
    email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", contact_text)
    if email_match:
        email = email_match.group(0)
    if not email:
        email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", text)
        if email_match:
            email = email_match.group(0)

    # Extract LinkedIn URL
    linkedin = ""
    li_match = re.search(r"linkedin\.com/in/[\w-]+", text, re.IGNORECASE)
    if li_match:
        linkedin = "https://www." + li_match.group(0)

    # Build structured sections
    result_sections: List[Dict[str, Any]] = []

    # Contact
    result_sections.append({
        "key": "contact",
        "label": "Contact",
        "contact": {
            "name": name,
            "email": email,
            "phone": "",
            "location": location,
            "linkedin": linkedin,
        },
    })

    # Summary
    summary_text = sections_raw.get("summary", "").strip()
    if summary_text and len(summary_text) > 20:
        result_sections.append({
            "key": "summary",
            "label": "Summary",
            "simple": {"id": _uid(), "lines": [summary_text]},
        })

    # Education
    edu_text = sections_raw.get("education", "")
    if edu_text:
        edu = _parse_education_block(edu_text)
        result_sections.append({
            "key": "education",
            "label": "Education",
            "education": {"id": _uid(), **edu},
        })

    # Experience
    exp_text = sections_raw.get("experience", "")
    if exp_text:
        experiences = _parse_experience_block(exp_text)
        if experiences:
            result_sections.append({
                "key": "professional_experience",
                "label": "Professional Experience",
                "experiences": [
                    {
                        "id": _uid(),
                        "company": e.get("company", ""),
                        "role": e.get("role", ""),
                        "date": e.get("date", ""),
                        "location": e.get("location", ""),
                        "bullets": [
                            {"id": _uid(), "text": b}
                            for b in e.get("bullets", [])
                        ] or [{"id": _uid(), "text": ""}],
                    }
                    for e in experiences
                ],
            })

    # Projects
    proj_text = sections_raw.get("projects", "")
    if proj_text:
        # Simple: each line is a project name or description
        proj_lines = [l.strip() for l in proj_text.split("\n") if l.strip() and len(l.strip()) > 5]
        if proj_lines:
            projects = []
            for pl in proj_lines[:5]:
                projects.append({
                    "id": _uid(),
                    "name": pl[:100],
                    "date": "",
                    "location": "",
                    "bullets": [{"id": _uid(), "text": ""}],
                })
            result_sections.append({
                "key": "projects",
                "label": "Projects",
                "projects": projects,
            })

    # Skills
    skills_text = sections_raw.get("skills", "")
    if skills_text:
        skill_lines = [l.strip() for l in skills_text.split("\n") if l.strip() and len(l.strip()) > 1]
        # LinkedIn lists skills one per line; combine into comma-separated
        combined = ", ".join(skill_lines[:20])
        result_sections.append({
            "key": "skills",
            "label": "Skills",
            "simple": {"id": _uid(), "lines": [combined] if combined else [""]},
        })

    # Certifications
    cert_text = sections_raw.get("certifications", "")
    if cert_text:
        cert_lines = [l.strip() for l in cert_text.split("\n") if l.strip() and len(l.strip()) > 3]
        result_sections.append({
            "key": "certifications",
            "label": "Certifications",
            "simple": {"id": _uid(), "lines": cert_lines[:10] or [""]},
        })

    # Honors
    honors_text = sections_raw.get("honors", "")
    if honors_text:
        honor_lines = [l.strip() for l in honors_text.split("\n") if l.strip() and len(l.strip()) > 3]
        result_sections.append({
            "key": "honors_awards",
            "label": "Honors & Awards",
            "simple": {"id": _uid(), "lines": honor_lines[:10] or [""]},
        })

    # Languages
    lang_text = sections_raw.get("languages", "")
    if lang_text:
        lang_lines = [l.strip() for l in lang_text.split("\n") if l.strip() and len(l.strip()) > 1]
        result_sections.append({
            "key": "languages",
            "label": "Languages",
            "simple": {"id": _uid(), "lines": [", ".join(lang_lines[:10])] if lang_lines else [""]},
        })

    return {
        "sections": result_sections,
        "name": name,
        "email": email,
        "headline": headline,
    }


__all__ = ["parse_linkedin_pdf", "parse_linkedin_text"]
