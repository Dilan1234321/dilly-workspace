"""
Meridian LLM Structured Resume - Normalize parsed resume into canonical format using few-shot learning.
When MERIDIAN_USE_LLM and OPENAI_API_KEY are set, the LLM receives raw parser sections and outputs
the canonical [SECTION]\\ncontent format so nothing is dropped (e.g. Relevant Experience, Volunteer, Affiliations).
Few-shot examples are loaded from projects/meridian/prompts/resume_normalizer_examples.json.
"""

import json
import logging
import os
import re
from typing import TYPE_CHECKING, List, Optional

logger = logging.getLogger("meridian.normalizer")
if os.environ.get("MERIDIAN_DEBUG_NORMALIZER", "").strip().lower() in ("1", "true", "yes"):
    logger.setLevel(logging.DEBUG)
    if not logger.handlers:
        logger.addHandler(logging.StreamHandler())

if TYPE_CHECKING:
    from dilly_core.resume_parser import ParsedResume


# Canonical section order and format (must match dilly_core.structured_resume)
CANONICAL_SECTION_ORDER = [
    "[CONTACT / TOP]",
    "[SUMMARY / OBJECTIVE]",
    "[EDUCATION]",
    "[RELEVANT COURSEWORK]",
    "[PROFESSIONAL EXPERIENCE]",
    "[RESEARCH]",
    "[CAMPUS INVOLVEMENT]",
    "[VOLUNTEER EXPERIENCE]",
    "[PROJECTS]",
    "[PUBLICATIONS / PRESENTATIONS]",
    "[SKILLS]",
    "[HONORS]",
    "[CERTIFICATIONS]",
]

SYSTEM_PROMPT = """You are Meridian's resume normalizer. You receive raw resume sections from a parser (section headers may vary: "Relevant Experience", "Leadership Experience", "Volunteer | ...", "Affiliations", etc.). Your job is to output ONE cleaned resume using ONLY the canonical section labels and format below. Do not add markdown, explanations, or content outside the format.

CANONICAL SECTIONS (use exactly these labels, in this order):
1. [CONTACT / TOP]: Name, Email, Phone, Location, LinkedIn if present. No GPA here.
2. [SUMMARY / OBJECTIVE]: Professional summary or career objective (short paragraph). Omit if not in the resume.
3. [EDUCATION]: University, Major(s), Minor(s), Graduation date, Honors. GPA only here if present. Degree line ONLY when the resume explicitly states A.A., A.S., or Associate of Arts/Science; for B.S., B.A., or any Bachelor's, omit the Degree line entirely.
4. [RELEVANT COURSEWORK]: List of relevant courses. Omit if not in the resume.
5. [PROFESSIONAL EXPERIENCE]: Paid work, internships, formal roles.
6. [RESEARCH]: Research experience (lab, PI, publications context). Same entry format: Company/Lab:, Role:, Date:, Location:, Description:
7. [CAMPUS INVOLVEMENT]: Leadership, activities, affiliations, clubs (not volunteer; use [VOLUNTEER EXPERIENCE] for volunteer).
8. [VOLUNTEER EXPERIENCE]: Volunteer roles, community service, unpaid service. Same entry format as experience: Company:, Role:, Date:, Location:, Description:
9. [PROJECTS]: Project name, date, location, description.
10. [PUBLICATIONS / PRESENTATIONS]: Papers, posters, talks. List or short entries (Title:, Venue:, Date:). Omit if not in the resume.
11. [SKILLS]: Simple list (no dates/locations per skill).
12. [HONORS]: Honors and awards (if in honors program, also mention in Education).
13. [CERTIFICATIONS]: Certifications only.

CRITICAL RULES:
- Contact: Put the candidate's full name first (on its own line), then Email:, Phone:, Location: (city, state only). Never put the candidate's name inside the Location field. Do not put section labels like "Education:" in Contact.
- Education: If the resume says "University of Tampa - Honors College" or "University Name - Program Name", the university is the main institution (e.g. "University of Tampa"), not the program. Do not list "Honors College" alone as the university name.
- Preserve ALL content: Never truncate or drop sections. If the input has Professional Experience (or Work Experience, Employment, etc.), output a complete [PROFESSIONAL EXPERIENCE] section with every role and every bullet. Output every section that has content.

FORMAT PER SECTION:
- Contact: Name on first line, then Email:, Phone:, Location: (city, state only), LinkedIn: if present.
- Summary/Objective: One short paragraph; no subfields.
- Education: University:, Major(s):, Minor(s):, Graduation date:, Honors:, and GPA: if present. Use N/A when not stated.
- Relevant Coursework: List of course names (bullets or comma-separated). No dates per course unless the resume has them.
- Professional Experience, Research, Campus Involvement & Volunteer Experience: for EACH entry output:
  Company: <name> (or Lab:/Institution: for Research)
  Role: <title>
  Date: <date range>
  Location: <city, state or N/A>
  Description: <bullets or paragraph>
  (blank line between entries)
- Projects: for each project: Project name:, Date:, Location:, Description:
- Publications/Presentations: List entries or use Title:, Venue/Journal:, Date:, (optional) Authors:. Preserve citations if present.
- Skills / Honors / Certifications: clean list or bullets; merge one-word-per-line into readable lines. Use • for bullets.

MAP non-standard headers into canonical sections:
- "Summary", "Objective", "Professional Summary", "Career Objective" → [SUMMARY / OBJECTIVE]
- "Relevant Coursework", "Coursework", "Selected Coursework" → [RELEVANT COURSEWORK]
- "Relevant Experience", "Work Experience", "Employment" → [PROFESSIONAL EXPERIENCE]
- "Research Experience", "Research" → [RESEARCH]
- "Leadership Experience", "Activities", "Affiliations", "Clubs" → [CAMPUS INVOLVEMENT]
- "Volunteer", "Volunteer Experience", "Community Service" (when volunteer-focused) → [VOLUNTEER EXPERIENCE]
- "Publications", "Presentations", "Papers", "Posters" → [PUBLICATIONS / PRESENTATIONS]
- "Skills and Certifications" → put skills in [SKILLS] and certification lines in [CERTIFICATIONS] if you can split; otherwise keep all under [SKILLS].
- "Honors & Awards" → [HONORS]
Do not create sections for acronyms (GPA, FL, CITI, etc.); fold that content into the right section. Preserve all factual content; do not invent or omit. Output ONLY the cleaned resume text."""

