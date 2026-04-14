"""
ATS-Verified PDF Resume Generator.

Generates clean, single-column PDF resumes from structured resume sections JSON,
optimized for ATS (Applicant Tracking System) parsing. Supports per-vendor
formatting adjustments for Greenhouse, Lever, Ashby, Workday, and SmartRecruiters.

Usage:
    pdf_bytes = build_ats_pdf(sections, ats_system="greenhouse")
    verification = verify_ats_compatibility(pdf_bytes, sections)
    result = sections_to_pdf_response(sections, "greenhouse", "Jane Doe", "SWE", "Google")
"""

from __future__ import annotations

import base64
import io
import re
from typing import Optional

from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib import colors


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_PAGE_WIDTH, _PAGE_HEIGHT = letter
_MARGIN = 0.5 * inch
_USABLE_WIDTH = _PAGE_WIDTH - 2 * _MARGIN

_FONT_BODY = "Times-Roman"
_FONT_BOLD = "Times-Bold"
_FONT_ITALIC = "Times-Italic"

_SIZE_NAME = 14
_SIZE_HEADER = 11
_SIZE_BODY = 10
_SIZE_CONTACT = 10

# ATS systems that need special handling
_WORKDAY_SYSTEMS = {"workday"}

# Section key -> ATS-friendly header label
_SECTION_HEADERS: dict[str, str] = {
    "education": "EDUCATION",
    "professional_experience": "EXPERIENCE",
    "research": "RESEARCH EXPERIENCE",
    "campus_involvement": "LEADERSHIP & INVOLVEMENT",
    "volunteer_experience": "VOLUNTEER EXPERIENCE",
    "projects": "PROJECTS",
    "skills": "SKILLS",
    "certifications": "CERTIFICATIONS",
    "honors": "HONORS & AWARDS",
    "coursework": "RELEVANT COURSEWORK",
    "publications": "PUBLICATIONS",
    "summary": "SUMMARY",
}

# Workday overrides
_WORKDAY_HEADERS: dict[str, str] = {
    **_SECTION_HEADERS,
    "professional_experience": "WORK EXPERIENCE",
}


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

def _build_styles() -> dict[str, ParagraphStyle]:
    """Build paragraph styles for the PDF."""
    base = getSampleStyleSheet()
    return {
        "name": ParagraphStyle(
            "ResumeName",
            parent=base["Normal"],
            fontName=_FONT_BOLD,
            fontSize=_SIZE_NAME,
            alignment=TA_CENTER,
            spaceAfter=2,
            leading=_SIZE_NAME + 2,
        ),
        "contact": ParagraphStyle(
            "ResumeContact",
            parent=base["Normal"],
            fontName=_FONT_BODY,
            fontSize=_SIZE_CONTACT,
            alignment=TA_CENTER,
            spaceAfter=6,
            leading=_SIZE_CONTACT + 2,
        ),
        "section_header": ParagraphStyle(
            "SectionHeader",
            parent=base["Normal"],
            fontName=_FONT_BOLD,
            fontSize=_SIZE_HEADER,
            spaceBefore=8,
            spaceAfter=3,
            leading=_SIZE_HEADER + 2,
            borderWidth=0.5,
            borderColor=colors.black,
            borderPadding=(0, 0, 1, 0),
        ),
        "entry_header": ParagraphStyle(
            "EntryHeader",
            parent=base["Normal"],
            fontName=_FONT_BOLD,
            fontSize=_SIZE_BODY,
            spaceAfter=1,
            leading=_SIZE_BODY + 2,
        ),
        "entry_sub": ParagraphStyle(
            "EntrySub",
            parent=base["Normal"],
            fontName=_FONT_ITALIC,
            fontSize=_SIZE_BODY,
            spaceAfter=1,
            leading=_SIZE_BODY + 2,
        ),
        "body": ParagraphStyle(
            "ResumeBody",
            parent=base["Normal"],
            fontName=_FONT_BODY,
            fontSize=_SIZE_BODY,
            spaceAfter=1,
            leading=_SIZE_BODY + 3,
        ),
        "bullet": ParagraphStyle(
            "ResumeBullet",
            parent=base["Normal"],
            fontName=_FONT_BODY,
            fontSize=_SIZE_BODY,
            leftIndent=12,
            spaceAfter=1,
            leading=_SIZE_BODY + 3,
        ),
    }


