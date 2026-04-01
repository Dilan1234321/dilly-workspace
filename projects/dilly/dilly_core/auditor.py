"""
Meridian Auditor - Full pipeline: extract text → signals → scoring + track audit.
Uses only proven data (zero hallucination). Call from FastAPI or CLI.
"""

import os
import re
from dataclasses import dataclass, field
from typing import List, Optional

from dilly_core.scoring import (
    ScoringSignals,
    extract_scoring_signals,
    compute_smart_score,
    compute_grit_score,
    apply_international_multiplier,
)
from dilly_core.tracks import (
    run_track_audit,
    get_default_track_for_major,
    get_composite_weights,
)


@dataclass
class AuditorResult:
    """Full audit result: metadata, scores, and evidence-based findings."""
    candidate_name: str
    major: str
    track: str
    smart_score: float
    grit_score: float
    build_score: float
    final_score: float
    audit_findings: List[str]
    evidence_smart: List[str]
    evidence_grit: List[str]
    evidence_build: List[str] = field(default_factory=list)  # Build-dimension evidence; LLM fills, rule-based may leave empty
    # Display-only: narrative + "From your resume" for UI breakdown; no formula/calculation (feels like magic).
    evidence_smart_display: Optional[str] = None
    evidence_grit_display: Optional[str] = None
    evidence_build_display: Optional[str] = None
    evidence_quotes: Optional[dict] = None  # {"smart": "quote", "grit": "quote", "build": "quote"} from LLM; exact snippet from resume per dimension
    recommendations: Optional[List[dict]] = None  # [{type, title, action, current_line?, suggested_line?, score_target?}] when LLM gives personalized recs
    dilly_take: Optional[str] = None  # One-line consultant headline (LLM output)


# Section headers that are never candidate names
_NAME_HEADER_BLACKLIST = frozenset(
    "education experience summary objective skills contact profile qualifications employment references".split()
)
# Words that indicate a line is not a name (sentence/header)
_NAME_REJECT_WORDS = frozenset(
    "university college coursework bachelor experience internship relevant expected graduation".split()
)


def standardize_name(name: str) -> str:
    """
    Apply standardized capitalization: Title Case (each word first letter upper, rest lower).
    Preserve surname particles (Mc, Mac, De, Del, La, Le, O') so "DeLoe" and "McLaughlin" stay intact.
    E.g. "BRIDGET E. KLAUS" -> "Bridget E. Klaus", "luke deloe" -> "Luke DeLoe".
    """
    if not name or not name.strip():
        return name
    words = name.strip().split()
    result = []
    for w in words:
        if not w:
            continue
        # Preserve single-letter initials as "X." or "X"
        if len(w) == 1 or (len(w) == 2 and w.endswith(".")):
            result.append(w.upper())
        # Preserve capital after surname particle (Mc, Mac, De, Del, La, Le, O') so DeLoe, McLaughlin stay
        else:
            m = re.match(r"^(Mc|Mac|De|Del|La|Le|O')([A-Za-z]+)$", w, re.IGNORECASE)
            if m and m.group(2):
                part1, rest = m.group(1), m.group(2)
                part1 = part1[0].upper() + part1[1:].lower() if len(part1) > 1 else part1.upper()
                rest = rest[0].upper() + rest[1:].lower()
                result.append(part1 + rest)
            else:
                result.append(w.capitalize())
    return " ".join(result)


def _clean_line_for_name(line: str) -> str:
    """Remove contact info from a line to get a possible name."""
    for sep in ["|", "\u2022", "\u00b7"]:
        line = line.split(sep)[0].strip()
    line = re.sub(r"\S+@\S+\.\S+", "", line)
    line = re.sub(r"https?://\S+|www\.\S+|linkedin\.com/\S*|linkedin|github", "", line, flags=re.IGNORECASE)
    line = re.sub(r"[\d\s\-\.\(\)]{7,}", " ", line)
    # Remove city, state (e.g. "Tampa, FL" or "New York, NY")
    line = re.sub(r"[A-Za-z\s]+,\s*[A-Z]{2}\b", "", line)
    return re.sub(r"\s+", " ", line).strip()


def _looks_like_name(name: str) -> bool:
    """True if string looks like a person name (2–4 words, mostly letters)."""
    if not name or len(name) < 3 or len(name) > 50:
        return False
    name = name[:50].rstrip(" |\u2022\u00b7,-")
    words = name.split()
    if len(words) < 2 or len(words) > 4:
        return False
    lower = name.lower()
    if lower in _NAME_HEADER_BLACKLIST:
        return False
    if any(w in lower for w in _NAME_REJECT_WORDS):
        return False
    # Each word: letters only, or one letter + period (initial)
    for w in words:
        if not w:
            return False
        cleaned = w.strip(".")
        if not cleaned.replace(".", "").isalpha():
            return False
    return True


def name_from_filename(filename: str) -> str:
    """
    Derive a display name from a resume filename. Used as fallback when text extraction fails.
    E.g. "Dilan Kochhar Résumé.docx.pdf" -> "Dilan Kochhar", "Michael_Zeltser_Resume.pdf" -> "Michael Zeltser".
    Returns standardized Title Case.
    """
    if not filename or not filename.strip():
        return "Unknown"
    base = os.path.basename(filename).strip()
    base, _ = os.path.splitext(base)
    if base.lower().endswith(".docx"):
        base, _ = os.path.splitext(base)
    base = base.replace("_", " ")
    base = re.sub(r"\s*\(\d+\)\s*$", "", base)  # (2), (1)
    base = re.sub(r"\b(resume|résumé|cv)\b", "", base, flags=re.IGNORECASE)
    base = re.sub(r"\s+", " ", base).strip()
    if not base or len(base) < 2:
        return "Unknown"
    return standardize_name(base[:50].strip())


def _merge_split_name_lines(lines: List[str]) -> List[str]:
    """
    Merge lines that look like one word split across two (e.g. "BROCKENBRO" + "UGH" -> "BROCKENBROUGH").
    """
    if not lines:
        return []
    merged = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        # If this line is a single alpha word and next line is a short single alpha word, might be name split
        if i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if (
                next_line
                and " " not in line
                and " " not in next_line
                and line.isalpha()
                and next_line.isalpha()
                and len(line) + len(next_line) <= 15
            ):
                merged.append(line + next_line)
                i += 2
                continue
        merged.append(line)
        i += 1
    return merged


