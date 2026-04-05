"""
Tests for the Dilly resume audit pipeline.

The audit pipeline extracts text, analyzes content, and produces
Smart/Grit/Build scores plus metadata.
"""
import pytest
from projects.dilly.dilly_resume_auditor import DillyResumeAuditor


class TestAuditPipeline:
    """Test analyze_content with injected resume text (no file I/O)."""

    def _run_audit(self, text: str) -> dict:
        """Helper: create an auditor, inject raw_text, and analyze."""
        auditor = DillyResumeAuditor("/dev/null")
        auditor.raw_text = text
        return auditor.analyze_content()

    def test_all_three_dimensions_returned(self, sample_resume_text):
        result = self._run_audit(sample_resume_text)
        metrics = result["metrics"]
        assert "smart_score" in metrics
        assert "grit_score" in metrics
        assert "build_score" in metrics

    def test_scores_are_numeric(self, sample_resume_text):
        result = self._run_audit(sample_resume_text)
        for key in ("smart_score", "grit_score", "build_score"):
            score = result["metrics"][key]
            assert isinstance(score, (int, float)), f"{key} is not numeric: {type(score)}"

    def test_scores_in_range(self, sample_resume_text):
        result = self._run_audit(sample_resume_text)
        for key in ("smart_score", "grit_score", "build_score"):
            score = result["metrics"][key]
            assert 0 <= score <= 100, f"{key}={score} out of range"

    def test_metadata_present(self, sample_resume_text):
        result = self._run_audit(sample_resume_text)
        meta = result["metadata"]
        assert "candidate" in meta
        assert "major" in meta
        assert "track" in meta

    def test_candidate_name_extracted(self, sample_resume_text):
        result = self._run_audit(sample_resume_text)
        assert result["metadata"]["candidate"] == "Jane Doe"

    def test_major_extracted(self, sample_resume_text):
        result = self._run_audit(sample_resume_text)
        major = result["metadata"]["major"]
        assert major != "Unknown", f"Major should be detected, got {major}"

    def test_deterministic(self, sample_resume_text):
        r1 = self._run_audit(sample_resume_text)
        r2 = self._run_audit(sample_resume_text)
        assert r1["metrics"] == r2["metrics"]

    def test_minimal_resume_still_produces_scores(self):
        minimal = "John Smith\njohn@test.com\n\nEducation\nState University, B.A. English, 2027\n"
        result = self._run_audit(minimal)
        metrics = result["metrics"]
        assert all(k in metrics for k in ("smart_score", "grit_score", "build_score"))
