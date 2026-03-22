"""
Lightweight eval harness for recruiter semantic matching.

Usage:
  python3 projects/meridian/scripts/recruiter_search_eval.py

This prints top-10 candidates for a few role descriptions with component scores.
Edit TEST_CASES to add expected emails (optional) for a crude precision@10 proxy.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
import sys

# Allow running as a script from repo root
_HERE = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_HERE, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)


@dataclass(frozen=True)
class TestCase:
    name: str
    role_description: str
    expected_emails: set[str]


TEST_CASES: list[TestCase] = [
    # Tech
    TestCase(
        name="AI_ML_Intern",
        role_description="Looking for a machine learning intern with Python, model training, and basic SQL. Bonus for NLP/LLMs.",
        expected_emails=set(),
    ),
    TestCase(
        name="Finance_Analyst",
        role_description="Finance analyst internship. Financial modeling, Excel, valuation, and reporting. Bonus: private equity exposure.",
        expected_emails=set(),
    ),
    TestCase(
        name="Software_Engineer_Intern",
        role_description="Software engineering intern. Must write code (Python or JavaScript), ship features, and collaborate in a team.",
        expected_emails=set(),
    ),
    # Pre-Health
    TestCase(
        name="PreHealth_Clinical_Assistant",
        role_description="Clinical assistant / scribe. Must have patient-facing experience, clinical exposure (shadowing/EMT), and strong communication. Bonus: research experience.",
        expected_emails=set(),
    ),
    TestCase(
        name="PreHealth_Research_Assistant",
        role_description="Undergraduate research assistant in a biology/chemistry lab. Must have lab experience, attention to detail, and ability to follow protocols. Bonus: statistics and data analysis.",
        expected_emails=set(),
    ),
    TestCase(
        name="PreHealth_PublicHealth_Intern",
        role_description="Public health internship focused on community outreach and research. Must have research and writing skills, and strong communication. Bonus: statistics, data analysis, Tableau.",
        expected_emails=set(),
    ),
    # Pre-Law
    TestCase(
        name="PreLaw_Legal_Intern",
        role_description="Legal intern. Must have writing, research, and interest in law/policy. Bonus: advocacy, public speaking, and client-facing experience.",
        expected_emails=set(),
    ),
    TestCase(
        name="PreLaw_Policy_Analyst_Intern",
        role_description="Policy analyst intern. Must have research, writing, and analytical skills; ability to synthesize evidence into memos. Bonus: public speaking and stakeholder communication.",
        expected_emails=set(),
    ),
    TestCase(
        name="PreLaw_Paralegal_Assistant",
        role_description="Paralegal assistant. Must be organized, detail-oriented, handle documents, and communicate with clients. Bonus: advocacy and strong writing.",
        expected_emails=set(),
    ),
    # Science
    TestCase(
        name="Science_Lab_Tech_Intern",
        role_description="Lab technician intern. Must have laboratory experience and research skills; follow protocols with attention to detail. Bonus: biochemistry or chemistry background.",
        expected_emails=set(),
    ),
    TestCase(
        name="Science_Data_Intern",
        role_description="Science data internship. Must have statistics, data analysis, and SQL. Bonus: Python and machine learning.",
        expected_emails=set(),
    ),
    TestCase(
        name="Science_Research_Coordinator",
        role_description="Research coordinator. Must have research experience, project management, and communication. Bonus: leadership and data analysis.",
        expected_emails=set(),
    ),
    # Business / Consulting
    TestCase(
        name="Business_Ops_Intern",
        role_description="Business operations intern. Must be analytical, strong in Excel, and comfortable with cross-functional project management. Bonus: data analysis and communication.",
        expected_emails=set(),
    ),
    TestCase(
        name="Consulting_Analyst_Intern",
        role_description="Consulting analyst intern. Must have analytical thinking, communication, and problem solving. Bonus: Excel, presentation skills, and leadership.",
        expected_emails=set(),
    ),
    TestCase(
        name="Consulting_Client_Success",
        role_description="Client success / associate. Must be client-facing with strong communication and collaboration. Bonus: project management and analytics.",
        expected_emails=set(),
    ),
    # Communications
    TestCase(
        name="Comms_PR_Intern",
        role_description="Public relations intern. Must have writing and communication skills; interest in PR/media. Bonus: journalism and presentation/public speaking.",
        expected_emails=set(),
    ),
    TestCase(
        name="Comms_Content_Intern",
        role_description="Content internship. Must have writing and communication, create content, and collaborate with teams. Bonus: marketing and analytics.",
        expected_emails=set(),
    ),
    TestCase(
        name="Comms_Marketing_Intern",
        role_description="Marketing intern. Must have communication and writing skills; interest in marketing and content. Bonus: data analysis, Excel, Tableau.",
        expected_emails=set(),
    ),
    # Education
    TestCase(
        name="Education_Teaching_Assistant",
        role_description="Teaching assistant. Must have teaching/tutoring experience, communication, and organization. Bonus: leadership and mentorship.",
        expected_emails=set(),
    ),
    TestCase(
        name="Education_Tutor",
        role_description="Tutor role. Must have tutoring/teaching and communication skills. Bonus: mentorship and leadership.",
        expected_emails=set(),
    ),
    TestCase(
        name="Education_Program_Coordinator",
        role_description="Program coordinator for an education nonprofit. Must have project management, communication, and organization. Bonus: volunteer experience and leadership.",
        expected_emails=set(),
    ),
    # Arts / Humanities
    TestCase(
        name="Arts_Graphic_Design_Intern",
        role_description="Graphic design intern. Must have graphic design skills and strong communication. Bonus: Figma and UI/UX experience.",
        expected_emails=set(),
    ),
    TestCase(
        name="Humanities_Research_Writing",
        role_description="Research and writing internship. Must have research and writing skills; synthesize sources into clear writing. Bonus: policy interest and public speaking.",
        expected_emails=set(),
    ),
    TestCase(
        name="Arts_UIUX_Intern",
        role_description="UI/UX design intern. Must have Figma and UI/UX fundamentals, strong communication, and collaboration. Bonus: research and analytical skills.",
        expected_emails=set(),
    ),
]


def main() -> None:
    from projects.dilly.api.recruiter_search import search

    for tc in TEST_CASES:
        print("\n" + "=" * 90)
        print(f"{tc.name}")
        print("- role_description:", tc.role_description[:220] + ("..." if len(tc.role_description) > 220 else ""))
        result = search(role_description=tc.role_description, limit=10, offset=0)
        candidates = result.get("candidates") or []
        total = int(result.get("total") or 0)
        if candidates:
            print("  extracted must_have_tags:", candidates[0].get("must_have_tags"))
            print("  extracted nice_to_have_tags:", candidates[0].get("nice_to_have_tags"))
        if total == 0:
            print("  (no candidates returned — check OPENAI_API_KEY / embedding availability and that memory/dilly_profiles has indexed candidates)")
        hits = 0
        for i, c in enumerate(candidates, start=1):
            email = (c.get("email") or "").strip().lower()
            if tc.expected_emails and email in tc.expected_emails:
                hits += 1
            print(
                f"{i:02d}. {c.get('name','—')}  <{email or '—'}>\n"
                f"    match={c.get('match_score')}  sem={c.get('semantic_score')}  "
                f"skill={c.get('skill_fit_score')}  must_q={c.get('must_have_quality')}  "
                f"mer={c.get('meridian_fit_score')}  fb={c.get('feedback_score')}\n"
                f"    majors={c.get('majors') or c.get('major')}  school={c.get('school_id')}  track={c.get('track')}\n"
            )
        if tc.expected_emails:
            print(f"precision@10 proxy: {hits}/{min(10, len(tc.expected_emails))} expected-in-top10")


if __name__ == "__main__":
    main()

