"""
Tests for the Dilly scoring engine: Smart, Grit, and Build scores.
"""
import pytest
from dilly_core.scoring import (
    ScoringSignals,
    compute_smart_score,
    compute_grit_score,
    compute_build_score,
)
from projects.dilly.api.cohort_scoring_weights import COHORT_SCORING_WEIGHTS


# ── Smart Score ───────────────────────────────────────────────────────────────


class TestComputeSmartScore:
    def test_basic_smart_score(self, sample_scoring_signals):
        score, evidence = compute_smart_score(sample_scoring_signals)
        assert isinstance(score, float)
        assert 0 <= score <= 100
        assert len(evidence) > 0

    def test_high_gpa_produces_higher_score(self):
        high = ScoringSignals(gpa=4.0, major="Data Science", honors_count=2, has_research=True,
                              quantifiable_impact_count=0, leadership_density=0, work_entry_count=0,
                              international_markers=False)
        low = ScoringSignals(gpa=2.5, major="Data Science", honors_count=0, has_research=False,
                             quantifiable_impact_count=0, leadership_density=0, work_entry_count=0,
                             international_markers=False)
        high_score, _ = compute_smart_score(high)
        low_score, _ = compute_smart_score(low)
        assert high_score > low_score

    def test_smart_score_deterministic(self, sample_scoring_signals):
        s1, e1 = compute_smart_score(sample_scoring_signals)
        s2, e2 = compute_smart_score(sample_scoring_signals)
        assert s1 == s2
        assert e1 == e2

    def test_smart_score_range_zero_gpa(self):
        signals = ScoringSignals(gpa=0.0, major="Unknown", honors_count=0, has_research=False,
                                 quantifiable_impact_count=0, leadership_density=0, work_entry_count=0,
                                 international_markers=False)
        score, _ = compute_smart_score(signals)
        assert 0 <= score <= 100

    def test_smart_score_with_minor_bonus(self):
        signals = ScoringSignals(gpa=3.5, major="Finance", honors_count=0, has_research=False,
                                 quantifiable_impact_count=0, leadership_density=0, work_entry_count=0,
                                 international_markers=False, has_minor=True, minor="Mathematics")
        score, evidence = compute_smart_score(signals)
        assert any("Minor" in e for e in evidence)


# ── Grit Score ────────────────────────────────────────────────────────────────


class TestComputeGritScore:
    def test_basic_grit_score(self, sample_scoring_signals):
        score, evidence = compute_grit_score(sample_scoring_signals)
        assert isinstance(score, (int, float))
        assert 0 <= score <= 100
        assert len(evidence) > 0

    def test_impact_and_leadership_increase_grit(self):
        strong = ScoringSignals(gpa=3.0, major="Marketing", honors_count=0, has_research=False,
                                quantifiable_impact_count=5, leadership_density=3, work_entry_count=4,
                                international_markers=False)
        weak = ScoringSignals(gpa=3.0, major="Marketing", honors_count=0, has_research=False,
                              quantifiable_impact_count=0, leadership_density=0, work_entry_count=0,
                              international_markers=False)
        strong_score, _ = compute_grit_score(strong)
        weak_score, _ = compute_grit_score(weak)
        assert strong_score > weak_score

    def test_grit_score_deterministic(self, sample_scoring_signals):
        s1, _ = compute_grit_score(sample_scoring_signals)
        s2, _ = compute_grit_score(sample_scoring_signals)
        assert s1 == s2


# ── Build Score ───────────────────────────────────────────────────────────────


class TestComputeBuildScore:
    def test_basic_build_score(self, sample_scoring_signals, sample_resume_text, sample_cohort_key):
        score, evidence = compute_build_score(
            sample_scoring_signals, sample_resume_text, cohort=sample_cohort_key
        )
        assert isinstance(score, float)
        assert 0 <= score <= 100
        assert len(evidence) > 0

    def test_build_score_varies_by_cohort(self, sample_scoring_signals, sample_resume_text):
        score_ds, _ = compute_build_score(
            sample_scoring_signals, sample_resume_text, cohort="data_science_analytics"
        )
        score_fin, _ = compute_build_score(
            sample_scoring_signals, sample_resume_text, cohort="finance_accounting"
        )
        # Different cohorts should give different scores for the same resume
        # (data-science keywords match data_science_analytics better)
        assert score_ds != score_fin

    def test_build_score_deterministic(self, sample_scoring_signals, sample_resume_text, sample_cohort_key):
        s1, _ = compute_build_score(sample_scoring_signals, sample_resume_text, cohort=sample_cohort_key)
        s2, _ = compute_build_score(sample_scoring_signals, sample_resume_text, cohort=sample_cohort_key)
        assert s1 == s2

    def test_empty_resume_text_still_produces_score(self, sample_scoring_signals):
        score, _ = compute_build_score(sample_scoring_signals, "", cohort="software_engineering_cs")
        assert 0 <= score <= 100


# ── Cohort Weights ────────────────────────────────────────────────────────────


class TestCohortWeights:
    def test_all_cohort_weights_sum_to_100(self):
        for key, cfg in COHORT_SCORING_WEIGHTS.items():
            total = cfg["smart"] + cfg["grit"] + cfg["build"]
            assert total == 100, f"Cohort {key} weights sum to {total}, expected 100"

    def test_recruiter_bar_in_range(self):
        for key, cfg in COHORT_SCORING_WEIGHTS.items():
            bar = cfg["recruiter_bar"]
            assert 50 <= bar <= 100, f"Cohort {key} recruiter_bar={bar} out of expected range"