def extract_candidate_name(raw_text: str, filename: Optional[str] = None) -> str:
    """
    Extract candidate name from resume text. Uses unified parser (layout-agnostic, multi-strategy).
    """
    from dilly_core.resume_parser import parse_resume
    parsed = parse_resume(raw_text, filename=filename)
    return parsed.name if parsed.name != "Unknown" else (name_from_filename(filename) if filename else "Unknown")


def extract_major_from_text(raw_text: str) -> str:
    """
    Extract major/degree from resume text. Uses unified parser (education block + keyword scan).
    """
    from dilly_core.resume_parser import parse_resume
    parsed = parse_resume(raw_text, filename=None)
    return parsed.major


# Majors that are typical pre-health paths. Only these get Pre-Health from "clinical"/"medical" etc.;
# Marine Science, Chemistry, Physics, etc. stay Science unless explicit intent (pre-med, MCAT, etc.).
_HEALTH_CAPABLE_MAJORS = frozenset({
    "Biology", "Biochemistry", "Biochemistry and Allied Health", "Allied Health", "Biomedical Sciences",
    "Nursing", "Public Health", "Health Science", "Human Performance",
})
# Business/communications majors: only assign Pre-Health if explicit intent appears in degree/objective zone (first N chars).
_BUSINESS_AND_COMMS_MAJORS = frozenset({
    "Marketing", "International Business", "International Business & Marketing", "Marketing & Finance",
    "Management", "Business Management", "Finance", "Economics", "Accounting", "Entrepreneurship", "Sport Management",
    "Communication", "Communication and Media Studies", "Communication and Speech Studies",
    "Advertising and Public Relations", "Journalism",
})
_PRE_HEALTH_STRONG_PHRASES = (
    "pre-health", "pre-med", "premed", "pre-medicine", "medical school", "mcat", "bs/do", "lecom",
    "pre-dental", "pre-pa", "pre-ot", "pre-pt", "pre-physical therapy", "pre-occupational therapy",
    "physician shadowing", "osteopathic", "amat", "amsa",
)
_DEGREE_ZONE_LEN = 600

# Majors that commonly feed into law school. Only these get Pre-Law from inferred signals (mock trial, legal internship, etc.).
_PRE_LAW_CAPABLE_MAJORS = frozenset({
    "History", "Political Science", "Philosophy", "Criminology", "Criminology and Criminal Justice",
    "Law, Justice and Advocacy", "English", "Writing", "Sociology", "International Studies",
    "History & International Studies", "Liberal Studies", "Applied Linguistics",
})
# Resume signals that suggest pre-law intent when not explicitly stated (club, internship, activity).
_PRE_LAW_SIGNAL_PHRASES = [
    "mock trial", "moot court", "legal internship", "legal intern", "paralegal",
    "law club", "pre-law", "prelaw", "law school", "lsat", "juris", "jd ",
    "judicial internship", "judicial extern", "legal clinic", "legal aid",
    "debate team", "debate club", "speech and debate", "model un", "model united nations",
    "advocacy", "legislative", "legislation", "policy memo", "briefing memo",
    "constitutional", "legal research", "legal writing", "legal assistant",
]


def get_track_from_major_and_text(major: str, raw_text: str) -> str:
    """
    Resolve track from major + text. Pre-Health and Pre-Law are tracks (intent), not majors;
    assigned only when the resume explicitly mentions that intent (or, for Pre-Health, major is
    health-capable and moderate keywords appear).
    Order: explicit "track: X" > Pre-Health (text) > Pre-Law (text) > major default > Humanities.
    For business/communications majors, Pre-Health only if strong intent appears in degree/objective zone (first 600 chars).
    """
    t = (raw_text or "").lower()
    major_base = (major or "").strip()
    for sep in [" & ", "–", " - ", "-"]:
        if sep in major_base:
            major_base = major_base.split(sep)[0].strip()
            break
    # Explicit track label in text wins
    for track_name in ["Pre-Health", "Pre-Law", "Tech", "Science", "Business", "Finance", "Consulting", "Communications", "Education", "Arts", "Humanities"]:
        if f"track: {track_name.lower()}" in t or f"track: {track_name.lower()}" in t[:600]:
            return track_name
    # Pre-Health: explicit intent phrases → Pre-Health, unless major is business/comms (then require strong phrase in degree zone).
    pre_health_explicit = [
        "pre-med", "pre-medicine", "premed", "pre-dental", "pre-dent", "pre-pa", "pre-physician assistant",
        "pre-ot", "pre-occupational therapy", "pre-pharmacy", "pre-vet", "pre-veterinary",
        "pre-physical therapy", "pre-pt", "osteopathic", "lecom", "bs/do", "mcat", "dat ", "dat.",
        "amat", "amsa", "pre-health", "medical school", "physician shadowing", "medical assistant",
        "patient care", "emt",
    ]
    pre_health_explicit_word_boundary = ["scribe", "scribing"]  # \b so "describe" doesn't match
    would_be_pre_health = False
    if any(k in t for k in pre_health_explicit):
        would_be_pre_health = True
    if not would_be_pre_health and any(re.search(r"\b" + re.escape(w) + r"\b", t) for w in pre_health_explicit_word_boundary):
        would_be_pre_health = True
    if would_be_pre_health:
        if major_base in _BUSINESS_AND_COMMS_MAJORS:
            degree_zone = t[:_DEGREE_ZONE_LEN]
            if not any(p in degree_zone for p in _PRE_HEALTH_STRONG_PHRASES):
                would_be_pre_health = False
        if would_be_pre_health:
            return "Pre-Health"
    # Moderate keywords (clinical, medical, shadowing, hospital, physician): only override when major is health-capable
    pre_health_moderate = ["clinical", "medical", "shadowing", "hospital", "physician"]
    if major_base in _HEALTH_CAPABLE_MAJORS and any(k in t for k in pre_health_moderate):
        return "Pre-Health"
    # Allied Health / health-capable + PT/OT/observation → Pre-Health (so we distinguish from non–pre-health Allied Health)
    if major_base in _HEALTH_CAPABLE_MAJORS and any(
        phrase in t for phrase in ["physical therapy", "occupational therapy", "observation hours"]
    ):
        return "Pre-Health"
    # Pre-Law: explicit intent phrases → Pre-Law
    if any(k in t for k in ["pre-law", "prelaw", "paralegal", "law school", "lsat", "moot court", "mock trial", "juris", "jd "]):
        return "Pre-Law"
    # Consulting: explicit intent (MBB, strategy, case work)
    if any(k in t for k in ["consulting", "strategy consulting", "case interview", "mckinsey", "bcg", "bain", "management consulting"]):
        return "Consulting"
    # Pre-Law inferred: pre-law–capable major + resume signals (mock trial club, legal internship, advocacy, policy memos, etc.)
    if major_base in _PRE_LAW_CAPABLE_MAJORS and any(phrase in t for phrase in _PRE_LAW_SIGNAL_PHRASES):
        return "Pre-Law"
    # Else: default track for this major (Marine Science → Science, etc.)
    return get_default_track_for_major(major)


