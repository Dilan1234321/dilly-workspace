"""
Meridian ATS Keyword Density & Placement Analysis.

Goes beyond "missing keywords" to show WHERE keywords appear, HOW they're used,
and whether they're in context (experience bullets) or bare (skills list).

Modern ATS like Greenhouse and Lever weight contextual keyword usage 2-3x higher
than bare-list mentions. This module makes that visible.

No LLM calls. Pure rule-based extraction and matching.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class KeywordOccurrence:
    """One occurrence of a keyword in the resume."""
    section: str       # "summary", "experience", "skills", "education", "projects", "other"
    line: str          # the line where it appears (truncated)
    contextual: bool   # True if keyword is used in a sentence/bullet; False if in a bare list
    weight: float      # ATS weight estimate: contextual=1.0, bare list=0.4, title/header=0.6


@dataclass
class KeywordAnalysis:
    """Analysis of one keyword in the resume."""
    keyword: str
    total_count: int
    occurrences: List[KeywordOccurrence]
    sections_found: List[str]       # unique sections where found
    contextual_count: int           # how many times used in context
    bare_count: int                 # how many times in bare list
    placement_score: float          # 0.0–1.0 quality of placement
    placement_verdict: str          # "strong", "adequate", "weak"
    tip: Optional[str] = None       # how to improve placement


@dataclass
class JDRequirement:
    """One requirement extracted from the JD."""
    keyword: str
    category: str         # "must_have", "nice_to_have", "inferred"
    found_in_resume: bool
    resume_count: int
    contextual_in_resume: bool   # at least one contextual use
    placement_quality: str       # "strong", "adequate", "weak", "missing"
    suggestion: Optional[str] = None


@dataclass
class KeywordDensityResult:
    """Full keyword density & placement output."""
    total_keywords: int
    total_contextual: int
    total_bare: int
    density_score: float               # 0.0–1.0 overall
    keywords: List[KeywordAnalysis]
    jd_match: Optional[dict] = None    # populated when JD provided

    def to_dict(self) -> dict:
        result: dict = {
            "total_keywords": self.total_keywords,
            "total_contextual": self.total_contextual,
            "total_bare": self.total_bare,
            "density_score": round(self.density_score, 2),
            "keywords": [
                {
                    "keyword": k.keyword,
                    "total_count": k.total_count,
                    "sections_found": k.sections_found,
                    "contextual_count": k.contextual_count,
                    "bare_count": k.bare_count,
                    "placement_score": round(k.placement_score, 2),
                    "placement_verdict": k.placement_verdict,
                    "tip": k.tip,
                    "occurrences": [
                        {"section": o.section, "line": o.line, "contextual": o.contextual,
                         "weight": round(o.weight, 2)}
                        for o in k.occurrences
                    ],
                }
                for k in self.keywords
            ],
        }
        if self.jd_match:
            result["jd_match"] = self.jd_match
        return result


# ---------------------------------------------------------------------------
# Section classification
# ---------------------------------------------------------------------------

_SECTION_MAP = {
    "_top": "contact",
    "contact": "contact",
    "contact / top": "contact",
    "contact_/_top": "contact",
    "summary": "summary",
    "objective": "summary",
    "summary / objective": "summary",
    "professional summary": "summary",
    "education": "education",
    "academic": "education",
    "academics": "education",
    "experience": "experience",
    "work experience": "experience",
    "professional experience": "experience",
    "employment": "experience",
    "relevant experience": "experience",
    "leadership": "experience",
    "leadership experience": "experience",
    "volunteer": "experience",
    "volunteer experience": "experience",
    "campus involvement": "experience",
    "involvement": "experience",
    "activities": "experience",
    "research": "experience",
    "research experience": "experience",
    "projects": "projects",
    "skills": "skills",
    "technical skills": "skills",
    "core competencies": "skills",
    "skills & activities": "skills",
    "skills and activities": "skills",
    "certifications": "skills",
    "honors": "education",
    "coursework": "education",
    "relevant coursework": "education",
    "publications": "projects",
    "publications / presentations": "projects",
}


def _classify_section(key: str) -> str:
    """Map a section key to a canonical category for keyword placement."""
    lower = key.lower().strip()
    if lower in _SECTION_MAP:
        return _SECTION_MAP[lower]
    for sub, cat in [
        ("experience", "experience"), ("work", "experience"), ("volunteer", "experience"),
        ("research", "experience"), ("leader", "experience"), ("involve", "experience"),
        ("project", "projects"), ("skill", "skills"), ("competenc", "skills"),
        ("education", "education"), ("academic", "education"), ("honor", "education"),
        ("summary", "summary"), ("objective", "summary"),
        ("publication", "projects"), ("certif", "skills"),
    ]:
        if sub in lower:
            return cat
    return "other"


def _is_bare_list_line(line: str) -> bool:
    """True if the line is a bare comma/pipe-separated skill list, not a sentence."""
    stripped = line.strip()
    if not stripped:
        return False
    # Strip leading bullet
    clean = re.sub(r"^[•\-*●\u2022]\s*", "", stripped)
    # Strip label prefix (e.g., "Technical Skills:" or "Languages:")
    clean = re.sub(r"^[A-Za-z\s]+:\s*", "", clean)
    if not clean:
        return False
    # Count separators
    separators = len(re.findall(r"[,|;]", clean))
    words = len(clean.split())
    # If more separators than 30% of words and short avg between separators → list
    if separators >= 2 and words > 0:
        avg_words_between = words / (separators + 1)
        if avg_words_between <= 3:
            return True
    return False


def _is_contextual_line(line: str) -> bool:
    """True if the line is a real sentence/bullet with a verb (contextual keyword use)."""
    stripped = line.strip()
    clean = re.sub(r"^[•\-*●\u2022]\s*", "", stripped)
    words = clean.split()
    if len(words) < 4:
        return False
    # Check for verb indicators: past tense, gerund, or common action verbs
    if re.search(r"\b(?:ed|ing|led|built|managed|created|developed|increased|reduced|designed|implemented|supported|analyzed|launched|coordinated)\b", clean, re.IGNORECASE):
        return True
    return len(words) >= 6


# ---------------------------------------------------------------------------
# Keyword extraction from resume
# ---------------------------------------------------------------------------

# Common stop words to exclude from keyword extraction
_STOP_WORDS = frozenset(
    "a an the and or but in on at to for of is are was were be been being have has had do does did "
    "will would could should may might shall can this that these those with from by as it its i me my "
    "we our you your he she they them their him her his not no nor so if then than also very just "
    "more most much many some any all each every both few several such no not only own same too "
    "about above after again against between into through during before under over between "
    "city state university college expected present current tampa florida fl "
    "january february march april may june july august september october november december "
    "jan feb mar apr jun jul aug sep oct nov dec "
    "gpa bachelor science arts degree major minor n/a".split()
)

# Common resume filler words that aren't meaningful keywords
_FILLER_WORDS = frozenset(
    "responsible duties include including various multiple different several "
    "role position company organization team member work experience professional "
    "skill skills ability able proficient proficiency strong excellent good great "
    "effective efficient dedicated detail oriented results driven self motivated "
    "hard working fast learner communication interpersonal problem solving critical thinking "
    "time management organizational teamwork collaboration".split()
)

# Words that appear in JDs but aren't meaningful keywords to match
_JD_FILLER = frozenset(
    "years year plus least ideal looking seeking prefer preferred required requirement "
    "must nice have bonus desired candidate knowledge familiarity understanding "
    "platforms practices experience expertise working environment ability proven "
    "track record bachelor master degree equivalent comfort comfortable "
    "databases systems tools technologies frameworks methodologies processes "
    "pipelines standards applications concepts principles patterns services "
    "solutions products features functions components modules libraries packages "
    "environments configurations implementations integrations deployments "
    "proficiency fluency literacy awareness exposure hands depth breadth "
    "solid deep broad comprehensive extensive relevant direct indirect "
    "minimum maximum optional mandatory essential preferred desired "
    "will shall need needs want wants like likes love loves enjoy enjoys".split()
)


def _extract_meaningful_keywords(sections: Dict[str, str]) -> Dict[str, List[KeywordOccurrence]]:
    """
    Extract meaningful keywords from all resume sections.
    Returns: keyword_lower -> list of occurrences with section, line, contextual flag.
    """
    keywords: Dict[str, List[KeywordOccurrence]] = {}

    for section_key, content in sections.items():
        if not content or not content.strip():
            continue
        category = _classify_section(section_key)
        if category == "contact":
            continue

        for line in content.split("\n"):
            stripped = line.strip()
            if not stripped or len(stripped) < 3:
                continue

            is_bare = _is_bare_list_line(stripped)
            is_ctx = _is_contextual_line(stripped) if not is_bare else False

            # For bare lists: split on separators and take each item
            if is_bare:
                clean = re.sub(r"^[•\-*●\u2022]\s*", "", stripped)
                clean = re.sub(r"^[A-Za-z\s]+:\s*", "", clean)
                items = re.split(r"[,|;]", clean)
                for item in items:
                    kw = item.strip()
                    if len(kw) < 2 or kw.lower() in _STOP_WORDS:
                        continue
                    kw_lower = kw.lower()
                    occ = KeywordOccurrence(
                        section=category,
                        line=stripped[:120],
                        contextual=False,
                        weight=0.4,
                    )
                    keywords.setdefault(kw_lower, []).append(occ)
            else:
                # For contextual lines: extract multi-word terms and significant single words
                _extract_terms_from_line(stripped, category, is_ctx, keywords)

    return keywords


def _extract_terms_from_line(
    line: str, section: str, is_contextual: bool,
    keywords: Dict[str, List[KeywordOccurrence]],
) -> None:
    """Extract meaningful terms from a sentence/bullet line."""
    clean = re.sub(r"^[•\-*●\u2022]\s*", "", line.strip())
    # Remove label prefixes
    clean = re.sub(r"^(?:Company|Role|Date|Location|Description|Project name):\s*", "", clean, flags=re.IGNORECASE)

    if not clean or len(clean) < 5:
        return

    weight = 1.0 if is_contextual else 0.6
    line_truncated = line.strip()[:120]

    # Extract capitalized multi-word terms (proper nouns, tools, companies)
    # e.g., "React", "Google", "Data Structures", "Machine Learning"
    cap_terms = re.findall(r"\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)*\b", clean)
    for term in cap_terms:
        if len(term) < 2:
            continue
        lower = term.lower()
        if lower in _STOP_WORDS or lower in _FILLER_WORDS:
            continue
        # Skip date-like or location-like terms
        if re.match(r"^(?:January|February|March|April|May|June|July|August|September|October|November|December|Present|Current)\b", term, re.IGNORECASE):
            continue
        if re.match(r"^[A-Z]{2}$", term):  # state codes
            continue
        keywords.setdefault(lower, []).append(KeywordOccurrence(
            section=section, line=line_truncated, contextual=is_contextual, weight=weight,
        ))

    # Extract known technical terms (even lowercase): programming languages, tools, frameworks
    tech_patterns = [
        r"\b(?:python|java|javascript|typescript|c\+\+|c#|ruby|php|swift|kotlin|go|rust|scala|perl|r)\b",
        r"\b(?:react|angular|vue|next\.?js|node\.?js|express|django|flask|spring|rails)\b",
        r"\b(?:sql|mysql|postgresql|mongodb|redis|firebase|dynamodb|elasticsearch)\b",
        r"\b(?:aws|azure|gcp|docker|kubernetes|terraform|jenkins|ci/cd|git|github)\b",
        r"\b(?:html|css|sass|tailwind|bootstrap|figma|sketch|photoshop|illustrator)\b",
        r"\b(?:excel|powerpoint|tableau|power\s*bi|spss|stata|matlab|sas)\b",
        r"\b(?:agile|scrum|kanban|jira|confluence|slack|trello|asana)\b",
        r"\b(?:machine\s+learning|deep\s+learning|nlp|computer\s+vision|data\s+science|data\s+analysis)\b",
        r"\b(?:api|rest|graphql|microservices|serverless|devops|saas)\b",
        r"\b(?:hipaa|sox|gdpr|pci|ferpa)\b",
    ]
    lower_clean = clean.lower()
    for pattern in tech_patterns:
        for m in re.finditer(pattern, lower_clean, re.IGNORECASE):
            term = m.group(0).strip()
            if len(term) < 2:
                continue
            keywords.setdefault(term.lower(), []).append(KeywordOccurrence(
                section=section, line=line_truncated, contextual=is_contextual, weight=weight,
            ))

    # Extract significant single words (verbs, nouns) that aren't stop/filler words
    words = re.findall(r"\b[a-zA-Z]{4,}\b", clean)
    for word in words:
        lower = word.lower()
        if lower in _STOP_WORDS or lower in _FILLER_WORDS:
            continue
        # Only keep words that appear meaningful (not too common)
        if lower in ("with", "that", "this", "from", "have", "been", "were", "also", "will"):
            continue
        # Skip very common resume words that aren't differentiating
        if lower in ("used", "made", "went", "came", "took", "gave", "said", "told",
                      "using", "making", "based", "related", "focused"):
            continue
        # Keep action verbs and domain terms
        keywords.setdefault(lower, []).append(KeywordOccurrence(
            section=section, line=line_truncated, contextual=is_contextual, weight=weight,
        ))


# ---------------------------------------------------------------------------
# Build keyword analysis from occurrences
# ---------------------------------------------------------------------------

def _build_keyword_analysis(
    raw_keywords: Dict[str, List[KeywordOccurrence]],
) -> List[KeywordAnalysis]:
    """Build KeywordAnalysis objects from raw occurrences, deduplicated and scored."""
    results: List[KeywordAnalysis] = []

    for kw, occs in raw_keywords.items():
        if not occs:
            continue

        # Deduplicate occurrences by section+line
        seen = set()
        unique_occs: List[KeywordOccurrence] = []
        for o in occs:
            key = (o.section, o.line[:60])
            if key not in seen:
                seen.add(key)
                unique_occs.append(o)

        if not unique_occs:
            continue

        total = len(unique_occs)
        sections_found = sorted(set(o.section for o in unique_occs))
        ctx_count = sum(1 for o in unique_occs if o.contextual)
        bare_count = sum(1 for o in unique_occs if not o.contextual)

        # Placement score: contextual in experience/projects = best, bare in skills = baseline
        weighted_sum = sum(o.weight for o in unique_occs)
        max_possible = len(unique_occs) * 1.0
        placement_score = min(1.0, weighted_sum / max_possible) if max_possible > 0 else 0.0

        # Multi-section bonus: appearing in both experience AND skills is strong
        if "experience" in sections_found and "skills" in sections_found:
            placement_score = min(1.0, placement_score + 0.15)
        if "summary" in sections_found:
            placement_score = min(1.0, placement_score + 0.1)

        if placement_score >= 0.75:
            verdict = "strong"
        elif placement_score >= 0.45:
            verdict = "adequate"
        else:
            verdict = "weak"

        # Generate tip
        tip = None
        if verdict == "weak":
            if bare_count > 0 and ctx_count == 0:
                tip = f"'{kw}' only appears in a skills list. Use it in an experience bullet to strengthen placement."
            elif "experience" not in sections_found and "projects" not in sections_found:
                tip = f"'{kw}' isn't in your experience or projects. Add it to a bullet that shows how you used it."
        elif verdict == "adequate":
            if "skills" not in sections_found and ctx_count > 0:
                tip = f"'{kw}' is used in context but not in your skills section. Add it to Skills for double coverage."
            elif ctx_count == 0:
                tip = f"'{kw}' appears in a list. Use it in an experience bullet for stronger ATS weighting."

        results.append(KeywordAnalysis(
            keyword=kw,
            total_count=total,
            occurrences=unique_occs,
            sections_found=sections_found,
            contextual_count=ctx_count,
            bare_count=bare_count,
            placement_score=placement_score,
            placement_verdict=verdict,
            tip=tip,
        ))

    # Sort: highest placement score first, then by total count
    results.sort(key=lambda k: (-k.placement_score, -k.total_count))
    return results


# ---------------------------------------------------------------------------
# JD matching
# ---------------------------------------------------------------------------

def _extract_jd_keywords(jd_text: str) -> List[Tuple[str, str]]:
    """
    Extract keywords from a job description with category (must_have, nice_to_have, inferred).
    Returns list of (keyword, category).
    """
    if not jd_text or not jd_text.strip():
        return []

    results: List[Tuple[str, str]] = []
    seen: set = set()

    must_have_zone = ""
    nice_to_have_zone = ""

    must_patterns = [
        r"(?:required|minimum|must.have|essential|mandatory)\s*(?:qualifications?|skills?|requirements?|experience)?[:\s]*(.+?)(?=\n\s*\n|preferred|nice.to.have|desired|bonus|$)",
    ]
    nice_patterns = [
        r"(?:preferred|nice.to.have|desired|bonus|plus|optional)\s*(?:qualifications?|skills?|requirements?|experience)?[:\s]*(.+?)(?=\n\s*\n|$)",
    ]

    for pat in must_patterns:
        m = re.search(pat, jd_text, re.IGNORECASE | re.DOTALL)
        if m:
            must_have_zone = m.group(1)
    for pat in nice_patterns:
        m = re.search(pat, jd_text, re.IGNORECASE | re.DOTALL)
        if m:
            nice_to_have_zone = m.group(1)

    def _add_keywords(text: str, category: str):
        for line in text.split("\n"):
            line = re.sub(r"^[•\-*●\u2022\d.)\s]+", "", line).strip()
            if not line or len(line) < 3:
                continue

            # 1. Extract known tech terms first (highest priority, handles case-insensitive)
            tech_terms = re.findall(
                r"\b(?:Python|Java(?!Script)|JavaScript|TypeScript|React|Angular|Vue|Next\.?js|Node\.?js|"
                r"SQL|AWS|Azure|GCP|Docker|Kubernetes|Git(?!Hub)|GitHub|Excel|Tableau|Power\s*BI|"
                r"Agile|Scrum|Machine\s+Learning|Data\s+Science|Data\s+Analysis|REST|API|GraphQL|"
                r"HTML|CSS|Figma|HIPAA|SOX|GDPR|C\+\+|C#|Ruby|PHP|Swift|Kotlin|Rust|"
                r"MongoDB|PostgreSQL|MySQL|Redis|Terraform|Jenkins|CI/CD|DevOps|SaaS|NLP|"
                r"Deep\s+Learning|Spark|Hadoop|Kafka|RabbitMQ|Elasticsearch|Linux|Bash|"
                r"Spring|Django|Flask|Express|Rails|FastAPI|TensorFlow|PyTorch|Pandas|NumPy|"
                r"Matplotlib|Scikit.?learn|JIRA|Confluence|Slack|Trello|Asana|Snowflake|"
                r"Databricks|Airflow|dbt|Looker|Mixpanel|Amplitude|Segment|Salesforce|HubSpot|"
                r"Figma|Sketch|Adobe\s*XD|Photoshop|Illustrator|InDesign|After\s*Effects|"
                r"MATLAB|SPSS|Stata|SAS|Minitab)\b",
                line, re.IGNORECASE,
            )
            for term in tech_terms:
                key = term.lower().strip()
                if key not in seen:
                    seen.add(key)
                    results.append((key, category))

            # 2. Extract domain-specific compound terms (2-3 words)
            compound_terms = re.findall(
                r"\b(?:cloud\s+(?:computing|platform|infrastructure)|"
                r"full[- ]stack|front[- ]end|back[- ]end|cross[- ]functional|"
                r"version\s+control|unit\s+testing|test[- ]driven|"
                r"object[- ]oriented|functional\s+programming|"
                r"natural\s+language\s+processing|computer\s+vision|"
                r"data\s+engineering|data\s+modeling|data\s+warehouse|"
                r"business\s+intelligence|project\s+management|"
                r"software\s+engineering|software\s+development|"
                r"web\s+development|mobile\s+development|"
                r"quality\s+assurance|user\s+research|"
                r"a/b\s+testing|statistical\s+analysis|"
                r"financial\s+modeling|financial\s+analysis|"
                r"supply\s+chain|product\s+management|"
                r"technical\s+writing|content\s+strategy)\b",
                line, re.IGNORECASE,
            )
            for term in compound_terms:
                key = re.sub(r"\s+", " ", term.lower().strip())
                if key not in seen:
                    seen.add(key)
                    results.append((key, category))

    if must_have_zone:
        _add_keywords(must_have_zone, "must_have")
    if nice_to_have_zone:
        _add_keywords(nice_to_have_zone, "nice_to_have")

    if not must_have_zone and not nice_to_have_zone:
        _add_keywords(jd_text, "inferred")

    return results[:40]


def _match_jd_to_resume(
    jd_keywords: List[Tuple[str, str]],
    resume_keywords: Dict[str, List[KeywordOccurrence]],
    sections: Dict[str, str],
) -> dict:
    """
    Match JD keywords against resume keywords.
    Returns JD match result dict.
    """
    requirements: List[dict] = []
    total_must = 0
    matched_must = 0
    total_nice = 0
    matched_nice = 0
    total_all = 0
    matched_all = 0

    # Build full resume text for fuzzy matching
    full_resume = " ".join(content for content in sections.values() if content).lower()

    for kw, category in jd_keywords:
        kw_lower = kw.lower().strip()
        total_all += 1
        if category == "must_have":
            total_must += 1
        elif category == "nice_to_have":
            total_nice += 1

        # Check if keyword or close variant exists in resume keywords
        found = False
        resume_count = 0
        contextual = False
        placement = "missing"

        if kw_lower in resume_keywords:
            occs = resume_keywords[kw_lower]
            found = True
            resume_count = len(occs)
            contextual = any(o.contextual for o in occs)
        else:
            # Word-boundary match to prevent "java" matching "javascript"
            boundary_pat = re.compile(r"\b" + re.escape(kw_lower) + r"\b", re.IGNORECASE)
            boundary_matches = boundary_pat.findall(full_resume)
            if boundary_matches:
                found = True
                resume_count = len(boundary_matches)
                for sec_key, content in sections.items():
                    cat = _classify_section(sec_key)
                    if cat in ("experience", "projects") and boundary_pat.search(content):
                        contextual = True
                        break

        if found:
            matched_all += 1
            if category == "must_have":
                matched_must += 1
            elif category == "nice_to_have":
                matched_nice += 1

            if contextual:
                placement = "strong"
            elif resume_count > 0:
                placement = "adequate"
        else:
            placement = "missing"

        # Generate suggestion for missing/weak keywords
        suggestion = None
        if not found:
            suggestion = f"Add '{kw}' to your skills section and use it in an experience bullet."
        elif not contextual:
            suggestion = f"'{kw}' is on your resume but not used in context. Add it to an experience bullet."

        requirements.append({
            "keyword": kw,
            "category": category,
            "found": found,
            "count": resume_count,
            "contextual": contextual,
            "placement": placement,
            "suggestion": suggestion,
        })

    # Calculate match percentage
    match_pct = round(matched_all / total_all * 100) if total_all > 0 else 0
    must_pct = round(matched_must / total_must * 100) if total_must > 0 else None
    nice_pct = round(matched_nice / total_nice * 100) if total_nice > 0 else None

    return {
        "match_percentage": match_pct,
        "must_have_matched": f"{matched_must}/{total_must}" if total_must > 0 else None,
        "must_have_pct": must_pct,
        "nice_to_have_matched": f"{matched_nice}/{total_nice}" if total_nice > 0 else None,
        "nice_to_have_pct": nice_pct,
        "total_matched": f"{matched_all}/{total_all}",
        "requirements": requirements,
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_keyword_analysis(
    sections: Dict[str, str],
    job_description: Optional[str] = None,
) -> KeywordDensityResult:
    """
    Run keyword density and placement analysis on resume sections.

    Args:
        sections: Dict of section_key -> content from the parsed resume
        job_description: Optional JD text for match analysis

    Returns:
        KeywordDensityResult with all analysis data
    """
    # Extract all keywords with their occurrences
    raw_keywords = _extract_meaningful_keywords(sections)

    # Build analysis objects
    keyword_analyses = _build_keyword_analysis(raw_keywords)

    # Filter to top 25 most significant keywords (by count * placement)
    keyword_analyses = keyword_analyses[:25]

    total_kw = len(keyword_analyses)
    total_ctx = sum(k.contextual_count for k in keyword_analyses)
    total_bare = sum(k.bare_count for k in keyword_analyses)

    # Overall density score: ratio of contextual to total, weighted
    if total_ctx + total_bare > 0:
        density_score = min(1.0, (total_ctx * 1.0 + total_bare * 0.4) / (total_ctx + total_bare))
    else:
        density_score = 0.0

    # JD matching
    jd_match = None
    if job_description and job_description.strip():
        jd_keywords = _extract_jd_keywords(job_description)
        if jd_keywords:
            jd_match = _match_jd_to_resume(jd_keywords, raw_keywords, sections)

    return KeywordDensityResult(
        total_keywords=total_kw,
        total_contextual=total_ctx,
        total_bare=total_bare,
        density_score=density_score,
        keywords=keyword_analyses,
        jd_match=jd_match,
    )
