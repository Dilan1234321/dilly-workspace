import asyncio
import hashlib
import json
import os
import secrets
import shutil
import sys
import tempfile
import time
import uuid
from typing import Any, Dict, List

# Allow "projects.dilly.*" imports when run from projects/meridian/api (uvicorn main:app)
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)
os.chdir(_WORKSPACE_ROOT)  # so paths like projects/meridian/... resolve

# Load .env from workspace root when present (e.g. DILLY_USE_LLM, OPENAI_API_KEY, RECRUITER_API_KEY)
_ENV_PATH = os.path.join(_WORKSPACE_ROOT, ".env")
try:
    from dotenv import load_dotenv
    load_dotenv(_ENV_PATH)
except ImportError:
    pass

from dilly_core.llm_client import is_llm_available
from dilly_core.evidence_quotes import get_fallback_evidence_quotes
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, Response
from starlette.middleware.gzip import GZipMiddleware
from projects.dilly.meridian_resume_auditor import MeridianResumeAuditor
from projects.dilly.api.schemas import AuditResponse, AuditResponseV2, Benchmarks, AuditRecommendation
import re

app = FastAPI(
    title="Meridian AI API",
    description="Career-acceleration API for students: resume audit, ATS, voice, jobs, recruiter search.",
    version="1.0.0",
    openapi_tags=[
        {"name": "auth", "description": "Auth, session, Stripe checkout, magic link, verification"},
        {"name": "profile", "description": "Profile, photo, transcript, parent invite, public profile"},
        {"name": "audit", "description": "Resume audit, badge, snapshot, leaderboard, explain-delta, ready-check"},
        {"name": "voice", "description": "Dilly chat, stream, tools (gap scan, interview prep, etc.)"},
        {"name": "ats", "description": "ATS analysis, keyword density, vendor sim, rewrite, gap analysis"},
        {"name": "report", "description": "Report PDF, email to parent, apply through Meridian"},
        {"name": "jobs", "description": "Job recommendations, required scores, door eligibility"},
        {"name": "recruiter", "description": "Recruiter search, candidate detail, company advice (API key required)"},
        {"name": "health", "description": "Health check"},
        {"name": "waitlist", "description": "Marketing waitlist signup"},
        {"name": "family", "description": "Family plan add-student flow"},
        {"name": "cron", "description": "Scheduled tasks (cleanup, etc.)"},
        {"name": "companies", "description": "Company lookup for ATS"},
        {"name": "resume", "description": "Resume editor: save, load, and re-audit edited resume sections"},
        {"name": "applications", "description": "Application tracker: add, update, and track job application statuses"},
        {"name": "templates", "description": "Eliminate repetitive work: cover letters, thank-you, follow-up, LinkedIn, resume tailoring"},
        {"name": "career_brain", "description": "Second Brain: timeline, search, connections, progress, decision log"},
        {"name": "notifications", "description": "Proactive push notifications: preferences, history, opened, internal daily run"},
        {"name": "memory", "description": "Dilly memory surface: narrative, memory items, session capture, extraction"},
        {"name": "ready_check", "description": "Am I Ready loop: verdicts, roadmap, history, compare, follow-ups"},
        {"name": "cohort_pulse", "description": "Weekly cohort pulse cards: current, history, seen/acted, generation"},
        {"name": "actions", "description": "Conversation-derived action items: list, count, update, voice history"},
    ],
)


from projects.dilly.api import deps