CORRECTION_SYSTEM_PROMPT = """You are Meridian's resume normalizer. Your previous output had specific issues that must be fixed.

You will receive: (1) the list of issues, (2) your previous output, (3) the raw resume sections. You MUST fix every issue in the list. Do not skip any.

Common fixes:
- Contact: First line must be the candidate's full name only. Location: must be only city, state (e.g. "New York, NY"). Never put the person's name in Location.
- Education: University: must be the institution name (e.g. "University of Tampa"), not a program like "Honors College". Keep Major(s):, Minor(s):, Location: separate; do not put major/minor or "Professional" in Location or Minor.
- Professional Experience: Company: = employer/organization name. Role: = job title only. Never put "N/A" for Company when the employer name appears under Role. Never put a bullet or percentage in Role; put that in Description.
- Campus Involvement: Same as experience. Company (or org) = club/org name, Role = position (Member, President, etc.). Move long description text from Role into Description.
- Volunteer Experience: Same format. Company: = organization, Role: = volunteer role, Date:, Location:, Description:. Put volunteer/community service roles here, not in Campus Involvement.
- Research: Same entry format. Company/Lab: = institution or lab, Role: = position (e.g. Research Assistant), Date:, Location:, Description:.
- Summary/Objective: One short paragraph only; no section labels inside it.
- Relevant Coursework: List of course names; preserve as in the resume.
- Publications/Presentations: Preserve citations; use Title:, Venue:, Date: when structuring.
- Projects: Each project gets its own Project name:, Date:, Location:, Description:. Do not merge two projects into one. Do not truncate descriptions (output full sentences).

Preserve every section and all factual content; do not truncate. Output ONLY the corrected full resume text, no preamble or explanation."""


