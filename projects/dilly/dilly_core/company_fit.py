"""
Company fit — threshold-based comparison of Smart/Grit/Build against company bars.

Used as a secondary contextual layer: "You meet 2/3 bars; gap in Build."
Canonical Dilly score stays primary; this is a fit overlay when viewing a company.
"""

from __future__ import annotations

import fnmatch
import json
import os
from dataclasses import dataclass, field
from typing import List

_CRITERIA_CACHE: list[dict] | None = None


def _load_company_criteria() -> list[dict]:
    """Load company_hiring_criteria.json. Cached."""
    global _CRITERIA_CACHE
    if _CRITERIA_CACHE is not None:
        return _CRITERIA_CACHE
    _dir = os.path.dirname(os.path.abspath(__file__))
    for base in (
        os.path.normpath(os.path.join(_dir, "..", "projects", "dilly", "knowledge")),
        os.path.join(os.getcwd(), "projects", "dilly", "knowledge"),
    ):
        path = os.path.join(base, "company_hiring_criteria.json")
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                _CRITERIA_CACHE = data.get("rules", [])
                return _CRITERIA_CACHE
            except Exception:
                pass
    _CRITERIA_CACHE = []
    return _CRITERIA_CACHE


def _rule_to_slug(rule: dict) -> str:
    """Stable URL slug for a rule."""
    pat = (rule.get("company_pattern") or "").strip()
    src = (rule.get("source") or "").strip().lower()
    if pat == "*":
        return src or "unknown"
    return pat.lower().replace(" ", "-").replace("_", "-") or src


def _get_company_by_slug(slug: str) -> dict | None:
    """Look up company by slug from company_hiring_criteria.json."""
    slug = (slug or "").strip().lower().replace(" ", "-")
    if not slug:
        return None
    for rule in _load_company_criteria():
        if _rule_to_slug(rule) == slug:
            pat = rule.get("company_pattern", "")
            src = rule.get("source", "")
            display_name = src if pat == "*" else pat
            return {
                "slug": slug,
                "display_name": display_name,
                "dilly_scores": rule.get("meridian_scores"),
                "confidence": rule.get("confidence", ""),
            }
    return None


@dataclass
class CompanyFitResult:
    """Result of comparing user scores to company thresholds."""
    company_slug: str
    company_display_name: str
    meets_smart: bool
    meets_grit: bool
    meets_build: bool
    bars_met: int
    bars_total: int
    gaps: List[dict] = field(default_factory=list)  # [{"pillar": "build", "user": 58, "bar": 65}]
    fit_label: str = ""  # "Strong", "On track", "Gap in Build", etc.
    min_smart: int | None = None
    min_grit: int | None = None
    min_build: int | None = None
    confidence: str = ""  # "validated" | "inferred" | ""


def get_company_fit(
    smart: float,
    grit: float,
    build: float,
    company_slug: str,
) -> CompanyFitResult | None:
    """
    Compare user's Smart, Grit, Build against company thresholds.
    Returns CompanyFitResult or None if company has no dilly_scores.
    """
    company_slug = (company_slug or "").strip().lower().replace(" ", "-")
    if not company_slug:
        return None

    company = _get_company_by_slug(company_slug)
    if not company:
        return None

    ms = company.get("meridian_scores") or {}
    if not isinstance(ms, dict):
        return None

    min_smart = ms.get("min_smart")
    min_grit = ms.get("min_grit")
    min_build = ms.get("min_build")

    # If no thresholds, we can't compute fit
    if min_smart is None and min_grit is None and min_build is None:
        return None

    meets_smart = (min_smart is None) or (smart >= min_smart)
    meets_grit = (min_grit is None) or (grit >= min_grit)
    meets_build = (min_build is None) or (build >= min_build)

    bars_total = sum(1 for m in (min_smart, min_grit, min_build) if m is not None)
    bars_met = sum([meets_smart, meets_grit, meets_build])

    gaps: List[dict] = []
    if not meets_smart and min_smart is not None:
        gaps.append({"pillar": "smart", "user": round(smart, 1), "bar": min_smart})
    if not meets_grit and min_grit is not None:
        gaps.append({"pillar": "grit", "user": round(grit, 1), "bar": min_grit})
    if not meets_build and min_build is not None:
        gaps.append({"pillar": "build", "user": round(build, 1), "bar": min_build})

    if bars_met == bars_total and bars_total > 0:
        fit_label = "Strong"
    elif len(gaps) == 1:
        p = gaps[0]["pillar"].capitalize()
        fit_label = f"Gap in {p}"
    elif len(gaps) > 1:
        fit_label = f"Gaps in {len(gaps)} pillars"
    else:
        fit_label = "On track"

    return CompanyFitResult(
        company_slug=company_slug,
        company_display_name=company.get("display_name", company_slug),
        meets_smart=meets_smart,
        meets_grit=meets_grit,
        meets_build=meets_build,
        bars_met=bars_met,
        bars_total=bars_total,
        gaps=gaps,
        fit_label=fit_label,
        min_smart=min_smart,
        min_grit=min_grit,
        min_build=min_build,
        confidence=company.get("confidence", ""),
    )


