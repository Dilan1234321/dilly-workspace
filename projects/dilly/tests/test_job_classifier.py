"""
Unit tests for the job level classifier.

Tests the _classify() function in quality_pipeline.py and the
_detect_job_type() function in job_analyzer.py.

Each test documents a real-world title pattern that previously
misclassified — these are the canonical regression examples.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.ingest.quality_pipeline import _classify
from dilly_core.job_analyzer import _detect_job_type


# ── Internship detection ─────────────────────────────────────────────────────

class TestInternshipDetection:
    """Titles that MUST classify as internship."""

    def test_basic_intern_suffix(self):
        assert _classify("Software Engineer Intern", "") == "internship"

    def test_internship_word(self):
        assert _classify("Finance Internship – Summer 2025", "") == "internship"

    def test_coop(self):
        assert _classify("Data Science Co-op", "") == "internship"

    def test_finance_summer_analyst_no_year(self):
        # Critical finance pattern: "Summer Analyst" without a year.
        # Previously classified as full_time/entry_level.
        assert _classify("Summer Analyst – Investment Banking", "") == "internship"

    def test_finance_summer_associate_no_year(self):
        assert _classify("Summer Associate, Private Equity", "") == "internship"

    def test_finance_summer_analyst_with_year_prefix(self):
        # "2025 Summer Analyst" — year before summer
        assert _classify("2025 Summer Analyst, Goldman Sachs", "") == "internship"

    def test_finance_summer_analyst_with_year_suffix(self):
        # "Summer 2025 Analyst"
        assert _classify("Summer 2025 Analyst – Equity Research", "") == "internship"

    def test_summer_fellow(self):
        assert _classify("Summer Fellow – Policy Research", "") == "internship"

    def test_summer_engineer(self):
        assert _classify("Summer Engineer, Product Infrastructure", "") == "internship"

    def test_rotational_analyst(self):
        assert _classify("Rotational Analyst Program – Finance", "") == "internship"

    def test_apprentice(self):
        assert _classify("Technology Apprentice", "") == "internship"

    def test_trainee(self):
        assert _classify("Accounting Trainee", "") == "internship"

    def test_analyst_detect_job_type(self):
        assert _detect_job_type("Summer Analyst – Investment Banking", "") == "internship"

    def test_associate_detect_job_type(self):
        assert _detect_job_type("Summer Associate, Private Equity", "") == "internship"


# ── Senior / exec disqualifiers ─────────────────────────────────────────────

class TestSeniorDisqualifiers:
    """Titles with senior/exec signals MUST NOT classify as internship or entry_level."""

    def test_senior_analyst_is_full_time(self):
        assert _classify("Senior Financial Analyst", "") == "full_time"

    def test_senior_software_engineer(self):
        assert _classify("Senior Software Engineer", "") == "full_time"

    def test_director_is_full_time(self):
        assert _classify("Director of Engineering", "") == "full_time"

    def test_vp_is_full_time(self):
        assert _classify("VP of Finance", "") == "full_time"

    def test_vice_president_is_full_time(self):
        assert _classify("Vice President, Investment Banking", "") == "full_time"

    def test_managing_director_is_full_time(self):
        # Common in banking — NOT an internship
        assert _classify("Managing Director, Equity Capital Markets", "") == "full_time"

    def test_lead_engineer_is_full_time(self):
        assert _classify("Lead Data Engineer", "") == "full_time"

    def test_principal_consultant(self):
        assert _classify("Principal Consultant", "") == "full_time"

    def test_staff_engineer(self):
        assert _classify("Staff Engineer", "") == "full_time"

    def test_head_of_product(self):
        assert _classify("Head of Product", "") == "full_time"

    def test_chief_of_staff(self):
        assert _classify("Chief of Staff", "") == "full_time"

    def test_senior_detect_job_type(self):
        assert _detect_job_type("Senior Financial Analyst", "") == "full_time"

    def test_vp_detect_job_type(self):
        assert _detect_job_type("VP of Marketing", "") == "full_time"

    def test_director_detect_job_type(self):
        assert _detect_job_type("Director, Human Resources", "") == "full_time"


# ── Entry-level detection ────────────────────────────────────────────────────

class TestEntryLevelDetection:
    """Titles that should classify as entry_level."""

    def test_junior_developer(self):
        assert _classify("Junior Software Developer", "") == "entry_level"

    def test_associate_analyst(self):
        # "Associate" without director/vp qualifier → entry_level
        assert _classify("Associate Analyst, Consulting", "") == "entry_level"

    def test_new_grad(self):
        assert _classify("New Grad Software Engineer", "") == "entry_level"

    def test_entry_level(self):
        assert _classify("Entry Level Data Analyst", "") == "entry_level"

    def test_graduate_engineer(self):
        assert _classify("Graduate Engineer – Technology", "") == "entry_level"

    def test_early_career(self):
        assert _classify("Early Career Financial Analyst", "") == "entry_level"

    def test_analyst_i(self):
        assert _classify("Analyst I, Corporate Finance", "") == "entry_level"

    def test_desc_experience_zero(self):
        # 0–2 years in description → entry_level
        assert _classify("Financial Analyst", "0-2 years of experience required.") == "entry_level"


# ── No false positives from description ─────────────────────────────────────

class TestDescriptionFalsePositives:
    """Senior description text should NOT reclassify a junior title."""

    def test_junior_title_senior_desc_stays_entry(self):
        # A junior role at a bank might say "you will work alongside our
        # Senior Analysts" in the description — still entry_level
        desc = "You will collaborate with Senior Directors and Managing Directors."
        result = _classify("Junior Analyst", desc)
        assert result == "entry_level"

    def test_intern_title_ignored_description_director(self):
        desc = "Reporting to the Director of Finance."
        assert _classify("Finance Intern", desc) == "internship"


# ── Part-time ────────────────────────────────────────────────────────────────

class TestPartTime:
    def test_part_time_basic(self):
        assert _classify("Part-Time Marketing Assistant", "") == "part_time"

    def test_part_time_no_hyphen(self):
        assert _classify("Part Time Tutor", "") == "part_time"


# ── Cross-cohort spot checks ─────────────────────────────────────────────────

class TestCrossCohortSpotChecks:
    """One internship pattern per underrepresented cohort."""

    def test_sport_intern(self):
        assert _classify("Sports Marketing Intern", "") == "internship"

    def test_nursing_summer(self):
        assert _classify("Summer Nursing Student Extern", "") == "internship"

    def test_legal_intern(self):
        assert _classify("Legal Intern – Compliance", "") == "internship"

    def test_design_intern(self):
        assert _classify("UX Design Intern", "") == "internship"

    def test_hr_summer_analyst(self):
        assert _classify("Summer Analyst – HR Advisory", "") == "internship"

    def test_education_teaching_fellow(self):
        assert _classify("Summer Teaching Fellow", "") == "internship"

    def test_accounting_coop(self):
        assert _classify("Accounting Co-op", "") == "internship"

    def test_policy_fellow(self):
        # "Policy Research Fellow" without "summer" is ambiguous — some
        # fellowships are year-round positions. Accept any plausible bucket.
        assert _classify("Policy Research Fellow", "") in ("internship", "entry_level", "full_time")

    def test_media_communications_intern(self):
        assert _classify("Communications Intern – PR", "") == "internship"

    def test_mechanical_eng_coop(self):
        assert _classify("Mechanical Engineering Co-op", "") == "internship"

    def test_data_science_summer_analyst(self):
        assert _classify("Summer Analyst – Data Science & Analytics", "") == "internship"

    def test_cybersecurity_intern(self):
        assert _classify("Cybersecurity Intern", "") == "internship"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
