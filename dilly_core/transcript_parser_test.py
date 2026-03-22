"""
Unit tests for transcript_parser. Run with: python -m dilly_core.transcript_parser_test
Ensures GPA extraction is accurate, cumulative preferred, and validation is strict.
"""

import sys
from dilly_core.transcript_parser import (
    parse_transcript_text,
    TranscriptParseResult,
    GPA_MIN,
    GPA_MAX,
    _valid_gpa,
    _normalize_text,
)


def _assert_eq(actual, expected, msg: str = ""):
    if actual != expected:
        raise AssertionError(f"{msg}: expected {expected!r}, got {actual!r}")


def test_valid_gpa():
    _assert_eq(_valid_gpa(3.5), 3.5, "valid 3.5")
    _assert_eq(_valid_gpa(2.0), 2.0, "valid 2.0")
    _assert_eq(_valid_gpa(4.0), 4.0, "valid 4.0")
    _assert_eq(_valid_gpa(3.567), 3.57, "rounding")
    _assert_eq(_valid_gpa(1.5), None, "below min")
    _assert_eq(_valid_gpa(4.5), None, "above max")
    _assert_eq(_valid_gpa(0), None, "zero")
    _assert_eq(_valid_gpa(None), None, "none")


def test_normalize_text():
    out = _normalize_text("  a   b  \n\n\n  c  ")
    assert "a" in out and "b" in out and "c" in out and "\n" in out, "normalize collapses space and newlines"
    _assert_eq(_normalize_text(""), "", "empty")


def test_cumulative_gpa_preferred():
    text = """
    Term GPA: 3.20
    Cumulative GPA: 3.45
    """
    r = parse_transcript_text(text)
    _assert_eq(r.gpa, 3.45, "cumulative preferred over term")
    _assert_eq(r.warnings, [], "no warning when cumulative found")


def test_single_gpa_inferred():
    text = "GPA: 3.50"
    r = parse_transcript_text(text)
    _assert_eq(r.gpa, 3.5, "single GPA extracted")
    _assert_eq("gpa_not_labeled_cumulative" in r.warnings, True, "warning when not labeled cumulative")


def test_no_gpa():
    text = "Course BIO 101 A 3 credits"
    r = parse_transcript_text(text)
    _assert_eq(r.gpa, None, "no GPA in text")
    _assert_eq("no_gpa_found" in r.warnings, True, "no_gpa_found warning")


def test_gpa_out_of_range_rejected():
    text = "GPA: 5.0"
    r = parse_transcript_text(text)
    _assert_eq(r.gpa, None, "5.0 rejected")
    _assert_eq(_valid_gpa(1.0), None, "1.0 below min")
    _assert_eq(_valid_gpa(4.01), None, "4.01 above max")


def test_bcpm():
    text = "Science GPA: 3.70  Cumulative GPA: 3.50"
    r = parse_transcript_text(text)
    _assert_eq(r.gpa, 3.5, "cumulative")
    _assert_eq(r.bcpm_gpa, 3.7, "BCPM")


def test_courses_dedup():
    text = """
    BIO 101   General Biology   Fall 2024   3 credits   A
    BIO 101   General Biology   Fall 2024   3 credits   A
    CHM 201   Organic Chemistry   Spring 2024   4 credits   B+
    """
    r = parse_transcript_text(text)
    _assert_eq(len(r.courses), 2, "dedup by (code, term)")
    _assert_eq(r.courses[0].code, "BIO 101", "first course code")
    _assert_eq(r.courses[0].grade, "A", "grade")
    _assert_eq(r.courses[1].code, "CHM 201", "second course")


def test_honors():
    text = "Dean's List Fall 2023, Fall 2024. Magna cum laude."
    r = parse_transcript_text(text)
    _assert_eq(len(r.honors) >= 2, True, "at least two honors")
    assert any("dean" in h.lower() for h in r.honors), "dean's list"
    assert any("magna" in h.lower() for h in r.honors), "magna"


def test_empty_text():
    r = parse_transcript_text("")
    _assert_eq(r.gpa, None, "empty")
    _assert_eq("empty_text" in r.warnings, True, "empty_text warning")


def run_tests():
    tests = [
        test_valid_gpa,
        test_normalize_text,
        test_cumulative_gpa_preferred,
        test_single_gpa_inferred,
        test_no_gpa,
        test_gpa_out_of_range_rejected,
        test_bcpm,
        test_courses_dedup,
        test_honors,
        test_empty_text,
    ]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"  OK {t.__name__}")
        except AssertionError as e:
            print(f"  FAIL {t.__name__}: {e}")
            failed += 1
    if failed:
        print(f"\n{failed} test(s) failed.")
        sys.exit(1)
    print(f"\nAll {len(tests)} tests passed.")


if __name__ == "__main__":
    run_tests()
