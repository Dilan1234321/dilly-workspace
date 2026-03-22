# Cousin feedback: Backend + UI streamlining

**Source:** Feedback from showing Meridian to cousin.  
**Summary:** (1) Master the backend, make it kickass. (2) Fix the UI so it’s more streamlined — lots of features and users scroll a long way.

---

## 1. Backend: make it kickass

**Current state:** `main.py` is thin (app, CORS, middleware, exception handler, router includes, startup cleanup). All endpoints live in routers: `auth`, `profile`, `audit`, `voice`, `ats`, `recruiter`, `jobs`, `report`, `health`, `waitlist`, `cron`, `family`. In-memory rate limit, solid CORS and auth patterns in `deps.py`.

**Concrete improvements:**

| Area | What to do |
|------|------------|
| **Structure** | Split into FastAPI routers: `auth`, `profile`, `audit`, `voice`, `ats`, `recruiter`, `jobs`, `reports`. Keep `main.py` as thin app + router includes + middleware. |
| **Errors** | Central exception handler; consistent error envelope `{ "error": "...", "code": "..." }`. Use HTTPException with detail that frontend can show. |
| **Validation** | Pydantic models for all request bodies (many already); ensure response models for key endpoints so API is self-documenting. |
| **Observability** | Request logging (method, path, status, duration); optional request_id for tracing. Log audit/voice/ATS failures with minimal PII. |
| **Performance** | Audit cache already exists; consider response compression (gzip). Ensure heavy endpoints (audit, ATS, voice) don’t block others (they’re async; confirm no accidental sync I/O). |
| **Docs** | OpenAPI tags per router; one-line descriptions on routes. Keeps “kickass” API discoverable. |

**Priority order:** Structure (routers) first, then errors + validation, then logging. Compression and OpenAPI polish when convenient.

**Errors & validation (implemented):**
- **`api/errors.py`** — Stable codes (`ErrorCode`: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, etc.) and raise helpers (`validation_error()`, `unauthorized()`, `forbidden()`, `not_found()`, `rate_limited()`, `conflict()`, `bad_request()`, `service_unavailable()`, `internal()`). All 4xx/5xx return envelope `{ "error", "code", "detail", "request_id" }`; frontend can branch on `code`.
- **`api/schemas.py`** — `ErrorResponse` model; request bodies: `WaitlistSignupRequest`, `AuthSendCodeRequest`, `AuthVerifyCodeRequest`, `FamilyAddStudentRequest`, `OkMessageResponse`, `ReportPdfRequest`.
- **`main.py`** — Exception handler uses `get_message(detail)` and `get_code(detail, status_code)` so structured `{ code, message }` detail is reflected in the response.
- **`deps.py`** — `rate_limit`, `require_auth`, `require_subscribed`, `require_recruiter` use `errors.*` instead of raw `HTTPException`.
- **Routers** — Auth (magic link, verify-code, verify, redeem-gift, beta-unlock, gift-checkout, create-checkout, dev-unlock, webhook), waitlist, family, report (pdf, email-to-parent, apply-through-meridian), profile (get, update, photo, transcript, parent-invite, public profile), audit (file validation, explain-delta, ready-check, post_badge, batch) use Pydantic request models and `errors.*`.

**Observability (implemented):**
- **`main.py`** — Middleware assigns `request_id` (or uses `X-Request-ID`); logs every request as `[API] request_id method path status duration_ms` (skips health and report PDF). On audit/voice/ATS paths, logs `[API] FAIL scope request_id status_code` when response is 4xx/5xx (middleware) or when an exception is raised (exception handler). No PII.

**Performance (implemented):**
- **`main.py`** — `GZipMiddleware` added for response compression. Audit, voice, and ATS route handlers are all `async def`.

**OpenAPI (implemented):**
- **`openapi_helpers.py`** — `ERROR_RESPONSES` dict for 4xx/5xx with `ErrorResponse` model. Key routes document these. App has description, version, openapi_tags. Route summaries on audit, badge, explain-delta, ready-check.

---

## 2. UI: streamline Career Center (less scroll)

**Current state:** Career Center is one long vertical page. Order of blocks (simplified):

1. Header (photo, welcome, edit)
2. Urgent deadline banner
3. Meridian noticed
4. Outcome capture (optional)
5. Primary goal form
6. Deadline countdown
7. 2-week sprint (when ≤14 days)
8. Smart / Grit / Build scores
9. Strongest signal
10. Voice/resume CTA + inline tools (Gap Scan, Interview Prep, Cover Letter)
11. ATS Readiness
12. Target firms
13. Track playbook
14. Jobs for you (preview)
15. Recruiter profile (six-second)
16. Share card
17. Quick links (View Report, New Audit, Jobs, Calendar, Insights, Sticker Sheet)

**Problems:** Too much above the fold isn’t possible; everything is always visible, so users scroll a lot to reach lower items.

**Streamlining options (pick and iterate):**

| Approach | Description |
|----------|-------------|
| **Above-the-fold hero** | First screen: photo + welcome + **one** primary CTA (e.g. “Your numbers” summary or “Run audit” / “Open report”) + one line of “Do this next.” Rest below in a single “More” or sectioned area. |
| **Collapsible sections** | Keep order but make blocks collapsible (e.g. “ATS Readiness”, “Track playbook”, “Jobs for you”). Default: first 2–3 open, rest collapsed with “Show ATS”, “Show playbook”, etc. |
| **Tabs on Center** | e.g. “Overview” (scores, strongest signal, one CTA) | “Tools” (ATS, Voice, Gap Scan, Interview Prep) | “Links” (Jobs, Recruiter profile, Share, Quick links). Reduces vertical stack. |
| **Progressive disclosure** | Show “Your numbers” + “Do this next” + ATS CTA always. Move “Target firms”, “Playbook”, “Share card”, “Quick links” into a “More” drawer or a second page (e.g. “Career Center – More”). |
| **Quick links as nav** | Turn Quick links into a compact bar or bottom-sheet so Report, New Audit, Jobs, Calendar, Insights, Sticker Sheet are one tap without scrolling. |