_TECH_JSON_CACHE: dict | None = None


def _load_tech_json() -> dict:
    """Load tech.json. Cached."""
    global _TECH_JSON_CACHE
    if _TECH_JSON_CACHE is not None:
        return _TECH_JSON_CACHE
    _dir = os.path.dirname(os.path.abspath(__file__))
    for base in (
        os.path.normpath(os.path.join(_dir, "..", "projects", "dilly", "knowledge")),
        os.path.join(os.getcwd(), "projects", "dilly", "knowledge"),
    ):
        path = os.path.join(base, "tech.json")
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    _TECH_JSON_CACHE = json.load(f)
                return _TECH_JSON_CACHE
            except Exception:
                pass
    _TECH_JSON_CACHE = {}
    return _TECH_JSON_CACHE


def _slug_matches_company(slug: str, company_name: str) -> bool:
    """True if slug matches company name (e.g. 'google' matches 'Google / Alphabet')."""
    slug = (slug or "").strip().lower()
    name_norm = (company_name or "").lower().replace(" ", "-").replace("/", "-").replace("&", "-")
    # "google" matches "google---alphabet" or "google"
    return slug in name_norm or slug.replace("-", "") in name_norm.replace("-", "")


def get_company_weighted_score(
    smart: float,
    grit: float,
    build: float,
    company_slug: str,
    track: str = "",
) -> dict | None:
    """
    Compute company-weighted composite: w_s*Smart + w_g*Grit + w_b*Build.
    When dimension_weights exist in tech.json, use company-specific weights.
    Fallback: when no company match and track provided, use industry weights.
    """
    company_slug = (company_slug or "").strip().lower().replace(" ", "-")

    # Try company-specific weights from tech.json
    if company_slug:
        data = _load_tech_json()
        companies = data.get("companies") or []
        for c in companies:
            name = c.get("name") or ""
            if _slug_matches_company(company_slug, name):
                dw = c.get("dimension_weights")
                if isinstance(dw, dict) and "smart" in dw and "grit" in dw and "build" in dw:
                    ws = float(dw.get("smart", 0.33))
                    wg = float(dw.get("grit", 0.34))
                    wb = float(dw.get("build", 0.33))
                    score = ws * smart + wg * grit + wb * build
                    return {
                        "fit_score": round(score, 2),
                        "company_display_name": name,
                        "weights": {"smart": ws, "grit": wg, "build": wb},
                        "source": "company",
                    }

    # Fallback: industry weights when no company match
    if track:
        try:
            from dilly_core.tracks import get_industry_weights
            ws, wg, wb = get_industry_weights(track)
            score = ws * smart + wg * grit + wb * build
            return {
                "fit_score": round(score, 2),
                "company_display_name": "",
                "weights": {"smart": ws, "grit": wg, "build": wb},
                "source": "industry",
                "track": track,
            }
        except ImportError:
            pass

    return None