def get_rule_based_recommendations(track: str, major: str, raw_text: str) -> List[dict]:
    """
    Rule-based recommendations (e.g. state pre-PT/pre-OT so Dilly and reviewers recognize intent).
    Merged with LLM or benchmark recs in the API.
    """
    recs: List[dict] = []
    if not raw_text:
        return recs
    t = raw_text.lower()
    major_base = (major or "").strip()
    for sep in [" & ", "–", " - ", "-"]:
        if sep in major_base:
            major_base = major_base.split(sep)[0].strip()
            break
    # Pre-Health + Allied Health (or health-capable) but no explicit "Pre-PT"/"Pre-OT"/"Pre-Health" → suggest stating it
    if track == "Pre-Health" and major_base in _HEALTH_CAPABLE_MAJORS:
        explicit_intent = ["pre-pt", "pre-ot", "pre-physical therapy", "pre-occupational therapy", "pre-health", "pre-med"]
        if not any(ex in t for ex in explicit_intent):
            if "physical therapy" in t or "occupational therapy" in t:
                recs.append({
                    "type": "action",
                    "title": "State pre-health intent",
                    "action": "Explicitly state your pre-health track in Education or Objective (e.g. 'Pre-PT' or 'Pre-Physical Therapy', 'Pre-OT', or 'Pre-Health') so Dilly and reviewers clearly recognize your intent and you get Pre-Health–specific scoring and recommendations.",
                })
    return recs


def _is_header_or_boring_line(line: str) -> bool:
    """Skip section headers, contact lines, and lines that only state GPA/major/degree."""
    ln = line.strip()
    if len(ln) < 15:
        return True
    # Section headers: all caps and short
    if ln.isupper() and len(ln) < 50:
        return True
    # Only "GPA: X.XX" or "Grade point average: X.X" - nothing impressive
    if re.match(r"^(gpa|grade\s*point\s*average|cumulative\s*gpa):\s*[0-4]\.\d+\s*$", ln, re.I):
        return True
    # Line is mostly degree + major only (e.g. "Bachelor of Science in Data Science")
    if re.match(r"^(bachelor|b\.?s\.?|b\.?a\.?|master|m\.?s\.?|m\.?a\.?)\s+(of\s+)?\w+\s+in\s+.{1,60}$", ln, re.I) and "honors" not in ln.lower() and "research" not in ln.lower():
        return True
    # Email, phone, LinkedIn only
    if re.search(r"^[\w.+]+@[\w.]+\.\w+$", ln) or re.match(r"^\+?\d[\d\s\-\.\(\)]{8,}$", ln) or "linkedin.com" in ln.lower():
        return True
    return False


def _extract_resume_snippets(raw_text: str, track: str) -> dict:
    """Extract short resume lines for breakdown. Smart: only impressive stuff (honors, research, etc.), never header/GPA/major. All: skip header-like lines."""
    lines = [ln.strip() for ln in (raw_text or "").splitlines() if ln.strip() and len(ln.strip()) > 10]
    out = {"smart": [], "grit": [], "build": []}
    max_len = 100

    # Smart: only quote impressive, non-header stuff (honors, research, scholarships). Never GPA, major, or degree line.
    smart_impressive = re.compile(
        r"honors|dean's list|dean’s list|presidential\s*scholar|scholarship|magna\s*cum|summa\s*cum|cum\s*laude|research|publication|laboratory|bench\s*work|principal\s*investigator",
        re.I,
    )
    for ln in lines:
        if _is_header_or_boring_line(ln):
            continue
        if _is_low_quality_evidence(ln):
            continue
        if smart_impressive.search(ln) and ln not in out["smart"]:
            out["smart"].append(ln[:max_len] + ("..." if len(ln) > max_len else ""))
            if len(out["smart"]) >= 2:
                break

    # Grit: leadership/impact lines; skip header-like (include founder/co-founder so "Org ... Co-Founder" lines are picked)
    grit_terms = re.compile(
        r"\d+%|\d+\s*%|\$\d|increased|led|director|manager|founded|founder|co-founder|lead\s|organized|\d+\+|\d+\s*members",
        re.I,
    )
    for ln in lines:
        if _is_header_or_boring_line(ln):
            continue
        if _is_low_quality_evidence(ln):
            continue
        if grit_terms.search(ln) and ln not in out["grit"]:
            out["grit"].append(ln[:max_len] + ("..." if len(ln) > max_len else ""))
            if len(out["grit"]) >= 2:
                break

    # Build: track-relevant substance; skip header-like
    build_terms = re.compile(
        r"clinical|shadowing|physician|research|python|javascript|project|internship|deployed|built|lab\s|experiment",
        re.I,
    )
    for ln in lines:
        if _is_header_or_boring_line(ln):
            continue
        if _is_low_quality_evidence(ln):
            continue
        if build_terms.search(ln) and ln not in out["build"]:
            out["build"].append(ln[:max_len] + ("..." if len(ln) > max_len else ""))
            if len(out["build"]) >= 2:
                break
    return out


