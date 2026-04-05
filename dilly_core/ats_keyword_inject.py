"""
Dilly ATS Contextual Keyword Injection.

Given keyword analysis results, identifies keywords that need stronger placement
and suggests exactly which bullet to add them to + a concrete rewrite.

Rule-based matching with optional LLM enhancement for complex rewrites.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


@dataclass
class InjectionSuggestion:
    """One keyword injection suggestion."""
    keyword: str
    status: str                  # "missing", "bare_only", "weak_placement"
    reason: str                  # why this injection is needed
    target_bullet: str           # the original bullet to modify
    target_section: str          # which section the bullet is in
    rewritten_bullet: str        # the bullet with keyword injected
    confidence: float            # 0.0–1.0 how natural the injection is
    priority: int                # 1=critical, 2=recommended, 3=nice-to-have


@dataclass
class InjectionResult:
    """Full injection analysis."""
    suggestions: List[InjectionSuggestion]
    summary: str
    keywords_addressed: int
    keywords_skipped: int

    def to_dict(self) -> dict:
        return {
            "suggestions": [
                {
                    "keyword": s.keyword,
                    "status": s.status,
                    "reason": s.reason,
                    "target_bullet": s.target_bullet,
                    "target_section": s.target_section,
                    "rewritten_bullet": s.rewritten_bullet,
                    "confidence": round(s.confidence, 2),
                    "priority": s.priority,
                }
                for s in self.suggestions
            ],
            "summary": self.summary,
            "keywords_addressed": self.keywords_addressed,
            "keywords_skipped": self.keywords_skipped,
        }


# Semantic affinity groups — keywords that tend to co-occur
_AFFINITY: Dict[str, List[str]] = {
    "python": ["data", "script", "automat", "analys", "machine learning", "django", "flask", "pandas", "pipeline"],
    "java": ["spring", "backend", "api", "microservice", "object", "android"],
    "javascript": ["react", "node", "frontend", "web", "dom", "typescript", "ui", "ux"],
    "typescript": ["react", "node", "frontend", "web", "angular", "type"],
    "react": ["frontend", "component", "ui", "web", "redux", "state", "dashboard", "interface"],
    "sql": ["database", "query", "data", "report", "analys", "join", "table"],
    "excel": ["spreadsheet", "data", "report", "analys", "financial", "pivot", "model"],
    "tableau": ["dashboard", "visual", "data", "report", "analytic", "insight"],
    "aws": ["cloud", "deploy", "infrastructure", "server", "lambda", "s3", "ec2"],
    "docker": ["container", "deploy", "infrastructure", "ci", "pipeline", "microservice"],
    "git": ["version", "collaborat", "code", "repository", "branch", "merge"],
    "agile": ["sprint", "scrum", "team", "project", "stakeholder", "backlog", "iteration"],
    "machine learning": ["model", "data", "predict", "train", "algorithm", "feature", "accuracy"],
    "data analysis": ["analyz", "data", "insight", "report", "trend", "metric", "dashboard"],
    "project management": ["led", "manag", "team", "timeline", "deliverable", "stakeholder", "coordinate"],
    "figma": ["design", "ui", "ux", "prototype", "wireframe", "mockup", "interface"],
    "power bi": ["dashboard", "visual", "data", "report", "analytic", "insight", "kpi"],
    "leadership": ["led", "manag", "team", "mentor", "coordinat", "direct", "oversee"],
}


def _extract_bullets(sections: Dict[str, str]) -> List[Tuple[str, str, str]]:
    """
    Extract all bullet lines from experience/projects sections.
    Returns: [(section_name, original_line, cleaned_line), ...]
    """
    bullets: List[Tuple[str, str, str]] = []
    for key, content in sections.items():
        lower_key = key.lower()
        is_target = any(t in lower_key for t in (
            "experience", "project", "research", "leadership",
            "involvement", "volunteer", "activit",
        ))
        if not is_target:
            continue
        for line in content.split("\n"):
            stripped = line.strip()
            if not stripped or len(stripped) < 15:
                continue
            clean = re.sub(r"^[•\-*●\u2022]\s*", "", stripped)
            if len(clean.split()) < 4:
                continue
            bullets.append((key, stripped, clean))
    return bullets


def _score_bullet_for_keyword(
    bullet_clean: str, keyword: str,
) -> float:
    """
    Score how well a bullet relates to a keyword (0.0–1.0).
    Higher = more natural injection target.
    """
    lower = bullet_clean.lower()
    kw_lower = keyword.lower()

    if re.search(r"\b" + re.escape(kw_lower) + r"\b", lower):
        return 0.0  # already contains keyword

    score = 0.0

    # Check affinity group
    affinity_terms = _AFFINITY.get(kw_lower, [])
    for term in affinity_terms:
        if term in lower:
            score += 0.25

    # Check if bullet has related domain words
    kw_parts = kw_lower.split()
    for part in kw_parts:
        if len(part) > 3 and part in lower:
            score += 0.15

    # Longer bullets are better injection targets (more context to work with)
    word_count = len(bullet_clean.split())
    if word_count >= 12:
        score += 0.1
    elif word_count >= 8:
        score += 0.05

    return min(1.0, score)


def _inject_keyword_into_bullet(
    bullet_clean: str, keyword: str,
) -> Tuple[str, float]:
    """
    Inject a keyword into a bullet, returning (rewritten, confidence).
    Uses pattern-based insertion at natural points.
    """
    kw = keyword
    kw_lower = keyword.lower()
    lower = bullet_clean.lower()

    # Strategy 1: Tool/tech keyword — append "using {keyword}" or "with {keyword}"
    tech_keywords = {
        "python", "java", "javascript", "typescript", "react", "angular", "vue",
        "node.js", "next.js", "sql", "mysql", "postgresql", "mongodb", "redis",
        "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "git", "github",
        "excel", "tableau", "power bi", "figma", "jira", "confluence", "slack",
        "html", "css", "sass", "tailwind", "django", "flask", "spring", "express",
        "tensorflow", "pytorch", "pandas", "numpy", "spark", "hadoop", "kafka",
        "elasticsearch", "matlab", "spss", "stata", "sas", "r",
    }
    if kw_lower in tech_keywords:
        # Try inserting "using {kw}" before trailing metrics or at end
        metrics_match = re.search(r",?\s*(?:resulting|achieving|leading|increasing|reducing|improving|saving)\b", bullet_clean, re.IGNORECASE)
        if metrics_match:
            pos = metrics_match.start()
            rewritten = bullet_clean[:pos].rstrip(", ") + f" using {kw}" + bullet_clean[pos:]
            return rewritten, 0.75

        # Before a trailing percentage/number
        num_match = re.search(r",?\s*\d+[%$]", bullet_clean)
        if num_match:
            pos = num_match.start()
            rewritten = bullet_clean[:pos].rstrip(", ") + f" with {kw}" + bullet_clean[pos:]
            return rewritten, 0.7

        # Append at end
        rewritten = bullet_clean.rstrip(".") + f" using {kw}"
        return rewritten, 0.6

    # Strategy 2: Process/methodology keyword — insert "through {keyword}" or "via {keyword}"
    process_keywords = {
        "agile", "scrum", "kanban", "ci/cd", "devops", "a/b testing",
        "machine learning", "deep learning", "data analysis", "data science",
        "project management", "quality assurance", "user research",
    }
    if kw_lower in process_keywords:
        metrics_match = re.search(r",?\s*(?:resulting|achieving|leading|increasing|reducing|improving|saving)\b", bullet_clean, re.IGNORECASE)
        if metrics_match:
            pos = metrics_match.start()
            rewritten = bullet_clean[:pos].rstrip(", ") + f" through {kw}" + bullet_clean[pos:]
            return rewritten, 0.7

        rewritten = bullet_clean.rstrip(".") + f" through {kw} methodology"
        return rewritten, 0.55

    # Strategy 3: Skill/soft keyword — weave into existing structure
    skill_keywords = {
        "leadership", "communication", "collaboration", "mentoring",
        "problem solving", "critical thinking", "strategic planning",
    }
    if kw_lower in skill_keywords:
        if "team" in lower or "collaborat" in lower:
            rewritten = bullet_clean.rstrip(".") + f", demonstrating strong {kw}"
            return rewritten, 0.6

        rewritten = bullet_clean.rstrip(".") + f", leveraging {kw} skills"
        return rewritten, 0.5

    # Strategy 4: Generic — try "utilizing {keyword}" at natural break point
    rewritten = bullet_clean.rstrip(".") + f" utilizing {kw}"
    return rewritten, 0.4


def _llm_inject_keywords(
    suggestions: List[InjectionSuggestion],
) -> List[InjectionSuggestion]:
    """Enhance low-confidence injections with LLM if available."""
    try:
        from dilly_core.llm_client import is_llm_available, get_chat_completion, get_light_model
        if not is_llm_available():
            return suggestions
    except ImportError:
        return suggestions

    low_conf = [s for s in suggestions if s.confidence < 0.6]
    if not low_conf:
        return suggestions

    prompt_items = []
    for s in low_conf[:8]:
        prompt_items.append(f"Keyword: {s.keyword}\nOriginal: {s.target_bullet}\nAttempt: {s.rewritten_bullet}")

    system = (
        "You are an ATS resume optimization expert. For each bullet, naturally integrate the keyword "
        "so it reads authentically — not forced. Preserve the original meaning and metrics. "
        "The keyword should feel like it was always there.\n\n"
        "Output ONLY a JSON array of objects: "
        '[{"keyword": "...", "rewritten": "...", "confidence": 0.0-1.0}]\n'
        "No markdown, no explanation. Just the JSON array."
    )
    user_msg = "Improve these keyword injections:\n\n" + "\n\n".join(prompt_items)

    try:
        import json
        resp = get_chat_completion(
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user_msg}],
            model=get_light_model(),
            temperature=0.3,
            max_tokens=1500,
        )
        cleaned = resp.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```\w*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned)
        items = json.loads(cleaned)
        kw_map = {item["keyword"].lower(): item for item in items if "keyword" in item and "rewritten" in item}
        for s in suggestions:
            if s.keyword.lower() in kw_map:
                entry = kw_map[s.keyword.lower()]
                s.rewritten_bullet = entry["rewritten"]
                s.confidence = max(s.confidence, float(entry.get("confidence", 0.7)))
    except Exception:
        pass

    return suggestions


def generate_keyword_injections(
    keyword_analysis: dict,
    sections: Dict[str, str],
    use_llm: bool = True,
) -> InjectionResult:
    """
    Generate contextual keyword injection suggestions.

    Args:
        keyword_analysis: Output from run_keyword_analysis().to_dict()
        sections: Resume sections dict from parser
        use_llm: Whether to use LLM for enhancement

    Returns:
        InjectionResult with concrete suggestions
    """
    bullets = _extract_bullets(sections)
    if not bullets:
        return InjectionResult(
            suggestions=[], summary="No experience/project bullets found to inject keywords into.",
            keywords_addressed=0, keywords_skipped=0,
        )

    suggestions: List[InjectionSuggestion] = []
    skipped = 0

    kw_list = keyword_analysis.get("keywords", [])
    for kw_data in kw_list:
        keyword = kw_data.get("keyword", "")
        verdict = kw_data.get("placement_verdict", "strong")
        ctx_count = kw_data.get("contextual_count", 0)
        bare_count = kw_data.get("bare_count", 0)
        total_count = kw_data.get("total_count", 0)

        # Only target weak/adequate keywords
        if verdict == "strong" and ctx_count > 0:
            continue

        if ctx_count > 0 and verdict != "weak":
            continue

        # Determine status and priority
        if total_count == 0:
            status = "missing"
            reason = f"'{keyword}' doesn't appear anywhere on your resume"
            priority = 1
        elif ctx_count == 0 and bare_count > 0:
            status = "bare_only"
            reason = f"'{keyword}' is only in a skills list — ATS weights contextual usage 2-3x higher"
            priority = 2
        else:
            status = "weak_placement"
            reason = f"'{keyword}' placement is weak — strengthen it with contextual usage in a bullet"
            priority = 3

        # Find best bullet to inject into
        scored_bullets = []
        for sec_name, orig, clean in bullets:
            score = _score_bullet_for_keyword(clean, keyword)
            if score > 0:
                scored_bullets.append((score, sec_name, orig, clean))

        if not scored_bullets:
            # Fall back to longest bullet in experience
            exp_bullets = [(len(c.split()), s, o, c) for s, o, c in bullets]
            exp_bullets.sort(key=lambda x: -x[0])
            if exp_bullets:
                _, sec_name, orig, clean = exp_bullets[0]
                scored_bullets = [(0.2, sec_name, orig, clean)]

        if not scored_bullets:
            skipped += 1
            continue

        scored_bullets.sort(key=lambda x: -x[0])
        best_score, best_section, best_orig, best_clean = scored_bullets[0]

        rewritten, inject_confidence = _inject_keyword_into_bullet(best_clean, keyword)

        # Reconstruct with bullet prefix
        prefix_match = re.match(r"^([•\-*●\u2022]\s*)", best_orig)
        prefix = prefix_match.group(1) if prefix_match else "• "
        rewritten_full = prefix + rewritten

        suggestions.append(InjectionSuggestion(
            keyword=keyword,
            status=status,
            reason=reason,
            target_bullet=best_orig,
            target_section=best_section,
            rewritten_bullet=rewritten_full,
            confidence=inject_confidence,
            priority=priority,
        ))

    # LLM enhancement for low-confidence injections
    if use_llm and suggestions:
        suggestions = _llm_inject_keywords(suggestions)

    # Sort by priority, then confidence descending
    suggestions.sort(key=lambda s: (s.priority, -s.confidence))

    # Cap at 10 suggestions
    suggestions = suggestions[:10]

    addressed = len(suggestions)
    if addressed == 0:
        summary = "All keywords have strong contextual placement. No injections needed."
    else:
        critical = sum(1 for s in suggestions if s.priority == 1)
        recommended = sum(1 for s in suggestions if s.priority == 2)
        parts = []
        if critical:
            parts.append(f"{critical} missing keyword{'s' if critical != 1 else ''}")
        if recommended:
            parts.append(f"{recommended} bare-list keyword{'s' if recommended != 1 else ''}")
        rest = addressed - critical - recommended
        if rest:
            parts.append(f"{rest} weak placement{'s' if rest != 1 else ''}")
        summary = f"Found {' + '.join(parts)} that need contextual placement in your bullets."

    return InjectionResult(
        suggestions=suggestions,
        summary=summary,
        keywords_addressed=addressed,
        keywords_skipped=skipped,
    )
