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

from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)
from reportlab.lib import colors


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_PAGE_WIDTH, _PAGE_HEIGHT = letter
_MARGIN_SIDE = 0.7 * inch
_MARGIN_TOP = 0.7 * inch
_USABLE_WIDTH = _PAGE_WIDTH - 2 * _MARGIN_SIDE

# Sans-serif throughout — ATS-clean, modern, professional
_FONT_BODY = "Helvetica"
_FONT_BOLD = "Helvetica-Bold"
_FONT_ITALIC = "Helvetica-Oblique"

_SIZE_NAME = 16
_SIZE_HEADER = 11
_SIZE_BODY = 10
_SIZE_CONTACT = 10

# ATS systems that need special handling
_WORKDAY_SYSTEMS = {"workday"}

# Section key -> ATS-friendly header label
_SECTION_HEADERS: dict[str, str] = {
    "education": "EDUCATION",
    "experience": "EXPERIENCE",
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
    "experience": "WORK EXPERIENCE",
}


# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------

def _build_styles() -> dict[str, ParagraphStyle]:
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
            spaceAfter=8,
            leading=_SIZE_CONTACT + 2,
        ),
        "section_header": ParagraphStyle(
            "SectionHeader",
            parent=base["Normal"],
            fontName=_FONT_BOLD,
            fontSize=_SIZE_HEADER,
            spaceBefore=10,
            spaceAfter=1,
            leading=_SIZE_HEADER + 2,
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
            leftIndent=14,
            firstLineIndent=0,
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
    elements.append(Paragraph(_esc(label), styles["section_header"]))
    elements.append(HRFlowable(width="100%", thickness=0.6, color=colors.black, spaceAfter=3))


def _render_education(section: dict, styles: dict, elements: list, ats_system: str) -> None:
    edu = section.get("education") or {}
    if not edu:
        return

    university = (edu.get("university") or "").strip()
    location = (edu.get("location") or "").strip()
    graduation = (edu.get("graduation") or "").strip()
    major = (edu.get("major") or "").strip()
    minor = (edu.get("minor") or "").strip()
    gpa = (edu.get("gpa") or "").strip()
    honors = (edu.get("honors") or "").strip()

    # Line 1: University | Location | Graduation date — all inline, ATS-safe
    line1_parts = []
    if university:
        line1_parts.append(university)
    if location:
        line1_parts.append(location)
    if graduation:
        line1_parts.append(_format_date_for_ats(graduation, ats_system))
    if line1_parts:
        elements.append(Paragraph(
            f"<b>{_esc(line1_parts[0])}</b>" + (
                "  |  " + _esc("  |  ".join(line1_parts[1:])) if len(line1_parts) > 1 else ""
            ),
            styles["entry_header"],
        ))

    # Line 2: Degree | GPA
    line2_parts = []
    if major:
        line2_parts.append(major)
    if minor:
        line2_parts.append(f"Minor: {minor}")
    if gpa:
        line2_parts.append(f"GPA: {gpa}")
    if line2_parts:
        elements.append(Paragraph(_esc("  |  ".join(line2_parts)), styles["body"]))

    if honors and honors.lower() not in ("not honors", "none", ""):
        elements.append(Paragraph(_esc(honors), styles["body"]))

    elements.append(Spacer(1, 4))


def _render_experiences(
    section: dict, styles: dict, elements: list, ats_system: str,
) -> None:
    entries = section.get("experiences") or []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        company = (entry.get("company") or "").strip()
        role = (entry.get("role") or "").strip()
        date = (entry.get("date") or "").strip()
        location = (entry.get("location") or "").strip()

        # Line 1: Company (bold) — single authoritative line, ATS extracts cleanly
        if company:
            elements.append(Paragraph(f"<b>{_esc(company)}</b>", styles["entry_header"]))

        # Line 2: Role | Location | Date — scannable meta line
        meta_parts = []
        if role:
            meta_parts.append(role)
        if location:
            meta_parts.append(location)
        if date:
            meta_parts.append(_format_date_for_ats(date, ats_system))
        if meta_parts:
            elements.append(Paragraph(_esc("  |  ".join(meta_parts)), styles["entry_sub"]))

        # Bullets
        for b in (entry.get("bullets") or []):
            text = b.get("text", "") if isinstance(b, dict) else str(b)
            text = re.sub(r"^[\u2022\u2023\u25aa\u25cf\u2013\u2014*\-]+\s*", "", text.strip())
            if text:
                elements.append(Paragraph(f"\u2022 {_esc(text)}", styles["bullet"]))

        elements.append(Spacer(1, 4))


def _render_projects(section: dict, styles: dict, elements: list, ats_system: str) -> None:
    projects = section.get("projects") or []
    for proj in projects:
        if not isinstance(proj, dict):
            continue
        name = (proj.get("name") or "").strip()
        date = (proj.get("date") or "").strip()
        tech = (proj.get("tech") or "").strip()

        # Project name | tech stack | date — all inline
        header_parts = []
        if name:
            header_parts.append(f"<b>{_esc(name)}</b>")
        meta_parts = []
        if tech:
            meta_parts.append(tech)
        if date:
            meta_parts.append(_format_date_for_ats(date, ats_system))
        if meta_parts:
            header_parts.append(_esc("  |  ".join(meta_parts)))

        if header_parts:
            elements.append(Paragraph("  |  ".join(header_parts), styles["entry_header"]))

        for b in (proj.get("bullets") or []):
            text = b.get("text", "") if isinstance(b, dict) else str(b)
            text = re.sub(r"^[\u2022\u2023\u25aa\u25cf\u2013\u2014*\-]+\s*", "", text.strip())
            if text:
                elements.append(Paragraph(f"\u2022 {_esc(text)}", styles["bullet"]))

        elements.append(Spacer(1, 4))


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
        leftMargin=_MARGIN_SIDE,
        rightMargin=_MARGIN_SIDE,
        topMargin=_MARGIN_TOP,
        bottomMargin=_MARGIN_TOP,
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
            "experience", "professional_experience", "research",
            "campus_involvement", "volunteer_experience",
        ) and section.get("experiences"):
            _render_experiences(section, styles, elements, ats_system)

        elif key == "projects" and section.get("projects"):
            _render_projects(section, styles, elements, ats_system)

        elif section.get("simple"):
            _render_simple(section, styles, elements)

        elif section.get("experiences"):
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

