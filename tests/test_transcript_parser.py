"""Unit tests for transcript_parser school extraction."""

import pytest
from dilly_core.transcript_parser import _extract_school, parse_transcript_text


def test_extract_school_labeled():
    text = "Institution: University of Michigan\nGPA: 3.5\n"
    assert _extract_school(text) == "University of Michigan"


def test_extract_school_header_line():
    text = "Stanford University\nOfficial Transcript\nStudent: Jane Doe\n"
    assert _extract_school(text) == "Stanford University"


def test_extract_school_university_of_prefix():
    text = "University of Florida\nDate: 2024-05-01\n"
    assert _extract_school(text) == "University of Florida"


def test_extract_school_not_found():
    text = "Student Name: John Smith\nGPA: 3.8 cumulative\nMajor: Biology\n"
    assert _extract_school(text) is None


def test_extract_school_noise_line_skipped():
    # "grade" in the line should prevent it matching as a school
    text = "Grade University Notes\nUniversity of Tampa\n"
    assert _extract_school(text) == "University of Tampa"


def test_parse_transcript_text_includes_school():
    text = (
        "Massachusetts Institute of Technology\n"
        "Official Transcript\n"
        "Cumulative GPA: 3.72\n"
        "Major: Computer Science\n"
    )
    result = parse_transcript_text(text)
    assert result.school == "Massachusetts Institute of Technology"
    assert result.gpa == 3.72
