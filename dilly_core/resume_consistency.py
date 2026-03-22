"""
Resume consistency checks on the parsed (MTS) resume text.
Detects: (1) duplicate facts (e.g. minor in Education and under an experience entry),
(2) description–role misattribution (e.g. PEACE description actually describing EPC role).
No raw PDF required; self-consistency only.
"""

import re
from typing import Dict, List, Tuple

from dilly_core.format_audit import parse_parsed_into_sections

# Education section keys
_EDUCATION_KEYS = frozenset("education academic academics".split())
# Experience-like section keys (we extract Company/Role/Description from these)
_EXPERIENCE_SECTION_KEYS = frozenset([
    "professional experience", "work experience", "employment", "experience",
    "campus involvement", "volunteer experience", "research",
])


def _normalize(s: str) -> str:
    if not s or not s.strip():
        return ""
    return re.sub(r"\s+", " ", s.strip()).strip()


def _extract_education_facts(education_body: str) -> List[str]:
    """
    Extract minor(s), honor names, and similar facts that should live only in Education.
    Returns list of normalized phrases (e.g. "Leadership Studies", "Phi Eta Sigma Honor Society").
    """
    facts: List[str] = []
    if not education_body or not education_body.strip():
        return facts
    # Minor(s): X, Y or Minor: X (match "Minor(s):" with optional parentheses)
    m = re.search(r"Minor\s*\(?s\)?\s*:\s*([^\n]+)", education_body, re.IGNORECASE)
    if m:
        part = m.group(1).strip()
        for item in re.split(r"[,&]", part):
            item = _normalize(item)
            if item and len(item) > 2 and item.upper() not in ("N/A", "NA"):
                facts.append(item)
    # Honors: X, Y
    m = re.search(r"Honors?\s*:\s*([^\n]+)", education_body, re.IGNORECASE)
    if m:
        part = m.group(1).strip()
        for item in re.split(r"[,&]|(?:\s+and\s+)", part):
            item = _normalize(item)
            if item and len(item) > 2 and item.upper() not in ("N/A", "NA"):
                facts.append(item)
    return facts


def _section_display_name(section_key: str) -> str:
    return section_key.replace("_", " ").title()


def _find_duplicate_facts(sections: Dict[str, str]) -> List[str]:
    """
    Find education-type facts that appear in both Education and an experience section.
    Returns list of human-readable finding strings.
    """
    findings: List[str] = []
    education_body = ""
    for key in _EDUCATION_KEYS:
        if key in sections:
            education_body += "\n" + (sections[key] or "")
    if not education_body.strip():
        return findings
    facts = _extract_education_facts(education_body)
    if not facts:
        return findings

    for section_key, body in sections.items():
        if section_key in _EDUCATION_KEYS or not body or not body.strip():
            continue
        if section_key not in _EXPERIENCE_SECTION_KEYS:
            continue
        body_norm = _normalize(body).lower()
        section_name = _section_display_name(section_key)
        for fact in facts:
            if not fact or len(fact) < 3:
                continue
            # Fact appears in this section? (substring match, word boundary friendly)
            pattern = re.escape(fact)
            if re.search(pattern, body, re.IGNORECASE):
                # Prefer citing the company/role if we can (first "Company: X" in this block)
                company_match = re.search(r"Company\s*:\s*([^\n]+)", body, re.IGNORECASE)
                role_match = re.search(r"Role\s*:\s*([^\n]+)", body, re.IGNORECASE)
                if company_match and role_match:
                    company = _normalize(company_match.group(1))
                    role = _normalize(role_match.group(1))
                    if company.upper() != "N/A":
                        findings.append(
                            f"\"{fact}\" appears in both Education and under {company} ({section_name}). "
                            f"Consider removing it from the {company} entry. It already belongs in Education."
                        )
                        continue
                findings.append(
                    f"\"{fact}\" appears in both Education and in {section_name}. "
                    f"Consider removing it from {section_name} to avoid repetition."
                )
    return findings


