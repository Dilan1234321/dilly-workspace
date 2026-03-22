# Meridian — Launch Roadmap (1 Month)

> **Superseded.** The canonical roadmap is **[ROADMAP.md](./ROADMAP.md)**. Use that for vision, phases, and current status. This file is kept for historical reference only.

**Assumptions:** ~6 hours/day productive work, launch in ~30 days. Focus: University of Tampa as first campus; stable, polished, supportable product.

---

## Current state (baseline)

- **Dashboard:** Next.js, upload → audit → results (scores, radar, findings, recommendations, progress, PDF download, share link).
- **Auth:** Magic-link sign-in, .edu gate, persistent session, dev unlock.
- **Backend:** FastAPI, `/audit/v2` (LLM + rule fallback), PDF report, parsed resumes with Cohort + Name from file, content-hash cache, peer benchmarking, red flags.
- **Cohorts:** 10 tracks (Pre-Health, Pre-Law, Tech, Science, Business, etc.), Pre-Law inferred from signals, Tech/Arts override.
- **Monetization:** Paywall ($20/mo copy), subscription flag; no real payment yet.
- **School config:** UTampa theme (primary/secondary), tagline, onboarding gate.

---

## Phase 1 — Stability & core UX (Days 1–7, ~42 hrs)

**Goal:** No crashes, clear errors, fast enough, and one path that feels “done.”

### 1.1 Error handling & resilience (~8 hrs)

- [ ] **API:** Consistent error shape (`{ "detail": "..." }` or `{ "error": "...", "code": "..." }`). Map 500s to user-friendly messages (e.g. “Audit temporarily unavailable; try again in a few minutes”).
- [ ] **Dashboard:** Global error boundary; toast or inline message on upload/audit failure; retry button. Show “Checking connection…” or spinner on health check.
- [ ] **LLM failures:** Fallback to rule-based audit is already there; ensure response still returns 200 with a `raw_logs` entry like “Used rule-based audit (LLM unavailable).”
- [ ] **PDF generation:** Catch reportlab errors; return 500 with clear message; avoid leaking stack traces.

### 1.2 Performance & limits (~6 hrs)

- [ ] **Upload:** Enforce max file size (e.g. 5 MB) and clear message if exceeded. Optional: client-side check before upload.
- [ ] **Audit timeout:** Set a timeout (e.g. 90s) for the audit request; show “This is taking longer than usual…” and allow cancel/retry.
- [ ] **Cache:** Confirm content-hash cache is used in production path; add a simple cache-stats endpoint for debugging (optional, or dev-only).
- [ ] **Parsed resumes:** Ensure writing/updating cohort doesn’t block the response; keep post-audit file update fire-and-forget with stderr log on failure.

### 1.3 Onboarding & paywall clarity (~6 hrs)

- [ ] **Onboarding copy:** Tighten UTampa onboarding (one short paragraph: what Meridian does, why .edu, what they get after sign-in). Add “Already have an account? Sign in” if you add a separate sign-in entry.
- [ ] **Paywall:** If you show paywall before first audit, add one clear CTA (“Unlock full access” / “Subscribe”) and one line on what’s included (e.g. “Unlimited audits, PDF reports, and recommendations”). If paywall is post–first-audit, same clarity.
- [ ] **Dev unlock:** Keep dev unlock for localhost; ensure it’s not exposed in production (e.g. hide button when not localhost or when `NEXT_PUBLIC_HIDE_DEV_UNLOCK` is set).

### 1.4 Audit flow polish (~8 hrs)

- [ ] **Upload UX:** Drag-and-drop state (dragging over), file type error (“Please upload a PDF or DOCX”), and one selected-file name + size before “Run audit.”
- [ ] **Loading state:** Dedicated “Auditing…” view (no flash of empty results). Optional: “Analyzing your resume…” with 2–3 rotating tips (e.g. “We’re checking Smart, Grit, and Build”).
- [ ] **Results order:** Keep: Cover block → Score breakdown (radar) → Progress (if last audit) → Assessment findings → Consistency/red flags (if any) → Strategic recommendations → Takeaway & report (one-line + PDF) → Evidence panel → Audit log. Ensure mobile order is sensible (stack vertically).

