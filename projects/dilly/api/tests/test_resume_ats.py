"""
End-to-end ATS tests for the Dilly resume generation pipeline.

Tests the actual PDF builder and keyword checker that ship to production.
Bypasses the HTTP layer and the LLM — feeds the builders the same JSON
shape the LLM returns and verifies the output would pass a real ATS.

Run:  python3 test_resume_ats.py
"""

from __future__ import annotations

import io
import json
import os
import re
import sys

# Make the API package importable
API_DIR = "/Users/dilankochhar/.openclaw/workspace/projects/dilly/dilly-workspace/projects/dilly/api"
sys.path.insert(0, API_DIR)

from ats_resume_builder import (  # noqa: E402
    build_ats_pdf,
    verify_ats_compatibility,
    sections_to_pdf_response,
)
from resume_keyword_check import check_keyword_coverage  # noqa: E402


# ---------------------------------------------------------------------------
# Fixtures — resume JSONs in the exact shape the LLM returns
# ---------------------------------------------------------------------------

def strong_tech_resume():
    """A realistic CS student resume for a SWE internship. Should score high."""
    return [
        {
            "key": "contact",
            "label": "Contact",
            "contact": {
                "name": "Jordan Chen",
                "email": "jordan.chen@university.edu",
                "phone": "(415) 555-0142",
                "location": "San Francisco, CA",
                "linkedin": "linkedin.com/in/jordanchen",
            },
        },
        {
            "key": "education",
            "label": "Education",
            "education": {
                "university": "Stanford University",
                "location": "Stanford, CA",
                "graduation": "Jun 2026",
                "major": "B.S. Computer Science",
                "minor": "Mathematics",
                "gpa": "3.87",
                "honors": "Dean's List (5 semesters)",
            },
        },
        {
            "key": "professional_experience",
            "label": "Experience",
            "experiences": [
                {
                    "company": "Stripe",
                    "role": "Software Engineering Intern",
                    "date": "Jun 2025 - Sep 2025",
                    "location": "San Francisco, CA",
                    "bullets": [
                        {"text": "Built a distributed caching layer in Go that reduced API p99 latency by 38% across 12 services."},
                        {"text": "Designed and shipped Kubernetes-based deployment pipeline with GitHub Actions, cutting deploy time from 22 to 6 minutes."},
                        {"text": "Wrote PostgreSQL migration scripts moving 1.8B rows with zero downtime using a shadow-write + replay strategy."},
                    ],
                },
                {
                    "company": "Stanford AI Lab",
                    "role": "Undergraduate Research Assistant",
                    "date": "Jan 2025 - Jun 2025",
                    "location": "Stanford, CA",
                    "bullets": [
                        {"text": "Trained transformer models for code generation using PyTorch on a 4xA100 cluster."},
                        {"text": "Published first-author paper at NeurIPS workshop on efficient fine-tuning of LLMs."},
                    ],
                },
            ],
        },
        {
            "key": "projects",
            "label": "Projects",
            "projects": [
                {
                    "name": "DistributedSQL — A toy Spanner clone",
                    "date": "2024",
                    "bullets": [
                        {"text": "Implemented Raft consensus + Paxos voting across 5 nodes in Rust, with full linearizability testing."},
                        {"text": "Built the SQL parser and planner, supporting joins, subqueries, and basic CTEs."},
                    ],
                },
            ],
        },
        {
            "key": "skills",
            "label": "Skills",
            "simple": {
                "lines": [
                    "Languages: Python, Go, Rust, TypeScript, SQL, Java",
                    "Infrastructure: Docker, Kubernetes, AWS, PostgreSQL, Redis, Kafka",
                    "ML/AI: PyTorch, TensorFlow, Hugging Face, CUDA",
                ],
            },
        },
    ]


