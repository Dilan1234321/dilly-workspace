"""
Company hiring criteria — only list jobs from companies we have verified criteria for.

Meridian premium standard: we confidently know each company's hiring guidelines
and apply them to students. If we can't, we don't list their jobs.
"""

import fnmatch
import json
import os
import re
from pathlib import Path

# Resolve criteria path: prefer relative to this file (api/ -> meridian/knowledge/)
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_CRITERIA_PATH_REL = os.path.normpath(os.path.join(_THIS_DIR, "..", "knowledge", "company_hiring_criteria.json"))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_THIS_DIR, "..", "..", ".."))
_CRITERIA_PATH_ABS = os.path.join(_WORKSPACE_ROOT, "projects", "dilly", "knowledge", "company_hiring_criteria.json")

def _get_criteria_path() -> str:
    """Use path relative to module first so it works regardless of cwd; fallback to workspace path."""
    if os.path.isfile(_CRITERIA_PATH_REL):
        return _CRITERIA_PATH_REL
    return _CRITERIA_PATH_ABS

_rules_cache: list[dict] | None = None


def _load_rules() -> list[dict]:
    """Load company hiring criteria rules. Cached."""
    global _rules_cache
    if _rules_cache is not None:
        return _rules_cache
    path = _get_criteria_path()
    if not os.path.isfile(path):
        _rules_cache = []
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _rules_cache = data.get("rules", [])
        return _rules_cache
    except Exception:
        _rules_cache = []
        return []


def job_is_verified(job: dict) -> tuple[bool, str | None]:
    """
    Return (True, criteria_for_llm) if job is from a company we have verified criteria for.
    Return (False, None) otherwise.
    """
    source = (job.get("source") or "").strip().lower()
    company = (job.get("company") or "").strip()

    for rule in _load_rules():
        rule_source = (rule.get("source") or "").strip().lower()
        pattern = (rule.get("company_pattern") or "").strip()

        if rule_source != source:
            continue

        if pattern == "*":
            return True, rule.get("criteria_for_llm") or ""

        # Case-insensitive match: "Stripe" matches "Stripe", "stripe" matches "Stripe"
        if fnmatch.fnmatch(company.lower(), pattern.lower()):
            return True, rule.get("criteria_for_llm") or ""

    return False, None


def get_job_required_scores(job: dict) -> dict | None:
    """
    Return meridian_scores for this job (min_smart, min_grit, min_build, min_final_score, track)
    if the matching rule has meridian_scores. Otherwise None.
    """
    source = (job.get("source") or "").strip().lower()
    company = (job.get("company") or "").strip()

    for rule in _load_rules():
        rule_source = (rule.get("source") or "").strip().lower()
        pattern = (rule.get("company_pattern") or "").strip()

        if rule_source != source:
            continue

        if pattern == "*":
            scores = rule.get("meridian_scores")
            return dict(scores) if isinstance(scores, dict) else None

        if fnmatch.fnmatch(company.lower(), pattern.lower()):
            scores = rule.get("meridian_scores")
            return dict(scores) if isinstance(scores, dict) else None

    return None


def get_verified_companies() -> list[str]:
    """Return list of company/source names we have verified criteria for (for UI or debugging)."""
    seen: set[str] = set()
    out: list[str] = []
    for rule in _load_rules():
        src = rule.get("source", "")
        pat = rule.get("company_pattern", "")
        if pat == "*":
            key = f"{src} (all)"
        else:
            key = f"{pat} ({src})"
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out


def _rule_to_slug(rule: dict) -> str:
    """Stable URL slug for a rule: lowercase company_pattern, or source if pattern is *."""
    pat = (rule.get("company_pattern") or "").strip()
    src = (rule.get("source") or "").strip().lower()
    if pat == "*":
        return src or "unknown"
    return pat.lower().replace(" ", "-").replace("_", "-") or src


def get_all_companies() -> list[dict]:
    """
    Return list of companies we have verified criteria for.
    Each item: slug, display_name, source, meridian_scores, criteria_source, confidence.
    One entry per (source, company_pattern); slug is unique.
    """
    seen_slugs: set[str] = set()
    out: list[dict] = []
    for rule in _load_rules():
        slug = _rule_to_slug(rule)
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        pat = rule.get("company_pattern", "")
        src = rule.get("source", "")
        display_name = src if pat == "*" else pat
        out.append({
            "slug": slug,
            "display_name": display_name,
            "source": src,
            "meridian_scores": rule.get("meridian_scores"),
            "criteria_source": rule.get("criteria_source"),
            "confidence": rule.get("confidence"),
        })
    return out


