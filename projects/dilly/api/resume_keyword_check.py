"""
Post-generation keyword coverage verification.

Given a job description and the generated resume sections, estimate how
many of the JD's high-value keywords made it into the resume. This is the
"would it pass the ATS filter?" safety net that runs immediately after
generation.

Algorithm:
  1. Extract "demand" keywords from the JD: named entities, capitalized
     multi-word phrases, and a curated list of ~400 skill/tool terms.
  2. Lowercase and stem lightly (drop common plurals, 'ing', etc.).
  3. For each JD keyword, check direct membership in the resume text
     AND a short list of semantic bridges ('docker' ↔ 'container',
     'react' ↔ 'frontend', etc.).
  4. Return coverage as a percent + list of missing keywords the user
     might want to address.

This is heuristic, not a perfect ATS simulator, but it catches the
"oh no the JD says Kubernetes everywhere and the resume never mentions
containers" failure mode, which is exactly the one Dilan cares about.
"""

from __future__ import annotations

import re
from typing import Any


# Terms commonly valued in tech/business/science JDs. Used as a
# whitelist when extracting demand keywords — NOT an exhaustive list;
# free-form capitalized multi-word phrases from the JD get added in too.
_KNOWN_SKILL_TERMS = {
    # programming languages
    "python", "java", "javascript", "typescript", "c++", "c#", "go", "golang",
    "rust", "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "sql",
    "bash", "shell", "perl", "lua", "dart",
    # frontend
    "react", "vue", "angular", "svelte", "next.js", "nextjs", "redux",
    "tailwind", "css", "html", "sass", "webpack", "vite",
    # backend / infra
    "node.js", "node", "django", "flask", "fastapi", "spring", "express",
    "rails", "laravel", ".net", "graphql", "rest", "grpc", "microservices",
    # data / ml
    "pandas", "numpy", "scikit-learn", "sklearn", "tensorflow", "pytorch",
    "keras", "spark", "hadoop", "kafka", "airflow", "dbt", "snowflake",
    "bigquery", "redshift", "databricks", "jupyter", "tableau", "power bi",
    "powerbi", "looker", "excel",
    # ml / ai specific
    "nlp", "computer vision", "deep learning", "machine learning", "llm",
    "transformer", "embedding", "rag", "fine-tuning", "classification",
    "regression", "clustering", "recommendation system", "reinforcement learning",
    # infra / devops
    "docker", "kubernetes", "k8s", "terraform", "ansible", "jenkins",
    "github actions", "gitlab ci", "circleci", "aws", "azure", "gcp",
    "s3", "ec2", "lambda", "ecs", "eks", "cloudformation", "pulumi",
    "prometheus", "grafana", "datadog", "splunk", "elasticsearch", "elk",
    # databases
    "postgresql", "postgres", "mysql", "mongodb", "redis", "dynamodb",
    "cassandra", "sqlite", "oracle", "ms sql", "sqlserver",
    # mobile
    "ios", "android", "react native", "flutter", "expo", "xcode",
    # testing / quality
    "jest", "mocha", "cypress", "selenium", "pytest", "junit", "rspec",
    "tdd", "bdd", "unit testing", "integration testing",
    # practices / methodologies
    "agile", "scrum", "kanban", "waterfall", "ci/cd", "pair programming",
    "code review", "mentorship",
    # business / finance
    "financial modeling", "dcf", "valuation", "m&a", "pitch book",
    "bloomberg", "capital iq", "factset", "excel modeling",
    # consulting / operations
    "process improvement", "market research", "competitive analysis",
    "stakeholder management", "project management", "cross-functional",
    # data analysis soft
    "data visualization", "data analysis", "a/b testing", "hypothesis testing",
    "statistics", "sql queries", "data pipeline", "etl",
    # healthcare / science
    "clinical", "patient care", "emr", "hipaa", "epidemiology",
    "biostatistics", "pcr", "western blot", "flow cytometry",
    # security
    "penetration testing", "siem", "zero trust", "soc2", "iso 27001",
    "gdpr", "hipaa",
    # soft-ish but real
    "leadership", "communication", "collaboration", "mentorship", "ownership",
    "autonomy",
}