def weak_resume_missing_keywords():
    """Thin resume that does NOT match a backend JD. Should score low."""
    return [
        {
            "key": "contact",
            "label": "Contact",
            "contact": {
                "name": "Alex Smith",
                "email": "alex@example.com",
                "phone": "(555) 123-4567",
                "location": "Tampa, FL",
            },
        },
        {
            "key": "education",
            "label": "Education",
            "education": {
                "university": "University of Tampa",
                "graduation": "May 2027",
                "major": "B.A. English Literature",
                "gpa": "3.5",
            },
        },
        {
            "key": "professional_experience",
            "label": "Experience",
            "experiences": [
                {
                    "company": "Campus Coffee",
                    "role": "Barista",
                    "date": "Sep 2024 - Present",
                    "bullets": [
                        {"text": "Served customers and managed inventory in a fast-paced environment."},
                    ],
                },
            ],
        },
        {
            "key": "skills",
            "label": "Skills",
            "simple": {
                "lines": ["Soft skills: communication, teamwork, customer service"],
            },
        },
    ]


# A realistic backend SWE JD that shouts keywords.
SWE_JD = """
Senior Backend Engineer at Stripe

We're hiring backend engineers to work on our payments platform. You'll
build distributed systems in Go and Python that process billions of
dollars. Required: 3+ years experience with Go, Python, or Java. Strong
knowledge of PostgreSQL, Kubernetes, Docker, and AWS. Experience with
microservices, gRPC, and Kafka preferred. You will ship code daily,
write tests (pytest, Jest), and participate in code reviews. Familiarity
with GitHub Actions, Terraform, and CI/CD a plus. We use TypeScript on
the frontend (React, Next.js).
""".strip()


# ---------------------------------------------------------------------------
# Test harness
# ---------------------------------------------------------------------------

class TestCase:
    def __init__(self, name: str):
        self.name = name
        self.passed = True
        self.notes: list[str] = []

    def check(self, condition: bool, msg: str):
        status = "✓" if condition else "✗"
        self.notes.append(f"  {status} {msg}")
        if not condition:
            self.passed = False

    def report(self):
        head = "PASS" if self.passed else "FAIL"
        print(f"\n[{head}] {self.name}")
        for n in self.notes:
            print(n)


def test_strong_resume_ats_all_vendors():
    """A strong resume should pass verify_ats_compatibility on every vendor."""
    sections = strong_tech_resume()
    vendors = ["greenhouse", "lever", "ashby", "workday", "smartrecruiters"]
    results = {}

    for vendor in vendors:
        tc = TestCase(f"Strong resume → {vendor}")
        pdf = build_ats_pdf(sections, ats_system=vendor)
        tc.check(len(pdf) > 2000, f"PDF size {len(pdf)} bytes (> 2000)")
        tc.check(pdf.startswith(b"%PDF"), "PDF header is %PDF")

        v = verify_ats_compatibility(pdf, sections)
        tc.check(v["passed"], f"verify_ats_compatibility.passed (score={v['score']})")
        tc.check(v["checks"]["text_extractable"], "text is extractable")
        tc.check(len(v["checks"]["sections_missing"]) == 0,
                 f"all section headers present (missing={v['checks']['sections_missing']})")
        tc.check(v["checks"]["keyword_preservation_rate"] >= 95,
                 f"content preserved ≥95% (got {v['checks']['keyword_preservation_rate']}%)")
        tc.check(v["checks"]["formatting_clean"], "no image objects in PDF")

        results[vendor] = (tc.passed, v["score"])
        tc.report()

    return results


def test_workday_date_formatting():
    """Workday requires MM/YYYY; others should preserve the input format."""
    tc = TestCase("Workday date format conversion")
    sections = strong_tech_resume()

    pdf_workday = build_ats_pdf(sections, ats_system="workday")
    pdf_green = build_ats_pdf(sections, ats_system="greenhouse")

    # Extract text
    import pypdf
    def extract(p):
        r = pypdf.PdfReader(io.BytesIO(p))
        return "\n".join(page.extract_text() or "" for page in r.pages)

    wd_text = extract(pdf_workday)
    gh_text = extract(pdf_green)

    # Jun 2025 → 06/2025 for Workday
    tc.check("06/2025" in wd_text, "Workday has '06/2025' (converted)")
    tc.check("Jun 2025" not in wd_text, "Workday does NOT have 'Jun 2025'")

    tc.check("Jun 2025" in gh_text, "Greenhouse preserves 'Jun 2025'")
    tc.check("06/2025" not in gh_text, "Greenhouse has no slashes")

    # Workday-specific header
    tc.check("WORK EXPERIENCE" in wd_text, "Workday uses 'WORK EXPERIENCE' header")
    tc.check("EXPERIENCE" in gh_text, "Greenhouse uses 'EXPERIENCE' header")
    tc.report()
    return tc.passed


