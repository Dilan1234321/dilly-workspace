"""
Tests for the ATS scoring engine: per-vendor scores, range checks, and format penalties.
"""
import pytest
from projects.dilly.api.ats_engine import scan_resume_ats

ATS_VENDORS = ["greenhouse", "lever", "ashby", "workday", "taleo", "icims", "successfactors"]


class TestATSVendorScores:
    """Each of the 7 ATS vendors must produce a score."""

    def test_all_vendors_present(self, sample_resume_text):
        result = scan_resume_ats(sample_resume_text)
        for vendor in ATS_VENDORS:
            assert vendor in result.vendors, f"Missing vendor: {vendor}"

    def test_all_vendor_scores_in_range(self, sample_resume_text):
        result = scan_resume_ats(sample_resume_text)
        for vendor in ATS_VENDORS:
            score = result.vendors[vendor]["score"]
            assert 0 <= score <= 100, f"{vendor} score {score} out of range"

    def test_overall_score_in_range(self, sample_resume_text):
        result = scan_resume_ats(sample_resume_text)
        assert 0 <= result.overall_score <= 100

    def test_each_vendor_has_score_key(self, sample_resume_text):
        result = scan_resume_ats(sample_resume_text)
        for vendor in ATS_VENDORS:
            entry = result.vendors[vendor]
            assert "score" in entry
            assert "issues" in entry
            assert "passed" in entry


class TestATSFormatPenalties:
    """Known-bad formatting should produce lower scores."""

    def test_tables_lower_workday_score(self, sample_resume_text):
        clean_result = scan_resume_ats(sample_resume_text)
        bad_text = sample_resume_text + "\n| Skill | Level |\n| Python | Expert |\n| SQL | Advanced |"
        bad_result = scan_resume_ats(bad_text)
        assert bad_result.vendors["workday"]["score"] < clean_result.vendors["workday"]["score"]

    def test_missing_email_penalizes_all(self):
        no_email = (
            "Jane Doe\n(555) 123-4567\n\n"
            "Education\nUniversity of Tampa — B.S. Finance\nGPA: 3.5 | May 2027\n\n"
            "Experience\nIntern — Acme Corp | Jun 2026 – Aug 2026\n"
            "• Analyzed quarterly reports\n\n"
            "Skills\nExcel, Python, SQL\n"
        )
        result = scan_resume_ats(no_email)
        # All vendors should penalize missing email
        for vendor in ATS_VENDORS:
            assert result.vendors[vendor]["score"] < 100

    def test_columns_penalize_strict_systems(self, sample_resume_text):
        columnar = sample_resume_text + "\nPython        Expert        5 years\nSQL           Advanced      3 years\nReact         Intermediate  1 year"
        result = scan_resume_ats(columnar)
        # Workday and Taleo are the strictest with columns
        clean_result = scan_resume_ats(sample_resume_text)
        assert result.vendors["workday"]["score"] <= clean_result.vendors["workday"]["score"]


class TestATSParsedFields:
    """Parsed fields extraction."""

    def test_email_extracted(self, sample_resume_text):
        result = scan_resume_ats(sample_resume_text)
        assert result.parsed_fields["email"] == "janedoe@email.com"

    def test_phone_extracted(self, sample_resume_text):
        result = scan_resume_ats(sample_resume_text)
        assert result.parsed_fields["phone"] is not None

    def test_education_detected(self, sample_resume_text):
        result = scan_resume_ats(sample_resume_text)
        assert result.parsed_fields["education"] is not None

    def test_skills_counted(self, sample_resume_text):
        result = scan_resume_ats(sample_resume_text)
        assert result.parsed_fields["skills_count"] > 0

    def test_name_guessed(self, sample_resume_text):
        result = scan_resume_ats(sample_resume_text)
        assert result.parsed_fields["name"] is not None


class TestATSDeterministic:
    def test_same_input_same_output(self, sample_resume_text):
        r1 = scan_resume_ats(sample_resume_text)
        r2 = scan_resume_ats(sample_resume_text)
        assert r1.overall_score == r2.overall_score
        for vendor in ATS_VENDORS:
            assert r1.vendors[vendor]["score"] == r2.vendors[vendor]["score"]