# Bridges: if the JD demands X but the resume only has Y, we still give
# the candidate credit because the skills are concept-adjacent and a
# modern semantic-match ATS (Ashby, Lever, Greenhouse-with-Sovren post-
# 2023) will rank them close.
_SEMANTIC_BRIDGES: dict[str, set[str]] = {
    "kubernetes": {"docker", "container", "containerization", "k8s", "containerized"},
    "k8s": {"docker", "kubernetes", "container"},
    "docker": {"kubernetes", "k8s", "container", "containerization"},
    "typescript": {"javascript", "js"},
    "javascript": {"typescript", "js"},
    "react": {"react native", "next.js", "frontend"},
    "react native": {"react"},
    "node.js": {"javascript", "typescript", "express"},
    "postgresql": {"postgres", "sql", "rdbms", "relational database"},
    "postgres": {"postgresql", "sql"},
    "mysql": {"sql", "rdbms", "relational database"},
    "sql": {"postgres", "postgresql", "mysql", "bigquery", "redshift"},
    "aws": {"cloud", "s3", "ec2", "lambda"},
    "gcp": {"cloud", "bigquery", "cloud run"},
    "azure": {"cloud"},
    "machine learning": {"ml", "deep learning", "classification", "regression"},
    "ml": {"machine learning", "deep learning"},
    "nlp": {"natural language processing", "llm", "transformer"},
    "llm": {"nlp", "transformer", "fine-tuning", "rag"},
    "data analysis": {"data analytics", "analysis", "statistics"},
    "data visualization": {"tableau", "power bi", "powerbi", "looker"},
    "ci/cd": {"github actions", "jenkins", "circleci", "gitlab ci"},
    "microservices": {"services", "api", "distributed"},
    "graphql": {"api", "rest"},
    "rest": {"api", "restful", "http"},
}


def _normalize(s: str) -> str:
    s = s.lower().strip()
    # Lightly stem: drop trailing 's', 'es', 'ing', 'ed' when the stem
    # is likely still a real word (>=4 chars).
    for suffix in ("ing", "ed", "s"):
        if s.endswith(suffix) and len(s) - len(suffix) >= 4:
            base = s[: -len(suffix)]
            if base.isalpha() or "-" in base or "." in base:
                return base
    return s


# Words that signal a job-title / role phrase rather than a skill.
# "Senior Backend Engineer" and "Product Manager" should not count as
# demand keywords because the candidate's own title is rarely going to
# match verbatim — and flagging them as "missing" pollutes the UX.
_JOB_TITLE_WORDS = {
    "engineer", "engineers", "developer", "developers", "manager",
    "managers", "analyst", "analysts", "designer", "designers",
    "scientist", "scientists", "consultant", "consultants",
    "intern", "interns", "associate", "associates", "lead",
    "director", "vp", "head", "specialist", "architect",
    "coordinator", "administrator", "technician", "officer",
}


def _extract_jd_keywords(jd: str, max_terms: int = 40) -> list[str]:
    """Extract the most likely 'demand' keywords from the job description."""
    if not jd:
        return []
    text = jd.lower()

    hits: set[str] = set()

    # Known skill terms: direct membership on the full text.
    for term in _KNOWN_SKILL_TERMS:
        if re.search(r"\b" + re.escape(term) + r"\b", text):
            hits.add(term)

    # Capitalized 2–4 word phrases from the JD (often proper tool /
    # product names the whitelist doesn't cover). We split the JD into
    # sentences FIRST so a phrase can never straddle a period — this
    # fixes the "Kubernetes, and AWS. Experience with microservices"
    # bug where the extractor produced garbage like "aws. experience".
    # Splitter is intentionally simple (. ! ? + newline + bullet glyph):
    # JDs are rarely literary, and a false sentence split just means we
    # miss a multi-word tool name, which is recoverable — a false
    # non-split produces uncorrectable noise in the "missing" list.
    sentences = re.split(r"[.!?\n\r\u2022\u2023\u25cf]+", jd)
    for sent in sentences:
        for m in re.finditer(
            r"\b([A-Z][a-zA-Z0-9+#-]*(?:\.[a-zA-Z0-9+#-]+)?"
            r"(?:\s+[A-Z][a-zA-Z0-9+#-]*(?:\.[a-zA-Z0-9+#-]+)?){0,3})\b",
            sent,
        ):
            phrase = m.group(1).strip()
            lower = phrase.lower()
            # Basic guards.
            if lower in {"we", "you", "they", "our", "your", "their"}:
                continue
            if len(lower) < 3:
                continue
            # Job titles: if any word in the phrase is a title word, it
            # is not a skill. "Senior Backend Engineer" out, "Backend"
            # on its own stays (and wouldn't match _KNOWN_SKILL_TERMS
            # anyway, so it'll be filtered below).
            tokens = lower.split()
            if any(t in _JOB_TITLE_WORDS for t in tokens):
                continue
            # Single capitalized word — only keep if it's a known skill.
            # Otherwise we grab every sentence-starter and proper noun.
            if " " not in phrase and not any(c in phrase for c in "+#-.") :
                if lower not in _KNOWN_SKILL_TERMS:
                    continue
            hits.add(lower)

    # Rank hits by frequency in the JD and return the top N
    ranked = sorted(
        hits,
        key=lambda h: text.count(h),
        reverse=True,
    )
    return ranked[:max_terms]