def _is_low_quality_evidence(text: str) -> bool:
    """True if text is placeholder, header-only, or not substantive (so we should show a default sentence instead)."""
    if not text or not (text or "").strip():
        return True
    t = (text or "").strip()
    # Mostly underscores, dashes, or punctuation
    if len(t) > 0 and sum(1 for c in t if c in "_- \t.") >= 0.7 * len(t):
        return True
    # Looks like a section header or degree line only (no substantive content)
    header_only = re.match(
        r"^(?:education|experience|bachelor|b\.?s\.?|b\.?a\.?|gpa|degree|major|minor|summary|skills)\s*[:\s\-\.]*$",
        t,
        re.I,
    )
    if header_only or re.match(r"^[\s_\-\.]+(?:education|bachelor|degree)", t, re.I):
        return True
    # Very short and no meaningful word (honors, research, led, etc.)
    words = re.findall(r"[a-z]+", t.lower())
    if len(words) <= 2 and not any(w in ("honors", "dean", "research", "led", "founded", "manager", "director", "clinical", "project") for w in words):
        return True
    return False


# Threshold below which we add fallback line-edit recs when the auditor returned none
_LOW_SCORE_LINE_EDIT_THRESHOLD = 50

# Max line_edits to return (prioritized by impact); quality bar = only suggest when clearly weak
_FALLBACK_LINE_EDIT_CAP = 5

# Bullet-like line: starts with bullet char or looks like a description
_BULLET_PREFIX = re.compile(r"^[\s]*[\u2022\u2023\u2043\u2219\-\*\u25aa\u25a0]\s*", re.U)

# Diagnosis labels (taxonomy) for UI and consultant-style copy
DIAGNOSIS_ADD_SCOPE = "Add scope"
DIAGNOSIS_ADD_OUTCOME = "Add outcome"
DIAGNOSIS_STRONGER_VERB = "Stronger verb"
DIAGNOSIS_AVOID_PASSIVE = "Lead with action"
DIAGNOSIS_ADD_TRACK_PROOF = "Add track proof"

# Vague verbs that suggest duty-only (candidates for "Stronger verb" or "Add outcome")
_VAGUE_VERBS = re.compile(
    r"\b(helped?|assisted|supported|participated|contributed|worked\s+on|involved\s+in|responsible\s+for|duties?\s+include)\b",
    re.I,
)
# Passive / duty framing
_PASSIVE_DUTY = re.compile(
    r"\b(was\s+responsible|were\s+responsible|is\s+responsible|are\s+responsible|duties?\s+included?|responsible\s+for)\b",
    re.I,
)
# Strong leadership/impact verbs (line is "almost there" if it has one but lacks scope/outcome)
_STRONG_VERBS = re.compile(
    r"\b(led|managed|directed|organized|founded|co-founded|increased|decreased|improved|developed|built|designed|launched|spearheaded|coordinated)\b",
    re.I,
)
_GRIT_TERMS = re.compile(
    r"\d+%|\d+\s*%|\$\d|increased|led|director|manager|founded|founder|co-founder|organized|\d+\+|\d+\s*members|team\s+of",
    re.I,
)
_BUILD_TERMS = re.compile(
    r"project|built|developed|deployed|research|clinical|shadowing|python|javascript|internship|lab\s|experiment|campaign|shipped|implemented",
    re.I,
)


def _is_bullet_or_description_line(line: str) -> bool:
    """True if line looks like an experience/activity bullet or role description (candidate for line_edit)."""
    ln = line.strip()
    if len(ln) < 20 or len(ln) > 350:
        return False
    if _is_header_or_boring_line(ln):
        return False
    if _is_low_quality_evidence(ln):
        return False
    if _BULLET_PREFIX.match(ln):
        return True
    if ":" in ln[:30]:
        return False
    return True


def _line_has_number(line: str) -> bool:
    return bool(re.search(r"\d", (line or "")))


def _classify_weak_line(line: str, track: str) -> Optional[tuple]:
    """
    Classify a bullet as weak for Grit or Build. Returns (dimension, tier, diagnosis) or None if not weak.
    tier: "almost_there" (has number or strong verb but missing outcome/scope) vs "needs_work".
    diagnosis: one of DIAGNOSIS_* labels.
    """
    ln = (line or "").strip()
    low = ln.lower()
    has_num = _line_has_number(ln)
    has_strong_verb = bool(_STRONG_VERBS.search(ln))
    has_grit_terms = bool(_GRIT_TERMS.search(ln))
    has_build_terms = bool(_BUILD_TERMS.search(ln))
    has_vague = bool(_VAGUE_VERBS.search(ln))
    has_passive = bool(_PASSIVE_DUTY.search(ln))

    # Grit: no number and no leadership/impact → needs_work (no outcome) or (vague verb → stronger verb)
    if not has_grit_terms:
        if has_num and has_strong_verb:
            return ("grit", "almost_there", DIAGNOSIS_ADD_OUTCOME)  # e.g. "Managed 5 people" → add result
        if has_strong_verb and not has_num:
            return ("grit", "almost_there", DIAGNOSIS_ADD_SCOPE)  # e.g. "Led the team" → add size/scope
        if has_vague:
            return ("grit", "needs_work", DIAGNOSIS_STRONGER_VERB)
        if has_passive:
            return ("grit", "needs_work", DIAGNOSIS_AVOID_PASSIVE)
        return ("grit", "needs_work", DIAGNOSIS_ADD_OUTCOME)  # default: add outcome/scope

    # Build: no track-relevant substance
    if not has_build_terms:
        return ("build", "needs_work", DIAGNOSIS_ADD_TRACK_PROOF)

    return None


def _track_specific_grit_action(diagnosis: str, track: str) -> str:
    """Consultant-style 'why' for Grit, track-aware."""
    base = "Grit is scored on leadership and quantifiable impact. Recruiters in your field look for scope (how many, how much) and results (what improved)."
    if diagnosis == DIAGNOSIS_ADD_OUTCOME:
        return base + " This bullet has a number or role but no outcome. Add one result (e.g. % change, time saved, quality improved) so they see the impact."
    if diagnosis == DIAGNOSIS_ADD_SCOPE:
        return base + " You used a strong verb; add scope next (e.g. team size, # of events, volume) so the win is concrete."
    if diagnosis == DIAGNOSIS_STRONGER_VERB:
        return base + " This reads like a duty, not an achievement. Use a stronger, action-led verb (e.g. Coordinated, Led, Delivered) and add one number or outcome."
    if diagnosis == DIAGNOSIS_AVOID_PASSIVE:
        return base + " Lead with what you did, not what you were responsible for. Reframe as 'Led X' or 'Delivered Y' so recruiters see ownership."
    return base + " Rewrite to include scope or result so recruiters see impact."


