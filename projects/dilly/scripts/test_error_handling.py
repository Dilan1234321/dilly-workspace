#!/usr/bin/env python3
"""
Test UTampa error handling and stability: file type, file size, 500 handler, 504 timeout.
Run from workspace root: python projects/dilly/scripts/test_error_handling.py
"""
import asyncio
import io
import sys
import os

# Run from workspace root so imports resolve
_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
os.chdir(_WORKSPACE_ROOT)
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

def test_health():
    from fastapi.testclient import TestClient
    from projects.dilly.api.main import app
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert "ok" in (r.json() or {}).get("status", "").lower() or "backend" in str(r.json())
    print("  GET /health -> 200 OK")

def test_audit_v2_requires_auth():
    from fastapi.testclient import TestClient
    from projects.dilly.api.main import app
    client = TestClient(app)
    # No file needed for 401; auth is checked first
    r = client.post("/audit/v2", data={}, files={})
    # Could be 401 (no auth) or 422 (missing file). Implementation checks auth first.
    assert r.status_code in (401, 422), f"Expected 401 or 422, got {r.status_code}"
    if r.status_code == 401:
        data = r.json() or {}
        assert "detail" in data
        print("  POST /audit/v2 (no auth) -> 401 OK")
    else:
        print("  POST /audit/v2 (no auth) -> 422 (validation) OK")

def test_file_type_rejected():
    from fastapi.testclient import TestClient
    from projects.dilly.api.main import app, _ERR_FILE_TYPE
    client = TestClient(app)
    # Legacy /audit does not require auth
    r = client.post(
        "/audit",
        files={"file": ("resume.txt", io.BytesIO(b"Hello world"), "text/plain")},
    )
    assert r.status_code == 400, f"Expected 400, got {r.status_code} {r.text}"
    data = r.json() or {}
    detail = data.get("detail", "")
    assert "Sparty" in detail or "PDF" in detail, f"Expected UTampa message, got: {detail}"
    print(f"  POST /audit (.txt) -> 400 OK: {detail[:60]}...")

def test_file_too_big_rejected():
    from fastapi.testclient import TestClient
    from projects.dilly.api.main import app, _MAX_UPLOAD_BYTES
    client = TestClient(app)
    # File slightly over 5 MB (fake PDF)
    big_size = _MAX_UPLOAD_BYTES + 1000
    r = client.post(
        "/audit",
        files={"file": ("large.pdf", io.BytesIO(b"x" * big_size), "application/pdf")},
    )
    assert r.status_code == 413, f"Expected 413, got {r.status_code} {r.text}"
    data = r.json() or {}
    detail = data.get("detail", "")
    assert "Spartan" in detail or "shield" in detail or "5" in detail, f"Expected file-too-big message, got: {detail}"
    print(f"  POST /audit (>5MB) -> 413 OK: {detail[:60]}...")

def test_500_returns_friendly_message():
    from fastapi.testclient import TestClient
    from projects.dilly.api.main import app, _ERR_AUDIT_500
    client = TestClient(app)
    # Send a "pdf" that will fail extract_text (e.g. empty or binary junk)
    r = client.post(
        "/audit",
        files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
    )
    # Empty file might trigger extract_text failure -> 500
    assert r.status_code == 500, f"Expected 500, got {r.status_code} {r.text}"
    data = r.json() or {}
    detail = data.get("detail", "")
    assert any(s in detail for s in ["Sparty", "Spartans", "shield", "breather", "defenses", "warming up"]), f"Expected UTampa 500 message, got: {detail}"
    assert "traceback" not in detail.lower() and "exception" not in detail.lower(), "Should not leak stack trace"
    print(f"  POST /audit (bad file -> 500) -> friendly message OK: {detail[:50]}...")

def test_audit_v2_timeout_returns_504():
    """When the audit runs longer than 90s, API returns 504 with friendly message."""
    from unittest.mock import patch, MagicMock
    from fastapi.testclient import TestClient
    from projects.dilly.api import main as api_main
    from projects.dilly.api.main import app, _ERR_TIMEOUT

    async def _mock_wait_for(coro, *args, **kwargs):
        if coro is not None and asyncio.iscoroutine(coro):
            coro.close()  # avoid "coroutine was never awaited" warning
        raise asyncio.TimeoutError()

    fake_auditor = MagicMock()
    fake_auditor.extract_text.return_value = True
    fake_auditor.raw_text = "Name: Test User\n\nEducation: BS Computer Science\nUniversity of Tampa"
    fake_auditor.analysis = True  # skip analyze_content

    with (
        patch.object(api_main, "_require_subscribed", return_value={"email": "test@spartans.ut.edu"}),
        patch.object(api_main, "DillyResumeAuditor", return_value=fake_auditor),
        patch.object(asyncio, "wait_for", side_effect=_mock_wait_for),
    ):
        client = TestClient(app)
        r = client.post(
            "/audit/v2",
            files={"file": ("resume.pdf", io.BytesIO(b"%PDF-1.4 minimal"), "application/pdf")},
            data={},
            headers={"Authorization": "Bearer fake-token"},
        )
    assert r.status_code == 504, f"Expected 504, got {r.status_code} {r.text}"
    data = r.json() or {}
    detail = data.get("detail", "")
    assert "taking longer" in detail.lower() or "Sparty" in detail, f"Expected timeout message, got: {detail}"
    print(f"  POST /audit/v2 (timeout) -> 504 OK: {detail[:55]}...")

def main():
    print("Testing Dilly error handling...")
    test_health()
    test_audit_v2_requires_auth()
    test_file_type_rejected()
    test_file_too_big_rejected()
    test_500_returns_friendly_message()
    test_audit_v2_timeout_returns_504()
    print("All tests passed.")

if __name__ == "__main__":
    main()
