# Meridian — Launch roadmap (Weeks 1–4)

> **Superseded.** The canonical roadmap is **[ROADMAP.md](./ROADMAP.md)**. Use that for vision, phases, and current status. This file is kept for historical reference only.

**Goal:** Full launch in one month. Soft launch (dev-unlock / invite; Stripe in month 2). No rough edges. One wow moment. Ship.

**Focus:** Nothing else. Just this.

---

## Week 1 — Stability & ship-ready

**Outcome:** No crashes on happy path. No raw 500s. Users can’t break the app with huge files or long waits.

| # | Task | Done |
|---|------|------|
| 1 | **Friendly errors** — API: catch 500s, return `{ "detail": "Audit temporarily unavailable. Try again in a few minutes." }` (or similar). No stack traces to client. Dashboard: show this message on audit failure; retry button. | ☐ |
| 2 | **Upload limit** — API: reject file > 5 MB with 413 and clear message. Dashboard: optional client-side check before upload; show "File must be under 5 MB." | ☐ |
| 3 | **Audit timeout** — API: set timeout on audit (e.g. 90s). Dashboard: if request exceeds ~60s, show "This is taking longer than usual…" and allow cancel; on timeout show friendly message + retry. | ☐ |
| 4 | **Smoke test** — Sign in → upload PDF → run audit → open PDF report → copy share link. No crashes. Fix any break. | ☐ |
| 5 | **Paywall copy** — One CTA ("Subscribe" or "Request access"). One line: "Unlimited audits, full reports, red flags, and peer comparison. $9.99/month." Remove or replace any other "coming soon" so it's clear. | ☐ |

---

## Week 2 — Wow moment & share

**Outcome:** "Top X% in [Track]" is visible and shareable. "Why your scores changed" is prominent on second audit. One clear "Share your results" block.

| # | Task | Done |
|---|------|------|
| 1 | **Top X% front and center** — After audit, show "Top X% in [Track]" prominently (e.g. above or beside radar, or in a badge). Use existing `peer_percentiles` and `peer_cohort_n`. Copy: "Top X% of [Track] resumes we've audited" or similar. | ☐ |
| 2 | **Top X% in PDF** — Include the same "Top X% in [Track]" line in the PDF report so the shareable report has the wow. | ☐ |
| 3 | **Why your scores changed** — When user has last audit + current audit, surface the explain-delta copy prominently (e.g. dedicated block under Progress: "Why your scores changed"). Already built; make it visible and scannable. | ☐ |
| 4 | **Share your results block** — One visible section: "Share your results" with (1) Copy report link, (2) Copy one-line summary. Include "Top X% in [Track]" in the block when available so they can paste it with the link. | ☐ |

---

## Week 3 — Polish & mobile

**Outcome:** Onboarding and every screen feel intentional. Works on phone. No embarrassing copy or edge-case crashes.

| # | Task | Done |
|---|------|------|
| 1 | **Onboarding** — One short paragraph on school pick screen: what Meridian does, why .edu. No dead ends. "Already have an account? Sign in" if needed. | ☐ |
| 2 | **Mobile** — Radar and cards readable at 375px width. Buttons and "Copy" targets ≥ 44px. No horizontal scroll. Test full flow on a phone (or 375px viewport). | ☐ |
| 3 | **Voice pass** — Scan every user-facing string: errors, empty states, paywall, recommendation labels. One tone: Meridian Hiring Manager (confident, kind, consultant-level). Fix any that sound generic or off. | ☐ |
| 4 | **Edge cases** — Very short resume (e.g. < 100 words): graceful message, no crash. Very long (e.g. > 2k words) or missing sections: clear message or sensible fallback. No 500. | ☐ |

---

## Week 4 — Launch

**Outcome:** App is live. You know how to run it and recover. Launch message and audience are set.

| # | Task | Done |
|---|------|------|
| 1 | **Deploy** — API and dashboard live. Env vars set (e.g. `NEXT_PUBLIC_API_URL`, no Stripe yet). Soft launch: dev-unlock or invite-only. | ☐ |
| 2 | **SEO / meta** — Title and description ($9.99/month, one line). So first search or share looks right. | ☐ |
| 3 | **Launch story** — (1) Who it's for (e.g. University of Tampa students). (2) One line: "Run Meridian before every application. Recruiters spend seconds on a resume—we hold you to the bar that gets interviews." (3) Where we tell people (career center, email, social). Write it down; use it. | ☐ |
| 4 | **Runbook** — One doc: how to start/restart API and dashboard, where logs are, how to clear audit cache if needed. So you can fix things at 2 a.m. | ☐ |

---

## Launch checklist (end of Week 4)

- [ ] Sign in works (magic link + verify).
- [ ] Paywall shows for unsubscribed; dev-unlock works when allowed.
- [ ] Upload → audit → results → PDF → share link: no errors on happy path.
- [ ] Errors are friendly (no 500 text or stack trace).
- [ ] Upload limit 5 MB enforced.
- [ ] "Top X% in [Track]" visible after audit and in PDF.
- [ ] "Why your scores changed" visible when user has two audits.
- [ ] "Share your results" block with link + one-line summary (+ Top X%).
- [ ] Mobile: one full flow at 375px, tappable, no horizontal scroll.
- [ ] Onboarding and copy: one tone, no dead ends.
- [ ] Deploy live; runbook done; launch story set.

---

## Post–launch (month 2+)

- **Stripe** — $9.99/month Checkout; webhook sets `subscribed`.
- **Meridian Voice** — In-app chatbot for career Q&A 24/7. See `dilly_core/MERIDIAN_VOICE.md`.
- **Meridian Career Center** — App section: career center on your phone with Meridian Voice. See `MERIDIAN_CAREER_CENTER_FEATURES.md`.

Out of scope for the 4-week launch. Focus: Weeks 1–4 only.