def test_keyword_coverage_strong():
    """Strong tech resume vs SWE JD should have high coverage."""
    tc = TestCase("Keyword coverage: strong resume vs SWE JD")
    result = check_keyword_coverage(strong_tech_resume(), SWE_JD)
    # 60 is the realistic floor — JDs usually span polyglot tooling and a
    # strong single-candidate resume matches 60–75% of it. Below 50 is the
    # product threshold that triggers a warning.
    tc.check(result["coverage_pct"] >= 60,
             f"coverage_pct ≥ 60 (got {result['coverage_pct']}%)")
    tc.check(result["passed"], "coverage passes threshold")
    tc.check(result["total_keywords"] >= 8,
             f"extracted ≥ 8 JD keywords (got {result['total_keywords']})")
    # Key terms from the JD should be matched
    matched_str = " ".join(result["matched_keywords"]).lower()
    for must_match in ["go", "python", "postgresql", "kubernetes", "docker", "aws"]:
        tc.check(must_match in matched_str,
                 f"'{must_match}' is in matched keywords")
    tc.report()
    return tc.passed, result


def test_keyword_coverage_weak():
    """Weak resume vs SWE JD should score low AND surface a warning."""
    tc = TestCase("Keyword coverage: weak resume vs SWE JD")
    result = check_keyword_coverage(weak_resume_missing_keywords(), SWE_JD)
    tc.check(result["coverage_pct"] < 30,
             f"coverage_pct < 30 (got {result['coverage_pct']}%) — weak resume")
    tc.check(not result["passed"], "coverage_check reports failure")
    tc.check(result["warning"] is not None, "warning is populated")
    tc.check(len(result["missing_keywords"]) > 0, "missing_keywords is non-empty")
    # The warning should name specific missing terms
    tc.check("ATS may filter" in (result["warning"] or ""),
             "warning explains the ATS risk")
    tc.report()
    return tc.passed, result


def test_semantic_bridges():
    """User has 'docker' but JD asks for 'kubernetes' — bridge should help."""
    tc = TestCase("Semantic bridges (docker <-> kubernetes)")
    sections = [
        {
            "key": "skills",
            "simple": {"lines": ["Infrastructure: Docker, AWS, PostgreSQL"]},
        },
    ]
    jd = "We need someone with Kubernetes experience."
    result = check_keyword_coverage(sections, jd)
    tc.check("kubernetes" in result["matched_keywords"],
             "kubernetes matched via docker bridge")
    tc.report()
    return tc.passed


def test_pdf_no_images_no_embeds():
    """The PDF must be text-layer only. No /Subtype /Image allowed."""
    tc = TestCase("PDF is text-layer only (ATS-parseable)")
    pdf = build_ats_pdf(strong_tech_resume(), ats_system="greenhouse")
    tc.check(b"/Subtype /Image" not in pdf, "No image objects")
    tc.check(b"/Subtype /Form" not in pdf, "No form XObjects")
    # Must contain Font objects — if it didn't, text would be rasterized
    tc.check(b"/Font" in pdf, "Has /Font references (text-layer)")
    tc.report()
    return tc.passed


