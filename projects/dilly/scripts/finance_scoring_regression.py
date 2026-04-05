#!/usr/bin/env python3
"""
Finance scoring regression: assert that Finance track scoring and extraction
match expected signals and score bands for a fixed set of resume snippets.
Aligned to FINANCE_SCORING_SPEC.md and tracks.audit_finance.

Usage (from workspace root):
  python projects/dilly/scripts/finance_scoring_regression.py [--fixtures PATH]
  Default fixtures: projects/dilly/scripts/fixtures/finance_scoring_regression_expected.json

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
    if not fixtures_path or not os.path.isabs(fixtures_path):
        fixtures_path = os.path.join(
            _WORKSPACE, "projects", "dilly", "scripts", "fixtures", "finance_scoring_regression_expected.json"
        )
    fixtures_path = os.path.normpath(fixtures_path)
    if not os.path.isfile(fixtures_path):
        print(f"FAIL: fixtures not found: {fixtures_path}")
        return False

    with open(fixtures_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    entries = data.get("entries", [])

    from dilly_core.scoring import extract_scoring_signals
    from dilly_core.tracks import audit_finance

    all_pass = True
    for entry in entries:
        name = entry.get("name") or "unnamed"
        text = (entry.get("text") or "").strip()
        major = (entry.get("major") or "Finance").strip()
        expect = entry.get("expect") or {}

        if not text:
            print(f"SKIP {name}: no text")
            continue

        signals = extract_scoring_signals(text, major=major)
        track_result = audit_finance(signals, text)
        build_score = track_result.build_score

        failures = []

        if "quantifiable_impact_count_min" in expect:
            min_val = int(expect["quantifiable_impact_count_min"])
            got = getattr(signals, "quantifiable_impact_count", 0) or 0
            if got < min_val:
                failures.append(f"quantifiable_impact_count: expected >={min_val}, got {got}")

        if "leadership_density_min" in expect:
            min_val = int(expect["leadership_density_min"])
            got = getattr(signals, "leadership_density", 0) or 0
            if got < min_val:
                failures.append(f"leadership_density: expected >={min_val}, got {got}")

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
    ap = argparse.ArgumentParser(description="Run Finance scoring regression against expected fixtures.")
    ap.add_argument("--fixtures", default="", help="Path to finance_scoring_regression_expected.json")
    args = ap.parse_args()
    ok = run_regression(args.fixtures)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