def _track_specific_build_action(diagnosis: str, track: str) -> str:
    """Consultant-style 'why' for Build, track-aware."""
    track_lens = {
        "Pre-Health": "Adcoms and health recruiters look for clinical hours, shadowing setting, and research. Add one concrete detail (e.g. hours, setting, method).",
        "Pre-Law": "Law schools and legal recruiters look for writing, advocacy, and analytical work. Name the deliverable or outcome (e.g. memo, case type, outcome).",
        "Tech": "Tech hiring managers look for stack, shipped impact, and system thinking. Add what you built or delivered (e.g. tool, feature, metric).",
        "Science": "Research and industry science value methods, publications, and rigor. Add one concrete detail (e.g. technique, finding, collaboration).",
        "Business": "Finance/consulting/marketing value quant impact and leadership. Add scope or outcome (e.g. $, %, campaign reach).",
        "Finance": "Big Four and financial firms value audit/tax/advisory experience, Excel/CFA, and quant impact. Add $ or % impact, deal/transaction scope, or certification.",
        "Consulting": "Consulting firms value case work, client impact, and structured problem-solving. Add scope, outcome ($ or %), or deliverable.",
        "Communications": "PR/media value campaigns, reach, and clarity. Add audience size, channel, or outcome.",
        "Education": "Ed recruiters value student outcomes and curriculum. Add one concrete result or scope.",
        "Arts": "Creative hiring values portfolio and craft. Name the project or medium and one outcome.",
        "Humanities": "Writing/editorial value analysis and clarity. Add the deliverable or audience.",
    }
    lens = track_lens.get(track, track_lens["Humanities"])
    return f"Build is scored on {track}-specific proof. {lens} This line doesn't yet show that. Add one concrete detail."


def _concrete_suggested_line(current_line: str, dimension: str, diagnosis: str, track: str) -> str:
    """Generate a concrete suggested_line (real before/after) where possible; else short template."""
    cl = (current_line or "").strip()
    if not cl:
        return "Add scope and an outcome (e.g. numbers, result) so recruiters see impact."
    # Strip trailing period for rewrites
    cl = cl.rstrip(".")
    if dimension == "grit":
        if diagnosis == DIAGNOSIS_ADD_OUTCOME:
            return f"{cl}, resulting in [add one outcome: e.g. 20% increase, 10 hrs/week saved, or improved N metric]."
        if diagnosis == DIAGNOSIS_ADD_SCOPE:
            return f"{cl} [add scope: e.g. team of 5, 12 events/semester, or 50+ stakeholders]."
        if diagnosis == DIAGNOSIS_STRONGER_VERB:
            return f"Led [same activity]. [Add one number or outcome]. Example: Coordinated X, delivering Y."
        if diagnosis == DIAGNOSIS_AVOID_PASSIVE:
            return f"Led [reframe the duty as an action]. Example: Led [X] by [doing Y], achieving [Z]."
        return f"{cl} Add a number or outcome (e.g. scope, %, or result) so recruiters see impact."
    # Build
    track_hints = {
        "Pre-Health": "e.g. shadowing hours, setting, or research method",
        "Pre-Law": "e.g. memo type, case area, or writing outcome",
        "Tech": "e.g. stack, feature, or metric improved",
        "Science": "e.g. method, finding, or collaboration",
        "Business": "e.g. $ or % impact, campaign reach",
        "Finance": "e.g. $ or % impact, deal/audit scope, or certification (CFA, CPA)",
        "Consulting": "e.g. client outcome, $ or % impact, or case/project deliverable",
        "Communications": "e.g. audience size, channel, or clip",
        "Education": "e.g. student outcome or curriculum scope",
        "Arts": "e.g. project name, medium, or outcome",
        "Humanities": "e.g. deliverable or audience",
    }
    hint = track_hints.get(track, track_hints["Humanities"])
    return f"{cl} Add one concrete {track} detail: {hint}."


def get_fallback_line_edits_for_low_scores(
    raw_text: str,
    track: str,
    smart_score: float,
    grit_score: float,
    build_score: float,
    max_recs: int = None,
) -> List[dict]:
    """
    When Grit or Build is low and the auditor returned no line_edit recommendations,
    suggest concrete line edits from weak bullets: taxonomy (diagnosis), track-specific copy,
    almost_there vs needs_work prioritization, real suggested_line where possible, cap 5.
    Quality bar: only suggest when line is clearly weak; return [] when none.
    """
    cap = max_recs if max_recs is not None else _FALLBACK_LINE_EDIT_CAP
    if not raw_text or not raw_text.strip():
        return []
    if grit_score >= _LOW_SCORE_LINE_EDIT_THRESHOLD and build_score >= _LOW_SCORE_LINE_EDIT_THRESHOLD:
        return []
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    candidates: List[tuple] = []  # (line, dimension, tier, diagnosis)
    for ln in lines:
        if not _is_bullet_or_description_line(ln):
            continue
        classified = _classify_weak_line(ln, track)
        if not classified:
            continue
        dim, tier, diag = classified
        if dim == "grit" and grit_score < _LOW_SCORE_LINE_EDIT_THRESHOLD:
            candidates.append((ln[:300], dim, tier, diag))
        elif dim == "build" and build_score < _LOW_SCORE_LINE_EDIT_THRESHOLD:
            candidates.append((ln[:300], dim, tier, diag))
    if not candidates:
        return []
    # Dedupe by line; keep first (we may have both grit and build for same line - keep one)
    seen: set = set()
    unique: List[tuple] = []
    for line, dim, tier, diag in candidates:
        key = line[:120]
        if key in seen:
            continue
        seen.add(key)
        unique.append((line, dim, tier, diag))
    # Prioritize: almost_there first (high impact, quick fix), then needs_work; then by dimension (grit then build if both low)
    def _prio(item: tuple) -> tuple:
        line, dim, tier, diag = item
        tier_order = 0 if tier == "almost_there" else 1
        dim_order = 0 if dim == "grit" else 1
        return (tier_order, dim_order, line[:80])

    unique.sort(key=_prio)
    selected = unique[:cap]
    recs = []
    for current_line, dimension, _tier, diagnosis in selected:
        if dimension == "grit":
            action = _track_specific_grit_action(diagnosis, track)
            title = "Strengthen this bullet (Grit)"
        else:
            action = _track_specific_build_action(diagnosis, track)
            title = f"Strengthen this line for {track} (Build)"
        suggested = _concrete_suggested_line(current_line, dimension, diagnosis, track)
        recs.append({
            "type": "line_edit",
            "title": title,
            "current_line": current_line,
            "suggested_line": suggested,
            "action": action,
            "score_target": "Grit" if dimension == "grit" else "Build",
            "diagnosis": diagnosis,
        })
    return recs