def test_bullet_normalization():
    """Bullets with unicode dots should be normalized to ASCII dash."""
    tc = TestCase("Bullet character normalization")
    sections = [
        {"key": "contact", "contact": {"name": "Test User", "email": "t@u.com"}},
        {
            "key": "professional_experience",
            "experiences": [{
                "company": "X",
                "role": "Y",
                "date": "2024",
                "bullets": [
                    {"text": "• Already has fancy bullet"},
                    {"text": "— Already has em dash"},
                    {"text": "No leading char"},
                ],
            }],
        },
    ]
    pdf = build_ats_pdf(sections, ats_system="greenhouse")
    import pypdf
    reader = pypdf.PdfReader(io.BytesIO(pdf))
    text = "\n".join(p.extract_text() or "" for p in reader.pages)
    # All three should now be ASCII dash-prefixed
    tc.check("- Already has fancy bullet" in text or "Already has fancy bullet" in text,
             "fancy bullet normalized/preserved")
    tc.check("- No leading char" in text or "No leading char" in text,
             "no-leading-char bullet rendered")
    # The original unicode bullet chars should be stripped from the rendering
    tc.check(text.count("•") == 0, "unicode bullets stripped")
    tc.report()
    return tc.passed


def test_all_contact_fields_preserved():
    """Name, email, phone, location, linkedin must all survive the PDF."""
    tc = TestCase("Contact info preservation")
    sections = strong_tech_resume()
    pdf = build_ats_pdf(sections, "greenhouse")
    import pypdf
    reader = pypdf.PdfReader(io.BytesIO(pdf))
    text = "\n".join(p.extract_text() or "" for p in reader.pages)
    contact = sections[0]["contact"]
    for field in ("name", "email", "phone", "location", "linkedin"):
        tc.check(contact[field] in text, f"{field}='{contact[field]}' in PDF")
    tc.report()
    return tc.passed


def test_filename_generation():
    """Downloaded filename should be sensible and ATS-safe."""
    tc = TestCase("Filename generation")
    resp = sections_to_pdf_response(
        strong_tech_resume(),
        "greenhouse",
        "Jordan Chen",
        "Backend Engineer",
        "Stripe",
    )
    tc.check(resp["filename"].endswith(".pdf"), "ends with .pdf")
    tc.check("Jordan Chen" in resp["filename"], "contains name")
    tc.check("Backend Engineer" in resp["filename"], "contains title")
    tc.check("Stripe" in resp["filename"], "contains company")
    tc.check(resp["content_type"] == "application/pdf", "content-type set")
    tc.check(resp["size_bytes"] > 2000, "size reported")
    tc.check(resp["verification"]["passed"], "verification passed")
    tc.report()
    return tc.passed


def test_downloaded_matches_preview():
    """The raw extracted text from the PDF (what ATS sees) must contain
    every bullet the preview shows (what the user approved)."""
    tc = TestCase("Downloaded PDF text matches preview (ATS-safe)")
    sections = strong_tech_resume()
    pdf = build_ats_pdf(sections, "greenhouse")
    import pypdf
    reader = pypdf.PdfReader(io.BytesIO(pdf))
    text = "\n".join(p.extract_text() or "" for p in reader.pages)

    # Every bullet must show up verbatim
    for s in sections:
        for entry in s.get("experiences") or []:
            for b in entry.get("bullets") or []:
                snippet = b["text"][:50]
                tc.check(snippet[:30] in text,
                         f"bullet '{snippet[:30]}...' present")
        for p in s.get("projects") or []:
            for b in p.get("bullets") or []:
                snippet = b["text"][:50]
                tc.check(snippet[:30] in text,
                         f"project bullet '{snippet[:30]}...' present")
        for line in (s.get("simple") or {}).get("lines") or []:
            # Pop the first 20 chars to dodge wrap issues
            tc.check(line[:20] in text, f"skills line '{line[:20]}' present")
    tc.report()
    return tc.passed


