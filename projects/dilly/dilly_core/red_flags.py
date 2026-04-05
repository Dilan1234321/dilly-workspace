"""
Red-flag checks on parsed resume text: recruiter turn-offs and common issues.
Voice: Dilly Hiring Manager (see MERIDIAN_HIRING_MANAGER.md).
Rule-based; no PII beyond what's in the resume. All message copy should sound like Dilly Hiring Manager.
"""

import re
from typing import List, Dict, Any

# .edu validation for magic link is separate; here we only check resume content


def _flag(message: str, line: str | None = None) -> Dict[str, Any]:
    out: Dict[str, Any] = {"message": message}
    if line and line.strip():
        out["line"] = line.strip()[:300]
    return out


def _normalize(s: str) -> str:
    if not s or not s.strip():
        return ""
    return re.sub(r"\s+", " ", s.strip())


def _has_section(text: str, *labels: str) -> bool:
    t = (text or "").upper()
    for label in labels:
        if f"[{label.upper()}]" in t or f"\n{label.upper()}\n" in t:
            return True
    return False


def run_red_flags(
    parsed_resume_text: str,
    raw_text_for_length: str | None = None,
    page_count: int | None = None,
) -> List[Dict[str, Any]]:
    """
    Run red-flag checks on the parsed (MTS) resume text.
    Returns a list of dicts: {"message": str, "line": str | None} with the triggering line when available.

    raw_text_for_length: When provided, the one-page check (when page_count is not used) uses this
    extracted PDF/DOCX text instead of parsed_resume_text.
    page_count: When provided (e.g. from PDF), the one-page check uses this directly: flag if page_count > 1.
    For DOCX, pass None and we fall back to word count (threshold 350).
    """
    if not parsed_resume_text or not parsed_resume_text.strip():
        return []
    text = parsed_resume_text.strip()
    norm = _normalize(text)
    lower = norm.lower()
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    findings: List[Dict[str, Any]] = []

    # 1) "References available upon request" - outdated, wastes space
    ref_match = re.search(r".{0,50}references?.{0,30}(?:upon request|available upon|on request).{0,30}", text, re.IGNORECASE | re.DOTALL)
    if ref_match or ("references" in lower and ("upon request" in lower or "available upon" in lower or "on request" in lower)):
        # Quote only the line that contains the phrase, so we don't show unrelated text (e.g. "fitness / Cooking" from previous section)
        trigger = None
        for line in text.split("\n"):
            if "upon request" in line.lower() or "available upon" in line.lower():
                trigger = _normalize(line.strip())[:80]
                break
        findings.append(_flag("Drop “references upon request”. Hiring managers assume you’ll provide them. Use the space for proof and impact instead.", trigger))

    # 2) Generic objective statement that says nothing
    if _has_section(text, "OBJECTIVE", "SUMMARY") and len(norm) > 20:
        obj_match = re.search(r"\[(?:OBJECTIVE|SUMMARY)\]\s*(.+?)(?=\[|\n\n|$)", text, re.IGNORECASE | re.DOTALL)
        if obj_match:
            obj_content = _normalize(obj_match.group(1))[:200]
            generic_phrases = [
                "seeking a position",
                "looking for an opportunity",
                "to obtain a position",
                "entry-level position",
                "where i can utilize",
                "to leverage my skills",
            ]
            if any(p in obj_content.lower() for p in generic_phrases) and len(obj_content) < 120:
                findings.append(_flag("This objective reads like filler. Replace with one sharp line that states your value, or remove it and use the space for evidence.", obj_content))

    # 3) No dates on education or experience
    date_pattern = re.compile(
        r"\b(?:19|20)\d{2}\b|"
        r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}\b|"
        r"\b(?:Present|Current)\b",
        re.IGNORECASE,
    )
    if "[EDUCATION]" in text.upper() and not date_pattern.search(text):
        ed_section = re.search(r"\[(?:EDUCATION)\]\s*(.+?)(?=\[|\n\n|$)", text, re.IGNORECASE | re.DOTALL)
        snippet = _normalize(ed_section.group(1))[:150] if ed_section else None
        findings.append(_flag("Add graduation or expected graduation dates. Without them, hiring managers can’t place you in the pipeline.", snippet))

    exp_section = re.search(r"\[(?:PROFESSIONAL EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT|EXPERIENCE)\][\s\S]*", text, re.IGNORECASE)
    if exp_section and not date_pattern.search(exp_section.group(0)):
        snippet = _normalize(exp_section.group(0))[:200]
        findings.append(_flag("Add start/end dates to each role (e.g. Jun 2023 – Present). Without dates, experience is hard to trust and harder to scan.", snippet))

    # 4) Very short resume (likely incomplete)
    word_count = len(norm.split())
    if word_count < 80 and "[EXPERIENCE]" in text.upper():
        findings.append(_flag("Resume is too thin. Add concrete bullets with outcomes and scope so we can score you fairly and recruiters can see what you’ve done.", None))

    # 4b) Likely over one page (early-career norm). Prefer PDF page count when available; else word count.
    over_one_page = False
    if page_count is not None:
        over_one_page = page_count > 1
    else:
        length_norm = _normalize(raw_text_for_length) if raw_text_for_length and raw_text_for_length.strip() else norm
        length_word_count = len(length_norm.split()) if length_norm else word_count
        over_one_page = length_word_count > 350  # ~1 page for DOCX; PDFs should use page_count
    if over_one_page:
        findings.append(_flag(
            "Your resume is likely over one page. Many hiring managers and consultants prefer one page for early-career roles. Trim or tighten so the best evidence fits on one page.",
            None,
        ))

    # 5) Duplicate or near-duplicate bullets (same sentence twice)
    bullets = re.findall(r"(?:^|\n)\s*[•\-\*]\s*(.+?)(?=\n\s*[•\-\*]|\n\n|$)", text, re.DOTALL)
    seen_norm: dict[str, str] = {}
    for b in bullets:
        bn = _normalize(b)[:80]
        if bn in seen_norm and len(bn) > 30:
            findings.append(_flag("Same or near-identical bullet appears twice. Remove or rephrase one. Duplicates read as padding.", bn))
            break
        seen_norm[bn] = b.strip()

    # 6) All caps block (hard to read)
    caps_block = re.search(r"\n([A-Z\s]{50,})\n", text)
    if caps_block and len(caps_block.group(1).replace(" ", "")) > 30:
        findings.append(_flag("Long all-caps block is hard to scan. Use sentence case so hiring managers can read it quickly.", caps_block.group(1).strip()[:150]))

    # 7) Missing contact or email
    if not re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", text):
        findings.append(_flag("No email on the resume. Add a professional email so recruiters and advisors can reach you.", None))

    # 8) ATS parseability red flags (from ats_analysis module)
    try:
        from dilly_core.ats_analysis import run_ats_analysis, ATSIssue
        from dilly_core.resume_parser import parse_resume
        parsed = parse_resume(parsed_resume_text)
        ats = run_ats_analysis(
            raw_text=raw_text_for_length or parsed_resume_text,
            parsed=parsed,
            page_count=page_count,
        )
        for issue in ats.issues:
            if issue.severity == "critical":
                findings.append(_flag(
                    f"ATS: {issue.detail} {issue.fix}",
                    issue.line,
                ))
    except Exception:
        pass

    return findings[:12]  # Cap at 12 to avoid noise