### 1.5 Mobile & responsiveness (~6 hrs)

- [ ] **Breakpoints:** Test 320px, 375px, 768px, 1024px. Radar chart scales; buttons and cards don’t overflow; text readable without zoom.
- [ ] **Touch:** Buttons and “Copy” targets at least 44px; no hover-only actions for critical path.
- [ ] **Navigation:** If you add a nav (e.g. “New audit” in header), make it obvious on mobile.

### 1.6 Names & cohorts (~4 hrs)

- [ ] **Name from file:** Already implemented; smoke-test with 2–3 resumes (including one with “Name: …” in file) and confirm UI shows that name.
- [ ] **Cohort in file:** Already updated after audit; confirm file on disk has “Cohort: …” and that editing the .txt doesn’t get overwritten until next audit (document behavior for support).

### 1.7 Docs & runbook (~4 hrs)

- [ ] **README (repo):** One-page “How to run Meridian locally” (API + dashboard env vars, `OPENAI_API_KEY`, `MERIDIAN_USE_LLM`, optional `MERIDIAN_DEV`). List required env for production (e.g. `NEXT_PUBLIC_API_URL`).
- [ ] **Internal runbook:** Single doc (e.g. `docs/RUNBOOK.md`) with: how to deploy API + dashboard, where logs live, how to clear cache or restart, who to contact. No need for full DevOps yet—just enough for you to recover at 2 a.m.

---

## Phase 2 — Pre-launch features (Days 8–14, ~42 hrs)

**Goal:** One or two differentiators and a path to “subscribe” that’s ready to plug into Stripe later.

### 2.1 “What are you applying to?” (IDEAS #2) (~12 hrs)

- [ ] **Backend:** Add optional `application_target` to `/audit/v2` (e.g. `"internship" | "full_time" | "grad_school" | null`). If present, pass to LLM in a one-line instruction (e.g. “Candidate is targeting internships; tailor recommendations for internship applications”).
- [ ] **Dashboard:** Before or after upload, one dropdown or chips: “What are you applying to? — Internships / Full-time job / Grad school / Just exploring.” Send in audit request body.
- [ ] **Prompt:** Extend LLM system or user prompt to use this when set (internship vs full-time vs grad can change emphasis on “projects vs tenure,” “recency,” etc.). No need to change scoring formula—only recommendation tone and priorities.

### 2.2 Shareable badge (IDEAS #10) (~10 hrs)

- [ ] **Design:** One badge asset: “Meridian [Score]” (e.g. “Meridian 85” or “100 Grit”) — simple, on-brand, shareable as image.
- [ ] **Backend:** Optional endpoint or static: given `score` and optional `dimension` (e.g. grit), return a PNG or SVG (e.g. generated with reportlab or a tiny template). Or host 3–5 pre-rendered badges (e.g. 70, 80, 90, 100) and pick closest.
- [ ] **Dashboard:** After audit, “Share your score” → “Download badge” / “Copy badge link.” Copy link could be a direct image URL or a small “meridian.app/badge/…” page that shows the badge and “Add to LinkedIn” CTA.
- [ ] **Legal:** Small print: “For personal use only; do not imply Meridian endorses you.” (Optional for v1.)

### 2.3 Cohort + definitions on dashboard (IDEAS) (~6 hrs)

- [ ] **Cohort blurb:** Under “Track · Major” on the results card, add one short sentence: “Smart = academic rigor, Grit = leadership & impact, Build = [track] readiness.” (You already have this under the radar; can repeat or link.)
- [ ] **Optional benchmark line:** If you have a target (e.g. “Tech bar 80”), show “Your Grit is X points above/below the Tech benchmark” (from benchmarks.json or a constant). Low priority if data isn’t ready.

### 2.4 Resume length / 1-page nudge (IDEAS #9) (~8 hrs)

- [ ] **Detection:** In parser or auditor, infer “likely >1 page” from raw text length (e.g. > ~900 words or > ~5500 chars) or from PDF page count if you have it at upload time.
- [ ] **Response:** Add `resume_length_note?: string` to audit response when over threshold, e.g. “Your resume is longer than one page. Many recruiters prefer one page for undergrads; consider trimming to your strongest points.”
- [ ] **Dashboard:** Show a small notice when present (e.g. yellow callout above recommendations). Optionally one generic recommendation: “Consider condensing to one page; we can suggest what to trim.”