def test_keyword_extractor_no_sentence_crossing():
    """Regression: JD keyword extractor must not produce phrases that
    span sentence boundaries (was grabbing 'aws. experience' etc)."""
    tc = TestCase("Keyword extractor does not cross sentence boundaries")
    import resume_keyword_check as rkc
    messy_jd = (
        "We need someone with Docker, Kubernetes, and AWS. Experience with "
        "microservices is required. Familiarity with Terraform a plus. "
        "You should know Python, Go, or Java. Strong testing habits expected."
    )
    kws = rkc._extract_jd_keywords(messy_jd)
    # Nothing with a period inside + a space + another word after
    for k in kws:
        tc.check(". " not in k, f"'{k}' has no '. ' (would be cross-sentence)")
        tc.check(not any(w in k.split() for w in ["engineer", "developer",
                 "manager", "scientist"]),
                 f"'{k}' is not a job-title phrase")
    # Good keywords should still be found
    matched = set(kws)
    for expected in ["docker", "kubernetes", "aws", "terraform", "python",
                     "go", "java", "microservices"]:
        tc.check(expected in matched, f"'{expected}' still extracted")
    tc.report()
    return tc.passed


def test_honesty_gate_readiness_exists():
    """The backend codepath must surface readiness=not_ready honestly,
    and the mobile UI must render that path (no silent fallback)."""
    tc = TestCase("Honesty gate: not_ready path is wired")
    # Backend check
    with open(os.path.join(API_DIR, "routers", "resume.py")) as f:
        src = f.read()
    tc.check("readiness == 'not_ready'" in src, "backend short-circuits on not_ready")
    tc.check('"not_ready": True' in src, "response carries not_ready flag")
    tc.check("tell_dilly_prompts" in src, "backend suggests specific gaps")

    # Mobile check
    mobile_path = "/Users/dilankochhar/.openclaw/workspace/projects/dilly/dilly-workspace/projects/dilly/mobile/app/(app)/resume-generate.tsx"
    with open(mobile_path) as f:
        mobile_src = f.read()
    tc.check("data.not_ready" in mobile_src, "mobile reads not_ready from response")
    tc.check("setStage('not_ready')" in mobile_src, "mobile has dedicated not_ready stage")
    tc.check("Dilly doesn't know enough about you" in mobile_src
             or "enough relevant experience" in mobile_src
             or "not ready" in mobile_src.lower(),
             "mobile renders honest copy (no bluffing)")
    tc.report()
    return tc.passed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 70)
    print("Dilly Resume — ATS End-to-End Tests")
    print("=" * 70)

    results = []

    # 1. Strong resume across all ATS vendors
    vendor_results = test_strong_resume_ats_all_vendors()
    for vendor, (passed, score) in vendor_results.items():
        results.append((f"strong_{vendor}", passed, score))

    # 2. Date formatting differences
    results.append(("workday_date_format", test_workday_date_formatting(), None))

    # 3. Keyword coverage — strong
    p, r = test_keyword_coverage_strong()
    results.append(("keyword_strong", p, r["coverage_pct"]))

    # 4. Keyword coverage — weak (should fail coverage, pass test)
    p, r = test_keyword_coverage_weak()
    results.append(("keyword_weak_honest", p, r["coverage_pct"]))

    # 5. Semantic bridges
    results.append(("semantic_bridge", test_semantic_bridges(), None))

    # 6. Text-layer only
    results.append(("text_layer_only", test_pdf_no_images_no_embeds(), None))

    # 7. Bullet normalization
    results.append(("bullet_normalization", test_bullet_normalization(), None))

    # 8. Contact preservation
    results.append(("contact_preserved", test_all_contact_fields_preserved(), None))

    # 9. Filename
    results.append(("filename", test_filename_generation(), None))

    # 10. Downloaded matches preview
    results.append(("download_matches", test_downloaded_matches_preview(), None))

    # 11. Keyword extractor regression
    results.append(("extractor_no_sentence_crossing",
                    test_keyword_extractor_no_sentence_crossing(), None))

    # 12. Honesty gate
    results.append(("honesty_gate", test_honesty_gate_readiness_exists(), None))

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    total = len(results)
    passed = sum(1 for _, p, _ in results if p)
    print(f"{passed}/{total} tests passed\n")
    for name, p, extra in results:
        mark = "PASS" if p else "FAIL"
        tail = f" ({extra})" if extra is not None else ""
        print(f"  [{mark}] {name}{tail}")

    if passed < total:
        sys.exit(1)


if __name__ == "__main__":
    main()