# ---------------------------------------------------------------------------
# Date formatting helpers
# ---------------------------------------------------------------------------

def _format_date_for_ats(date_str: str, ats_system: str) -> str:
    """Format date string for specific ATS systems.

    Workday requires MM/YYYY format. Others accept most standard formats.
    """
    if not date_str or not date_str.strip():
        return date_str or ""

    date_str = date_str.strip()

    if ats_system not in _WORKDAY_SYSTEMS:
        return date_str

    # For Workday: convert common formats to MM/YYYY
    # "May 2024" -> "05/2024"
    month_map = {
        "jan": "01", "january": "01",
        "feb": "02", "february": "02",
        "mar": "03", "march": "03",
        "apr": "04", "april": "04",
        "may": "05",
        "jun": "06", "june": "06",
        "jul": "07", "july": "07",
        "aug": "08", "august": "08",
        "sep": "09", "september": "09",
        "oct": "10", "october": "10",
        "nov": "11", "november": "11",
        "dec": "12", "december": "12",
    }

    # Handle ranges like "Aug 2023 - May 2025" or "Aug 2023 - Present"
    range_match = re.match(
        r"([A-Za-z]+\.?\s*\d{4})\s*[-\u2013\u2014]\s*(.+)",
        date_str,
    )
    if range_match:
        start = _convert_single_date(range_match.group(1).strip(), month_map)
        end_raw = range_match.group(2).strip()
        if end_raw.lower() == "present":
            end = "Present"
        else:
            end = _convert_single_date(end_raw, month_map)
        return f"{start} - {end}"

    return _convert_single_date(date_str, month_map)


def _convert_single_date(date_str: str, month_map: dict[str, str]) -> str:
    """Convert a single date like 'May 2024' to '05/2024'."""
    m = re.match(r"([A-Za-z]+)\.?\s*(\d{4})", date_str.strip())
    if m:
        month_lower = m.group(1).lower()
        if month_lower in month_map:
            return f"{month_map[month_lower]}/{m.group(2)}"
    return date_str


# ---------------------------------------------------------------------------
# XML escaping
# ---------------------------------------------------------------------------

def _esc(text: str) -> str:
    """Escape text for ReportLab XML paragraphs."""
    if not text:
        return ""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


# ---------------------------------------------------------------------------
# Section renderers
# ---------------------------------------------------------------------------

def _render_contact(section: dict, styles: dict, elements: list) -> None:
    """Render the contact section: name centered bold, info line centered."""
    contact = section.get("contact") or {}
    name = (contact.get("name") or "").strip()
    if name:
        elements.append(Paragraph(_esc(name), styles["name"]))

    parts = []
    for field in ("email", "phone", "location", "linkedin"):
        val = (contact.get(field) or "").strip()
        if val:
            parts.append(val)
    if parts:
        elements.append(Paragraph(_esc(" | ".join(parts)), styles["contact"]))


def _render_section_divider(label: str, styles: dict, elements: list) -> None:
    """Render a section header with a bottom border line."""
    # Use a table with a bottom border for a clean ATS-safe divider
    header_para = Paragraph(f"<b>{_esc(label)}</b>", styles["section_header"])
    t = Table([[header_para]], colWidths=[_USABLE_WIDTH])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.black),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(t)


