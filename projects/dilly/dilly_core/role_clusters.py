"""
Role cluster definitions for AI Arena's Role Radar.

Maps raw job title substrings → a canonical cluster name. Used by the
nightly classify_arena_attrs.py batch to populate internships.role_cluster.

Design rules:
- Patterns are matched against lowercased title text (no description).
- First match wins — order within each cluster matters for specificity.
- Clusters are intentionally broad to ensure enough dots on the chart
  (aim for 20+ listings per cluster per active cohort).
- CLUSTER_LABELS provides the display name shown on the Role Radar chart.
"""

from __future__ import annotations

import re

# ── Cluster → title patterns ──────────────────────────────────────────────
# Checked in order; first full-list match wins.
# Each entry: (cluster_name, [pattern_strings])  — patterns are regex fragments
# matched against the full lowercased title with re.search().

CLUSTERS: list[tuple[str, list[str]]] = [
    # ── AI / ML specialisms first (more specific than generic SWE) ─────────
    ("ml-ai-engineer", [
        r"machine learning engineer", r"\bml engineer\b", r"\bai engineer\b",
        r"mlops", r"llmops", r"llm engineer", r"ai platform engineer",
        r"applied (machine learning|ml|ai) scientist",
        r"research engineer.*(ml|ai|nlp|vision)",
        r"computer vision engineer", r"nlp engineer",
    ]),

    # ── Software engineering (broad) ───────────────────────────────────────
    ("software-engineer", [
        r"software engineer", r"\bswe\b", r"software developer",
        r"full.?stack", r"frontend engineer", r"frontend developer",
        r"backend engineer", r"backend developer",
        r"ios (developer|engineer)", r"android (developer|engineer)",
        r"mobile (developer|engineer)", r"web developer",
        r"site reliability engineer", r"\bsre\b",
        r"devops engineer", r"platform engineer",
        r"cloud engineer", r"infrastructure engineer",
        r"founding engineer", r"staff engineer", r"principal engineer",
    ]),

    # ── Data engineering ───────────────────────────────────────────────────
    ("data-engineer", [
        r"data engineer", r"analytics engineer", r"\betl\b",
        r"data platform", r"database engineer", r"data infrastructure",
        r"data pipeline", r"data architect",
    ]),

    # ── Data science ───────────────────────────────────────────────────────
    ("data-scientist", [
        r"data scientist", r"research scientist",
        r"quantitative researcher", r"quant researcher",
    ]),

    # ── Data / business analysis ───────────────────────────────────────────
    ("data-analyst", [
        r"data analyst", r"analytics analyst", r"business analyst",
        r"insights analyst", r"reporting analyst", r"bi analyst",
        r"business intelligence analyst",
    ]),

    # ── BI / visualization ─────────────────────────────────────────────────
    ("bi-developer", [
        r"bi developer", r"bi engineer", r"business intelligence developer",
        r"power bi", r"tableau developer", r"visualization engineer",
    ]),

    # ── Product management ─────────────────────────────────────────────────
    ("product-manager", [
        r"product manager", r"\bpm\b.*product", r"product owner",
        r"associate product manager", r"\bapm\b",
        r"technical product manager", r"director of product",
    ]),

    # ── Security ───────────────────────────────────────────────────────────
    ("security", [
        r"security (engineer|analyst|architect)", r"cybersecurity",
        r"information security", r"appsec", r"penetration test",
        r"threat (analyst|intelligence)", r"incident response",
        r"vulnerability (analyst|researcher)",
    ]),

    # ── UX / Design ────────────────────────────────────────────────────────
    ("design-ux", [
        r"ux (designer|researcher|lead)", r"ui (designer|engineer)",
        r"product designer", r"user (researcher|experience)",
        r"brand designer", r"graphic designer", r"visual designer",
        r"interaction designer", r"creative director",
    ]),

    # ── Finance / Investment ───────────────────────────────────────────────
    ("financial-analyst", [
        r"financial analyst", r"finance analyst", r"\bfp&a\b",
        r"investment banking (analyst|associate)",
        r"\bib analyst\b", r"capital markets analyst",
        r"equity research analyst", r"equity analyst",
        r"treasury analyst", r"corporate finance",
        r"mergers.*(acquisitions|analyst)",
    ]),

    # ── Accounting ─────────────────────────────────────────────────────────
    ("accounting", [
        r"accountant", r"accounting (analyst|associate|intern)",
        r"audit (associate|analyst|intern)", r"\btas\b.*analyst",
        r"tax (analyst|associate|consultant)",
        r"\bcpa\b", r"controller", r"staff accountant",
    ]),

    # ── Quantitative / Risk ────────────────────────────────────────────────
    ("quant-risk", [
        r"quantitative analyst", r"\bquant\b",
        r"risk analyst", r"credit risk", r"risk (model|management)",
        r"actuarial", r"algorithmic trading", r"strat.*analyst.*quant",
    ]),

    # ── Operations / Strategy ──────────────────────────────────────────────
    ("operations-strategy", [
        r"operations analyst", r"ops analyst", r"strategy.*operations",
        r"business operations", r"corporate strategy",
        r"strategic planning", r"strategy analyst",
        r"management consultant", r"associate consultant",
        r"strategy consultant", r"operations consultant",
        r"program analyst", r"process (improvement|analyst)",
        r"supply chain analyst", r"logistics analyst",
    ]),

    # ── Project / Program management ───────────────────────────────────────
    ("project-manager", [
        r"project manager", r"program manager", r"\bpmo\b",
        r"technical program manager", r"delivery manager",
        r"scrum master", r"agile coach",
    ]),

    # ── Marketing ─────────────────────────────────────────────────────────
    ("marketing", [
        r"marketing analyst", r"digital marketing", r"growth (analyst|marketer|hacker)",
        r"seo (specialist|analyst|manager)", r"sem (specialist|manager)",
        r"content (marketer|strategist|specialist)",
        r"brand (manager|strategist)", r"product marketing",
        r"marketing manager", r"marketing associate",
        r"performance marketing", r"paid (media|social)",
        r"social media (manager|specialist)", r"demand generation",
        r"marketing coordinator",
    ]),

    # ── Sales / Business development ───────────────────────────────────────
    ("sales-bizdev", [
        r"\bsales (representative|associate|intern|analyst)\b",
        r"account executive", r"account manager",
        r"business development (representative|associate|manager)",
        r"\bbdr\b", r"\bsdr\b", r"customer success",
        r"client success", r"client partner", r"inside sales",
    ]),

    # ── People / HR ────────────────────────────────────────────────────────
    ("hr-people", [
        r"people (operations|analyst|partner)",
        r"human resources", r"\bhr (analyst|generalist|coordinator)\b",
        r"talent (acquisition|operations|analyst)",
        r"recruiter", r"recruiting (coordinator|analyst)",
        r"compensation analyst",
    ]),

    # ── Research / Science ─────────────────────────────────────────────────
    ("research-science", [
        r"research (associate|analyst|assistant)",
        r"(bio|chem|life science).*scientist",
        r"lab (researcher|technician)",
        r"clinical research (associate|coordinator)",
        r"policy analyst", r"policy researcher",
        r"economic analyst", r"economist",
    ]),
]