def validate_normalized_output(raw_sections_text: str, normalized_output: str) -> List[str]:
    """
    Detect common normalization failures so we can trigger a corrective LLM pass.
    Returns a list of issue descriptions (empty if output looks acceptable).
    """
    issues: List[str] = []
    if not normalized_output or not normalized_output.strip():
        return ["Output is empty."]
    raw = (raw_sections_text or "").strip()
    out = normalized_output.strip()
    lines = [ln.strip() for ln in out.split("\n") if ln.strip()]

    # Truncation: ends mid-sentence or with incomplete line
    last_line = lines[-1] if lines else ""
    if last_line.endswith(" -") or last_line.endswith(" –") or last_line.endswith(" |") or last_line.endswith(":"):
        issues.append("Output appears truncated (ends mid-sentence or with incomplete line).")
    if len(last_line) > 0 and len(last_line) < 25 and not re.search(r"^\[?[\w\s&/]+\]?$", last_line):
        if "Description:" not in last_line and "Location:" not in last_line:
            issues.append("Output may be truncated (very short final line).")

    # Severe content loss: raw is much larger than output
    if len(raw) > 2000 and len(out) < len(raw) * 0.4:
        issues.append("Output is much shorter than input; content may have been dropped or truncated.")

    # Contact: section label "Education:" in Contact block
    _next = r"\[SUMMARY / OBJECTIVE\]|\[EDUCATION\]|\[RELEVANT COURSEWORK\]|\[PROFESSIONAL EXPERIENCE\]|\[RESEARCH\]|\[CAMPUS INVOLVEMENT\]|\[VOLUNTEER EXPERIENCE\]|\[PROJECTS\]|\[PUBLICATIONS / PRESENTATIONS\]|\[SKILLS\]|\[HONORS\]|\[CERTIFICATIONS\]"
    contact_match = re.search(r"\[CONTACT\s*/\s*TOP\](.*?)(?=" + _next + r"|$)", out, re.DOTALL | re.IGNORECASE)
    if contact_match and "Education:" in contact_match.group(1):
        issues.append("Contact section should not contain 'Education:'; put education content only under [EDUCATION].")

    # Contact: name in Location (alone or before city, state)
    contact_block = (contact_match.group(1) if contact_match else "")
    location_in_contact = re.search(r"Location:\s*([^\n]+)", contact_block)
    if location_in_contact:
        loc_val = location_in_contact.group(1).strip()
        # Looks like "FirstName LastName" only (no comma, no state code)
        if re.match(r"^[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$", loc_val) and "," not in loc_val and not re.search(r"\b(AZ|CA|FL|NY|TX|NJ|IL|PA|OH|GA|NC|MI|MA)\b", loc_val, re.I):
            issues.append("Contact Location should be city, state (e.g. 'New York, NY'), not the candidate's name. Put the candidate's name on the first line of Contact.")
        # "FirstName LastName City, ST" - name stuck in front of location
        if re.search(r"^[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+[A-Za-z\s]+,\s*[A-Z]{2}\b", loc_val):
            issues.append("Contact Location should be only city, state (e.g. 'New York, NY'). Put the candidate's full name on the first line of Contact, not in the Location field.")

    # Education: "University: Honors College" without main institution name
    edu_match = re.search(r"\[EDUCATION\](.*?)(?=\[RELEVANT COURSEWORK\]|\[PROFESSIONAL EXPERIENCE\]|\[RESEARCH\]|\[CAMPUS INVOLVEMENT\]|\[VOLUNTEER EXPERIENCE\]|\[PROJECTS\]|\[PUBLICATIONS / PRESENTATIONS\]|\[SKILLS\]|\[HONORS\]|\[CERTIFICATIONS\]|$)", out, re.DOTALL | re.IGNORECASE)
    if edu_match:
        edu_block = edu_match.group(1)
        if re.search(r"University:\s*Honors\s+College\b", edu_block, re.I):
            issues.append("Education: 'Honors College' is a program, not the university name. Set University: to the main institution (e.g. 'University of Tampa'), not Honors College.")
        # Jumbled fields: Location or Minor containing city/state or stray "Professional"
        if re.search(r"Location:\s*[A-Za-z\s]+(?:Tampa|New York|FL|NY)\b", edu_block, re.I) or re.search(r"Minor\(s\):\s*[^\n]*(?:Tampa,?\s*FL|Professional)\b", edu_block, re.I):
            issues.append("Education: Keep University:, Major(s):, Minor(s):, Graduation date:, and Location: separate. Do not put major/minor or 'Professional' in Location; do not put city/state or 'Professional' in Minor(s).")

    # Education: "Degree: Associate's" but raw doesn't mention associate/A.A./A.S.
    if "Degree: Associate's" in out or "Degree: Associate" in out:
        if not re.search(r"\bA\.A\.|\bA\.S\.|\bAssociate\s+of\s+(Arts|Science)|associate'?s?\b", raw, re.I):
            issues.append("Do not output 'Degree: Associate's' unless the resume explicitly states A.A., A.S., or Associate's. For B.S./B.A., omit the Degree line.")

    # Professional Experience: Company: N/A with Role: that looks like a company name
    pro_match = re.search(r"\[PROFESSIONAL EXPERIENCE\](.*?)(?=\[RESEARCH\]|\[CAMPUS INVOLVEMENT\]|\[VOLUNTEER EXPERIENCE\]|\[PROJECTS\]|\[PUBLICATIONS / PRESENTATIONS\]|\[SKILLS\]|\[HONORS\]|\[CERTIFICATIONS\]|$)", out, re.DOTALL | re.IGNORECASE)
    if pro_match:
        pro_block = pro_match.group(1)
        if "Company: N/A" in pro_block and re.search(r"Role:\s*(?:The\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+Foundation|Properties|Inc|LLC|Corp)?", pro_block):
            issues.append("Professional Experience: Company and Role are swapped. Company: should be the employer name (e.g. KVR Properties); Role: should be the job title (e.g. Artificial Intelligence Engineering Intern).")
        if "Role:" in pro_block and "Description:" in pro_block:
            # Role line containing long description-like text (sentence or percentage)
            if re.search(r"Role:\s*[^\n]{80,}", pro_block) or re.search(r"Role:\s*[^\n]*\d+%", pro_block):
                issues.append("Professional Experience: Role should be the job title only; move bullet/description text to Description:.")

    # Raw had experience/professional content but output section missing or tiny
    raw_lower = raw.lower()
    if any(x in raw_lower for x in ("section: professional experience", "section: work experience", "section: relevant experience", "section: employment")) and not re.search(r"\[PROFESSIONAL EXPERIENCE\]\s*\n\s*Company:", out, re.I):
        issues.append("Input contained Professional/Work/Relevant Experience but output is missing or incomplete. Output a full [PROFESSIONAL EXPERIENCE] section with Company:, Role:, Date:, Location:, Description: for each entry.")

    # Campus Involvement: Company: N/A with Role: that looks like org/club name (same swap as experience)
    campus_match = re.search(r"\[CAMPUS INVOLVEMENT\](.*?)(?=\[VOLUNTEER EXPERIENCE\]|\[PROJECTS\]|\[PUBLICATIONS / PRESENTATIONS\]|\[SKILLS\]|\[HONORS\]|\[CERTIFICATIONS\]|$)", out, re.DOTALL | re.IGNORECASE)
    if campus_match:
        campus_block = campus_match.group(1)
        if "Company: N/A" in campus_block and re.search(r"Role:\s*(?:University of [A-Za-z]+|Alpha [A-Za-z]+ [A-Za-z]+|Mu [A-Za-z]+ [A-Za-z]+|[A-Za-z]+ (?:Club|Society|Chapter)\b)", campus_block):
            issues.append("Campus Involvement: Company (or organization) should be the club/org name (e.g. Alpha Kappa Psi, University of Tampa Data Science Club); Role should be the position (e.g. Member, President). Fix any Company: N/A where Role: is the org name.")
        if re.search(r"Role:\s*[^\n]{80,}", campus_block) or re.search(r"Role:\s*[^\n]*\b(?:website|database|infrastructure)\b", campus_block, re.I):
            issues.append("Campus Involvement: Role should be the position/title only; move description text to Description:.")

    # Volunteer Experience: same Company/Role format as experience and campus
    volunteer_match = re.search(r"\[VOLUNTEER EXPERIENCE\](.*?)(?=\[PROJECTS\]|\[PUBLICATIONS / PRESENTATIONS\]|\[SKILLS\]|\[HONORS\]|\[CERTIFICATIONS\]|$)", out, re.DOTALL | re.IGNORECASE)
    if volunteer_match:
        vol_block = volunteer_match.group(1)
        if "Company: N/A" in vol_block and re.search(r"Role:\s*(?:The\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+Foundation|Charity|Food Bank|Hospital)\b", vol_block):
            issues.append("Volunteer Experience: Company should be the organization name; Role should be the volunteer role/title. Fix any Company: N/A where Role: is the org name.")
        if re.search(r"Role:\s*[^\n]{80,}", vol_block):
            issues.append("Volunteer Experience: Role should be the role/title only; move description text to Description:.")

    # Projects: truncated Description (ends mid-sentence) or two projects merged into one
    proj_match = re.search(r"\[PROJECTS\](.*?)(?=\[PUBLICATIONS / PRESENTATIONS\]|\[SKILLS\]|\[HONORS\]|\[CERTIFICATIONS\]|$)", out, re.DOTALL | re.IGNORECASE)
    if proj_match:
        proj_block = proj_match.group(1)
        if re.search(r"Description:\s*[^\n]*(?:\s+from the|\s+and the|\s+to the|\s+with the)\s*$", proj_block):
            issues.append("Projects: Description appears truncated (ends mid-sentence). Output the full description; do not truncate.")
        # Project name line with two different year dates suggests two projects merged
        if re.search(r"Project name:\s*[^\n]*(?:January|Feb|March|April|May|June|July|Aug|Sept|Oct|Nov|Dec)[^\n]*(?:January|Feb|March|April|May|June|July|Aug|Sept|Oct|Nov|Dec)", proj_block, re.I):
            issues.append("Projects: Split into separate entries. Each project should have its own Project name:, Date:, Location:, Description:. Do not merge two projects into one.")

    return issues


