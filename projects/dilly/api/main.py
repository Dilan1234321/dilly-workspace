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

# Allow "projects.dilly.*" and "dilly_core.*" imports when run from projects/dilly/api/
# (e.g. uvicorn main:app).  The redirector in projects/dilly/projects/dilly/__init__.py
# handles "projects.dilly.X" -> "X" resolution once this directory is on sys.path.
# NOTE: os.chdir() is intentionally NOT used here — it is unsafe in a multi-worker
# web server.  All file-system paths use absolute paths derived from _WORKSPACE_ROOT.
_API_DIR = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_API_DIR, ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)

# Load .env from workspace root when present (e.g. DILLY_USE_LLM, OPENAI_API_KEY, RECRUITER_API_KEY)
_ENV_PATH = os.path.join(_WORKSPACE_ROOT, ".env")
try:
    from dotenv import load_dotenv
    load_dotenv(_ENV_PATH, override=True)
except ImportError:
    pass

from dilly_core.llm_client import is_llm_available
from dilly_core.evidence_quotes import get_fallback_evidence_quotes
from fastapi import Depends, FastAPI, UploadFile, File, Form, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, Response
from starlette.middleware.gzip import GZipMiddleware
from projects.dilly.dilly_resume_auditor import DillyResumeAuditor
from projects.dilly.api.schemas import AuditResponse, AuditResponseV2, Benchmarks, AuditRecommendation
import re

