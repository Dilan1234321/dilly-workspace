#!/usr/bin/env python3
"""
Parsing regression: assert that the parser still produces expected name/email/major/GPA
for a fixed set of resumes. Run after parser or structured-resume changes to avoid regressions.

Usage (from workspace root):
  python projects/dilly/scripts/parsing_regression.py [--sources DIR] [--fixtures PATH]
  Default: sources = assets/resumes, fixtures = scripts/fixtures/parsing_regression_expected.json

Exit: 0 if all pass, 1 if any mismatch. CI can run this as a gate.
"""

import argparse
import json
import os
import sys

_WORKSPACE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _WORKSPACE not in sys.path:
    sys.path.insert(0, _WORKSPACE)
if os.path.join(_WORKSPACE, "projects", "dilly") not in sys.path:
    sys.path.insert(0, os.path.join(_WORKSPACE, "projects", "dilly"))
os.chdir(_WORKSPACE)


def extract_raw_text(path: str) -> str:
    try:
        from dilly_resume_auditor import DillyResumeAuditor
        auditor = DillyResumeAuditor(path)
        if auditor.extract_text():
            return (auditor.raw_text or "").strip()
    except Exception:
        pass
    return ""


def run_regression(sources_dir: str, fixtures_path: str) -> bool:
    sources_dir = os.path.normpath(os.path.join(_WORKSPACE, sources_dir))
    if not fixtures_path or not os.path.isabs(fixtures_path):
        fixtures_path = os.path.join(_WORKSPACE, "projects", "dilly", "scripts", "fixtures", "parsing_regression_expected.json")
    fixtures_path = os.path.normpath(fixtures_path)

    with open(fixtures_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    entries = data.get("entries", [])

    from dilly_core.resume_parser import parse_resume

    all_pass = True
    for entry in entries:
        source = entry["source"]
        path = os.path.join(sources_dir, source)
        if not os.path.isfile(path):
            print(f"SKIP {source}: file not found")
            continue

        raw = extract_raw_text(path)
        if not raw:
            print(f"FAIL {source}: no text extracted")
            all_pass = False
            continue

        parsed = parse_resume(raw, filename=source)
        expected_name = (entry.get("name") or "").strip() or None
        expected_email = entry.get("email")
        if expected_email is not None:
            expected_email = (str(expected_email).strip() or None)
        expected_major = (entry.get("major") or "").strip() or None
        expected_gpa = entry.get("gpa")

        got_name = (parsed.name or "").strip() or None
        got_email = (parsed.email if getattr(parsed, "email", None) is not None else None) or (None)
        # Email comes from get_email_from_parsed in audit; parser doesn't set parsed.email. So we need to get email from parsed the same way as audit.
        from dilly_core.structured_resume import get_email_from_parsed
        got_email = (get_email_from_parsed(parsed) or "").strip() or None
        got_major = (parsed.major or "").strip() or None
        got_gpa = parsed.gpa

        def _norm(s: str | None) -> str:
            if s is None:
                return ""
            return " ".join(s.split()).strip().lower()

        def _gpa_eq(a, b) -> bool:
            if a is None and b is None:
                return True
            if a is None or b is None:
                return False
            return abs(float(a) - float(b)) < 0.01

        failures = []
        if _norm(expected_name) != _norm(got_name):
            failures.append(f"name: expected {expected_name!r}, got {got_name!r}")
        if (expected_email or "").lower().strip() != (got_email or "").lower().strip():
            failures.append(f"email: expected {expected_email!r}, got {got_email!r}")
        if (expected_major or "").strip() != (got_major or "").strip():
            failures.append(f"major: expected {expected_major!r}, got {got_major!r}")
        if not _gpa_eq(expected_gpa, got_gpa):
            failures.append(f"gpa: expected {expected_gpa!r}, got {got_gpa!r}")

        if failures:
            print(f"FAIL {source}:")
            for f in failures:
                print(f"  {f}")
            all_pass = False
        else:
            print(f"OK   {source}")

    return all_pass


def main():
    ap = argparse.ArgumentParser(description="Run parsing regression against expected fixtures.")
    ap.add_argument("--sources", default="assets/resumes", help="Directory containing source PDF/DOCX (relative to workspace)")
    ap.add_argument("--fixtures", default="", help="Path to parsing_regression_expected.json (default: scripts/fixtures/parsing_regression_expected.json)")
    args = ap.parse_args()
    ok = run_regression(args.sources, args.fixtures)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
