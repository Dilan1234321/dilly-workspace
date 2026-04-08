"""
ATS Score v2 — calibrated 3-factor composite scoring.

Replaces the single-number additive penalty model in ats_engine.py and
ats_analysis.py. Scores a resume against each ATS vendor on three independent
axes, then combines them with vendor-specific weights.

The three factors:

    Parseability   — Can the vendor's parser even read this file? (format,
                     tables, columns, encoding, fonts, exotic glyphs)
    Extraction     — Of the fields the vendor expects (name, email, phone,
                     education, experience entries, dates, bullets), how many
                     did it successfully pull out?
    Keyword Match  — When a job description is provided, how well does the
                     resume match the required keywords, weighted by placement
                     quality (contextual > skills list > missing)?

Each factor returns:
    * value      — the point estimate 0-100
    * low / high — confidence band (wider = less certain the heuristics got it right)
    * reasons    — list of {title, delta, category} describing what hurt the score

The composite is a vendor-specific weighted product, not a sum. Workday weights
parseability more heavily than Greenhouse. If any factor is near zero, the
composite is too — a resume that can't be parsed can't score 85 just because
its keywords look good.

Every Issue (parseability failure, missing field, missing section, weak keyword
placement) is tagged with:
    * affects_vendors  — which vendors care about this
    * lift_per_vendor  — how many points each vendor gains when this is fixed

The mobile UI renders lift_per_vendor as "Fix this: +6 on Workday, +2 on iCIMS"
and can preview cumulative lift across any subset of issues the user selects.

No LLM calls. Pure deterministic scoring. Designed to be:
    - Calibrated   — penalty weights derived from vendor parser docs + field studies
    - Explainable  — every score change is traceable to a named issue
    - Testable     — the vendor profile is a data table; tests can assert against it
    - Composable   — ats_engine.py and ats_analysis.py both produce the inputs this
                     module consumes, so we can cut over gradually
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Vendor profiles — data, not code
# ---------------------------------------------------------------------------

# Each vendor has:
#   display           — UI label
#   composite_weights — how much parseability / extraction / keyword matter for THIS vendor
#   parse_sensitivity — multiplier on parseability penalties (Workday is strict)
#   extract_sensitivity — multiplier on extraction penalties
#   kw_sensitivity    — multiplier on keyword penalties
#   base              — starting headroom (most vendors start at 100, some have
#                       a small systemic ceiling because they historically reject more)

VENDOR_PROFILES: Dict[str, Dict[str, Any]] = {
    "workday": {
        "display": "Workday",
        "composite_weights": {"parse": 0.45, "extract": 0.35, "keyword": 0.20},
        "parse_sensitivity": 1.6,
        "extract_sensitivity": 1.3,
        "kw_sensitivity": 0.9,
        "base": 96,
        "notes": "Strict parser. Single-column only, rejects tables, requires canonical section headers, "
                 "skips headers/footers. The biggest population of ATS rejects globally.",
    },
    "taleo": {
        "display": "Taleo (Oracle)",
        "composite_weights": {"parse": 0.40, "extract": 0.40, "keyword": 0.20},
        "parse_sensitivity": 1.5,
        "extract_sensitivity": 1.4,
        "kw_sensitivity": 0.9,
        "base": 94,
        "notes": "Ignores headers/footers. Chokes on non-Month-YYYY dates. Needs individual skills, not paragraphs.",
    },
    "icims": {
        "display": "iCIMS",
        "composite_weights": {"parse": 0.35, "extract": 0.35, "keyword": 0.30},
        "parse_sensitivity": 1.1,
        "extract_sensitivity": 1.2,
        "kw_sensitivity": 1.1,
        "base": 95,
        "notes": "Uses Textkernel/Sovren under the hood. Leans on the Skills section for keyword matching.",
    },
    "successfactors": {
        "display": "SuccessFactors (SAP)",
        "composite_weights": {"parse": 0.35, "extract": 0.35, "keyword": 0.30},
        "parse_sensitivity": 1.15,
        "extract_sensitivity": 1.2,
        "kw_sensitivity": 1.0,
        "base": 95,
        "notes": "Enterprise parser, closer to Workday than Greenhouse. Needs standard section headers.",
    },
    "greenhouse": {
        "display": "Greenhouse",
        "composite_weights": {"parse": 0.25, "extract": 0.35, "keyword": 0.40},
        "parse_sensitivity": 0.6,
        "extract_sensitivity": 0.9,
        "kw_sensitivity": 1.1,
        "base": 98,
        "notes": "Modern parser. Handles most formatting. Heaviest weight on keyword relevance.",
    },
    "lever": {
        "display": "Lever",
        "composite_weights": {"parse": 0.25, "extract": 0.35, "keyword": 0.40},
        "parse_sensitivity": 0.6,
        "extract_sensitivity": 0.85,
        "kw_sensitivity": 1.1,
        "base": 97,
        "notes": "Modern parser. Infers section boundaries from context if headers are missing.",
    },
    "ashby": {
        "display": "Ashby",
        "composite_weights": {"parse": 0.25, "extract": 0.35, "keyword": 0.40},
        "parse_sensitivity": 0.5,
        "extract_sensitivity": 0.85,
        "kw_sensitivity": 1.15,
        "base": 98,
        "notes": "Newest of the modern ATS. Very lenient on format, aggressive on keyword match.",
    },
}

VENDOR_ORDER: List[str] = [
    "workday", "taleo", "icims", "successfactors",
    "greenhouse", "lever", "ashby",
]


# ---------------------------------------------------------------------------
# Issue taxonomy — every detectable problem, with its base penalty weight
# ---------------------------------------------------------------------------
#
# Each issue has:
#   id          — stable identifier, used for dedup and UI keys
#   category    — "parseability" | "extraction" | "keyword" (drives which factor takes the hit)
#   severity    — "critical" | "high" | "medium" | "low" (sets base penalty magnitude)
#   base_lift   — average points regained when fixed (before vendor multiplier).
#                 This is what gets shown to the user as "Fix this: +X points"
#   affects     — set of vendor keys affected. Empty = all vendors.
#   title       — short UI label
#   fix         — actionable instruction

@dataclass
class ScoreIssue:
    id: str
    category: str
    severity: str
    base_lift: float
    title: str
    fix: str
    detail: str = ""
    affects: Tuple[str, ...] = ()     # empty = all vendors
    line: Optional[str] = None

    def lift_for_vendor(self, vendor_key: str) -> float:
        """Return the estimated score lift for this vendor if the issue is fixed."""
        if self.affects and vendor_key not in self.affects:
            return 0.0
        profile = VENDOR_PROFILES.get(vendor_key, {})
        mult_key = {
            "parseability": "parse_sensitivity",
            "extraction":   "extract_sensitivity",
            "keyword":      "kw_sensitivity",
        }.get(self.category, "parse_sensitivity")
        mult = float(profile.get(mult_key, 1.0))
        return round(self.base_lift * mult, 1)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "category": self.category,
            "severity": self.severity,
            "title": self.title,
            "fix": self.fix,
            "detail": self.detail,
            "base_lift": self.base_lift,
            "affects": list(self.affects),
            "line": self.line,
            # Pre-computed per-vendor lift so the mobile client doesn't recalculate
            "lift_per_vendor": {
                v: self.lift_for_vendor(v)
                for v in VENDOR_ORDER
                if (not self.affects or v in self.affects)
            },
        }


# Severity → base point penalty (before sensitivity multiplier)
SEVERITY_BASE: Dict[str, float] = {
    "critical": 14.0,
    "high":     7.5,
    "medium":   3.5,
    "low":      1.2,
}


# ---------------------------------------------------------------------------
# Extracted-fields projection (what each vendor actually pulls out)
# ---------------------------------------------------------------------------
#
# Given the signals we've already extracted (email, phone, experience entries,
# section detection, etc.) we can simulate what each vendor's parser would
# get — and, more importantly, what it would drop.
#
# The rules here are based on public vendor parser documentation plus observed
# behaviour from resume studies. They are intentionally conservative: we only
# flag a field as "dropped" when the vendor-specific heuristic strongly
# suggests it. Everything else is "extracted".

@dataclass
class ExtractedField:
    """One field the vendor pulled (or failed to pull)."""
    key: str          # "name" | "email" | "phone" | "location" | "education" | ...
    label: str        # UI label
    status: str       # "extracted" | "partial" | "dropped" | "missing"
    value: Optional[str] = None
    note: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class VendorExtraction:
    """The simulated extraction for one vendor."""
    vendor_key: str
    vendor_display: str
    fields: List[ExtractedField]
    experience_captured: int
    experience_total: int
    bullets_captured: int
    bullets_total: int
    sections_captured: List[str]
    sections_dropped: List[str]

    def completeness(self) -> float:
        """Return 0-1 completeness across fields + experience + sections."""
        field_total = max(len(self.fields), 1)
        field_hits = sum(1 for f in self.fields if f.status == "extracted")
        field_score = field_hits / field_total

        exp_denom = max(self.experience_total, 1)
        exp_score = self.experience_captured / exp_denom if self.experience_total else 1.0

        bullet_denom = max(self.bullets_total, 1)
        bullet_score = self.bullets_captured / bullet_denom if self.bullets_total else 1.0

        return round(0.45 * field_score + 0.35 * exp_score + 0.20 * bullet_score, 3)

    def to_dict(self) -> dict:
        return {
            "vendor_key": self.vendor_key,
            "vendor_display": self.vendor_display,
            "fields": [f.to_dict() for f in self.fields],
            "experience_captured": self.experience_captured,
            "experience_total": self.experience_total,
            "bullets_captured": self.bullets_captured,
            "bullets_total": self.bullets_total,
            "sections_captured": self.sections_captured,
            "sections_dropped": self.sections_dropped,
            "completeness": self.completeness(),
        }


# ---------------------------------------------------------------------------
# Factor scores and the composite vendor score
# ---------------------------------------------------------------------------

@dataclass
class FactorScore:
    value: float         # point estimate 0-100
    low: float           # lower bound of confidence band
    high: float          # upper bound
    reasons: List[dict]  # [{id, title, category, delta}] — what moved the needle

    def to_dict(self) -> dict:
        return {
            "value": round(self.value, 1),
            "low": round(self.low, 1),
            "high": round(self.high, 1),
            "reasons": self.reasons,
        }


@dataclass
class VendorScoreV2:
    vendor_key: str
    vendor_display: str
    parseability: FactorScore
    extraction: FactorScore
    keyword: FactorScore
    composite: FactorScore                # the final per-vendor score with confidence
    extraction_view: VendorExtraction     # per-vendor extraction simulation
    top_issues: List[dict]                # top 5 issues by lift
    forecast_if_all_fixed: float          # cumulative score if every applicable issue is fixed
    notes: str                             # vendor-specific explanatory text

    def to_dict(self) -> dict:
        return {
            "vendor_key": self.vendor_key,
            "vendor_display": self.vendor_display,
            "parseability": self.parseability.to_dict(),
            "extraction": self.extraction.to_dict(),
            "keyword": self.keyword.to_dict(),
            "composite": self.composite.to_dict(),
            "extraction_view": self.extraction_view.to_dict(),
            "top_issues": self.top_issues,
            "forecast_if_all_fixed": round(self.forecast_if_all_fixed, 1),
            "notes": self.notes,
        }


@dataclass
class ATSScoreV2Result:
    overall: FactorScore                  # blended composite across vendors
    overall_forecast_if_all_fixed: float
    vendors: List[VendorScoreV2]
    issues: List[ScoreIssue]              # full issue list (pre-dedup on id)
    file_redflags: List[dict]             # file-level red flags (image-only PDF, etc.)
    meta: Dict[str, Any]                  # supporting metadata (scoring_version, etc.)

    def to_dict(self) -> dict:
        return {
            "overall": self.overall.to_dict(),
            "overall_forecast_if_all_fixed": round(self.overall_forecast_if_all_fixed, 1),
            "vendors": [v.to_dict() for v in self.vendors],
            "issues": [i.to_dict() for i in self.issues],
            "file_redflags": self.file_redflags,
            "meta": self.meta,
            "scoring_version": "v2",
        }


# ---------------------------------------------------------------------------
# Core scoring — given a set of signals, produce an ATSScoreV2Result
# ---------------------------------------------------------------------------
#
# The "signals" dict is a simple contract: producers (ats_engine.py and
# ats_analysis.py) fill it with the things they detect, then call
# score_from_signals(signals) to get the v2 result. This makes the scoring
# module a pure function of its inputs — trivially testable.

SignalDict = Dict[str, Any]


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _combine_composite(parse: float, extract: float, keyword: float,
                       weights: Dict[str, float]) -> float:
    """
    Weighted geometric-ish mean: if any factor is very low, it drags the
    composite down. Pure arithmetic mean would let a 20-parseability resume
    score 70 just because its keywords were great — which is wrong, because
    the ATS can't even see the keywords if it can't parse the file.

    Formula: weighted product normalized back to 0-100.
    """
    wp = weights.get("parse", 0.33)
    we = weights.get("extract", 0.33)
    wk = weights.get("keyword", 0.34)
    total = wp + we + wk or 1.0
    wp, we, wk = wp / total, we / total, wk / total

    # Convert 0-100 to 0-1, take weighted geometric mean, then re-scale
    # Use a small floor (0.01) to avoid log(0) when a factor is zero.
    p = max(parse / 100.0, 0.01)
    e = max(extract / 100.0, 0.01)
    k = max(keyword / 100.0, 0.01)

    log_mean = wp * math.log(p) + we * math.log(e) + wk * math.log(k)
    composite_unit = math.exp(log_mean)
    return _clamp(composite_unit * 100.0)


def _confidence_band(value: float, signal_certainty: float) -> Tuple[float, float]:
    """
    signal_certainty ∈ [0, 1]. 1 = very certain, 0 = pure guess.
    Lower certainty → wider band. Caps band width at ±10 points.
    """
    width = (1.0 - signal_certainty) * 10.0
    return (_clamp(value - width), _clamp(value + width))


# ---------------------------------------------------------------------------
# score_from_signals — the primary entry point
# ---------------------------------------------------------------------------

def score_from_signals(signals: SignalDict,
                        extra_issues: Optional[List[ScoreIssue]] = None) -> ATSScoreV2Result:
    """
    Produce an ATSScoreV2Result from a normalized signal dictionary.

    Expected keys in `signals` (all optional — missing keys fall back to safe defaults):

      PARSEABILITY:
        has_tables:                bool
        has_multi_column:          bool
        has_non_standard_headers:  bool | list[str]
        has_graphics:              bool
        has_fancy_unicode:         bool
        has_encoding_garbage:      bool
        is_image_only_pdf:         bool
        file_extension:            str   ("pdf", "docx", "txt", ...)
        embedded_fonts_count:      int
        contact_in_top:            bool
        contact_in_header_footer:  bool

      EXTRACTION:
        has_name:                  bool
        has_email:                 bool
        has_phone:                 bool
        has_linkedin:              bool
        has_location:              bool
        has_education_section:     bool
        has_experience_section:    bool
        has_skills_section:        bool
        experience_entries:        int
        experience_entries_clean:  int   (how many parsed without errors)
        bullets_total:             int
        bullets_clean:             int
        standard_date_format:      bool
        mixed_date_formats:        bool

      KEYWORDS:
        keyword_match:             float 0-100  (from ats_keywords.py)
        keyword_match_confidence:  float 0-1    (how sure we are — JD provided vs inferred)
        keywords_missing_critical: list[str]
        keywords_weak_placement:   list[str]

      META:
        track:                     str | None   (cohort id, for section completeness)
        file_size_bytes:           int
        page_count:                int
    """
    sig = dict(signals or {})

    # ── 1. Build the issue list ────────────────────────────────────────────
    issues: List[ScoreIssue] = []

    # Parseability issues
    if sig.get("is_image_only_pdf"):
        issues.append(ScoreIssue(
            id="image_only_pdf",
            category="parseability", severity="critical", base_lift=22.0,
            title="Resume is an image, not text",
            fix="Re-export the resume from Word, Google Docs, or Pages with 'Save as PDF' — NOT 'Print to PDF' or screenshot. ATS parsers cannot read scanned images.",
            detail="An image-only PDF (scanned, photographed, or exported via screenshot) looks fine to humans but is 0% parseable to every ATS.",
            affects=(),
        ))

    if sig.get("has_encoding_garbage"):
        issues.append(ScoreIssue(
            id="encoding_garbage",
            category="parseability", severity="critical", base_lift=14.0,
            title="Garbled text from PDF encoding",
            fix="Your PDF uses a non-standard character encoding. Re-export from Word/Docs with 'Best for electronic distribution' (not 'Best for printing').",
            affects=("workday", "taleo", "icims", "successfactors"),
        ))

    if sig.get("has_tables"):
        issues.append(ScoreIssue(
            id="tables_detected",
            category="parseability", severity="critical", base_lift=12.0,
            title="Tables detected",
            fix="Replace tables with simple text and spacing. Workday, Taleo, and SuccessFactors flatten tables into garbled row text.",
            affects=("workday", "taleo", "successfactors", "icims"),
        ))

    if sig.get("has_multi_column"):
        issues.append(ScoreIssue(
            id="multi_column",
            category="parseability", severity="critical", base_lift=13.0,
            title="Multi-column layout",
            fix="Switch to a single-column template. Strict parsers read left-to-right across columns, producing scrambled text.",
            affects=("workday", "taleo", "successfactors"),
        ))

    if sig.get("has_graphics"):
        issues.append(ScoreIssue(
            id="graphics_detected",
            category="parseability", severity="high", base_lift=6.5,
            title="Graphics or icons detected",
            fix="Remove embedded images, icons, and charts. Most ATS drop graphics entirely; some systems fail to parse the surrounding text.",
            affects=("workday", "taleo", "successfactors"),
        ))

    if sig.get("has_fancy_unicode"):
        issues.append(ScoreIssue(
            id="fancy_unicode",
            category="parseability", severity="medium", base_lift=3.5,
            title="Exotic bullet or symbol characters",
            fix="Replace decorative bullets (★, ➤, ■) with a simple • or -. Strict parsers render unknown glyphs as ?.",
            affects=("workday", "taleo"),
        ))

    headers_issue = sig.get("has_non_standard_headers")
    if headers_issue:
        header_names = headers_issue if isinstance(headers_issue, list) else []
        names_detail = (" Detected: " + ", ".join(f"'{n}'" for n in header_names[:3])) if header_names else ""
        issues.append(ScoreIssue(
            id="non_standard_headers",
            category="parseability", severity="high", base_lift=8.0,
            title="Non-standard section headers",
            fix=f"Rename creative headers to the canonical 'Education', 'Experience', 'Skills', 'Projects'.{names_detail}",
            affects=("workday", "taleo", "icims", "successfactors"),
        ))

    if sig.get("file_extension") == "txt":
        issues.append(ScoreIssue(
            id="file_type_txt",
            category="parseability", severity="high", base_lift=5.0,
            title="Plain .txt format",
            fix="Most ATS expect PDF or DOCX. Save your resume as 'PDF' or 'Word Document (.docx)' before uploading.",
            affects=("workday", "taleo", "icims", "successfactors"),
        ))

    # Extraction issues
    if not sig.get("has_email"):
        issues.append(ScoreIssue(
            id="missing_email",
            category="extraction", severity="critical", base_lift=18.0,
            title="No email address detected",
            fix="Add your email to the top of the resume, on its own line. Without it the application is auto-rejected in most ATS.",
            affects=(),
        ))

    if not sig.get("has_phone"):
        issues.append(ScoreIssue(
            id="missing_phone",
            category="extraction", severity="medium", base_lift=4.0,
            title="No phone number detected",
            fix="Add a phone number in standard format: +1 (555) 555-5555 or 555-555-5555.",
            affects=("taleo", "icims", "successfactors"),
        ))

    if sig.get("contact_in_header_footer") and not sig.get("contact_in_top"):
        issues.append(ScoreIssue(
            id="contact_in_header",
            category="extraction", severity="high", base_lift=10.0,
            title="Contact info lives in the PDF header/footer",
            fix="Move your email and phone to the first two lines of the body text. Taleo ignores PDF headers/footers entirely — your contact info will simply not exist to it.",
            affects=("taleo", "workday"),
        ))

    if not sig.get("has_education_section"):
        issues.append(ScoreIssue(
            id="missing_education",
            category="extraction", severity="high", base_lift=9.0,
            title="No Education section detected",
            fix="Add an 'Education' header with your degree, school, and graduation year.",
            affects=("workday", "taleo", "icims", "successfactors"),
        ))

    if not sig.get("has_experience_section"):
        issues.append(ScoreIssue(
            id="missing_experience",
            category="extraction", severity="critical", base_lift=14.0,
            title="No Experience section detected",
            fix="Add an 'Experience' header above your work history. ATS rely on this header to identify employment.",
            affects=("workday", "taleo", "icims", "successfactors"),
        ))

    if not sig.get("has_skills_section"):
        issues.append(ScoreIssue(
            id="missing_skills",
            category="extraction", severity="medium", base_lift=5.0,
            title="No Skills section detected",
            fix="Add a 'Skills' section as a simple comma-separated list. iCIMS and Workday use this for keyword indexing.",
            affects=("workday", "icims"),
        ))

    bullets_total = int(sig.get("bullets_total") or 0)
    bullets_clean = int(sig.get("bullets_clean") or 0)
    if bullets_total > 0 and bullets_clean < bullets_total:
        dropped = bullets_total - bullets_clean
        ratio = dropped / bullets_total
        sev = "high" if ratio > 0.3 else "medium"
        lift = 8.0 if ratio > 0.3 else 4.0
        issues.append(ScoreIssue(
            id="bullets_dropped",
            category="extraction", severity=sev, base_lift=lift,
            title=f"{dropped} of {bullets_total} bullets may not parse",
            fix="Start every bullet with a single character (• or -), keep it on one physical line, and avoid tabs inside bullets.",
            affects=("workday", "taleo", "successfactors"),
        ))

    experience_entries = int(sig.get("experience_entries") or 0)
    experience_clean = int(sig.get("experience_entries_clean") or experience_entries)
    if experience_entries > 0 and experience_clean < experience_entries:
        missed = experience_entries - experience_clean
        issues.append(ScoreIssue(
            id="experience_mis_parsed",
            category="extraction", severity="high", base_lift=7.0 * min(missed, 3),
            title=f"{missed} experience entries missing dates or role",
            fix="Each experience entry needs: Company name, role title, city/state, and a date range in 'Month YYYY – Month YYYY' format.",
            affects=("workday", "taleo", "icims"),
        ))

    if sig.get("mixed_date_formats"):
        issues.append(ScoreIssue(
            id="mixed_dates",
            category="extraction", severity="medium", base_lift=3.5,
            title="Mixed date formats",
            fix="Pick one format — 'Jan 2024 – Present' — and use it everywhere. Mixing 'Jan 2024', '01/2024', and '2024' confuses Taleo.",
            affects=("taleo", "icims"),
        ))

    if not sig.get("standard_date_format"):
        issues.append(ScoreIssue(
            id="no_standard_dates",
            category="extraction", severity="high", base_lift=6.5,
            title="Dates not in standard format",
            fix="Use 'Month YYYY' (e.g. 'Jan 2024'). Strict parsers fail on 'Spring 2024' or 'Q1 2024'.",
            affects=("workday", "taleo", "icims"),
        ))

    # Keyword issues
    kw_missing = sig.get("keywords_missing_critical") or []
    if kw_missing:
        issues.append(ScoreIssue(
            id="keywords_missing",
            category="keyword", severity="high", base_lift=9.0,
            title=f"{len(kw_missing)} critical job keywords missing",
            detail="Missing: " + ", ".join(str(k) for k in kw_missing[:8]),
            fix="Add these keywords to your Skills section AND weave at least two of them into your experience bullets with real context.",
            affects=("greenhouse", "lever", "ashby", "icims", "successfactors"),
        ))

    kw_weak = sig.get("keywords_weak_placement") or []
    if kw_weak:
        issues.append(ScoreIssue(
            id="keywords_weak",
            category="keyword", severity="medium", base_lift=4.5,
            title=f"{len(kw_weak)} keywords only in Skills list",
            detail="Skills-only: " + ", ".join(str(k) for k in kw_weak[:8]),
            fix="For each keyword, rewrite one experience bullet to demonstrate it in context (e.g. 'Built a Python pipeline that…'). Contextual usage scores 2.5x higher than a bare skills list.",
            affects=("greenhouse", "lever", "ashby", "icims"),
        ))

    # Merge extra issues (e.g. Workday-specific field validation) before dedup
    if extra_issues:
        issues.extend(extra_issues)

    # Dedup by id — first occurrence wins
    seen: set = set()
    deduped: List[ScoreIssue] = []
    for iss in issues:
        if iss.id in seen:
            continue
        seen.add(iss.id)
        deduped.append(iss)
    issues = deduped

    # ── 2. Compute the three factor scores per vendor ──────────────────────
    parseability_certainty = 0.85 if sig.get("file_extension") in ("pdf", "docx") else 0.65
    extraction_certainty = 0.9 if sig.get("has_email") else 0.8
    keyword_certainty = float(sig.get("keyword_match_confidence") or (0.85 if "keyword_match" in sig else 0.5))

    vendors_out: List[VendorScoreV2] = []
    for vkey in VENDOR_ORDER:
        profile = VENDOR_PROFILES[vkey]
        base = float(profile["base"])

        # Parseability for this vendor
        parse_val = base
        parse_reasons: List[dict] = []
        for iss in issues:
            if iss.category != "parseability":
                continue
            if iss.affects and vkey not in iss.affects:
                continue
            delta = iss.base_lift * float(profile["parse_sensitivity"])
            parse_val -= delta
            parse_reasons.append({
                "id": iss.id, "title": iss.title, "delta": round(-delta, 1), "category": iss.category,
            })
        parse_val = _clamp(parse_val)
        plo, phi = _confidence_band(parse_val, parseability_certainty)
        parse_factor = FactorScore(parse_val, plo, phi, parse_reasons)

        # Extraction for this vendor
        ext_val = base
        ext_reasons: List[dict] = []
        for iss in issues:
            if iss.category != "extraction":
                continue
            if iss.affects and vkey not in iss.affects:
                continue
            delta = iss.base_lift * float(profile["extract_sensitivity"])
            ext_val -= delta
            ext_reasons.append({
                "id": iss.id, "title": iss.title, "delta": round(-delta, 1), "category": iss.category,
            })
        ext_val = _clamp(ext_val)
        elo, ehi = _confidence_band(ext_val, extraction_certainty)
        extract_factor = FactorScore(ext_val, elo, ehi, ext_reasons)

        # Keyword for this vendor
        kw_base = float(sig.get("keyword_match") or base)
        kw_val = kw_base
        kw_reasons: List[dict] = []
        for iss in issues:
            if iss.category != "keyword":
                continue
            if iss.affects and vkey not in iss.affects:
                continue
            delta = iss.base_lift * float(profile["kw_sensitivity"])
            kw_val -= delta
            kw_reasons.append({
                "id": iss.id, "title": iss.title, "delta": round(-delta, 1), "category": iss.category,
            })
        kw_val = _clamp(kw_val)
        klo, khi = _confidence_band(kw_val, keyword_certainty)
        keyword_factor = FactorScore(kw_val, klo, khi, kw_reasons)

        # Composite with vendor weights
        weights = profile["composite_weights"]
        comp_val = _combine_composite(parse_val, ext_val, kw_val, weights)
        # Composite confidence band combines the widest sub-factor bands
        comp_low = _combine_composite(plo, elo, klo, weights)
        comp_high = _combine_composite(phi, ehi, khi, weights)
        comp_reasons = sorted(
            parse_reasons + ext_reasons + kw_reasons,
            key=lambda r: r["delta"],
        )[:5]
        composite = FactorScore(comp_val, comp_low, comp_high, comp_reasons)

        # Extraction view (per-vendor "what got extracted")
        extraction_view = _build_extraction_view(vkey, profile, sig, issues)

        # Top issues by lift for this vendor
        ranked = sorted(
            (
                {
                    "id": iss.id,
                    "title": iss.title,
                    "severity": iss.severity,
                    "category": iss.category,
                    "lift": iss.lift_for_vendor(vkey),
                    "fix": iss.fix,
                }
                for iss in issues
                if iss.lift_for_vendor(vkey) > 0
            ),
            key=lambda d: d["lift"],
            reverse=True,
        )[:5]

        # Forecast with everything fixed
        all_lift = sum(iss.lift_for_vendor(vkey) for iss in issues)
        # Cap the forecast at the vendor base — you can't score higher than the
        # parser ceiling even with a perfect resume.
        forecast = _clamp(comp_val + min(all_lift, base - comp_val))

        vendors_out.append(VendorScoreV2(
            vendor_key=vkey,
            vendor_display=str(profile["display"]),
            parseability=parse_factor,
            extraction=extract_factor,
            keyword=keyword_factor,
            composite=composite,
            extraction_view=extraction_view,
            top_issues=ranked,
            forecast_if_all_fixed=forecast,
            notes=str(profile.get("notes") or ""),
        ))

    # ── 3. Overall blend across vendors ─────────────────────────────────────
    # Weight Workday/Taleo more heavily since they dominate the Fortune 500.
    vendor_weights = {
        "workday": 2.2,
        "taleo": 1.6,
        "icims": 1.3,
        "successfactors": 1.1,
        "greenhouse": 1.0,
        "lever": 0.9,
        "ashby": 0.6,
    }
    tot = sum(vendor_weights.values())
    overall_val = sum(
        vendor_weights[v.vendor_key] * v.composite.value for v in vendors_out
    ) / tot
    overall_low = sum(
        vendor_weights[v.vendor_key] * v.composite.low for v in vendors_out
    ) / tot
    overall_high = sum(
        vendor_weights[v.vendor_key] * v.composite.high for v in vendors_out
    ) / tot
    overall_forecast = sum(
        vendor_weights[v.vendor_key] * v.forecast_if_all_fixed for v in vendors_out
    ) / tot

    # Overall top reasons = flatten all vendor top issues, dedup by id, keep top 5
    overall_reasons_by_id: Dict[str, dict] = {}
    for v in vendors_out:
        for r in v.composite.reasons:
            if r["id"] not in overall_reasons_by_id:
                overall_reasons_by_id[r["id"]] = r
    overall_reasons = sorted(
        overall_reasons_by_id.values(), key=lambda r: r["delta"]
    )[:5]

    overall = FactorScore(overall_val, overall_low, overall_high, overall_reasons)

    # ── 4. File-level red flags (surfaced separately) ──────────────────────
    file_redflags: List[dict] = []
    if sig.get("is_image_only_pdf"):
        file_redflags.append({
            "level": "critical",
            "title": "Image-only PDF",
            "detail": "This PDF has no text layer. No ATS can read it. Re-export from Word/Docs with 'Save as PDF'.",
        })
    if sig.get("has_encoding_garbage"):
        file_redflags.append({
            "level": "critical",
            "title": "Corrupted text encoding",
            "detail": "Non-standard character codes detected. The source PDF will look fine to you but parse as garbage.",
        })
    if sig.get("file_extension") not in (None, "pdf", "docx"):
        file_redflags.append({
            "level": "high",
            "title": f"Unusual file type (.{sig.get('file_extension')})",
            "detail": "Most ATS expect PDF or DOCX. Save as one of those before applying.",
        })
    embedded_fonts = int(sig.get("embedded_fonts_count") or 0)
    if embedded_fonts > 6:
        file_redflags.append({
            "level": "medium",
            "title": f"{embedded_fonts} embedded fonts",
            "detail": "Heavy font variety often means decorative templates that strict parsers choke on. Prefer 1-2 standard fonts.",
        })

    return ATSScoreV2Result(
        overall=overall,
        overall_forecast_if_all_fixed=overall_forecast,
        vendors=vendors_out,
        issues=issues,
        file_redflags=file_redflags,
        meta={
            "scoring_version": "v2",
            "vendor_order": VENDOR_ORDER,
            "parseability_certainty": parseability_certainty,
            "extraction_certainty": extraction_certainty,
            "keyword_certainty": keyword_certainty,
        },
    )


# ---------------------------------------------------------------------------
# Extraction view builder — simulates what the vendor pulls and what it drops
# ---------------------------------------------------------------------------

def _build_extraction_view(
    vendor_key: str,
    profile: Dict[str, Any],
    sig: SignalDict,
    issues: List[ScoreIssue],
) -> VendorExtraction:
    """
    Build the per-vendor 'what the parser sees' view. The same underlying
    signals produce different extractions per vendor because of parser quirks:
      - Taleo drops PDF headers/footers
      - Workday chokes on non-standard section headers
      - Greenhouse infers missing headers from context
    """
    name_status = "extracted" if sig.get("has_name") else "missing"

    # Email — Taleo and Workday both drop content inside PDF headers/footers
    if sig.get("has_email"):
        if vendor_key in ("taleo", "workday") and sig.get("contact_in_header_footer") and not sig.get("contact_in_top"):
            email_status = "dropped"
            email_note = "Contact info in PDF header/footer — skipped by this parser"
        else:
            email_status = "extracted"
            email_note = None
    else:
        email_status = "missing"
        email_note = None

    if sig.get("has_phone"):
        phone_status = "dropped" if (vendor_key in ("taleo", "workday") and sig.get("contact_in_header_footer") and not sig.get("contact_in_top")) else "extracted"
    else:
        phone_status = "missing"

    linkedin_status = "extracted" if sig.get("has_linkedin") else "missing"
    location_status = "extracted" if sig.get("has_location") else "partial"

    # Section status per vendor
    sections_captured: List[str] = []
    sections_dropped: List[str] = []

    for label, key, critical in [
        ("Education", "has_education_section", True),
        ("Experience", "has_experience_section", True),
        ("Skills", "has_skills_section", False),
    ]:
        if sig.get(key):
            # Even if present, non-standard headers cause strict vendors to drop it
            if sig.get("has_non_standard_headers") and vendor_key in ("workday", "taleo", "successfactors"):
                sections_dropped.append(label)
            else:
                sections_captured.append(label)
        elif critical:
            sections_dropped.append(label)

    # Experience capture — strict vendors lose entries without canonical dates
    exp_total = int(sig.get("experience_entries") or 0)
    exp_clean = int(sig.get("experience_entries_clean") or exp_total)
    if vendor_key in ("workday", "taleo") and not sig.get("standard_date_format"):
        exp_captured = max(0, exp_clean - 1)  # best-case: one entry is always visible
    else:
        exp_captured = exp_clean

    # Bullet capture — multi-column layouts scramble bullets for strict vendors
    bullets_total = int(sig.get("bullets_total") or 0)
    bullets_clean = int(sig.get("bullets_clean") or bullets_total)
    if vendor_key in ("workday", "taleo", "successfactors"):
        if sig.get("has_multi_column"):
            bullets_captured = int(bullets_clean * 0.3)
        elif sig.get("has_tables"):
            bullets_captured = int(bullets_clean * 0.5)
        else:
            bullets_captured = bullets_clean
    else:
        bullets_captured = bullets_clean

    fields = [
        ExtractedField("name", "Name",
                       name_status,
                       value=str(sig.get("name_value") or "") or None),
        ExtractedField("email", "Email",
                       email_status,
                       value=str(sig.get("email_value") or "") or None,
                       note=email_note),
        ExtractedField("phone", "Phone",
                       phone_status,
                       value=str(sig.get("phone_value") or "") or None),
        ExtractedField("linkedin", "LinkedIn", linkedin_status),
        ExtractedField("location", "Location", location_status),
    ]

    return VendorExtraction(
        vendor_key=vendor_key,
        vendor_display=str(profile["display"]),
        fields=fields,
        experience_captured=exp_captured,
        experience_total=exp_total,
        bullets_captured=bullets_captured,
        bullets_total=bullets_total,
        sections_captured=sections_captured,
        sections_dropped=sections_dropped,
    )


# ---------------------------------------------------------------------------
# Convenience adapter — convert an existing ATSAnalysisResult into signals
# ---------------------------------------------------------------------------

def signals_from_ats_analysis(result: Any, raw_text: str = "",
                               keyword_match: Optional[float] = None,
                               keyword_confidence: Optional[float] = None,
                               keywords_missing: Optional[List[str]] = None,
                               keywords_weak: Optional[List[str]] = None,
                               file_extension: Optional[str] = None) -> SignalDict:
    """
    Build a signal dict from an ATSAnalysisResult (from ats_analysis.run_ats_analysis).
    Keyword arguments let the caller layer in keyword-match data from a separate
    analysis pass.
    """
    sig: SignalDict = {}

    # Unpack the extracted fields into flat booleans
    extracted = {f.field.lower(): f for f in getattr(result, "extracted_fields", [])}
    sig["has_name"]     = "name" in extracted and extracted["name"].status == "extracted"
    sig["has_email"]    = "email" in extracted and extracted["email"].status == "extracted"
    sig["has_phone"]    = "phone" in extracted and extracted["phone"].status == "extracted"
    sig["has_linkedin"] = "linkedin" in extracted and extracted["linkedin"].status == "extracted"
    sig["has_location"] = "location" in extracted and extracted["location"].status == "extracted"

    sig["name_value"]  = extracted["name"].value if "name" in extracted else None
    sig["email_value"] = extracted["email"].value if "email" in extracted else None
    sig["phone_value"] = extracted["phone"].value if "phone" in extracted else None

    # Section detection from the issues / detected_sections list
    detected_lower = {s.lower() for s in getattr(result, "detected_sections", [])}
    sig["has_education_section"]  = any("education" in s for s in detected_lower)
    sig["has_experience_section"] = any("experience" in s or "employment" in s for s in detected_lower)
    sig["has_skills_section"]     = any("skill" in s for s in detected_lower)

    # Parseability signals from the issue list
    for issue in getattr(result, "issues", []):
        cat = (getattr(issue, "category", "") or "").lower()
        title = (getattr(issue, "title", "") or "").lower()
        if "table" in title:
            sig["has_tables"] = True
        if "column" in title or "multi-column" in title:
            sig["has_multi_column"] = True
        if "non-standard" in title or "creative header" in title:
            sig["has_non_standard_headers"] = True
        if "encoding" in title or "garbled" in title:
            sig["has_encoding_garbage"] = True
        if "contact" in title and ("header" in title or "footer" in title):
            sig["contact_in_header_footer"] = True
        if "graphic" in title or "image" in title:
            sig["has_graphics"] = True
        if "date" in title and "mixed" in title:
            sig["mixed_date_formats"] = True

    sig.setdefault("contact_in_top", True)
    sig.setdefault("standard_date_format", True)

    # Experience counts
    exp_entries = getattr(result, "experience_entries", []) or []
    sig["experience_entries"] = len(exp_entries)
    sig["experience_entries_clean"] = sum(1 for e in exp_entries if e.dates and e.role)
    sig["bullets_total"] = sum(e.bullet_count for e in exp_entries)
    sig["bullets_clean"] = sig["bullets_total"]

    # Keyword layer
    if keyword_match is not None:
        sig["keyword_match"] = float(keyword_match)
    if keyword_confidence is not None:
        sig["keyword_match_confidence"] = float(keyword_confidence)
    if keywords_missing:
        sig["keywords_missing_critical"] = list(keywords_missing)
    if keywords_weak:
        sig["keywords_weak_placement"] = list(keywords_weak)

    if file_extension:
        sig["file_extension"] = file_extension.lower().lstrip(".")

    return sig


__all__ = [
    "VENDOR_PROFILES",
    "VENDOR_ORDER",
    "ScoreIssue",
    "ExtractedField",
    "VendorExtraction",
    "FactorScore",
    "VendorScoreV2",
    "ATSScoreV2Result",
    "score_from_signals",
    "signals_from_ats_analysis",
]