# ── Display labels for the Role Radar chart ───────────────────────────────
CLUSTER_LABELS: dict[str, str] = {
    "ml-ai-engineer":      "ML/AI Eng",
    "software-engineer":   "Software Eng",
    "data-engineer":       "Data Eng",
    "data-scientist":      "Data Scientist",
    "data-analyst":        "Data Analyst",
    "bi-developer":        "BI / Viz",
    "product-manager":     "Product Mgr",
    "security":            "Security",
    "design-ux":           "Design / UX",
    "financial-analyst":   "Finance Analyst",
    "accounting":          "Accounting",
    "quant-risk":          "Quant / Risk",
    "operations-strategy": "Ops & Strategy",
    "project-manager":     "Project Mgr",
    "marketing":           "Marketing",
    "sales-bizdev":        "Sales / BizDev",
    "hr-people":           "HR / People",
    "research-science":    "Research / Science",
}

# Pre-compile patterns for performance
_COMPILED: list[tuple[str, list[re.Pattern[str]]]] = [
    (name, [re.compile(p, re.IGNORECASE) for p in patterns])
    for name, patterns in CLUSTERS
]


def classify_title(title: str) -> str | None:
    """Return the cluster name for a job title, or None if no match."""
    t = (title or "").strip()
    if not t:
        return None
    for cluster_name, patterns in _COMPILED:
        for pat in patterns:
            if pat.search(t):
                return cluster_name
    return None
