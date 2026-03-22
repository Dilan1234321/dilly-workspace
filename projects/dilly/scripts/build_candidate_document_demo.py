#!/usr/bin/env python3
"""
See the candidate document builder in action.

Run with no args → uses sample data so you see the output immediately.
Run with an email → uses that user's profile + latest audit (if any) from Meridian storage.

Run from the workspace root (the folder that contains 'projects/'):

  python3 projects/meridian/scripts/build_candidate_document_demo.py
  python3 projects/meridian/scripts/build_candidate_document_demo.py your@email.edu

If you're already in projects/meridian/dashboard/, run:

  python3 ../scripts/build_candidate_document_demo.py
"""

import sys
import os

# So we can import from api and dilly_core (script is in projects/meridian/scripts/)
_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from dilly_core.candidate_document import (
    build_candidate_document,
    build_candidate_document_parts,
    TOTAL_CHAR_CAP,
)
from dilly_core.skill_tags import extract_skill_tags


def sample_data():
    """Fake profile + audit so you can run with no setup."""
    profile = {
        "name": "Jordan Lee",
        "major": "Computer Science",
        "majors": ["Computer Science", "Mathematics"],
        "career_goal": "Software engineer at a product company",
        "application_target": "internship",
    }
    audit = {
        "candidate_name": "Jordan Lee",
        "major": "Computer Science",
        "detected_track": "Tech",
        "scores": {"smart": 78, "grit": 72, "build": 65},
        "final_score": 72,
        "dilly_take": "Strong academic and leadership signals; add one more technical project to raise Build.",
        "audit_findings": [
            "GPA and coursework show strong Smart signal.",
            "Leadership in campus orgs and event planning support Grit.",
            "One solid internship; a side project or second experience would strengthen Build.",
        ],
        "evidence_quotes": {
            "smart": "3.8 GPA, Dean's List, Data Structures, Algorithms",
            "grit": "Led 5-person team for hackathon; increased membership 40%",
            "build": "Summer dev internship at local startup; built internal dashboard",
        },
        "recommendations": [
            {"text": "Add a second technical project (GitHub or coursework) with 2–3 outcome bullets."},
            {"text": "Quantify the hackathon outcome (e.g. users, impact)."},
            {"text": "Add one more leadership or ownership bullet to experience."},
        ],
    }
    resume_text = """[EDUCATION]
University of Example, B.S. Computer Science, expected May 2026
GPA 3.8, Dean's List, Relevant: Data Structures, Algorithms, Linear Algebra

[PROFESSIONAL EXPERIENCE]
Software Dev Intern, Local Startup, Summer 2025
• Built internal dashboard used by 12 team members; reduced manual reporting by 50%
• Wrote Python scripts for data pipeline; documented in Confluence

[CAMPUS INVOLVEMENT]
Tech Club VP, 2024–present
• Led 5-person team for annual hackathon; 40% increase in participation
• Coordinate weekly workshops on web dev and interview prep"""
    return profile, audit, resume_text


def main():
    email = (sys.argv[1].strip().lower() if len(sys.argv) > 1 else "").strip()

    if not email:
        print("Using sample data (no email provided).\n")
        profile, audit, resume_text = sample_data()
    else:
        try:
            from projects.dilly.api.profile_store import get_profile
            from projects.dilly.api.audit_history import get_audits
            profile = get_profile(email)
            audits = get_audits(email)
            audit = audits[0] if audits else None
            resume_text = None
            # Try to load parsed resume for this user (by email key)
            try:
                from dilly_core.structured_resume import read_parsed_resume, get_parsed_resumes_dir
                import hashlib
                uid = hashlib.sha256(email.encode()).hexdigest()[:16]
                _dir = get_parsed_resumes_dir()
                if _dir and os.path.isdir(_dir):
                    for f in os.listdir(_dir):
                        if uid in f or email.replace("@", "_") in f:
                            path = os.path.join(_dir, f)
                            if os.path.isfile(path):
                                resume_text = read_parsed_resume(path)
                                break
            except Exception:
                pass
            if not profile and not audit:
                print("No profile or audit found for that email. Using sample data instead.\n")
                profile, audit, resume_text = sample_data()
            else:
                profile = profile or {}
                audit = audit or {}
                print(f"Loaded profile + audit for {email}\n")
        except Exception as e:
            print(f"Could not load data for {email}: {e}\nUsing sample data.\n")
            profile, audit, resume_text = sample_data()

    # Build and print
    doc = build_candidate_document(profile, audit, resume_text)
    parts = build_candidate_document_parts(profile, audit, resume_text)
    # Skill tags (no parsed resume in sample, so from audit only)
    skill_tags = extract_skill_tags(parsed_resume=None, audit=audit, profile=profile)

    print("=" * 60)
    print("CANDIDATE DOCUMENT (this is what we embed for semantic search)")
    print("=" * 60)
    print(doc)
    print()
    print("=" * 60)
    print("PARTS (resume_summary, audit_summary)")
    print("=" * 60)
    print("--- resume_summary ---")
    print(parts["resume_summary"])
    print()
    print("--- audit_summary ---")
    print(parts["audit_summary"])
    print()
    print("--- skill_tags ---")
    print(skill_tags if skill_tags else "(none)")
    print()
    print(f"Total document length: {len(doc)} chars")
    # Quality bar: doc must be bounded and non-empty when we have data
    if doc and (profile or audit):
        assert len(doc) <= TOTAL_CHAR_CAP, f"Document exceeds cap ({len(doc)} > {TOTAL_CHAR_CAP})"
        assert doc != "No profile or audit data.", "Expected content when profile or audit present"
    # Skill tags quality: list, no None/junk; sample data must yield known tags
    assert isinstance(skill_tags, list), "skill_tags must be a list"
    assert all(isinstance(t, str) and t.strip() for t in skill_tags), "skill_tags must be non-empty strings"
    if audit and audit.get("detected_track"):
        assert any("Tech" in t or "Pre-Health" in t or "Leadership" in t or t == audit.get("detected_track", "").strip() for t in skill_tags), "Audit with track/findings should yield at least one known tag"
    print("(Quality checks: length cap OK, content present, skill_tags valid)")


if __name__ == "__main__":
    main()