def _find_normalizer_examples_path() -> Optional[str]:
    """Locate resume_normalizer_examples.json under workspace or projects/meridian/prompts."""
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for candidate in (
        os.path.join(os.getcwd(), "projects", "dilly", "prompts", "resume_normalizer_examples.json"),
        os.path.join(os.getcwd(), "prompts", "resume_normalizer_examples.json"),
        os.path.join(_root, "projects", "dilly", "prompts", "resume_normalizer_examples.json"),
    ):
        if candidate and os.path.isfile(candidate):
            return candidate
    return os.path.join(_root, "projects", "dilly", "prompts", "resume_normalizer_examples.json")


def _find_normalizer_live_path() -> Optional[str]:
    """Path for resume_normalizer_live.json (same dir as static examples)."""
    static_path = _find_normalizer_examples_path()
    if not static_path:
        _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(_root, "projects", "dilly", "prompts", "resume_normalizer_live.json")
    return os.path.join(os.path.dirname(static_path), "resume_normalizer_live.json")


# Max live examples to keep on disk and to include in the next prompt
NORMALIZER_LIVE_MAX_EXAMPLES = int(os.environ.get("MERIDIAN_NORMALIZER_LIVE_MAX", "30"))
NORMALIZER_LIVE_IN_PROMPT = int(os.environ.get("MERIDIAN_NORMALIZER_LIVE_IN_PROMPT", "3"))
# Max chars per stored example to avoid huge files
NORMALIZER_LIVE_INPUT_MAX = 15000
NORMALIZER_LIVE_OUTPUT_MAX = 12000


