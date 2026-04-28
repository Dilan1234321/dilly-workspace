"""
/admin/jobs — manual triggers for the jobs ingestion pipeline.

Same admin-email auth as /admin/cost. Lets the owner kick off a fresh
crawl + classification without needing the CRON_SECRET token. Crawl
runs in a background thread; the endpoint returns immediately so
Railway's HTTP gateway doesn't time out on the request.

Endpoints:
  GET  /admin/jobs/count   — current count of active listings
  POST /admin/jobs/crawl   — kick off crawl_all() + classify in background
  POST /admin/jobs/discover — kick off slug discovery in background
"""

from __future__ import annotations

import os
import threading
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

from projects.dilly.api import deps

router = APIRouter(tags=["admin-jobs"])


def _ADMIN_EMAILS() -> set[str]:
    raw = (os.environ.get("DILLY_ADMIN_EMAILS", "") or "").strip()
    emails = {e.strip().lower() for e in raw.split(",") if e.strip()}
    if not emails:
        emails.add("kochhardilan05@gmail.com")
    return emails


def _require_admin(request: Request) -> str:
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    if email not in _ADMIN_EMAILS():
        raise HTTPException(status_code=403, detail="Admin access required.")
    return email


@router.get("/admin/jobs/count")
async def admin_jobs_count(request: Request):
    """Return current job counts. Helps verify whether the crawl actually
    landed without needing to scroll the Jobs tab."""
    _require_admin(request)
    try:
        from projects.dilly.crawl_internships_v2 import get_db
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM internships WHERE status = 'active'")
        active = int(cur.fetchone()[0] or 0)
        cur.execute("SELECT COUNT(DISTINCT company_id) FROM internships WHERE status = 'active'")
        companies = int(cur.fetchone()[0] or 0)
        cur.execute("SELECT MAX(updated_at) FROM internships WHERE status = 'active'")
        last_updated = cur.fetchone()[0]
        cur.execute(
            "SELECT source_ats, COUNT(*) FROM internships WHERE status = 'active' "
            "GROUP BY source_ats ORDER BY 2 DESC LIMIT 30"
        )
        per_source = [{"source": r[0], "count": int(r[1])} for r in cur.fetchall()]
        conn.close()
        return {
            "active_listings": active,
            "active_companies": companies,
            "last_updated": str(last_updated) if last_updated else None,
            "per_source": per_source,
        }
    except Exception as e:
        return {"error": str(e)[:500]}


# Module-level guard so a crawl can't be started while another is running.
# Threaded crawls share the process, so a second click while one's still
# going would just waste API calls and DB writes (the upsert dedupes,
# but the wasted HTTP fetches are real cost).
_crawl_running: bool = False
_crawl_lock = threading.Lock()


def _run_crawl_with_classify():
    global _crawl_running
    try:
        from projects.dilly.crawl_internships_v2 import (
            crawl_all, classify_unclassified, get_db,
        )
        print("[admin_jobs.crawl] starting crawl_all()", flush=True)
        crawl_all()
        print("[admin_jobs.crawl] crawl_all() done, starting classify", flush=True)
        try:
            conn = get_db()
            api_key = os.environ.get("ANTHROPIC_API_KEY", "")
            n = classify_unclassified(conn, api_key)
            conn.close()
            print(f"[admin_jobs.crawl] classified {n} new listings", flush=True)
        except Exception as e:
            print(f"[admin_jobs.crawl] classify error: {e}", flush=True)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[admin_jobs.crawl] FATAL: {e}", flush=True)
    finally:
        with _crawl_lock:
            _crawl_running = False


@router.post("/admin/jobs/crawl")
async def admin_jobs_crawl(request: Request):
    """Kick off crawl_all() + classify_unclassified() in a background
    thread. Returns immediately. Watch /admin/jobs/count to verify
    counts climb. Typical crawl takes 10–20 minutes to finish all
    sources."""
    _require_admin(request)
    global _crawl_running
    with _crawl_lock:
        if _crawl_running:
            return {
                "ok": False,
                "running": True,
                "message": "A crawl is already in progress. Wait for it to finish.",
            }
        _crawl_running = True
    threading.Thread(target=_run_crawl_with_classify, daemon=True).start()
    return {"ok": True, "running": True, "message": "Crawl started in background. Poll /admin/jobs/count to watch counts grow."}


@router.post("/admin/jobs/discover")
async def admin_jobs_discover(request: Request, vendor: str = "all", limit: Optional[int] = None):
    """Kick off ATS slug discovery (Greenhouse/Lever/Ashby/Workday) in a
    background thread. Hits found get persisted to discovered_boards so
    the next crawl picks them up automatically. vendor: one of
    greenhouse|lever|ashby|workday|all."""
    _require_admin(request)
    try:
        from projects.dilly.api.ingest.candidate_slugs import CANDIDATE_SLUGS
        from projects.dilly.api.ingest.slug_discovery import (
            discover_greenhouse, discover_lever, discover_ashby, discover_workday,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Discovery module load failed: {e}")

    cap = int(limit) if limit and int(limit) > 0 else None
    v = (vendor or "all").lower().strip()

    def _run_all():
        try:
            if v in ("greenhouse", "all"):
                r = discover_greenhouse(CANDIDATE_SLUGS, limit=cap)
                print(f"[admin_jobs.discover] greenhouse: {r}", flush=True)
            if v in ("lever", "all"):
                r = discover_lever(CANDIDATE_SLUGS, limit=cap)
                print(f"[admin_jobs.discover] lever: {r}", flush=True)
            if v in ("ashby", "all"):
                r = discover_ashby(CANDIDATE_SLUGS, limit=cap)
                print(f"[admin_jobs.discover] ashby: {r}", flush=True)
            if v in ("workday", "all"):
                wd_cap = cap or 200
                r = discover_workday(CANDIDATE_SLUGS, limit=wd_cap)
                print(f"[admin_jobs.discover] workday: {r}", flush=True)
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[admin_jobs.discover] FATAL: {e}", flush=True)

    threading.Thread(target=_run_all, daemon=True).start()
    return {"ok": True, "running": True, "vendor": v, "message": "Discovery started in background. Then call /admin/jobs/crawl to ingest from new boards."}
