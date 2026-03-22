#!/usr/bin/env python3
"""
Smoke test: sign-in → upload → audit → results → PDF → share.
Uses TestClient and real auth store; runs one real PDF from assets/resumes.
Run from workspace root: python projects/meridian/scripts/smoke_test_path.py
"""
import io
import os
import sys

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
os.chdir(_WORKSPACE_ROOT)
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)


def main():
    from fastapi.testclient import TestClient
    from projects.dilly.api.main import app
    from projects.dilly.api.auth_store import create_session, set_subscribed

    # 1. Create subscribed session (simulates “signed in”)
    email = "smoke@test.edu"
    token = create_session(email)
    set_subscribed(email, True)
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Health
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200, f"Health: expected 200, got {r.status_code}"
    print("  1. GET /health -> 200")

    # 3. Pick a real PDF from assets/resumes
    assets = os.path.join(_WORKSPACE_ROOT, "assets", "resumes")
    pdf_path = None
    if os.path.isdir(assets):
        for name in ["resume copy.pdf", "Kylee Ravenell Resume.pdf", "Luke DeLoe - Resume.pdf"]:
            p = os.path.join(assets, name)
            if os.path.isfile(p) and os.path.getsize(p) < 5 * 1024 * 1024:
                pdf_path = p
                break
        if not pdf_path:
            for f in os.listdir(assets):
                if f.lower().endswith(".pdf"):
                    p = os.path.join(assets, f)
                    if os.path.getsize(p) < 5 * 1024 * 1024:
                        pdf_path = p
                        break
    if not pdf_path or not os.path.isfile(pdf_path):
        # Fallback: minimal PDF bytes so at least one endpoint is hit (may 500 on extract)
        pdf_path = None

    if pdf_path:
        with open(pdf_path, "rb") as f:
            file_bytes = f.read()
        file_io = io.BytesIO(file_bytes)
        r = client.post(
            "/audit/v2",
            files={"file": (os.path.basename(pdf_path), file_io, "application/pdf")},
            data={},
            headers=headers,
        )
    else:
        # No assets: skip audit, use a minimal audit payload for report only
        r = None

    if r is not None:
        if r.status_code != 200:
            print(f"  2. POST /audit/v2 -> {r.status_code} {r.text[:200]}")
            if r.status_code in (401, 403):
                print("     (Auth failed; check auth_store or use dev session.)")
            sys.exit(1)
        audit = r.json()
        print("  2. POST /audit/v2 -> 200 (audit result)")
    else:
        # Build minimal audit payload for report step only
        audit = {
            "candidate_name": "Smoke Test",
            "detected_track": "Tech",
            "major": "Computer Science",
            "scores": {"smart": 70, "grit": 65, "build": 60},
            "final_score": 65,
            "audit_findings": ["Smart: Strong GPA.", "Grit: Good leadership.", "Build: Add projects."],
            "evidence": {"smart": "GPA and coursework.", "grit": "Leadership roles.", "build": "Track readiness."},
            "recommendations": [],
            "raw_logs": [],
        }
        print("  2. (Skipped /audit/v2; no PDF in assets/resumes; using minimal payload for report)")

    # 4. Generate report PDF and get share URL
    r = client.post("/report/pdf", json=audit, headers=headers)
    assert r.status_code == 200, f"Report PDF: expected 200, got {r.status_code} {r.text}"
    data = r.json()
    url = data.get("url") or ""
    assert "report/pdf/" in url, f"Expected report URL, got {url}"
    token = url.split("/report/pdf/")[-1].split("?")[0].strip()
    assert token, "Could not get report token from URL"
    print("  3. POST /report/pdf -> 200 (share URL)")

    # 5. Download report by token (share link)
    r = client.get(f"/report/pdf/{token}")
    assert r.status_code == 200, f"GET report: expected 200, got {r.status_code}"
    assert "application/pdf" in r.headers.get("content-type", ""), "Expected PDF content-type"
    print("  4. GET /report/pdf/{token} -> 200 (PDF)")

    print("  Smoke path OK: sign-in → audit → report → share link → download PDF.")


if __name__ == "__main__":
    main()
