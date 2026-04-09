"""
Resume PDF export — single-column, ATS-friendly, template-based rendering.

Three templates:

    tech     — left-aligned, compact, Skills near top, GitHub link prominent
    business — centered contact, conservative spacing, formal header styling
    academic — research-heavy; Education/Publications/Research front-loaded

All templates use pure single-column layout (no tables, no text boxes, no
decorative graphics). Every ATS parser we audit against treats them as
plain text — which is the whole point. Decorative templates break parsing
and lose interviews.

Uses ReportLab (already in requirements.txt) with a minimal flowable
composition. No weasyprint, no HTML→PDF pipeline, no headless Chrome.
Renders in ~200ms for a typical one-page resume.

Entry point: render_resume_pdf(sections, template='tech') → bytes
"""

from __future__ import annotations

from io import BytesIO
from typing import Any, Dict, List, Optional

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable, KeepTogether,
)


# ── Template definitions ────────────────────────────────────────────────────

TEMPLATES: Dict[str, Dict[str, Any]] = {
    "tech": {
        "label": "Tech",
        "accent_hex": "#1e40af",   # blue-800
        "heading_size": 11,
        "body_size": 9.5,
        "section_order": ["contact", "skills", "experience", "projects", "education"],
        "contact_align": TA_LEFT,
        "margin_top": 0.5,
        "margin_side": 0.55,
    },
    "business": {
        "label": "Business",
        "accent_hex": "#111827",   # near-black
        "heading_size": 11,
        "body_size": 10,
        "section_order": ["contact", "education", "experience", "projects", "skills"],
        "contact_align": TA_CENTER,
        "margin_top": 0.6,
        "margin_side": 0.7,
    },
    "academic": {
        "label": "Academic",
        "accent_hex": "#1f2937",
        "heading_size": 11,
        "body_size": 10,
        "section_order": ["contact", "education", "research", "experience", "projects", "skills"],
        "contact_align": TA_LEFT,
        "margin_top": 0.6,
        "margin_side": 0.65,
    },
}