def _append_normalizer_example(raw_sections: str, normalized_output: str) -> None:
    """
    Append one (input, output) to resume_normalizer_live.json so the next resume
    benefits from this example. Best-effort; does not raise.
    """
    if os.environ.get("MERIDIAN_NORMALIZER_LIVE_LEARN", "1").strip().lower() in ("0", "false", "no"):
        return
    path = _find_normalizer_live_path()
    if not path or not os.path.isdir(os.path.dirname(path)):
        return
    raw_sections = (raw_sections or "")[:NORMALIZER_LIVE_INPUT_MAX].strip()
    normalized_output = (normalized_output or "")[:NORMALIZER_LIVE_OUTPUT_MAX].strip()
    if not raw_sections or not normalized_output:
        return
    try:
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = {"examples": []}
        examples = data.get("examples") or []
        examples.append({"input": raw_sections, "output": normalized_output})
        if len(examples) > NORMALIZER_LIVE_MAX_EXAMPLES:
            examples = examples[-NORMALIZER_LIVE_MAX_EXAMPLES:]
        data["examples"] = examples
        tmp_path = path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, path)
        logger.info("Normalizer: appended 1 live example (%d total).", len(examples))
    except Exception as e:
        logger.warning("Normalizer: failed to append live example: %s", e)