def _render_education(section: dict, styles: dict, elements: list, ats_system: str) -> None:
    """Render education section."""
    edu = section.get("education") or {}
    if not edu:
        return

    university = (edu.get("university") or "").strip()
    location = (edu.get("location") or "").strip()
    graduation = (edu.get("graduation") or "").strip()

    # University line with location/graduation right-aligned via table
    if university:
        right_parts = []
        if location:
            right_parts.append(location)
        if graduation:
            right_parts.append(_format_date_for_ats(graduation, ats_system))
        right_text = ", ".join(right_parts)

        left = Paragraph(f"<b>{_esc(university)}</b>", styles["entry_header"])
        right = Paragraph(_esc(right_text), ParagraphStyle(
            "RightAlign", fontName=_FONT_BODY, fontSize=_SIZE_BODY,
            alignment=TA_RIGHT, leading=_SIZE_BODY + 2,
        ))
        t = Table([[left, right]], colWidths=[_USABLE_WIDTH * 0.65, _USABLE_WIDTH * 0.35])
        t.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        elements.append(t)

    # Degree line
    degree_parts = []
    major = (edu.get("major") or "").strip()
    minor = (edu.get("minor") or "").strip()
    gpa = (edu.get("gpa") or "").strip()

    if major:
        degree_parts.append(major)
    if minor:
        degree_parts.append(f"Minor: {minor}")
    if gpa:
        degree_parts.append(f"GPA: {gpa}")
    if degree_parts:
        elements.append(Paragraph(_esc(" | ".join(degree_parts)), styles["body"]))

    # Honors
    honors = (edu.get("honors") or "").strip()
    if honors and honors.lower() != "not honors":
        elements.append(Paragraph(_esc(honors), styles["body"]))

    elements.append(Spacer(1, 3))


