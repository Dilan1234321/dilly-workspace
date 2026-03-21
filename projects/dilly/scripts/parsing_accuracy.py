#!/usr/bin/env python3
"""
Parsing accuracy evaluation: use training_data.json as ground truth to measure
how well we extract name, major, and track from resume text. Goal: 95%+ accuracy.

Run from workspace root:
  python -m projects.dilly.scripts.parsing_accuracy
  DILLY_USE_LLM=1 OPENAI_API_KEY=... python -m projects.dilly.scripts.parsing_accuracy   # include LLM

Output: per-field accuracy (name, major, track), overall (all three correct), and a list of failures
so you can fix the parser or prompt and re-run until you hit 95%.
"""

import json
import os
import sys

# Workspace root on path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
if WORKSPACE not in sys.path:
    sys.path.insert(0, WORKSPACE)
os.chdir(WORKSPACE)

TRAINING_PATH = os.path.join(WORKSPACE, "projects", "dilly", "prompts", "training_data.json")


def _normalize_name(s: str) -> str:
    if not s or not s.strip():
        return ""
    # Lowercase, collapse spaces, strip
    t = " ".join((s or "").lower().split()).strip()
    # Optional: drop middle initial for looser match (e.g. "Kate M. Hicks" vs "Kate Hicks")
    return t


def _normalize_major(s: str) -> str:
    if not s or not s.strip():
        return ""
    return " ".join((s or "").lower().split()).strip()


def _name_match(extracted: str, ground: str) -> bool:
    if not ground:
        return not extracted or extracted.lower() == "unknown"
    e = _normalize_name(extracted)
    g = _normalize_name(ground)
    if e == g:
        return True
    # One contains the other (e.g. "Kate M. Hicks" vs "Kate Hicks")
    if e in g or g in e:
        return True
    # Same first and last word (ignore middle)
    ew = e.split()
    gw = g.split()
    if ew and gw:
        if ew[0] == gw[0] and ew[-1] == gw[-1]:
            return True
    return False


def _major_match(extracted: str, ground: str) -> bool:
    if not ground or ground.lower() == "unknown":
        return True  # no ground truth to check
    e = _normalize_major(extracted)
    g = _normalize_major(ground)
    if e == g:
        return True
    # Canonical variants (e.g. "International Business & Marketing" vs "International Business and Marketing")
    if e.replace(" & ", " and ") == g.replace(" & ", " and "):
        return True
    return False


def _track_match(extracted: str, ground: str) -> bool:
    if not ground:
        return True
    return (extracted or "").strip().lower() == (ground or "").strip().lower()


def evaluate_rule_based(examples: list) -> tuple[dict, list]:
    from dilly_core.resume_parser import parse_resume
    from dilly_core.auditor import get_track_from_major_and_text

    results = {"name": 0, "major": 0, "track": 0, "all": 0, "n": 0}
    failures = []

    for ex in examples:
        excerpt = (ex.get("resume_excerpt") or ex.get("resume_text") or "").strip()
        filename = ex.get("filename") or ""
        gt_name = (ex.get("candidate_name") or "").strip()
        gt_major = (ex.get("major") or "").strip()
        gt_track = (ex.get("track") or "Builder").strip()

        if not excerpt:
            continue

        parsed = parse_resume(excerpt, filename=filename)
        track = get_track_from_major_and_text(parsed.major or "", excerpt)

        ok_name = _name_match(parsed.name or "", gt_name)
        ok_major = _major_match(parsed.major or "", gt_major)
        ok_track = _track_match(track, gt_track)
        ok_all = ok_name and ok_major and ok_track

        results["n"] += 1
        if ok_name:
            results["name"] += 1
        if ok_major:
            results["major"] += 1
        if ok_track:
            results["track"] += 1
        if ok_all:
            results["all"] += 1

        if not ok_all:
            failures.append({
                "filename": filename,
                "ground_truth": {"name": gt_name, "major": gt_major, "track": gt_track},
                "rule_based": {"name": parsed.name, "major": parsed.major, "track": track},
                "wrong": [x for x, ok in [("name", ok_name), ("major", ok_major), ("track", ok_track)] if not ok],
            })

    return results, failures