### 2.5 Billing plumbing (no Stripe yet) (~6 hrs)

- [ ] **Schema:** Ensure `subscribed` (or equivalent) is stored per user and returned from `/auth/me`. You already have dev unlock; ensure “subscribed” is the single source of truth for “can run audit / can download PDF.”
- [ ] **Dashboard:** If not subscribed, show paywall after first audit (or before first audit—your choice). “Subscribe for $20/month” button can point to a placeholder “Coming soon” or “Contact us” page.
- [ ] **Prep for Stripe:** List what you’ll need: webhook URL, “customer created” and “subscription updated” handlers, store `stripe_customer_id` and `subscription_status` somewhere. Implement in Phase 3 or post-launch.

---

## Phase 3 — Production readiness (Days 15–21, ~42 hrs)

**Goal:** Deployable, observable, and safe for real users.

### 3.1 Deployment (~12 hrs)

- [ ] **API:** Dockerfile exists; document env vars. Deploy to Railway, Render, Fly.io, or a VPS. Use env for `OPENAI_API_KEY`, `MERIDIAN_USE_LLM`, origin for CORS, and (if needed) `NEXT_PUBLIC_API_URL` base URL.
- [ ] **Dashboard:** Build with `NEXT_PUBLIC_API_URL` pointing to deployed API. Deploy to Vercel or same host. Set up one production domain (e.g. `app.meridian.io` or `meridian.yoursite.com`).
- [ ] **Auth in prod:** Magic-link flow must work (send email or show link in UI for dev). If you use a real email sender (SendGrid, Resend), configure and test. Ensure token/session storage is HTTPS-only in prod.
- [ ] **File storage:** Parsed resumes and report PDFs: decide if they stay on server disk or move to S3/R2. For single-server launch, disk is fine; add a cron or cleanup job to delete report PDFs older than 7 days.

### 3.2 Security & privacy (~8 hrs)

- [ ] **CORS:** Restrict to your dashboard origin(s) in production (no `*`).
- [ ] **Rate limiting:** Add a simple rate limit on `/audit/v2` (e.g. 10/hour per IP or per user if you have user id). Prevents abuse and controls cost.
- [ ] **Input validation:** Max file size, file type (PDF/DOCX only), max text length passed to LLM (you may already truncate at 28k chars). Reject oversized or invalid payloads with 400.
- [ ] **Privacy:** One-paragraph privacy note: what you store (email, audit results, parsed text), how long, and that you don’t sell data. Link from sign-up or footer. No need for full GDPR flow for UTampa-only launch, but be clear.

### 3.3 Observability (~8 hrs)

- [ ] **Logging:** Structured logs for audit requests (e.g. track, final_score, duration, llm_used). No PII in logs. Optional: request_id for tracing.
- [ ] **Health:** `/health` already exists; add optional `/health/ready` that checks DB or critical deps if you add them. Dashboard can ping health on load.
- [ ] **Errors:** Centralize API exception handler; log stack trace server-side; return generic message to client. Optional: send critical errors to a channel (e.g. email or Discord) via a small webhook.
- [ ] **Uptime:** Use a free uptime checker (e.g. UptimeRobot) hitting `/health` every 5 min; alert you if down.

### 3.4 Testing (~8 hrs)

- [ ] **API:** At least 3–5 tests: health, audit with a minimal PDF or fixture (mock or real LLM), PDF report generation, auth verify with a dummy token. Use pytest; run in CI or pre-deploy.
- [ ] **Dashboard:** Smoke-test the full path (land → onboarding → sign-in → upload → audit → view results → download PDF) on staging or prod-like URL. Fix any broken links or missing env.
- [ ] **Regression:** Re-run audit on 2–3 real resumes you’ve used before; confirm scores and cohort are in a reasonable range and PDF generates.

### 3.5 Content & copy (~6 hrs)