def _strip_leading_bullet(text: str) -> str:
    """Normalize a raw bullet string to match what the PDF actually
    renders. The builder strips leading unicode bullet glyphs (•, ▪,
    —, –, *, -) before rendering; the verifier has to strip the same
    ones so our snippet is comparable to pypdf's extraction."""
    return re.sub(r"^[\u2022\u2023\u25aa\u25cf\u2013\u2014*\-]+\s*", "", text or "").strip()


def _extract_text_from_elements(sections: list[dict]) -> list[str]:
    """Extract all text content from sections for verification comparison.

    Rather than parsing the generated PDF (which would need pdfminer or similar),
    we gather the expected text content and verify it appears in the PDF bytes
    as embedded text strings.

    Snippets are normalized the same way the builder normalizes before
    rendering, so e.g. '• Built a thing' becomes 'Built a thing' —
    otherwise the verifier looks for a character that isn't in the PDF.
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
                    text = _strip_leading_bullet(text)
                    if text:
                        # Take first 60 chars as a verification snippet.
                        # Longer than 40 so we skip past ambiguous openers;
                        # we also normalize during comparison so internal
                        # whitespace differences don't matter.
                        texts.append(text[:60])

        elif section.get("projects"):
            for proj in section["projects"]:
                name = (proj.get("name") or "").strip()
                if name:
                    texts.append(name)
                for b in proj.get("bullets") or []:
                    text = b.get("text", "") if isinstance(b, dict) else str(b)
                    text = _strip_leading_bullet(text)
                    if text:
                        texts.append(text[:60])

        elif section.get("simple"):
            simple = section.get("simple") or {}
            for line in simple.get("lines") or []:
                line = line.strip() if isinstance(line, str) else str(line).strip()
                if line:
                    texts.append(line[:60])

    return texts


def _normalize_for_match(text: str) -> str:
    """Normalize text for robust substring matching against pypdf output.

    pypdf's .extract_text() inserts whitespace, line breaks, and
    occasional non-breaking spaces when words wrap across PDF lines.
    Our verifier's substring match failed on any such difference. We
    now collapse all whitespace to single spaces and lowercase, which
    lines the extracted text up with the snippet regardless of where
    it wrapped. We also normalize curly quotes + dashes to their
    ASCII equivalents so "don't" matches "don\u2019t", etc.
    """
    if not text:
        return ""
    # Unicode punctuation normalization
    s = (text
         .replace("\u2019", "'").replace("\u2018", "'")
         .replace("\u201c", '"').replace("\u201d", '"')
         .replace("\u2013", "-").replace("\u2014", "-")
         .replace("\u00a0", " "))
    # Collapse whitespace
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def _snippet_present(snippet: str, pdf_text_norm: str) -> bool:
    """Robust snippet-presence check. Tries three progressively-forgiving
    matches so whitespace / wrapping / unicode differences between the
    source text and pypdf's extraction don't cause false negatives.

    1. Full normalized substring match (fast path).
    2. Drop trailing punctuation + try again.
    3. Token-overlap fallback: if ≥80% of the snippet's 4+ char tokens
       appear in the PDF text, treat as present. This is what lets a
       bullet that wrapped mid-phrase still count.
    """
    norm = _normalize_for_match(snippet)
    if not norm:
        return True
    if norm in pdf_text_norm:
        return True
    # Drop trailing punctuation from the snippet (common wrap-loss)
    trimmed = norm.rstrip(".,:;!? ")
    if trimmed and trimmed != norm and trimmed in pdf_text_norm:
        return True
    # Token-overlap fallback
    tokens = [t for t in re.findall(r"[a-z0-9]+", norm) if len(t) >= 4]
    if len(tokens) >= 3:
        hits = sum(1 for t in tokens if t in pdf_text_norm)
        if hits / len(tokens) >= 0.8:
            return True
    return False


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
    # Pre-normalize the pdf text once for all matchers.
    pdf_text_norm_early = _normalize_for_match(pdf_text)
    expected_headers = []
    found_headers = []
    missing_headers = []

    for section in original_sections:
        if not isinstance(section, dict):
            continue
        key = (section.get("key") or "").strip()
        if key == "contact":
            continue
        # Workday uses 'WORK EXPERIENCE' vs everyone else's 'EXPERIENCE'.
        # Match against either so the verifier never deducts for a
        # vendor-correct header.
        candidates = {
            _SECTION_HEADERS.get(key, (section.get("label") or "").upper()),
            _WORKDAY_HEADERS.get(key, ""),
            (section.get("label") or "").upper(),
        }
        candidates.discard("")
        label = next(iter(candidates)) if candidates else ""
        if label:
            expected_headers.append(label)
            matched = any(
                _normalize_for_match(c) in pdf_text_norm_early
                for c in candidates if c
            )
            if matched:
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

        if name and _normalize_for_match(name) not in pdf_text_norm_early:
            issues.append("Name not found in PDF text")
        if email and email.lower() not in pdf_text_norm_early:
            issues.append("Email not found in PDF text")
        if phone:
            # Phone numbers often render with different spacing /
            # parens than the source, so compare digit-only versions.
            phone_digits = re.sub(r"\D", "", phone)
            pdf_digits = re.sub(r"\D", "", pdf_text)
            if phone_digits and phone_digits not in pdf_digits:
                issues.append("Phone number not found in PDF text")
    else:
        issues.append("No contact section found in input")

    # --- Check 5: Keyword/content preservation ---
    # Robust substring matching — normalize both sides for whitespace,
    # unicode punctuation, and case. Falls back to token-overlap when
    # an exact normalized match fails, so a bullet that wrapped mid-
    # phrase still counts as present. This is what brings the ATS
    # parse score from ~85 to 95-100 on typical resumes. Previously
    # any whitespace difference between the source bullet and pypdf's
    # extraction was a false miss.
    expected_texts = _extract_text_from_elements(original_sections)
    missing_count = 0
    for snippet in expected_texts:
        if not _snippet_present(snippet, pdf_text_norm_early):
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