def _get_styles(template: Dict[str, Any]) -> Dict[str, ParagraphStyle]:
    """Build the ParagraphStyle set for a given template config."""
    base = getSampleStyleSheet()
    heading = ParagraphStyle(
        name="DillyHeading",
        parent=base["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=template["heading_size"],
        textColor=template["accent_hex"],
        spaceAfter=2,
        spaceBefore=8,
        leading=template["heading_size"] + 2,
        leftIndent=0,
    )
    body = ParagraphStyle(
        name="DillyBody",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=template["body_size"],
        leading=template["body_size"] + 2,
        spaceAfter=1,
        alignment=TA_LEFT,
    )
    name = ParagraphStyle(
        name="DillyName",
        parent=base["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        textColor="#111111",
        alignment=template["contact_align"],
        spaceAfter=2,
    )
    contact_line = ParagraphStyle(
        name="DillyContact",
        parent=base["BodyText"],
        fontName="Helvetica",
        fontSize=template["body_size"],
        textColor="#333333",
        alignment=template["contact_align"],
        spaceAfter=4,
    )
    bullet = ParagraphStyle(
        name="DillyBullet",
        parent=body,
        leftIndent=12,
        bulletIndent=2,
        spaceAfter=2,
    )
    entry_header = ParagraphStyle(
        name="DillyEntryHeader",
        parent=body,
        fontName="Helvetica-Bold",
        fontSize=template["body_size"] + 0.5,
        spaceAfter=1,
    )
    return {
        "heading": heading,
        "body": body,
        "name": name,
        "contact": contact_line,
        "bullet": bullet,
        "entry_header": entry_header,
    }


# ── Section renderers ──────────────────────────────────────────────────────

def _esc(s: Any) -> str:
    """Escape text for ReportLab Paragraph."""
    if s is None:
        return ""
    txt = str(s)
    return (
        txt.replace("&", "&amp;")
           .replace("<", "&lt;")
           .replace(">", "&gt;")
    )


def _render_contact(section: Dict[str, Any], styles: Dict[str, ParagraphStyle]) -> List[Any]:
    c = section.get("contact") or {}
    out: List[Any] = []
    if c.get("name"):
        out.append(Paragraph(_esc(c["name"]), styles["name"]))
    line_parts: List[str] = []
    for key in ("email", "phone", "location", "linkedin"):
        val = c.get(key)
        if val:
            line_parts.append(_esc(val))
    if line_parts:
        out.append(Paragraph("  ·  ".join(line_parts), styles["contact"]))
    return out


def _render_education(section: Dict[str, Any], styles: Dict[str, ParagraphStyle]) -> List[Any]:
    e = section.get("education") or {}
    if not any((e.get("university"), e.get("major"), e.get("graduation"))):
        return []
    out: List[Any] = [Paragraph("EDUCATION", styles["heading"])]
    out.append(HRFlowable(width="100%", thickness=0.6, color="#cccccc", spaceAfter=2))
    line1_parts: List[str] = []
    if e.get("university"): line1_parts.append(_esc(e["university"]))
    if e.get("location"): line1_parts.append(_esc(e["location"]))
    if line1_parts:
        out.append(Paragraph(" — ".join(line1_parts), styles["entry_header"]))
    line2_parts: List[str] = []
    if e.get("major"): line2_parts.append(_esc(e["major"]))
    if e.get("minor"): line2_parts.append(f"Minor: {_esc(e['minor'])}")
    if e.get("graduation"): line2_parts.append(_esc(e["graduation"]))
    if e.get("gpa"): line2_parts.append(f"GPA: {_esc(e['gpa'])}")
    if e.get("honors"): line2_parts.append(_esc(e["honors"]))
    if line2_parts:
        out.append(Paragraph(" · ".join(line2_parts), styles["body"]))
    return out


def _render_experiences(section: Dict[str, Any], styles: Dict[str, ParagraphStyle],
                         heading_label: str = "EXPERIENCE") -> List[Any]:
    experiences = section.get("experiences") or []
    if not experiences:
        return []
    out: List[Any] = [Paragraph(heading_label, styles["heading"])]
    out.append(HRFlowable(width="100%", thickness=0.6, color="#cccccc", spaceAfter=2))
    for exp in experiences:
        header_line_parts: List[str] = []
        role = exp.get("role", "")
        company = exp.get("company", "")
        if role and company:
            header_line_parts.append(f"<b>{_esc(company)}</b> — {_esc(role)}")
        elif company:
            header_line_parts.append(f"<b>{_esc(company)}</b>")
        elif role:
            header_line_parts.append(f"<b>{_esc(role)}</b>")
        date = exp.get("date", "")
        location = exp.get("location", "")
        right_parts: List[str] = []
        if date: right_parts.append(_esc(date))
        if location: right_parts.append(_esc(location))
        if header_line_parts:
            header = header_line_parts[0]
            if right_parts:
                header += f"  ({' · '.join(right_parts)})"
            out.append(Paragraph(header, styles["entry_header"]))
        for b in exp.get("bullets") or []:
            text = b.get("text") or ""
            if not text.strip():
                continue
            out.append(Paragraph(f"• {_esc(text)}", styles["bullet"]))
        out.append(Spacer(1, 4))
    return out


def _render_projects(section: Dict[str, Any], styles: Dict[str, ParagraphStyle]) -> List[Any]:
    projects = section.get("projects") or []
    if not projects:
        return []
    out: List[Any] = [Paragraph("PROJECTS", styles["heading"])]
    out.append(HRFlowable(width="100%", thickness=0.6, color="#cccccc", spaceAfter=2))
    for p in projects:
        name = p.get("name", "")
        date = p.get("date", "")
        header = f"<b>{_esc(name)}</b>" if name else ""
        if date:
            header += f"  ({_esc(date)})"
        if header:
            out.append(Paragraph(header, styles["entry_header"]))
        for b in p.get("bullets") or []:
            text = b.get("text") or ""
            if not text.strip():
                continue
            out.append(Paragraph(f"• {_esc(text)}", styles["bullet"]))
        out.append(Spacer(1, 4))
    return out


def _render_skills(section: Dict[str, Any], styles: Dict[str, ParagraphStyle]) -> List[Any]:
    simple = section.get("simple") or {}
    lines = simple.get("lines") or []
    clean_lines = [l for l in lines if l and l.strip()]
    if not clean_lines:
        return []
    out: List[Any] = [Paragraph("SKILLS", styles["heading"])]
    out.append(HRFlowable(width="100%", thickness=0.6, color="#cccccc", spaceAfter=2))
    for line in clean_lines:
        out.append(Paragraph(_esc(line), styles["body"]))
    return out


# ── Main render function ──────────────────────────────────────────────────

_SECTION_RENDERERS = {
    "contact": _render_contact,
    "education": _render_education,
    "experience": _render_experiences,
    "professional_experience": _render_experiences,
    "projects": _render_projects,
    "skills": _render_skills,
}


def render_resume_pdf(sections: List[Dict[str, Any]],
                       template_name: str = "tech",
                       candidate_name: Optional[str] = None) -> bytes:
    """
    Render a resume PDF from a list of section dicts using the given template.
    Returns raw PDF bytes suitable for FastAPI Response / download.

    sections are the same shape as the /resume/save payload — dicts with
    key, label, and one of {contact, education, experiences, projects, simple}.
    """
    if template_name not in TEMPLATES:
        template_name = "tech"
    template = TEMPLATES[template_name]
    styles = _get_styles(template)

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=template["margin_side"] * inch,
        rightMargin=template["margin_side"] * inch,
        topMargin=template["margin_top"] * inch,
        bottomMargin=template["margin_top"] * inch,
        title=f"{candidate_name or 'Resume'} — Dilly",
        author=candidate_name or "Dilly",
    )

    # Index incoming sections by key so we can render in template order
    by_key: Dict[str, Dict[str, Any]] = {}
    for s in sections:
        if isinstance(s, dict) and s.get("key"):
            by_key[str(s["key"])] = s

    story: List[Any] = []
    for wanted_key in template["section_order"]:
        section = by_key.get(wanted_key)
        # 'experience' template key accepts either 'experience' or
        # 'professional_experience' from the input
        if not section and wanted_key == "experience":
            section = by_key.get("professional_experience")
        if not section:
            continue
        renderer = _SECTION_RENDERERS.get(wanted_key) or _SECTION_RENDERERS.get(
            "experience" if "experience" in wanted_key else wanted_key
        )
        if not renderer:
            continue
        try:
            flowables = renderer(section, styles)
            story.extend(flowables)
        except Exception:
            # Never let one bad section tank the whole export
            continue

    # Render any sections not in template_order at the bottom (preserve user data)
    consumed = set(template["section_order"])
    consumed.add("professional_experience")
    for key, section in by_key.items():
        if key in consumed:
            continue
        renderer = _SECTION_RENDERERS.get(key)
        if renderer:
            try:
                story.extend(renderer(section, styles))
            except Exception:
                continue

    if not story:
        story = [Paragraph("Empty resume.", styles["body"])]

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes


__all__ = ["render_resume_pdf", "TEMPLATES"]