def _sections_to_text(sections: list[dict]) -> str:
    """Flatten the structured resume sections into a single text blob."""
    parts: list[str] = []
    for s in sections or []:
        if not isinstance(s, dict):
            continue
        key = s.get("key")
        if key == "contact":
            continue  # exclude contact info from keyword matching
        if s.get("education"):
            edu = s["education"]
            for f in ("university", "major", "minor", "honors"):
                v = (edu.get(f) or "").strip()
                if v:
                    parts.append(v)
        for entry in s.get("experiences") or []:
            for f in ("company", "role", "location"):
                v = (entry.get(f) or "").strip()
                if v:
                    parts.append(v)
            for b in entry.get("bullets") or []:
                t = b.get("text", "") if isinstance(b, dict) else str(b)
                if t:
                    parts.append(t)
        for proj in s.get("projects") or []:
            for f in ("name", "tech", "location"):
                v = (proj.get(f) or "").strip()
                if v:
                    parts.append(v)
            for b in proj.get("bullets") or []:
                t = b.get("text", "") if isinstance(b, dict) else str(b)
                if t:
                    parts.append(t)
        for line in (s.get("simple") or {}).get("lines") or []:
            if isinstance(line, str) and line.strip():
                parts.append(line.strip())
    return " | ".join(parts).lower()


def _matches(keyword: str, resume_text: str) -> bool:
    kw = keyword.lower().strip()
    if not kw:
        return False
    # Direct word-boundary match
    if re.search(r"\b" + re.escape(kw) + r"\b", resume_text):
        return True
    # Normalized stem match (kw->pandas_stem, resume_stem matches pandas_stem)
    norm_kw = _normalize(kw)
    if norm_kw != kw and re.search(r"\b" + re.escape(norm_kw), resume_text):
        return True
    # Semantic bridge: if any bridge term for this keyword is in the resume,
    # count it as a match (option B).
    for bridge in _SEMANTIC_BRIDGES.get(kw, set()):
        if re.search(r"\b" + re.escape(bridge) + r"\b", resume_text):
            return True
    return False


def check_keyword_coverage(
    sections: list[dict],
    job_description: str,
    min_coverage_pct: int = 50,
) -> dict[str, Any]:
    """Score how well the resume covers the JD's demand keywords.

    Returns:
        {
          passed: bool (coverage >= min_coverage_pct),
          coverage_pct: int,
          total_keywords: int,
          matched_keywords: [str],
          missing_keywords: [str],   # up to 10 most important missing
          warning: str | None,
        }
    """
    keywords = _extract_jd_keywords(job_description)
    if not keywords:
        # No JD or nothing we could extract — can't score it
        return {
            "passed": True,
            "coverage_pct": 100,
            "total_keywords": 0,
            "matched_keywords": [],
            "missing_keywords": [],
            "warning": None,
        }
    resume_text = _sections_to_text(sections)
    matched: list[str] = []
    missing: list[str] = []
    for kw in keywords:
        (matched if _matches(kw, resume_text) else missing).append(kw)
    total = len(keywords)
    pct = int(round((len(matched) / total) * 100)) if total else 100
    warning: Optional[str] = None
    if pct < min_coverage_pct:
        warning = (
            f"Keyword coverage below threshold ({pct}%). The JD asks for "
            f"things like {', '.join(missing[:5])} that aren't clearly in "
            "your resume. If you actually have experience with these, "
            "tell Dilly so we can weave them in. Otherwise the ATS may "
            "filter this application out."
        )
    return {
        "passed": pct >= min_coverage_pct,
        "coverage_pct": pct,
        "total_keywords": total,
        "matched_keywords": matched[:20],
        "missing_keywords": missing[:10],
        "warning": warning,
    }


# Late import so module imports don't fail at startup
from typing import Optional  # noqa: E402