- [ ] **Landing (if separate):** One page: what Meridian is, who it’s for (students), key benefit (consulting-level resume feedback), CTA “Get started” → app. If the app is the only public page, add a short “About” or “How it works” section at the bottom.
- [ ] **In-app copy:** Audit results, paywall, and error messages in one voice (consulting, confident, helpful). Pass a quick copy edit on every user-facing string.
- [ ] **School-specific:** UTampa name, tagline, and (if any) “Powered by Meridian for University of Tampa” in footer.

---

## Phase 4 — Launch week (Days 22–28, ~42 hrs)

**Goal:** Soft launch at UTampa, support channel, and a simple feedback loop.

### 4.1 Launch checklist (~4 hrs)

- [ ] **Domains:** App and API on correct domains; SSL; CORS and cookies set for prod domain.
- [ ] **Env:** All secrets in env (no .env committed); OPENAI_API_KEY has sufficient quota.
- [ ] **Paywall:** Decide: free for first N days, or paywall from day one. If free trial, set “subscribed” to true for first 50 users or for 7 days (implement a simple flag or end date).
- [ ] **Email:** Magic link sends successfully; “From” name and support address set. Optionally set up a support@ or hello@ inbox.

### 4.2 Support & feedback (~8 hrs)

- [ ] **Support:** One contact method (email or Typeform). Link in dashboard footer: “Help” or “Contact support.” Document 2–3 common issues (e.g. “I didn’t get the magic link” → check spam; “Audit failed” → try again, smaller file).
- [ ] **Feedback:** Optional in-app “Send feedback” (opens email or form). Or add a single NPS or “How was your audit?” after first audit (store in log or sheet).
- [ ] **Runbook:** Update RUNBOOK with production URLs, where to look at logs, and how to turn off LLM if OpenAI is down (fallback to rules).

### 4.3 Soft launch (~6 hrs)

- [ ] **Announce:** Email or post to UTampa list (career center, student orgs, or your network). Short message: what Meridian is, link to app, “We’d love your feedback.”
- [ ] **Monitor:** Watch logs and errors for first 24–48 hours. Fix critical bugs same day. Optionally add a simple “audit count” or “sign-up count” so you know usage.

### 4.4 Buffer & polish (~24 hrs)

- [ ] **Bug fixes:** Reserve time for issues found in Phase 3–4 (e.g. mobile layout, PDF edge cases, cohort wrong for one major).
- [ ] **Performance:** If audit is slow, add a “We’re analyzing your resume…” message and consider showing partial results or caching more aggressively.
- [ ] **Deferred:** Explicitly list “post-launch”: live resume editor, workshops, certs hub, podcasts, mentors, JobBook, GPA inference. These stay in IDEAS until you have bandwidth.

---

## Post-launch (Month 2+)

- **Stripe:** Wire “Subscribe” to Stripe Checkout; webhook to set `subscribed`; handle cancel/reactivate.
- **Per-student links:** Career center sends link to student → view report without login (IDEAS).
- **More schools:** Add school config for 1–2 more .edu domains; same codebase, different theme/tagline.
- **Live resume editing, “What are you applying to?” refinement, 1-page trim suggestions, badges, workshops, certs, podcasts, mentors, JobBook** as prioritized in IDEAS.

---

## Summary timeline

| Week   | Focus                         | Key deliverables                                      |
|--------|-------------------------------|--------------------------------------------------------|
| 1      | Stability & core UX           | Error handling, limits, onboarding/paywall clarity, mobile, runbook |
| 2      | Pre-launch features           | “What are you applying to?”, badge, cohort copy, 1-page nudge, billing prep |
| 3      | Production readiness          | Deploy API + dashboard, security, rate limit, logging, tests, copy |
| 4      | Launch week                   | Launch checklist, support, soft launch, buffer for bugs |

**Total:** ~168 hours over 4 weeks at 6 hrs/day. Adjust by dropping or shrinking items (e.g. badge in Week 2 if you prefer to ship “What are you applying to?” only).

---

## How to use this doc

- Copy sections into your task manager or `memory/YYYY-MM-DD.md` as you work.
- When you complete an item, check it off here and add a one-line note under *Implemented* in IDEAS.md if it’s a feature.
- Revisit the roadmap at the start of each week and shift priorities if something blocks (e.g. deployment takes longer; cut “badge” and keep “What are you applying to?”).