def _load_normalizer_examples() -> List[dict]:
    """Load few-shot examples: static (resume_normalizer_examples.json) + last N from live (resume_normalizer_live.json)."""
    path = _find_normalizer_examples_path()
    static = []
    if path and os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            examples = data.get("examples") or data.get("examples_list") or []
            static = [{"input": ex.get("input", ""), "output": ex.get("output", "")} for ex in examples if ex.get("input") and ex.get("output")]
        except Exception:
            pass
    live_path = _find_normalizer_live_path()
    live = []
    if live_path and os.path.isfile(live_path) and NORMALIZER_LIVE_IN_PROMPT > 0:
        try:
            with open(live_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            live_list = data.get("examples") or []
            live = [{"input": ex.get("input", ""), "output": ex.get("output", "")} for ex in live_list[-NORMALIZER_LIVE_IN_PROMPT:] if ex.get("input") and ex.get("output")]
        except Exception:
            pass
    # Static first, then recent live (so model sees stable format + your latest resumes)
    return static + live


def _build_few_shot_prefix() -> str:
    """Build user message prefix from loaded examples. Falls back to minimal inline example if file missing."""
    examples = _load_normalizer_examples()
    if not examples:
        return "Normalize the following raw sections into Meridian canonical format. Use section labels: [CONTACT / TOP], [SUMMARY / OBJECTIVE], [EDUCATION], [RELEVANT COURSEWORK], [PROFESSIONAL EXPERIENCE], [RESEARCH], [CAMPUS INVOLVEMENT], [VOLUNTEER EXPERIENCE], [PROJECTS], [PUBLICATIONS / PRESENTATIONS], [SKILLS], [HONORS], [CERTIFICATIONS]. For experience/research/campus/volunteer use Company:, Role:, Date:, Location:, Description: per entry. Output ONLY the cleaned resume.\n\n---\n"
    parts = ["Below are example inputs (raw sections) and the exact output format you must produce.\n"]
    for i, ex in enumerate(examples, 1):
        parts.append(f"Example {i} - Input (raw sections):\n{ex['input'].strip()}\n\nExample {i} - Your output must look like this (canonical format):\n{ex['output'].strip()}\n\n---\n")
    parts.append("Now normalize the following raw sections into the same canonical format. Output ONLY the cleaned resume, no preamble.")
    return "\n".join(parts)


def serialize_parsed_sections(parsed: "ParsedResume") -> str:
    """Turn ParsedResume.sections into a single text blob for the LLM (Section: key + content)."""
    from dilly_core.resume_parser import ParsedResume
    if not getattr(parsed, "sections", None):
        return ""
    parts = []
    for key, content in parsed.sections.items():
        if not (content and content.strip()):
            continue
        parts.append(f"Section: {key}\n{content.strip()}")
    return "\n\n".join(parts)


def normalize_resume_with_llm(parsed: "ParsedResume") -> Optional[str]:
    """
    Normalize a parsed resume into canonical format using the LLM with few-shot examples.
    Input: raw parser sections (so the LLM can map "Relevant Experience", "Volunteer", etc.).
    Output: single canonical structured resume text. On failure returns None (caller can fall back to rule-based).
    """
    if parsed is None or not getattr(parsed, "sections", None):
        return None
    raw_text = serialize_parsed_sections(parsed)
    if not raw_text.strip():
        return None
    from dilly_core.llm_client import get_chat_completion, is_llm_available
    if not is_llm_available():
        return None
    try:
        raw_text = raw_text[:30000].strip()  # stay within context
        few_shot_prefix = _build_few_shot_prefix()
        user_content = f"{few_shot_prefix}\n\n{raw_text}\n---"
        out = get_chat_completion(
            SYSTEM_PROMPT,
            user_content,
            max_tokens=16000,
            temperature=0.1,
        )
        if not out:
            return None
        out = out.strip()
        if out.startswith("```"):
            out = re.sub(r"^```\w*\n?", "", out)
        if out.endswith("```"):
            out = re.sub(r"\n?```\s*$", "", out)
        out = out.strip() if out else None
        if not out:
            return None

        # Self-check: detect issues and run one corrective pass if needed
        issues = validate_normalized_output(raw_text, out)
        if os.environ.get("MERIDIAN_DEBUG_NORMALIZER", "").strip().lower() in ("1", "true", "yes"):
            import sys
            print(f"[Meridian normalizer] Validation found {len(issues)} issue(s).", file=sys.stderr)
        if issues:
            logger.info("Normalizer validation found %d issue(s), running correction pass.", len(issues))
            if os.environ.get("MERIDIAN_DEBUG_NORMALIZER", "").strip().lower() in ("1", "true", "yes"):
                import sys
                print(f"[Meridian normalizer] Running correction pass...", file=sys.stderr)
            for issue in issues:
                logger.debug("  - %s", issue)
            corrected = _correct_resume_with_llm(raw_text, out, issues)
            if corrected and corrected.strip():
                logger.info("Normalizer correction pass returned %d chars.", len(corrected))
                if os.environ.get("MERIDIAN_DEBUG_NORMALIZER", "").strip().lower() in ("1", "true", "yes"):
                    print(f"[Meridian normalizer] Correction returned {len(corrected)} chars.", file=sys.stderr)
                _append_normalizer_example(raw_text, corrected.strip())
                return corrected.strip()
            logger.warning("Normalizer correction pass returned empty or failed; keeping first pass output.")
            if os.environ.get("MERIDIAN_DEBUG_NORMALIZER", "").strip().lower() in ("1", "true", "yes"):
                print("[Meridian normalizer] Correction returned empty or failed; keeping first pass.", file=sys.stderr)
        _append_normalizer_example(raw_text, out)
        return out
    except Exception as e:
        logger.exception("Normalizer failed: %s", e)
        return None


def _correct_resume_with_llm(
    raw_text: str,
    previous_output: str,
    issues: List[str],
) -> Optional[str]:
    """One corrective LLM call with the listed issues; returns corrected full resume or None."""
    if not issues or not raw_text.strip():
        return None
    try:
        from dilly_core.llm_client import get_chat_completion
        issues_blob = "\n".join(f"- {i}" for i in issues)
        user_content = f"""You MUST fix every issue below. Output a complete corrected canonical resume.

ISSUES TO FIX (fix every one):
{issues_blob}

PREVIOUS OUTPUT (for reference; fix the issues in it):
---
{previous_output[:12000]}
---

RAW SECTIONS (use this to get correct company names, role titles, and full text):
---
{raw_text[:28000]}
---

Output ONLY the corrected full resume. Fix every issue listed above. Do not truncate."""
        out = get_chat_completion(
            CORRECTION_SYSTEM_PROMPT,
            user_content,
            max_tokens=16000,
            temperature=0.1,
        )
        if not out:
            return None
        out = out.strip()
        if out.startswith("```"):
            out = re.sub(r"^```\w*\n?", "", out)
        if out.endswith("```"):
            out = re.sub(r"\n?```\s*$", "", out)
        return out.strip() if out else None
    except Exception as e:
        logger.warning("Normalizer correction pass failed: %s", e)
        return None


def clean_structured_resume_with_llm(messy_structured_text: str) -> str:
    """
    Legacy: clean already-built structured text with the LLM (no raw sections).
    Used when only the rule-based output is available. Prefer normalize_resume_with_llm(parsed) when you have the parsed resume so the LLM can recover dropped sections.
    """
    if not messy_structured_text or not messy_structured_text.strip():
        return messy_structured_text
    from dilly_core.llm_client import get_chat_completion, is_llm_available
    if not is_llm_available():
        return messy_structured_text
    try:
        text = messy_structured_text[:32000].strip()
        user_content = f"Clean and restructure this resume into the canonical format above. Output only the cleaned structured resume.\n\n---\n{text}\n---"
        out = get_chat_completion(SYSTEM_PROMPT, user_content, max_tokens=16000, temperature=0.1)
        if not out:
            return messy_structured_text
        out = out.strip()
        if out.startswith("```"):
            out = re.sub(r"^```\w*\n?", "", out)
        if out.endswith("```"):
            out = re.sub(r"\n?```\s*$", "", out)
        return out.strip() if out else messy_structured_text
    except Exception:
        return messy_structured_text