def evaluate_llm_leave_one_out(examples: list) -> tuple[dict, list]:
    """Run LLM on each example with zero-shot so we measure parsing without leaking ground truth."""
    from dilly_core.llm_auditor import run_audit_llm

    prev_few = os.environ.get("DILLY_FEW_SHOT")
    os.environ["DILLY_FEW_SHOT"] = "0"  # zero-shot for fair accuracy eval

    results = {"name": 0, "major": 0, "track": 0, "all": 0, "n": 0}
    failures = []

    for i, ex in enumerate(examples):
        excerpt = (ex.get("resume_excerpt") or ex.get("resume_text") or "").strip()
        filename = ex.get("filename") or ""
        gt_name = (ex.get("candidate_name") or "").strip()
        gt_major = (ex.get("major") or "").strip()
        gt_track = (ex.get("track") or "Builder").strip()

        if not excerpt:
            continue

        try:
            result = run_audit_llm(
                excerpt[:2400],
                candidate_name=None,  # let LLM extract
                major=None,
                gpa=None,
                filename=filename,
            )
        except Exception as e:
            failures.append({
                "filename": filename,
                "error": str(e),
                "ground_truth": {"name": gt_name, "major": gt_major, "track": gt_track},
            })
            continue

        r_name = (result.candidate_name or "").strip()
        r_major = (result.major or "").strip()
        r_track = (result.track or "").strip()

        ok_name = _name_match(r_name, gt_name)
        ok_major = _major_match(r_major, gt_major)
        ok_track = _track_match(r_track, gt_track)
        ok_all = ok_name and ok_major and ok_track

        results["n"] += 1
        if ok_name:
            results["name"] += 1
        if ok_major:
            results["major"] += 1
        if ok_track:
            results["track"] += 1
        if ok_all:
            results["all"] += 1

        if not ok_all:
            failures.append({
                "filename": filename,
                "ground_truth": {"name": gt_name, "major": gt_major, "track": gt_track},
                "llm": {"name": r_name, "major": r_major, "track": r_track},
                "wrong": [x for x, ok in [("name", ok_name), ("major", ok_major), ("track", ok_track)] if not ok],
            })

    if prev_few is not None:
        os.environ["DILLY_FEW_SHOT"] = prev_few
    else:
        os.environ.pop("DILLY_FEW_SHOT", None)
    return results, failures


def main():
    if not os.path.isfile(TRAINING_PATH):
        print(f"Training data not found: {TRAINING_PATH}")
        sys.exit(1)

    with open(TRAINING_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    examples = data.get("examples") or data.get("items") or []
    if not examples:
        print("No examples in training_data.json")
        sys.exit(1)

    print("=" * 60)
    print("PARSING ACCURACY (ground truth = training_data.json)")
    print("=" * 60)
    print(f"Examples: {len(examples)}\n")

    # Rule-based
    r_results, r_failures = evaluate_rule_based(examples)
    n = r_results["n"]
    print("--- Rule-based parser ---")
    print(f"  Name:  {r_results['name']}/{n} = {100 * r_results['name'] / n:.1f}%")
    print(f"  Major: {r_results['major']}/{n} = {100 * r_results['major'] / n:.1f}%")
    print(f"  Track: {r_results['track']}/{n} = {100 * r_results['track'] / n:.1f}%")
    print(f"  All 3: {r_results['all']}/{n} = {100 * r_results['all'] / n:.1f}%")
    if r_failures:
        print(f"\n  Failures ({len(r_failures)}):")
        for f in r_failures[:15]:
            print(f"    - {f.get('filename', '?')}: wrong {f.get('wrong', [])} | gt name={f['ground_truth'].get('name')} major={f['ground_truth'].get('major')} track={f['ground_truth'].get('track')} | got name={f['rule_based'].get('name')} major={f['rule_based'].get('major')} track={f['rule_based'].get('track')}")
        if len(r_failures) > 15:
            print(f"    ... and {len(r_failures) - 15} more")

    use_llm = os.environ.get("DILLY_USE_LLM", "").strip().lower() in ("1", "true", "yes") and os.environ.get("OPENAI_API_KEY")
    if use_llm:
        print("\n--- LLM (leave-one-out style) ---")
        try:
            l_results, l_failures = evaluate_llm_leave_one_out(examples)
            n = l_results["n"]
            print(f"  Name:  {l_results['name']}/{n} = {100 * l_results['name'] / n:.1f}%")
            print(f"  Major: {l_results['major']}/{n} = {100 * l_results['major'] / n:.1f}%")
            print(f"  Track: {l_results['track']}/{n} = {100 * l_results['track'] / n:.1f}%")
            print(f"  All 3: {l_results['all']}/{n} = {100 * l_results['all'] / n:.1f}%")
            if l_failures:
                print(f"\n  Failures ({len(l_failures)}):")
                for f in l_failures[:10]:
                    if "error" in f:
                        print(f"    - {f.get('filename')}: {f['error']}")
                    else:
                        print(f"    - {f.get('filename')}: wrong {f.get('wrong', [])} | gt major={f['ground_truth'].get('major')} | got major={f['llm'].get('major')}")
        except Exception as e:
            print(f"  LLM eval error: {e}")
    else:
        print("\n(Set DILLY_USE_LLM=1 and OPENAI_API_KEY to also evaluate LLM parsing.)")

    print("\n" + "=" * 60)
    target = 95.0
    all_pct = 100 * r_results["all"] / r_results["n"] if r_results["n"] else 0
    if all_pct >= target:
        print(f"Target {target}% met (rule-based all-three: {all_pct:.1f}%).")
    else:
        print(f"Target {target}% not yet met (rule-based all-three: {all_pct:.1f}%). Fix failures above and re-run.")
    print("=" * 60)


if __name__ == "__main__":
    main()