**Recommended starting point:**  
- **Hero block:** Welcome + scores (or “Run first audit”) + single “Do this next” + primary CTA (Voice or Report).  
- **One row of compact “cards”** for: ATS, Jobs, Recruiter profile (icon + label, tap to open full page or sheet).  
- **Collapsible “More”** for: playbook, target firms, share card, outcome capture, Meridian noticed.  
- **Quick links** as a sticky/fixed compact strip or part of bottom nav so they don’t require long scroll.

**Mobile-first:** Keep touch targets ≥44px, avoid horizontal scroll, keep copy short. Test on a small viewport after changes.

---

## 3. Next steps

- **Backend:** Create `projects/meridian/api/routers/` and move endpoints into `auth`, `profile`, `audit`, etc. Add central error handler and request logging.  
- **UI:** Refactor Career Center in `dashboard/src/app/page.tsx`: introduce a clear “hero” block, group secondary tools into compact row + “More” (or tabs), and surface Quick links without long scroll.  
- **Docs:** Update `WHATS_IN_THE_APP.md` when Career Center layout or nav changes; add a short “API structure” note when routers are in place.

This file is the single place for “cousin feedback → backend + UI plan.” Implement in small steps and ship incrementally.

---

## 4. API structure (current)

- **`api/deps.py`** — Shared: `rate_limit`, `bearer_user`, `require_auth`, `require_subscribed`, `require_recruiter`, `is_dev_allowed`.
- **`api/routers/auth.py`** — Prefix `/auth`: send-magic-link, send-verification-code, verify-code, verify (GET), me, logout, dev-unlock, beta-unlock, Stripe checkout/redeem/webhook.
- **`api/routers/recruiter.py`** — Prefix `/recruiter`: search (POST), candidates/{id} (GET), company-advice (POST), feedback (POST). Uses RECRUITER_API_KEY.
- **`api/routers/profile.py`** — No prefix; full paths: GET/PATCH /profile, /profile/photo (POST, GET, DELETE), /profile/transcript (POST, DELETE), /account/delete, /profile/parent-invite, /parent/summary, /profile/public/{slug} (GET), /profile/public/{slug}/photo (GET).
- **`api/routers/jobs.py`** — No prefix: GET /jobs/recommended, POST /jd-meridian-scores, GET /jobs/{job_id}/required-scores, GET /door-eligibility. Uses `api/resume_loader.load_parsed_resume_for_voice` for job matching.
- **`api/resume_loader.py`** — Shared: `load_parsed_resume_for_voice(email, max_chars)` for jobs and voice context.
- **`api/constants.py`** — Shared: upload limits (`MAX_UPLOAD_BYTES`), error messages (`ERR_FILE_TYPE`, `ERR_EXTRACT`, `ERR_AUDIT_500`, etc.), `AUDIT_TIMEOUT_SEC`, `APPLICATION_TARGET_VALUES`.
- **`api/routers/audit.py`** — No prefix. Audit: POST /audit, POST /audit/v2, GET /audit/history, GET /audit/history/{audit_id}, GET/POST /badge, GET/POST /snapshot, GET /leaderboard/{track}, GET /peer-cohort-stats, POST /audit/explain-delta, POST /ready-check, POST /generate-lines, POST /interview-prep, POST /audit/batch. Uses `api/constants` and `deps.rate_limit`/`require_subscribed`/`require_auth`.
- **`api/routers/voice.py`** — GET /voice/onboarding-state, POST /voice/chat, /voice/stream, /voice/rewrite-bullet, /voice/interview-prep, /voice/gap-scan, /voice/firm-deadlines, /voice/feedback. **Implemented** (reimplemented March 2026): chat/stream with data-capture (beyond_resume), onboarding initial message, rewrite-bullet, interview-prep, gap-scan, feedback logging; firm-deadlines returns empty list (stub until data source wired).
- **`api/routers/ats.py`** — POST /ats-analysis-from-audit, GET /resume-text, POST /ats-score/record, GET /ats-score/history, POST /ats-keyword-density, POST /ats-vendor-sim, POST /ats-rewrite, POST /ats-keyword-inject, GET /ats-company-lookup, POST /ats-check, POST /gap-analysis. Uses dilly_core (ats_analysis, ats_vendors, ats_rewrites, ats_keywords, ats_keyword_inject, ats_company_lookup) and ats_score_history, resume_loader.
- **`api/routers/report.py`** — POST /report/pdf (generate shareable PDF), GET /report/pdf/{token}, POST /report/email-to-parent, POST /apply-through-meridian. Uses apply_destinations, job_matching, email_sender, profile_store.
- **`api/routers/health.py`** — GET /health (no prefix). Health check for dashboards and load balancers.
- **`api/routers/waitlist.py`** — POST /waitlist. Marketing waitlist signup; rate limited; no auth.
- **`api/routers/cron.py`** — Prefix `/cron`: GET /cron/cleanup-draft-profiles (requires CRON_SECRET).
- **`api/routers/family.py`** — Prefix `/family`: GET /family/add (token=family_add_token), POST /family/add-student (family_add_token, student_email). Token-based; no Bearer auth.
- **`api/main.py`** — Thin app: CORS, request logging (method, path, status, duration; X-Request-ID), central exception handler (envelope `error`, `code`, `detail`, `request_id`). Includes all routers above. Startup: report PDF cleanup (remove expired files). No route handlers in main.
