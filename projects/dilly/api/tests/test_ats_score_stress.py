"""
Stress-test the ATS parse verifier against "realistic messy" resumes
that previously scored ~85. Target: every realistic resume scores
>= 95, most score 100.

Runs directly (no pytest needed): python3 test_ats_score_stress.py
"""
from __future__ import annotations

import os
import sys

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, API_DIR)

from ats_resume_builder import build_ats_pdf, verify_ats_compatibility  # noqa: E402


def _resume(name, email, bullets):
    """Build a plausible resume JSON with the given bullets."""
    return [
        {"key": "contact", "label": "Contact", "contact": {
            "name": name, "email": email, "phone": "(555) 123-4567",
            "location": "San Francisco, CA", "linkedin": "linkedin.com/in/x",
        }},
        {"key": "education", "label": "Education", "education": {
            "university": "Stanford University",
            "location": "Stanford, CA",
            "graduation": "Jun 2026",
            "major": "B.S. Computer Science",
            "gpa": "3.85",
        }},
        {"key": "professional_experience", "label": "Experience", "experiences": [{
            "company": "Stripe", "role": "Software Engineering Intern",
            "date": "Jun 2025 - Sep 2025", "location": "San Francisco, CA",
            "bullets": [{"text": b} for b in bullets],
        }]},
        {"key": "skills", "label": "Skills", "simple": {"lines": [
            "Languages: Python, Go, SQL, TypeScript",
            "Infrastructure: Docker, Kubernetes, AWS, PostgreSQL",
        ]}},
    ]


def stress_case(name: str, sections: list[dict]) -> tuple[str, int, list[str]]:
    pdf = build_ats_pdf(sections, "greenhouse")
    v = verify_ats_compatibility(pdf, sections)
    return name, v["score"], v.get("issues") or []


# Realistic messy cases that commonly score < 95 on the old verifier:

CASES = [
    ("long-bullet-wraps", _resume(
        "Jordan Chen", "jordan@stanford.edu",
        [
            # Long bullets that will wrap mid-phrase in ReportLab
            "Designed and shipped a Kubernetes-based deployment pipeline with GitHub Actions that cut deploy time from 22 minutes to 6 minutes across 12 production services.",
            "Implemented a distributed caching layer in Go using Redis Cluster that reduced p99 API latency by 38% and saved roughly $240k per year in database provisioning costs.",
            "Wrote the PostgreSQL migration scripts moving 1.8 billion rows with zero downtime using a shadow-write and replay strategy coordinated with the data platform team.",
        ],
    )),
    ("unicode-punctuation", _resume(
        "Jane O'Brien", "jane@example.com",
        [
            "Led the team's migration to a microservices architecture — reducing p95 latency by 45%.",
            "Published first-author paper titled \u201cEfficient fine-tuning of LLMs\u201d at NeurIPS workshop.",
            "Collaborated with don't-break-prod rotation on-call to close 22 incidents in Q3.",
        ],
    )),
    ("bullet-with-prefix-glyphs", _resume(
        "Alex Park", "alex@test.io",
        [
            "\u2022 Already has fancy bullet at the start",  # • prefix
            "\u2013 Em dash prefix style",
            "Normal bullet, no prefix glyph, just plain text flowing to end.",
        ],
    )),
    ("parens-and-numbers", _resume(
        "Sam Lee", "sam@example.com",
        [
            "Grew MAU from 12k (Jan 2024) to 340k (Dec 2024), a 28x increase in 12 months.",
            "Shipped 7 major features (auth, billing, invites, SSO, audit log, exports, API) in 14 sprints.",
            "Reduced infra cost by $180k/yr (from $600k to $420k) via right-sizing + reserved instances.",
        ],
    )),
    ("realistic-SWE-intern", _resume(
        "Taylor Kim", "taylor@ucla.edu",
        [
            "Built end-to-end ML pipeline for anomaly detection using PyTorch and Kafka streaming.",
            "Refactored legacy REST endpoints to gRPC, reducing payload sizes 60% and p50 latency 25%.",
            "Authored internal RFC adopted by 4 teams for handling distributed tracing in Go services.",
            "Mentored 2 early-career engineers on code review practices and incident response.",
        ],
    )),
]


def main():
    print("=" * 70)
    print("ATS parse score stress test")
    print("target: every case scores >= 95")
    print("=" * 70)

    fails = 0
    for name, score, issues in (stress_case(n, s) for n, s in CASES):
        status = "✓" if score >= 95 else "✗"
        print(f"{status} {name:30} score={score}")
        if score < 95:
            fails += 1
            for i in issues[:3]:
                print(f"     - {i}")

    print()
    if fails == 0:
        print(f"ALL {len(CASES)} cases scored >= 95")
    else:
        print(f"{fails}/{len(CASES)} cases scored < 95")
        sys.exit(1)


if __name__ == "__main__":
    main()