def get_company_by_slug(slug: str) -> dict | None:
    """
    Return full company detail for slug, or None if not found.
    Keys: slug, display_name, source, company_pattern, meridian_scores, criteria_for_llm, criteria_source, confidence.
    company_pattern is for internal use (e.g. filtering jobs).
    """
    slug = (slug or "").strip().lower().replace(" ", "-")
    if not slug:
        return None
    for rule in _load_rules():
        if _rule_to_slug(rule) == slug:
            pat = rule.get("company_pattern", "")
            src = rule.get("source", "")
            display_name = src if pat == "*" else pat
            return {
                "slug": slug,
                "display_name": display_name,
                "source": src,
                "company_pattern": pat,
                "meridian_scores": rule.get("meridian_scores"),
                "criteria_for_llm": rule.get("criteria_for_llm"),
                "criteria_source": rule.get("criteria_source"),
                "confidence": rule.get("confidence"),
            }
    return None


def rule_matches_job(rule: dict, job: dict) -> bool:
    """True if this rule applies to this job (same source and company match)."""
    rule_source = (rule.get("source") or "").strip().lower()
    pattern = (rule.get("company_pattern") or "").strip()
    job_source = (job.get("source") or "").strip().lower()
    company = (job.get("company") or "").strip()
    if rule_source != job_source:
        return False
    if pattern == "*":
        return True
    return fnmatch.fnmatch(company.lower(), pattern.lower())


def criteria_to_voice_bullets(criteria_for_llm: str, max_bullets: int = 12) -> list[str]:
    """
    Turn criteria_for_llm into short, voice-friendly bullets for Dilly or UI.
    Splits on sentence boundaries and common clause starters; keeps each bullet under ~100 chars.
    """
    if not (criteria_for_llm or "").strip():
        return []
    text = (criteria_for_llm or "").strip()
    bullets: list[str] = []
    # Split on sentence boundaries (.  or . then space) and on "Emphasize", "Values", "look for", "Key:"
    parts = re.split(r"\.\s+|\b(?:Emphasize|Values?|look for|Key:|—)\s*", text, flags=re.IGNORECASE)
    for p in parts:
        p = p.strip().strip(".:;-").strip()
        if len(p) < 8:
            continue
        if len(p) > 120:
            # Break long sentences at commas or "and"
            for sub in re.split(r",\s+|\s+and\s+", p, maxsplit=2):
                sub = sub.strip().strip(".:").strip()
                if len(sub) >= 8:
                    bullets.append(sub)
        else:
            bullets.append(p)
        if len(bullets) >= max_bullets:
            break
    return bullets[:max_bullets]


def get_frameworks_by_track() -> dict:
    """
    Aggregate company guidelines by track to build scoring frameworks.
    Returns: { track: { track, companies: [{ slug, display_name }], summary, average_scores, source_note } }
    Tracks with no companies are omitted.
    """
    rules = _load_rules()
    by_track: dict = {}
    for rule in rules:
        pat = (rule.get("company_pattern") or "").strip()
        if pat == "*":
            continue
        ms = rule.get("meridian_scores") or {}
        track = (ms.get("track") or rule.get("track") or "").strip()
        if not track:
            continue
        slug = _rule_to_slug(rule)
        display_name = pat
        if track not in by_track:
            by_track[track] = {
                "track": track,
                "companies": [],
                "criteria_snippets": [],
                "scores_list": [],
            }
        by_track[track]["companies"].append({"slug": slug, "display_name": display_name})
        crit = (rule.get("criteria_for_llm") or "").strip()
        if crit:
            by_track[track]["criteria_snippets"].append(crit[:300])
        if isinstance(ms, dict) and (ms.get("min_smart") is not None or ms.get("min_final_score") is not None):
            by_track[track]["scores_list"].append(ms)

    out = {}
    for track, data in by_track.items():
        companies = data["companies"]
        snippets = data["criteria_snippets"]
        scores_list = data["scores_list"]
        # Dedupe companies by display_name for summary
        seen_names = set()
        unique_companies = [c for c in companies if c["display_name"] not in seen_names and not seen_names.add(c["display_name"])]
        summary = ""
        if snippets:
            summary = " ".join(snippets[:5])[:600]
            if len(" ".join(snippets)) > 600:
                summary += "…"
        avg = {}
        if scores_list:
            for key in ("min_smart", "min_grit", "min_build", "min_final_score"):
                vals = [s.get(key) for s in scores_list if s.get(key) is not None]
                if vals:
                    avg[key] = round(sum(vals) / len(vals), 1)
        out[track] = {
            "track": track,
            "companies": unique_companies,
            "company_count": len(unique_companies),
            "summary": summary,
            "average_scores": avg if avg else None,
            "source_note": f"Based on hiring guidelines from {len(unique_companies)} employer(s) in this track (public career pages and industry guides).",
        }
    return out