def _default_evidence_sentence(dimension: str, track: str = "Humanities") -> str:
    """High-impact fallback when snippet is missing or low-quality. Used for Smart, Grit, and Build."""
    if dimension == "smart":
        return "You showcased high academic standard through your coursework and academic profile."
    if dimension == "grit":
        return "You demonstrated leadership and impact through your experience and roles."
    if dimension == "build":
        return f"You demonstrated {track} readiness through your background and experience."
    return "You received this score based on your profile."


def _weave_snippet_into_sentence(dimension: str, narrative_lead: str, snippet: str, track: str = "Humanities") -> str:
    """
    Weave resume snippet into one flowing sentence (no "From your resume:" quote block).
    Handles "Role | Company" and "Company ... Role" (e.g. "The Kochhar Education Foundation ... Co-Founder").
    When snippet is low-quality (placeholder, header-only), returns _default_evidence_sentence.
    """
    s = (snippet or "").strip()
    if not s or _is_low_quality_evidence(s):
        return _default_evidence_sentence(dimension, track)
    # Already woven (e.g. from a prior run or LLM): lead + "your role as the/ a ...". Don't re-parse unless malformed.
    if s.startswith("You demonstrated ") or s.startswith("You showcased "):
        parts_lead = s.split(" ● ", 1)
        first = parts_lead[0].strip()
        action_after = (parts_lead[1].strip() if len(parts_lead) > 1 else "")
        # Grit evidence that still has "by present", "your role as a The", or trailing "Role City, ST" is malformed - re-parse.
        malformed_grit = (
            dimension == "grit"
            and ("by present" in first or "your role as a The" in first or (re.search(r",\s*[A-Z]{2}\s*\.?$", first) and ("Co-Founder" in first or "Founder" in first)))
        )
        if malformed_grit:
            rest = first
            for lead in ["You demonstrated leadership and impact through ", "You showcased high academic standard through ", "You demonstrated ", "You showcased "]:
                if rest.startswith(lead):
                    rest = rest[len(lead):].strip()
                    break
            rest = re.sub(r"^your role as (?:a|the) ", "", rest, flags=re.I).strip()
            s = rest + (" ● " + action_after if action_after else "")
            # fall through to normal parsing below
        else:
            if not first:
                return _default_evidence_sentence(dimension, track)
            # If the first segment has a low-quality tail (e.g. "through ___" or "through Education Bachelor's"), use default
            if " through " in first:
                tail = first.split(" through ", 1)[-1].strip().rstrip(".")
                if _is_low_quality_evidence(tail) or "_" * 3 in tail:
                    return _default_evidence_sentence(dimension, track)
            return first if first.endswith(".") else first + "."
    # Normalize bullet chars and split into role/company vs action
    for bullet in [" ● ", " • ", " - ", " – ", " - "]:
        s = s.replace(bullet, " ● ")
    parts = [p.strip() for p in s.split(" ● ", 1)]
    role_company = (parts[0] if parts else "").strip()
    action = (parts[1] if len(parts) > 1 else "").strip()
    # Strip date ranges and "by present" / "- present"
    role_company = re.sub(r"\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}\s*[-–to]+\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}\s*$", "", role_company, flags=re.I)
    role_company = re.sub(r"\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}\s*[-–]+\s*[Pp]resent\s*$", "", role_company, flags=re.I)
    role_company = re.sub(r"\s+by\s+present\s*$", "", role_company, flags=re.I)
    role_company = re.sub(r"\s*[-–]\s*[Pp]resent\s*$", "", role_company, flags=re.I)
    # Strip trailing location (e.g. " New York, NY", " Tampa, FL")
    role_company = re.sub(r"\s+[A-Za-z\s]+,\s*[A-Z]{2}\s*$", "", role_company).strip()
    role_company = role_company.strip()
    # Parse: "Role | Company" / "Role at Company" vs "Company ... Role" (org first, then Founder/Co-Founder/Director etc.)
    role, company = "", ""
    role_titles = r"\b(Co-Founder|Co-founder|Founder|Director|President|VP\b|Vice President|Manager|Lead\b|Head of)\b"
    if " | " in role_company:
        left, right = role_company.split(" | ", 1)[0].strip(), role_company.split(" | ", 1)[1].strip()
        # "Company | December 2022 by present Co-Founder New York, NY" -> company=left, role from right
        m_right = re.search(role_titles, right, re.I) if right else None
        if m_right and re.search(r"\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*", right, re.I):
            company = left
            role = m_right.group(1).strip()
        else:
            role, company = left, right
    elif " at " in role_company:
        role, company = role_company.split(" at ", 1)[0].strip(), role_company.split(" at ", 1)[1].strip()
    else:
        # "Organization ... Role" format (e.g. "The Kochhar Education Foundation December 2022 Co-Founder")
        m = re.search(role_titles, role_company, re.I)
        if m:
            idx = m.start()
            company = role_company[:idx].strip()
            role = m.group(1).strip()
            # Strip leftover date fragment (e.g. "December 2022") from company
            company = re.sub(r"\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}\s*$", "", company, flags=re.I).strip()
        else:
            role = role_company
    # Strip trailing date and "by present" from company so output is clean
    if company:
        company = re.sub(r"\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{4}\s*(?:\s+by\s+present)?\s*$", "", company, flags=re.I).strip()
    # Clean action: lowercase, past tense -> "by [verb]ing" for flow
    if action:
        action = action[0].lower() + action[1:] if len(action) > 1 else action
        action = re.sub(r"\.\.\.$", "", action).strip()
        # Skip action if it looks like a date or fragment (e.g. "2023, 2024: Fundr...")
        if re.match(r"^\d{4}", action) and len(action) < 25:
            action = ""
        else:
            for past, ing in [("maintained ", "maintaining "), ("led ", "leading "), ("organized ", "organizing "), ("increased ", "increasing "), ("developed ", "developing "), ("managed ", "managing "), ("created ", "creating "), ("built ", "building "), ("designed ", "designing "), ("founded ", "founding ")]:
                if action.startswith(past):
                    action = ing + action[len(past):]
                    break
            if len(action) > 80:
                action = action[:77].rsplit(" ", 1)[0] + "..."
    if dimension == "grit":
        role_lower = role.lower() if role else ""
        # "Founder" / "Co-Founder" of [Organization] (not "at")
        if (role_lower in ("founder", "co-founder", "cofounder") and company):
            if company.lower().startswith("the "):
                org_phrase = company[0].lower() + company[1:]  # "the Kochhar Education Foundation"
            else:
                org_phrase = "the " + (company[0].lower() + company[1:] if company else "")
            if action:
                return f"{narrative_lead} your role as the {role_lower.replace(' ', '-')} of {org_phrase} by {action}."
            return f"{narrative_lead} your role as the {role_lower.replace(' ', '-')} of {org_phrase}."
        if role and company and action:
            return f"{narrative_lead} your role as a {role} at {company} by {action}."
        if role and company:
            return f"{narrative_lead} your role as a {role} at {company}." + (f" by {action}." if action else ".")
        if role and action:
            return f"{narrative_lead} your role as a {role} by {action}."
        if company and not role and action:
            return f"{narrative_lead} your work at {company}, including {action}."
        if role_company and action:
            return f"{narrative_lead} your experience at {role_company}, including {action}."
        tail = s[:80].rstrip() if s else ""
        if _is_low_quality_evidence(tail):
            return _default_evidence_sentence(dimension, track)
        return f"{narrative_lead} your experience, including {tail}." if tail else _default_evidence_sentence(dimension, track)
    if dimension == "smart":
        # Smart: e.g. "Honors: Dean's List, Presidential Scholar" -> "your honors, including Dean's List and Presidential Scholar"
        s_lower = s.lower()
        if "honors" in s_lower or "dean" in s_lower or "scholar" in s_lower:
            rest = re.sub(r"^honors?:\s*", "", s, flags=re.I).strip()
            if _is_low_quality_evidence(rest):
                return _default_evidence_sentence(dimension, track)
            return f"{narrative_lead} your honors, including {rest[0].lower() + rest[1:]}." if rest else f"{narrative_lead} your honors."
        if "research" in s_lower or "publication" in s_lower or "lab" in s_lower:
            if _is_low_quality_evidence(s):
                return _default_evidence_sentence(dimension, track)
            return f"{narrative_lead} {s[0].lower() + s[1:]}." if len(s) > 1 else f"{narrative_lead} {s}."
        if _is_low_quality_evidence(s):
            return _default_evidence_sentence(dimension, track)
        return f"{narrative_lead} {s[0].lower() + s[1:]}." if s and len(s) > 1 else _default_evidence_sentence(dimension, track)
    if dimension == "build":
        if _is_low_quality_evidence(s):
            return _default_evidence_sentence(dimension, track)
        return f"{narrative_lead} {s[0].lower() + s[1:]}." if s and len(s) > 1 else f"{narrative_lead} {s}." if s else _default_evidence_sentence(dimension, track)
    if _is_low_quality_evidence(s):
        return _default_evidence_sentence(dimension, track)
    return f"{narrative_lead} {s}."