# Default origins when CORS_ORIGINS is unset. 3000 = internal dashboard (projects/dilly/dashboard);
# 3001 = student-facing app (projects/dilly/student). If you set CORS_ORIGINS, include every origin you need (additive in your env list).
_CORS_ORIGINS = [
    o.strip() for o in (os.environ.get("CORS_ORIGINS") or "").split(",") if o.strip()
] or [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "https://trydilly.com",
    "https://www.trydilly.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# GZip compression for responses (reduces bandwidth on mobile/slow networks)
app.add_middleware(GZipMiddleware)

def _failure_scope(path: str) -> str | None:
    """Return 'audit'|'voice'|'ats' if path is a heavy endpoint we track for failures; else None."""
    if path.startswith("/audit"):
        return "audit"
    if path.startswith("/voice"):
        return "voice"
    if path.startswith("/ats"):
        return "ats"
    return None


# Request logging: method, path, status, duration, request_id (no PII)
@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or secrets.token_hex(8)
    request.state.request_id = request_id
    start = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start) * 1000)
    path = request.url.path
    if path.startswith("/health") or path.startswith("/report/pdf/"):
        return response  # skip logging health and report PDF fetches to reduce noise
    print(f"[API] {request_id} {request.method} {path} {response.status_code} {duration_ms}ms", flush=True)
    scope = _failure_scope(path)
    if scope and response.status_code >= 400:
        print(f"[API] FAIL {scope} {request_id} {response.status_code}", flush=True)
    response.headers["X-Request-ID"] = request_id
    return response

from projects.dilly.api.routers import auth as auth_router
from projects.dilly.api.routers import recruiter as recruiter_router
from projects.dilly.api.routers import profile as profile_router
from projects.dilly.api.routers import jobs as jobs_router
from projects.dilly.api.routers import audit as audit_router
from projects.dilly.api.routers import voice as voice_router
from projects.dilly.api.routers import ats as ats_router
from projects.dilly.api.routers import report as report_router
from projects.dilly.api.routers import health as health_router
from projects.dilly.api.routers import waitlist as waitlist_router
from projects.dilly.api.routers import cron as cron_router
from projects.dilly.api.routers import family as family_router
from projects.dilly.api.routers import resume as resume_router
from projects.dilly.api.routers import applications as applications_router
from projects.dilly.api.routers import companies as companies_router
from projects.dilly.api.routers import tracks as tracks_router
from projects.dilly.api.routers import templates as templates_router
from projects.dilly.api.routers import career_brain as career_brain_router
from projects.dilly.api.routers import habits as habits_router
from projects.dilly.api.routers import notifications as notifications_router
from projects.dilly.api.routers import internal_notifications as internal_notifications_router
from projects.dilly.api.routers import memory as memory_router
from projects.dilly.api.routers import internal_memory as internal_memory_router
from projects.dilly.api.routers import ready_check as ready_check_router
from projects.dilly.api.routers import internal_ready_check as internal_ready_check_router
from projects.dilly.api.routers import cohort_pulse as cohort_pulse_router
from projects.dilly.api.routers import internal_cohort_pulse as internal_cohort_pulse_router
from projects.dilly.api.routers import actions as actions_router
from projects.dilly.api.routers import voice_history as voice_history_router
from projects.dilly.api.routers import internal_voice_extract as internal_voice_extract_router
from projects.dilly.api.routers import internal_voice_agent as internal_voice_agent_router
app.include_router(auth_router.router)
app.include_router(recruiter_router.router)
app.include_router(profile_router.router)
app.include_router(jobs_router.router)
app.include_router(audit_router.router)
app.include_router(voice_router.router)
app.include_router(ats_router.router)
app.include_router(report_router.router)
app.include_router(health_router.router)
app.include_router(waitlist_router.router)
app.include_router(cron_router.router)
app.include_router(family_router.router)
app.include_router(resume_router.router)
app.include_router(applications_router.router)
app.include_router(companies_router.router)
app.include_router(tracks_router.router)
app.include_router(templates_router.router)
app.include_router(career_brain_router.router)
app.include_router(habits_router.router)
app.include_router(notifications_router.router)
app.include_router(internal_notifications_router.router)
app.include_router(memory_router.router)
app.include_router(internal_memory_router.router)
app.include_router(ready_check_router.router)
app.include_router(internal_ready_check_router.router)
app.include_router(cohort_pulse_router.router)
app.include_router(internal_cohort_pulse_router.router)
app.include_router(actions_router.router)
app.include_router(voice_history_router.router)
app.include_router(internal_voice_extract_router.router)
app.include_router(internal_voice_agent_router.router)

