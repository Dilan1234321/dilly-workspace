"""
Shared fixtures for the Dilly test suite.
"""
import os
import sys
import pytest

# Ensure project root is on sys.path so imports like dilly_core.scoring work.
_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_TESTS_DIR, ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


@pytest.fixture
def sample_resume_text() -> str:
    """A realistic resume text for testing ATS and audit pipelines."""
    return (
        "Jane Doe\n"
        "janedoe@email.com | (555) 123-4567 | linkedin.com/in/janedoe\n\n"
        "Education\n"
        "University of Tampa — B.S. Data Science, Minor in Finance\n"
        "GPA: 3.72 | Dean's List | Expected May 2027\n\n"
        "Experience\n"
        "Data Science Intern — Stripe | May 2026 – Aug 2026\n"
        "• Built a churn-prediction model using Python and scikit-learn, reducing churn by 12%\n"
        "• Automated weekly KPI dashboards in Tableau, saving 5 hours/week\n\n"
        "Research Assistant — University of Tampa | Jan 2025 – Present\n"
        "• Conducted NLP sentiment analysis on 50,000 tweets using BERT\n"
        "• Co-authored poster presented at ACM undergraduate research conference\n\n"
        "Skills\n"
        "Python, SQL, R, Pandas, Scikit-learn, TensorFlow, Tableau, Git, AWS, Docker\n\n"
        "Projects\n"
        "• Personal finance tracker — deployed on Vercel, 200+ monthly users\n"
        "• Kaggle competition — top 8% in Titanic survival prediction\n"
    )


@pytest.fixture
def sample_scoring_signals():
    """A set of ScoringSignals for testing the scoring engine."""
    from dilly_core.scoring import ScoringSignals

    return ScoringSignals(
        gpa=3.72,
        major="Data Science",
        honors_count=1,
        has_research=True,
        quantifiable_impact_count=3,
        leadership_density=1,
        work_entry_count=2,
        international_markers=False,
        has_minor=True,
        minor="Finance",
        deployed_app_or_live_link=True,
        hackathon_mention=False,
        recognized_tech_employer=True,
    )


@pytest.fixture
def sample_cohort_key() -> str:
    """A cohort key for testing cohort-aware scoring."""
    return "data_science_analytics"
