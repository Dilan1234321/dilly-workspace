#!/usr/bin/env python3
"""
Ingest company guidelines from public-only sources into company_hiring_criteria.json.

Reads knowledge/company_guidelines_public_seed.json (and optionally
knowledge/scraped_criteria.json from company_criteria_scraper.py), merges new rules
into knowledge/company_hiring_criteria.json without overwriting existing rules.
All ingested entries use source=career_page and confidence=inferred so we can
show "we have many company guidelines from public career pages" when reaching out.

Usage (from workspace root or projects/dilly):
  python projects/dilly/scripts/ingest_public_company_guidelines.py [--dry-run]
  python projects/dilly/scripts/ingest_public_company_guidelines.py --merge-scraped  # also merge scraped_criteria.json if present

See docs/HIRING_GUIDELINES_PUBLIC_SOURCES.md.
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Paths relative to project root (projects/dilly)
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
WORKSPACE_ROOT = PROJECT_ROOT.parent.parent
CRITERIA_PATH = PROJECT_ROOT / "knowledge" / "company_hiring_criteria.json"
SEED_PATH = PROJECT_ROOT / "knowledge" / "company_guidelines_public_seed.json"
SCRAPED_PATH = PROJECT_ROOT / "knowledge" / "scraped_criteria.json"

SOURCE_PUBLIC = "career_page"
CONFIDENCE_INFERRED = "inferred"


def load_json(path: Path) -> dict | list:
    if not path.is_file():
        return {} if "seed" in str(path) or "scraped" in str(path) else {"rules": []}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {path}")


def rule_key(r: dict) -> tuple:
    """Unique key for dedup: (source, company_pattern)."""
    return (
        (r.get("source") or "").strip().lower(),
        (r.get("company_pattern") or "").strip(),
    )


def seed_entries_to_rules(seed_data: dict) -> list[dict]:
    """Convert company_guidelines_public_seed.json companies into criteria rules."""
    companies = seed_data.get("companies") or []
    rules = []
    for c in companies:
        pattern = (c.get("company_pattern") or "").strip()
        if not pattern:
            continue
        rule = {
            "source": SOURCE_PUBLIC,
            "company_pattern": pattern,
            "confidence": CONFIDENCE_INFERRED,
            "criteria_source": (c.get("criteria_source") or "Public career page / industry guide").strip(),
            "criteria_for_llm": (c.get("criteria_for_llm") or "").strip(),
            "dilly_scores": c.get("meridian_scores"),
        }
        if not rule["criteria_for_llm"]:
            continue
        if c.get("track"):
            rule["track"] = c["track"]
        rules.append(rule)
    return rules


def scraped_to_rules(scraped_data: dict) -> list[dict]:
    """Convert scraped_criteria.json (from company_criteria_scraper) into rules. One per source."""
    sources = scraped_data.get("sources") or []
    rules = []
    for src in sources:
        company = (src.get("company") or "Unknown").strip()
        url = (src.get("source_url") or "").strip()
        sections = src.get("sections") or []
        criteria_text = " ".join(
            (s.get("content") or "")[:500] for s in sections[:5]
        ).strip()[:2000]
        if not criteria_text:
            criteria_text = f"Public career page: {url}. Review page for qualifications and culture."
        criteria_for_llm = (
            f"Based on public career page ({url}): {criteria_text}"
            if criteria_text
            else f"Public career page: {url}. See link for what they look for."
        )
        rule = {
            "source": SOURCE_PUBLIC,
            "company_pattern": company,
            "confidence": CONFIDENCE_INFERRED,
            "criteria_source": url or "Public career page",
            "criteria_for_llm": criteria_for_llm,
            "dilly_scores": None,
        }
        rules.append(rule)
    return rules


def run_ingest(dry_run: bool = False, merge_scraped: bool = False) -> bool:
    criteria_data = load_json(CRITERIA_PATH)
    rules_existing = list(criteria_data.get("rules") or [])
    existing_keys = {rule_key(r) for r in rules_existing}

    seed_data = load_json(SEED_PATH)
    new_rules = seed_entries_to_rules(seed_data)

    if merge_scraped and SCRAPED_PATH.is_file():
        scraped_data = load_json(SCRAPED_PATH)
        new_rules.extend(scraped_to_rules(scraped_data))

    added = 0
    for r in new_rules:
        k = rule_key(r)
        if k in existing_keys:
            continue
        existing_keys.add(k)
        rules_existing.append(r)
        added += 1
        print(f"  + {r.get('company_pattern')} ({r.get('source')})")

    if dry_run:
        print(f"[DRY RUN] Would add {added} rules. Total would be {len(rules_existing)}.")
        return True

    if added == 0:
        print("No new rules to add.")
        return True

    criteria_data["rules"] = rules_existing
    save_json(CRITERIA_PATH, criteria_data)
    print(f"Added {added} company guidelines. Total rules: {len(rules_existing)}.")
    return True


def main():
    parser = argparse.ArgumentParser(description="Ingest public-source company guidelines into company_hiring_criteria.json")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be added, do not write")
    parser.add_argument("--merge-scraped", action="store_true", help="Also merge scraped_criteria.json if present")
    args = parser.parse_args()

    if not SEED_PATH.is_file():
        print(f"Seed file not found: {SEED_PATH}", file=sys.stderr)
        sys.exit(1)

    ok = run_ingest(dry_run=args.dry_run, merge_scraped=args.merge_scraped)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