benchmarks = Benchmarks()

# Exception handler uses errors.get_code / get_message for consistent envelope
from projects.dilly.api.constants import (
    ERR_AUDIT_500 as _ERR_AUDIT_500,
    ERR_EXTRACT as _ERR_EXTRACT,
    ERR_FILE_TYPE as _ERR_FILE_TYPE,
    ERR_FILE_TOO_BIG as _ERR_FILE_TOO_BIG,
    ERR_REPORT_500 as _ERR_REPORT_500,
    MAX_UPLOAD_BYTES as _MAX_UPLOAD_BYTES,
    MIN_RESUME_WORDS as _MIN_RESUME_WORDS,
    MAX_RESUME_WORDS as _MAX_RESUME_WORDS,
    ERR_RESUME_TOO_SHORT as _ERR_RESUME_TOO_SHORT,
    ERR_RESUME_TOO_LONG as _ERR_RESUME_TOO_LONG,
    ERR_RESUME_MISSING_SECTIONS as _ERR_RESUME_MISSING_SECTIONS,
    ERR_TIMEOUT as _ERR_TIMEOUT,
    AUDIT_TIMEOUT_SEC as _AUDIT_TIMEOUT_SEC,
)


@app.exception_handler(Exception)
async def _catch_all(request: Request, exc: Exception):
    """Catch unhandled exceptions; return consistent error envelope (error, code, detail, request_id). No stack trace to client."""
    from fastapi.responses import JSONResponse
    from projects.dilly.api.errors import get_code, get_message
    request_id = getattr(request.state, "request_id", None) or secrets.token_hex(8)
    path = getattr(request, "url", None) and getattr(request.url, "path", "") or ""
    status_code = exc.status_code if isinstance(exc, HTTPException) else 500
    scope = _failure_scope(path)
    if scope:
        print(f"[API] FAIL {scope} {request_id} {status_code}", flush=True)
    envelope = {"error": None, "code": None, "detail": None, "request_id": request_id}
    if isinstance(exc, HTTPException):
        detail = exc.detail
        envelope["error"] = get_message(detail)
        envelope["code"] = get_code(detail, exc.status_code)
        envelope["detail"] = envelope["error"]
        r = JSONResponse(status_code=exc.status_code, content=envelope)
        r.headers["X-Request-ID"] = request_id
        return r
    import traceback
    traceback.print_exc()
    msg = _ERR_AUDIT_500[hash(id(exc)) % len(_ERR_AUDIT_500)]
    envelope["error"] = msg
    envelope["code"] = "INTERNAL_ERROR"
    envelope["detail"] = msg
    r = JSONResponse(status_code=500, content=envelope)
    r.headers["X-Request-ID"] = request_id
    return r


# Report PDF cleanup on startup (remove expired files)
_REPORTS_DIR = os.path.join(_WORKSPACE_ROOT, "memory", "meridian_reports")
_REPORT_EXPIRY_DAYS = 7
_REPORT_EXPIRY_SEC = _REPORT_EXPIRY_DAYS * 86400


def _reports_cleanup() -> None:
    """Remove report PDFs older than expiry."""
    if not os.path.isdir(_REPORTS_DIR):
        return
    now = time.time()
    for name in os.listdir(_REPORTS_DIR):
        if not name.endswith(".pdf"):
            continue
        path = os.path.join(_REPORTS_DIR, name)
        try:
            if now - os.path.getmtime(path) > _REPORT_EXPIRY_SEC:
                os.remove(path)
        except Exception:
            pass


@app.on_event("startup")
def _on_startup() -> None:
    _reports_cleanup()
    # So operators know where to put RECRUITER_API_KEY and if it loaded
    recruiter_key_set = bool((os.environ.get("RECRUITER_API_KEY") or "").strip())
    print(f"[API] .env loaded from: {_ENV_PATH}", flush=True)
    print(f"[API] RECRUITER_API_KEY: {'set' if recruiter_key_set else 'NOT SET (add to .env and restart)'}", flush=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
