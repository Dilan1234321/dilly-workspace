#!/usr/bin/env python3
"""
Tech scoring regression: assert that Tech track scoring and extraction still match
expected signals and score bands for a fixed set of resume snippets. Run after
scoring or extraction changes to avoid regressions.

Usage (from workspace root):
  python projects/dilly/scripts/tech_scoring_regression.py [--fixtures PATH]
  Default fixtures: projects/dilly/scripts/fixtures/tech_scoring_regression_expected.json

Exit: 0 if all pass, 1 if any mismatch.
"""

import argparse
import json
import os
import sys

_WORKSPACE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _WORKSPACE not in sys.path:
    sys.path.insert(0, _WORKSPACE)
os.chdir(_WORKSPACE)


def run_regression(fixtures_path: str) -> bool:
    if not os.path.isabs(fixtures_path):
        fixtures_path = os.path.join(
            _WORKSPACE, "projects", "dilly", "scripts", "fixtures", "tech_scoring_regression_expected.json"
        )
    fixtures_path = os.path.normpath(fixtures_path)
    if not os.path.isfile(fixtures_path):
        print(f"FAIL: fixtures not found: {fixtures_path}")
        return False

    with open(fixtures_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    entries = data.get("entries", [])

    from dilly_core.scoring import extract_scoring_signals, get_tech_keywords_for_major
    from dilly_core.scoring import get_tech_outcome_tied_signals
    from dilly_core.tracks import audit_tech

    all_pass = True
    for entry in entries:
        name = entry.get("name") or "unnamed"
        text = (entry.get("text") or "").strip()
        major = (entry.get("major") or "Computer Science").strip()
        expect = entry.get("expect") or {}

        if not text:
            print(f"SKIP {name}: no text")
            continue

        signals = extract_scoring_signals(text, major=major)
        keywords = get_tech_keywords_for_major(major)
        outcome_tied_hits, skills_without_outcome = get_tech_outcome_tied_signals(text, tech_keywords=keywords)
        track_result = audit_tech(signals, text)
        build_score = track_result.build_score

        failures = []

        if "outcome_tied_hits_min" in expect:
            min_val = int(expect["outcome_tied_hits_min"])
            if outcome_tied_hits < min_val:
                failures.append(f"outcome_tied_hits: expected >={min_val}, got {outcome_tied_hits}")

        if "skills_without_outcome_min" in expect:
            min_val = int(expect["skills_without_outcome_min"])
            n = len(skills_without_outcome)
            if n < min_val:
                failures.append(f"skills_without_outcome: expected >={min_val}, got {n}")

        if "security_metrics_count_min" in expect:
            min_val = int(expect["security_metrics_count_min"])
            got = getattr(signals, "security_metrics_count", 0) or 0
            if got < min_val:
                failures.append(f"security_metrics_count: expected >={min_val}, got {got}")

        if expect.get("deployed_app") is True:
            if not getattr(signals, "deployed_app_or_live_link", False):
                failures.append("deployed_app_or_live_link: expected True, got False")

        if "build_min" in expect:
            min_build = float(expect["build_min"])
            if build_score < min_build:
                failures.append(f"build_score: expected >={min_build}, got {build_score}")

        if "build_max" in expect:
            max_build = float(expect["build_max"])
            if build_score > max_build:
                failures.append(f"build_score: expected <={max_build}, got {build_score}")

        if failures:
            print(f"FAIL {name}:")
            for f in failures:
                print(f"  {f}")
            all_pass = False
        else:
            print(f"OK   {name}")

    return all_pass


def main():
    ap = argparse.ArgumentParser(description="Run Tech scoring regression against expected fixtures.")
    ap.add_argument("--fixtures", default="", help="Path to tech_scoring_regression_expected.json")
    args = ap.parse_args()
    ok = run_regression(args.fixtures)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
