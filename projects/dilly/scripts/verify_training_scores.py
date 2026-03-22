#!/usr/bin/env python3
"""
Verify training_data.json Smart, Grit, Build (and final) scores against
dilly_core scoring logic. Prefer full PDF text from RESUME_DIR when
available (scores in training_data were generated from full text); fallback
to excerpt. Reports mismatches.
"""
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MERIDIAN_DIR = os.path.dirname(SCRIPT_DIR)  # projects/meridian
WORKSPACE_ROOT = os.path.dirname(os.path.dirname(MERIDIAN_DIR))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

TRAINING_PATH = os.path.join(MERIDIAN_DIR, "prompts", "training_data.json")
RESUME_DIR = os.environ.get("RESUME_DIR", os.path.join(WORKSPACE_ROOT, "assets", "resumes"))
# Tolerance for float comparison
TOL = 0.02


def extract_text_from_pdf(pdf_path: str) -> str:
    try:
        import pypdf
        reader = pypdf.PdfReader(pdf_path)
        return "\n".join([p.extract_text() or "" for p in reader.pages]).strip()
    except Exception:
        return ""


def main():
    with open(TRAINING_PATH, "r") as f:
        data = json.load(f)
    examples = data.get("examples", [])

    from dilly_core.auditor import run_audit

    ok = 0
    mismatches = []
    used_full_pdf = 0

    for ex in examples:
        filename = ex.get("filename", "")
        text = ex.get("resume_excerpt", "")

        # Prefer full PDF text when available (training_data scores were from full text)
        pdf_path = os.path.join(RESUME_DIR, filename)
        if os.path.isfile(pdf_path):
            full_text = extract_text_from_pdf(pdf_path)
            if full_text and len(full_text) >= 50:
                text = full_text
                used_full_pdf += 1

        if not text or len(text) < 50:
            mismatches.append((filename, "No usable text (excerpt or PDF)", ex, None))
            continue

        expected_smart = ex.get("smart_score", 0)
        expected_grit = ex.get("grit_score", 0)
        expected_build = ex.get("build_score", 0)
        expected_final = ex.get("final_score", 0)
        expected_track = ex.get("track", "Humanities")

        try:
            result = run_audit(text, candidate_name="Unknown", major="Unknown", gpa=None)
        except Exception as e:
            mismatches.append((filename, f"run_audit error: {e}", ex, None))
            continue

        actual = (result.smart_score, result.grit_score, result.build_score, result.final_score)
        expected = (expected_smart, expected_grit, expected_build, expected_final)

        diff_smart = abs(result.smart_score - expected_smart) > TOL
        diff_grit = abs(result.grit_score - expected_grit) > TOL
        diff_build = abs(result.build_score - expected_build) > TOL
        diff_final = abs(result.final_score - expected_final) > TOL
        track_changed = result.track != expected_track

        if diff_smart or diff_grit or diff_build or diff_final or track_changed:
            mismatches.append((
                filename,
                {
                    "expected_track": expected_track,
                    "actual_track": result.track,
                    "expected": {"smart": expected_smart, "grit": expected_grit, "build": expected_build, "final": expected_final},
                    "actual": {"smart": result.smart_score, "grit": result.grit_score, "build": result.build_score, "final": result.final_score},
                    "diffs": {"smart": diff_smart, "grit": diff_grit, "build": diff_build, "final": diff_final, "track": track_changed},
                },
                ex,
                result,
            ))
        else:
            ok += 1

    # Report
    print("=" * 60)
    print("MERIDIAN TRAINING DATA VERIFICATION")
    print("Logic: dilly_core/scoring.py + tracks.py + auditor.py")
    print("=" * 60)
    print(f"Total examples: {len(examples)}")
    print(f"Audited with full PDF text: {used_full_pdf} (rest: excerpt)")
    print(f"Match: {ok}")
    print(f"Mismatch or error: {len(mismatches)}")
    print()

    for filename, info, ex, result in mismatches:
        print(f"--- {filename} ---")
        if isinstance(info, str):
            print(f"  Error: {info}")
        else:
            print(f"  Track: expected {info['expected_track']} -> actual {info['actual_track']}" if info.get("diffs", {}).get("track") else "  Track: OK")
            for pill in ["smart", "grit", "build", "final"]:
                if info.get("diffs", {}).get(pill):
                    e_val = info["expected"][pill]
                    a_val = info["actual"][pill]
                    print(f"  {pill}: expected {e_val} -> actual {a_val}")
        print()

    return 0 if not mismatches else 1


if __name__ == "__main__":
    sys.exit(main())