def _render_experiences(
    section: dict, styles: dict, elements: list, ats_system: str,
) -> None:
    """Render experience entries (professional, research, volunteer, etc.)."""
    entries = section.get("experiences") or []
    for entry in entries:
        company = (entry.get("company") or "").strip()
        role = (entry.get("role") or "").strip()
        date = (entry.get("date") or "").strip()
        location = (entry.get("location") or "").strip()

        # Company/Role on left, date on right
        left_text = ""
        if company and role:
            left_text = f"<b>{_esc(company)}</b> - {_esc(role)}"
        elif company:
            left_text = f"<b>{_esc(company)}</b>"
        elif role:
            left_text = f"<b>{_esc(role)}</b>"

        right_parts = []
        if date:
            right_parts.append(_format_date_for_ats(date, ats_system))
        if location:
            right_parts.append(location)
        right_text = " | ".join(right_parts)

        if left_text:
            left = Paragraph(left_text, styles["entry_header"])
            right = Paragraph(_esc(right_text), ParagraphStyle(
                "RightAlign", fontName=_FONT_BODY, fontSize=_SIZE_BODY,
                alignment=TA_RIGHT, leading=_SIZE_BODY + 2,
            ))
            t = Table([[left, right]], colWidths=[_USABLE_WIDTH * 0.65, _USABLE_WIDTH * 0.35])
            t.setStyle(TableStyle([
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            elements.append(t)

        # Bullets
        bullets = entry.get("bullets") or []
        for b in bullets:
            text = b.get("text", "") if isinstance(b, dict) else str(b)
            text = text.strip()
            if not text:
                continue
            # Strip existing bullet chars, then add a simple dash
            text = re.sub(r"^[\u2022\u2023\u25aa\u25cf\u2013\u2014*\-]+\s*", "", text)
            elements.append(Paragraph(f"- {_esc(text)}", styles["bullet"]))

        elements.append(Spacer(1, 3))


def _render_projects(section: dict, styles: dict, elements: list, ats_system: str) -> None:
    """Render project entries."""
    projects = section.get("projects") or []
    for proj in projects:
        name = (proj.get("name") or "").strip()
        date = (proj.get("date") or "").strip()
        location = (proj.get("location") or "").strip()

        left_text = f"<b>{_esc(name)}</b>" if name else ""
        right_parts = []
        if date:
            right_parts.append(_format_date_for_ats(date, ats_system))
        if location:
            right_parts.append(location)
        right_text = " | ".join(right_parts)

        if left_text:
            left = Paragraph(left_text, styles["entry_header"])
            right = Paragraph(_esc(right_text), ParagraphStyle(
                "RightAlign", fontName=_FONT_BODY, fontSize=_SIZE_BODY,
                alignment=TA_RIGHT, leading=_SIZE_BODY + 2,
            ))
            t = Table([[left, right]], colWidths=[_USABLE_WIDTH * 0.65, _USABLE_WIDTH * 0.35])
            t.setStyle(TableStyle([
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            elements.append(t)

        bullets = proj.get("bullets") or []
        for b in bullets:
            text = b.get("text", "") if isinstance(b, dict) else str(b)
            text = text.strip()
            if not text:
                continue
            text = re.sub(r"^[\u2022\u2023\u25aa\u25cf\u2013\u2014*\-]+\s*", "", text)
            elements.append(Paragraph(f"- {_esc(text)}", styles["bullet"]))

        elements.append(Spacer(1, 3))


def _render_simple(section: dict, styles: dict, elements: list) -> None:
    """Render a simple section (skills, honors, coursework, etc.)."""
    simple = section.get("simple") or {}
    lines = simple.get("lines") or []
    for line in lines:
        line = line.strip() if isinstance(line, str) else str(line).strip()
        if line:
            elements.append(Paragraph(_esc(line), styles["body"]))
    if lines:
        elements.append(Spacer(1, 3))


# ---------------------------------------------------------------------------
# Main PDF builder
# ---------------------------------------------------------------------------

def build_ats_pdf(sections: list[dict], ats_system: str = "greenhouse") -> bytes:
    """Build an ATS-optimized PDF from structured resume sections.

    Args:
        sections: List of section dicts matching the ResumeSection schema.
                  Each has a 'key' field and the relevant data field
                  (contact, education, experiences, projects, simple).
        ats_system: Target ATS system. One of: greenhouse, lever, ashby,
                    workday, smartrecruiters. Affects date formatting and
                    section header labels.

    Returns:
        PDF file bytes.
    """
    ats_system = (ats_system or "greenhouse").lower().strip()
    headers = _WORKDAY_HEADERS if ats_system in _WORKDAY_SYSTEMS else _SECTION_HEADERS
    styles = _build_styles()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=_MARGIN,
        rightMargin=_MARGIN,
        topMargin=_MARGIN,
        bottomMargin=_MARGIN,
        title="Resume",
        author="Dilly",
    )

    elements: list = []

    for section in sections:
        if not isinstance(section, dict):
            continue
        key = (section.get("key") or "").strip()
        label = section.get("label") or ""

        if key == "contact":
            _render_contact(section, styles, elements)
            continue

        # Section header
        header_label = headers.get(key, label.upper() if label else key.upper().replace("_", " "))
        if header_label:
            _render_section_divider(header_label, styles, elements)

        # Dispatch to the right renderer
        if key == "education" and section.get("education"):
            _render_education(section, styles, elements, ats_system)

        elif key in (
            "professional_experience", "research",
            "campus_involvement", "volunteer_experience",
        ) and section.get("experiences"):
            _render_experiences(section, styles, elements, ats_system)

        elif key == "projects" and section.get("projects"):
            _render_projects(section, styles, elements, ats_system)

        elif section.get("simple"):
            _render_simple(section, styles, elements)

        elif section.get("experiences"):
            # Catch-all for custom experience-like sections
            _render_experiences(section, styles, elements, ats_system)

        elif section.get("projects"):
            _render_projects(section, styles, elements, ats_system)

    # Build PDF
    if not elements:
        # Empty resume fallback
        elements.append(Paragraph("(No resume content provided)", styles["body"]))

    doc.build(elements)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# ATS Verification
# ---------------------------------------------------------------------------

def _extract_text_from_elements(sections: list[dict]) -> list[str]:
    """Extract all text content from sections for verification comparison.

    Rather than parsing the generated PDF (which would need pdfminer or similar),
    we gather the expected text content and verify it appears in the PDF bytes
    as embedded text strings.
    """
    texts: list[str] = []

    for section in sections:
        if not isinstance(section, dict):
            continue
        key = (section.get("key") or "").strip()

        if key == "contact":
            contact = section.get("contact") or {}
            for field in ("name", "email", "phone", "location"):
                val = (contact.get(field) or "").strip()
                if val:
                    texts.append(val)

        elif key == "education":
            edu = section.get("education") or {}
            for field in ("university", "major", "gpa"):
                val = (edu.get(field) or "").strip()
                if val:
                    texts.append(val)

        elif section.get("experiences"):
            for entry in section["experiences"]:
                for field in ("company", "role"):
                    val = (entry.get(field) or "").strip()
                    if val:
                        texts.append(val)
                for b in entry.get("bullets") or []:
                    text = b.get("text", "") if isinstance(b, dict) else str(b)
                    text = text.strip()
                    if text:
                        # Take first 40 chars as a verification snippet
                        texts.append(text[:40])

        elif section.get("projects"):
            for proj in section["projects"]:
                name = (proj.get("name") or "").strip()
                if name:
                    texts.append(name)
                for b in proj.get("bullets") or []:
                    text = b.get("text", "") if isinstance(b, dict) else str(b)
                    text = text.strip()
                    if text:
                        texts.append(text[:40])

        elif section.get("simple"):
            simple = section.get("simple") or {}
            for line in simple.get("lines") or []:
                line = line.strip() if isinstance(line, str) else str(line).strip()
                if line:
                    texts.append(line[:40])

    return texts


def verify_ats_compatibility(
    pdf_bytes: bytes, original_sections: list[dict],
) -> dict:
    """Verify that the generated PDF is ATS-compatible.

    Checks that all content is embedded as extractable text in the PDF
    (not as images or vector drawings), that section headers are present,
    and that contact info is included.

    Args:
        pdf_bytes: The generated PDF file bytes.
        original_sections: The original sections JSON used to generate the PDF.

    Returns:
        Dict with:
            passed: bool
            score: 0-100
            checks: dict of individual check results
            issues: list of problem descriptions
    """
    issues: list[str] = []
    checks: dict[str, object] = {}

    # --- Check 1: PDF is not empty and has content ---
    if len(pdf_bytes) < 500:
        issues.append("PDF is suspiciously small -- may be empty or corrupted")

    # --- Check 2: Text is extractable (embedded as text, not images) ---
    # Use pypdf to extract text the way an ATS parser would.
    pdf_text = ""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        page_texts = []
        for page in reader.pages:
            page_texts.append(page.extract_text() or "")
        pdf_text = "\n".join(page_texts)
    except Exception:
        # Fallback: scan raw bytes for text fragments
        pdf_text = pdf_bytes.decode("latin-1", errors="ignore")

    checks["text_extractable"] = len(pdf_text.strip()) > 50

    if not checks["text_extractable"]:
        issues.append("PDF does not contain extractable text")

    # --- Check 3: Section headers are present ---
    expected_headers = []
    found_headers = []
    missing_headers = []

    for section in original_sections:
        if not isinstance(section, dict):
            continue
        key = (section.get("key") or "").strip()
        if key == "contact":
            continue
        label = _SECTION_HEADERS.get(key, (section.get("label") or "").upper())
        if label:
            expected_headers.append(label)
            if label in pdf_text or label.lower() in pdf_text.lower():
                found_headers.append(label)
            else:
                missing_headers.append(label)

    checks["sections_found"] = found_headers
    checks["sections_missing"] = missing_headers
    if missing_headers:
        issues.append(f"Missing section headers: {', '.join(missing_headers)}")

    # --- Check 4: Contact info is present ---
    contact_section = None
    for s in original_sections:
        if isinstance(s, dict) and s.get("key") == "contact":
            contact_section = s.get("contact") or {}
            break

    if contact_section:
        name = (contact_section.get("name") or "").strip()
        email = (contact_section.get("email") or "").strip()
        phone = (contact_section.get("phone") or "").strip()

        if name and name not in pdf_text:
            issues.append("Name not found in PDF text")
        if email and email not in pdf_text:
            issues.append("Email not found in PDF text")
        if phone and phone not in pdf_text:
            issues.append("Phone number not found in PDF text")
    else:
        issues.append("No contact section found in input")

    # --- Check 5: Keyword/content preservation ---
    expected_texts = _extract_text_from_elements(original_sections)
    missing_count = 0
    for snippet in expected_texts:
        # Check if the snippet (or a close match) appears in the PDF
        if snippet not in pdf_text:
            # Try with HTML escaping reversed
            clean = snippet.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            if clean not in pdf_text:
                missing_count += 1

    total_texts = len(expected_texts)
    preservation_rate = ((total_texts - missing_count) / total_texts * 100) if total_texts > 0 else 100
    checks["keywords_preserved"] = missing_count == 0
    checks["keyword_preservation_rate"] = round(preservation_rate, 1)

    if missing_count > 0:
        issues.append(
            f"{missing_count}/{total_texts} content snippets not found in PDF text "
            f"({preservation_rate:.0f}% preservation rate)"
        )

    # --- Check 6: Formatting cleanliness ---
    # Verify no image objects, no fancy encoding
    has_images = b"/Subtype /Image" in pdf_bytes
    checks["formatting_clean"] = not has_images
    if has_images:
        issues.append("PDF contains image objects -- ATS may not extract text from images")

    # --- Compute score ---
    score = 100
    if not checks["text_extractable"]:
        score -= 40
    if missing_headers:
        score -= len(missing_headers) * 5
    if missing_count > 0:
        score -= min(30, int(missing_count * 3))
    if has_images:
        score -= 10
    if issues and "contact" in " ".join(issues).lower():
        score -= 5

    score = max(0, min(100, score))
    passed = score >= 80 and checks["text_extractable"] and not missing_headers

    return {
        "passed": passed,
        "score": score,
        "checks": checks,
        "issues": issues,
    }


# ---------------------------------------------------------------------------
# Convenience wrapper for API response
# ---------------------------------------------------------------------------

def sections_to_pdf_response(
    sections: list[dict],
    ats_system: str,
    user_name: str,
    job_title: str,
    company: str,
) -> dict:
    """Generate PDF, verify it, and return base64 bytes + verification result.

    Args:
        sections: Resume sections JSON (list of dicts).
        ats_system: Target ATS system name.
        user_name: Candidate's name for the filename.
        job_title: Target job title for the filename.
        company: Target company for the filename.

    Returns:
        Dict with pdf_base64, filename, content_type, size_bytes, and verification.
    """
    pdf_bytes = build_ats_pdf(sections, ats_system)
    verification = verify_ats_compatibility(pdf_bytes, sections)

    # Build a clean filename
    safe_name = re.sub(r"[^\w\s\-]", "", user_name or "Resume").strip()
    safe_title = re.sub(r"[^\w\s\-]", "", job_title or "").strip()
    safe_company = re.sub(r"[^\w\s\-]", "", company or "").strip()

    if safe_title and safe_company:
        filename = f"{safe_name} - {safe_title} at {safe_company} Resume.pdf"
    elif safe_company:
        filename = f"{safe_name} - {safe_company} Resume.pdf"
    else:
        filename = f"{safe_name} Resume.pdf"

    return {
        "pdf_base64": base64.b64encode(pdf_bytes).decode("ascii"),
        "filename": filename,
        "content_type": "application/pdf",
        "size_bytes": len(pdf_bytes),
        "verification": verification,
    }