def _parse_experience_entries_from_formatted(body: str) -> List[Dict[str, str]]:
    """
    Parse structured block that already has 'Company:', 'Role:', 'Description:' labels.
    Returns list of {company, role, description} (section set by caller).
    """
    entries: List[Dict[str, str]] = []
    blocks = re.split(r"\n(?=Company\s*:)", body, flags=re.IGNORECASE)
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        company = ""
        role = ""
        m_company = re.search(r"Company\s*:\s*([^\n]+)", block, re.IGNORECASE)
        if m_company:
            company = _normalize(m_company.group(1))
        m_role = re.search(r"Role\s*:\s*([^\n]+)", block, re.IGNORECASE)
        if m_role:
            role = _normalize(m_role.group(1))
        m_desc = re.search(r"Description\s*:\s*(.*)", block, re.IGNORECASE | re.DOTALL)
        description = ""
        if m_desc:
            description = _normalize(m_desc.group(1))
        if company.upper() == "N/A":
            company = ""
        if role.upper() == "N/A":
            role = ""
        if description.upper() in ("N/A", "NA", ""):
            description = ""
        entries.append({"company": company, "role": role, "description": description})
    return entries


def _collect_all_experience_entries(sections: Dict[str, str]) -> List[Dict[str, str]]:
    """Return list of {section_name, company, role, description} for each experience entry."""
    out: List[Dict[str, str]] = []
    for section_key, body in sections.items():
        if section_key not in _EXPERIENCE_SECTION_KEYS or not body or not body.strip():
            continue
        section_name = _section_display_name(section_key)
        for e in _parse_experience_entries_from_formatted(body):
            e["section_name"] = section_name
            out.append(e)
    return out


_DESCRIPTION_FIT_SYSTEM = """You are a resume quality checker. You compare each experience entry's description to its stated Company and Role.

Given a list of experience entries (Company, Role, Section) and their descriptions, your job is to identify MISATTRIBUTION: when a description clearly describes a different role or company than the one it is listed under.

For example: if "Director of Community Outreach at PEACE Volunteer Center" has a description that talks about "Sustainable Spartan Markets" and "Market Coordinator" and coordinating vendors, that description might actually belong under "Market Coordinator at Environmental Protection Coalition." Output that mismatch.

Output ONLY lines of the form:
Under [Company] / [Role]: the description belongs under [Other Company] / [Other Role].

If every description fits its entry, output exactly: NONE

Be concise. One line per mismatch. No other text."""


def _check_description_role_fit(entries: List[Dict[str, str]]) -> List[str]:
    """
    Use LLM to detect when a description belongs to a different Company/Role.
    Returns list of finding strings.
    """
    findings: List[str] = []
    # Only entries with non-empty description
    with_desc = [e for e in entries if e.get("description") and len((e.get("description") or "").strip()) > 30]
    if not with_desc:
        return findings
    try:
        from dilly_core.llm_client import get_chat_completion, is_llm_available
    except Exception:
        return findings
    if not is_llm_available():
        return findings

    lines = []
    for i, e in enumerate(with_desc):
        company = (e.get("company") or "").strip() or "N/A"
        role = (e.get("role") or "").strip() or "N/A"
        section = (e.get("section_name") or "").strip()
        desc = (e.get("description") or "").strip()
        lines.append(f"Entry {i + 1} ({section}): Company: {company}, Role: {role}\nDescription: {desc[:500]}")
    user_content = "Experience entries and their descriptions:\n\n" + "\n\n".join(lines)
    user_content += "\n\nList any mismatches (description under wrong entry), or output NONE if all fit."

    out = get_chat_completion(_DESCRIPTION_FIT_SYSTEM, user_content, max_tokens=500, temperature=0.0)
    if not out or not out.strip():
        return findings
    out = out.strip()
    if out.upper() == "NONE" or "none" in out.lower()[:10]:
        return findings
    for line in out.split("\n"):
        line = line.strip()
        if not line or len(line) < 20:
            continue
        # Normalize to a clear suggestion
        if "belongs under" in line.lower() or "description" in line.lower():
            findings.append(
                "Resume consistency: " + line.rstrip(".")
                + " Double-check that each role has the correct description."
            )
    return findings


def run_consistency_checks(parsed_resume_text: str) -> List[str]:
    """
    Run duplicate-fact and description–role consistency checks on the parsed (MTS) resume text.
    Returns a list of human-readable finding strings to show in the audit (e.g. in a "Resume consistency" section).
    """
    if not parsed_resume_text or not parsed_resume_text.strip():
        return []
    sections = parse_parsed_into_sections(parsed_resume_text)
    findings: List[str] = []

    # 1) Duplicate facts (e.g. Leadership Studies in Education and under PLF)
    duplicate_findings = _find_duplicate_facts(sections)
    findings.extend(duplicate_findings)

    # 2) Description–role fit (LLM)
    entries = _collect_all_experience_entries(sections)
    desc_findings = _check_description_role_fit(entries)
    findings.extend(desc_findings)

    return findings