app = FastAPI(
    title="Dilly AI API",
    description="Career-acceleration API for students: resume audit, ATS, voice, jobs, recruiter search.",
    version="1.0.0",
    openapi_tags=[
        {"name": "auth", "description": "Auth, session, Stripe checkout, magic link, verification"},
        {"name": "profile", "description": "Profile, photo, transcript, parent invite, public profile"},
        {"name": "audit", "description": "Resume audit, badge, snapshot, leaderboard, explain-delta, ready-check"},
        {"name": "voice", "description": "Dilly chat, stream, tools (gap scan, interview prep, etc.)"},
        {"name": "ats", "description": "ATS analysis, keyword density, vendor sim, rewrite, gap analysis"},
        {"name": "report", "description": "Report PDF, email to parent, apply through Dilly"},
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
from projects.dilly.api.config import config

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
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
from projects.dilly.api.routers import jobs_listings as jobs_listings_router
from projects.dilly.api.routers import jobs_narrative as jobs_narrative_router
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
from projects.dilly.api.routers import booking as booking_router
from projects.dilly.api.routers import companies as companies_router
from projects.dilly.api.routers import tracks as tracks_router
from projects.dilly.api.routers import templates as templates_router
from projects.dilly.api.routers import career_brain as career_brain_router
from projects.dilly.api.routers import habits as habits_router
from projects.dilly.api.routers import generated_resumes as generated_resumes_router
from projects.dilly.api.routers import home as home_router
from projects.dilly.api.routers import job_url as job_url_router
from projects.dilly.api.routers import internships_v2 as internships_v2_router
from projects.dilly.api.routers import push as push_router
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
from projects.dilly.api.routers import ai as ai_router
from projects.dilly.api.routers import ai_arena as ai_arena_router
from projects.dilly.api.routers import calendar_feed as calendar_feed_router
from projects.dilly.api.routers import interview_prep as interview_prep_router
from projects.dilly.api.routers import interview_feedback as interview_feedback_router
from projects.dilly.api.routers import insights as insights_router
from projects.dilly.api.routers import weekly_brief as weekly_brief_router
from projects.dilly.api.routers import cron_jobs_cleanup
app.include_router(cron_jobs_cleanup.router)
app.include_router(auth_router.router)
app.include_router(recruiter_router.router)
app.include_router(profile_router.router)
app.include_router(jobs_router.router)
app.include_router(jobs_narrative_router.router)
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
app.include_router(booking_router.router)
app.include_router(companies_router.router)
app.include_router(tracks_router.router)
app.include_router(templates_router.router)
app.include_router(career_brain_router.router)
app.include_router(habits_router.router)
app.include_router(generated_resumes_router.router)
app.include_router(home_router.router)
app.include_router(job_url_router.router)
app.include_router(ai_arena_router.router)
app.include_router(internships_v2_router.router)
app.include_router(push_router.router)
app.include_router(notifications_router.router)
# Internal routers require DILLY_INTERNAL_KEY (or legacy CRON_SECRET) header
_internal_deps = [Depends(deps.require_internal_key)]
app.include_router(internal_notifications_router.router, dependencies=_internal_deps)
app.include_router(memory_router.router)
app.include_router(internal_memory_router.router, dependencies=_internal_deps)
app.include_router(ready_check_router.router)
app.include_router(internal_ready_check_router.router, dependencies=_internal_deps)
app.include_router(cohort_pulse_router.router)
app.include_router(internal_cohort_pulse_router.router, dependencies=_internal_deps)
app.include_router(actions_router.router)
app.include_router(voice_history_router.router)
app.include_router(internal_voice_extract_router.router, dependencies=_internal_deps)
app.include_router(internal_voice_agent_router.router, dependencies=_internal_deps)
app.include_router(ai_router.router)
app.include_router(calendar_feed_router.router)
app.include_router(interview_prep_router.router)
app.include_router(interview_feedback_router.router)
app.include_router(insights_router.router)
app.include_router(weekly_brief_router.router)

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
_REPORT_EXPIRY_SEC = config.report_expiry_days * 86400


def _reports_cleanup() -> None:
    """Remove report PDFs older than expiry."""
    if not os.path.isdir(config.reports_dir):
        return
    now = time.time()
    for name in os.listdir(config.reports_dir):
        if not name.endswith(".pdf"):
            continue
        path = os.path.join(config.reports_dir, name)
        try:
            if now - os.path.getmtime(path) > _REPORT_EXPIRY_SEC:
                os.remove(path)
        except Exception:
            pass


def _run_crawl_internships() -> None:
    """Crawl ATS sources and classify new listings. Runs at 02:00 UTC."""
    try:
        print("[CRON] crawl-internships starting", flush=True)
        from projects.dilly.crawl_internships_v2 import crawl_all, classify_unclassified, get_db
        crawl_all()
        conn = get_db()
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        classified = classify_unclassified(conn, api_key)
        conn.close()
        print(f"[CRON] crawl-internships done — classified={classified}", flush=True)
    except Exception:
        import traceback
        traceback.print_exc()


def _run_recompute_matches() -> None:
    """Recompute match scores for all students. Runs at 03:00 UTC."""
    try:
        print("[CRON] recompute-matches starting", flush=True)
        from projects.dilly.match_engine import run_matching
        run_matching()
        print("[CRON] recompute-matches done", flush=True)
    except Exception:
        import traceback
        traceback.print_exc()


@app.on_event("startup")
def _on_startup() -> None:
    _reports_cleanup()
    recruiter_key_set = bool(config.recruiter_api_key.strip())
    print(f"[API] .env loaded from: {_ENV_PATH}", flush=True)
    print(f"[API] RECRUITER_API_KEY: {'set' if recruiter_key_set else 'NOT SET (add to .env and restart)'}", flush=True)

    # Start background scheduler for daily cron jobs (replaces Railway curl containers)
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger
        _scheduler = BackgroundScheduler(timezone="UTC")
        _scheduler.add_job(_run_crawl_internships, CronTrigger(hour=2, minute=0), id="crawl_internships", replace_existing=True)
        _scheduler.add_job(_run_recompute_matches, CronTrigger(hour=3, minute=0), id="recompute_matches", replace_existing=True)
        _scheduler.start()
        print("[CRON] Scheduler started — crawl@02:00 UTC, matches@03:00 UTC", flush=True)
    except Exception:
        import traceback
        print("[CRON] WARNING: scheduler failed to start", flush=True)
        traceback.print_exc()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.api_host, port=config.api_port)