def _narrative_smart_finding(signals: "ScoringSignals") -> str:
    """Second-person: You showcased academic rigor through your GPA, honors, research, minor."""
    parts = [f"your {signals.gpa:.2f} GPA"]
    if signals.honors_count:
        parts.append("your placement in the honors program" if signals.honors_count >= 2 else "honors recognition")
    if signals.has_research:
        parts.append("your research involvement")
    minor = getattr(signals, "minor", "") or ""
    if minor:
        parts.append(f"your {minor} minor")
    if len(parts) == 1:
        return f"Smart: You demonstrated academic standing through {parts[0]} and your major ({signals.major})."
    return f"Smart: You showcased high academic standard due to {', '.join(parts[:-1])}, and {parts[-1]}."


def _narrative_grit_finding(signals: "ScoringSignals") -> str:
    """Second-person: You demonstrated leadership and impact through your roles, outcomes, experience."""
    parts = []
    if getattr(signals, "leadership_density", 0):
        parts.append("your leadership roles")
    if getattr(signals, "quantifiable_impact_count", 0):
        parts.append("quantifiable outcomes")
    if getattr(signals, "work_entry_count", 0):
        parts.append("your work and experience history")
    if not parts:
        return "Grit: Your resume had limited signaled leadership or impact metrics."
    return f"Grit: You demonstrated leadership and impact through {', '.join(parts)}."


def _narrative_build_finding(track: str, track_result) -> List[str]:
    """Second-person Build finding(s)."""
    findings = getattr(track_result, "findings", None) or []
    out = []
    for i, f in enumerate(findings):
        f_clean = f.strip()
        if i == 0:
            out.append(f"Build: You demonstrated {track} readiness. {f_clean}" if f_clean and not f_clean.lower().startswith("build:") else f"Build: You: {f_clean}")
        else:
            out.append(f"Build: {f_clean}" if not f_clean.startswith("Build:") else f_clean)
    if not out:
        out.append(f"Build: You demonstrated {track} readiness; track scoring applied.")
    return out


def run_audit(
    raw_text: str,
    *,
    candidate_name: str = "Unknown",
    major: str = "Unknown",
    gpa: float | None = None,
    filename: Optional[str] = None,
) -> AuditorResult:
    """
    Run full Dilly audit from raw resume text.
    Returns scores and audit_findings (evidence-based only).
    If candidate_name is not provided, extracts from text (multi-line) with filename fallback so we avoid "Unknown".
    If major is Unknown, attempts extract_major_from_text so scoring uses the right multiplier.
    """
    if candidate_name == "Unknown":
        candidate_name = extract_candidate_name(raw_text, filename=filename)
    if major == "Unknown":
        major = extract_major_from_text(raw_text)
    track = get_track_from_major_and_text(major, raw_text)
    signals = extract_scoring_signals(raw_text, gpa=gpa, major=major)
    # Override major if we had one
    if major != "Unknown":
        signals = ScoringSignals(
            gpa=signals.gpa,
            major=major,
            honors_count=signals.honors_count,
            has_research=signals.has_research,
            quantifiable_impact_count=signals.quantifiable_impact_count,
            leadership_density=signals.leadership_density,
            work_entry_count=signals.work_entry_count,
            international_markers=signals.international_markers,
            has_minor=getattr(signals, "has_minor", False),
            minor=getattr(signals, "minor", "") or "",
            bcpm_gpa=signals.bcpm_gpa,
            longitudinal_clinical_years=signals.longitudinal_clinical_years,
            outcome_leadership_count=signals.outcome_leadership_count,
            commit_velocity_per_week=signals.commit_velocity_per_week,
            research_semesters=signals.research_semesters,
            research_longevity_years=getattr(signals, "research_longevity_years", 0.0),
            deployed_app_or_live_link=getattr(signals, "deployed_app_or_live_link", False),
            hackathon_mention=getattr(signals, "hackathon_mention", False),
            recognized_tech_employer=getattr(signals, "recognized_tech_employer", False),
            competitive_programming=getattr(signals, "competitive_programming", False),
            actuarial_exams_passed=getattr(signals, "actuarial_exams_passed", 0),
            certifications_list=getattr(signals, "certifications_list", None) or [],
            security_metrics_count=getattr(signals, "security_metrics_count", 0),
        )
    smart_score, evidence_smart = compute_smart_score(signals, track=track)
    grit_score, evidence_grit = compute_grit_score(signals)
    grit_score, grit_intl = apply_international_multiplier(grit_score, signals.international_markers)
    evidence_grit.extend(grit_intl)
    # Cybersecurity: security-specific metrics in bullets boost Grit (TECH_SCORING_EXTRACTION, SOC analyst guides)
    if track == "Tech" and (signals.major or "").strip() == "Cybersecurity":
        sec_metrics = getattr(signals, "security_metrics_count", 0) or 0
        if sec_metrics > 0:
            bonus = min(20, sec_metrics * 5)
            grit_score = min(100.0, grit_score + bonus)
            evidence_grit.append(f"Security-specific metrics in bullets: +{bonus} pts (Cybersecurity).")
    track_result = run_track_audit(track, signals, raw_text)
    build_score = track_result.build_score
    ws, wg, wb = get_composite_weights(track)
    final_score = round((smart_score * ws) + (grit_score * wg) + (build_score * wb), 2)
    snippets = _extract_resume_snippets(raw_text, track)
    if snippets.get("smart"):
        evidence_smart.append("From your resume: \"" + snippets["smart"][0] + "\".")
    if snippets.get("grit"):
        evidence_grit.append("From your resume: \"" + snippets["grit"][0] + "\".")
    evidence_build = list(track_result.findings)[:2] if getattr(track_result, "findings", None) else []
    if snippets.get("build"):
        evidence_build.append("From your resume: \"" + snippets["build"][0] + "\".")
    audit_findings: List[str] = []
    audit_findings.append(_narrative_smart_finding(signals))
    audit_findings.append(_narrative_grit_finding(signals))
    audit_findings.extend(_narrative_build_finding(track, track_result))
    # Display-only breakdown: weave snippet into one flowing sentence (no "From your resume:" block).
    smart_narrative = _narrative_smart_finding(signals).replace("Smart: ", "", 1)
    grit_narrative = _narrative_grit_finding(signals).replace("Grit: ", "", 1)
    build_narratives = _narrative_build_finding(track, track_result)
    build_first = build_narratives[0].replace("Build: ", "", 1) if build_narratives else f"You demonstrated {track} readiness."
    build_sentences = [s.strip() for s in build_first.split(". ") if s.strip()]
    build_narrative = ". ".join(s for s in build_sentences if not any(x in s for x in ["Score +", " pts.", "×", " = "])).strip() or build_first
    def _usable_snippet(key: str) -> bool:
        return bool(snippets.get(key)) and not _is_low_quality_evidence((snippets[key][0] or "").strip())
    evidence_smart_display = _weave_snippet_into_sentence("smart", "You showcased high academic standard through ", snippets["smart"][0], track) if _usable_snippet("smart") else smart_narrative
    evidence_grit_display = _weave_snippet_into_sentence("grit", "You demonstrated leadership and impact through ", snippets["grit"][0], track) if _usable_snippet("grit") else grit_narrative
    evidence_build_display = _weave_snippet_into_sentence("build", f"You demonstrated {track} readiness through ", snippets["build"][0], track) if _usable_snippet("build") else build_narrative
    # Tie-to-outcome recommendation for Tech when skills appear without outcome (TECH_SCORING_EXTRACTION_AND_RECOMMENDATIONS.md)
    recommendations = None
    if track == "Tech" and getattr(track_result, "skills_without_outcome", None):
        untied = track_result.skills_without_outcome
        if untied:
            skills_str = ", ".join(untied[:5])
            if len(untied) > 5:
                skills_str += ", …"
            recommendations = [{
                "type": "action",
                "title": "Tie skills to outcomes",
                "action": f"Tie {skills_str} to an outcome: add a project or role bullet that uses this skill and includes a measurable result (e.g. %, $, time saved, users impacted).",
                "score_target": "build",
            }]
    return AuditorResult(
        candidate_name=candidate_name,
        major=signals.major,
        track=track,
        smart_score=smart_score,
        grit_score=grit_score,
        build_score=build_score,
        final_score=final_score,
        audit_findings=audit_findings,
        evidence_smart=evidence_smart,
        evidence_grit=evidence_grit,
        evidence_build=evidence_build,
        evidence_smart_display=evidence_smart_display,
        evidence_grit_display=evidence_grit_display,
        evidence_build_display=evidence_build_display,
        recommendations=recommendations,
    )
