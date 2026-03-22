# Meridian — Roadmap for Pitch & Expo

**Use this when presenting:** pitch competition (2 days) and expo (1 month). One story: *we’re not just an idea—we’re built, live-capable, and still building.*

---

## The one-line story

**Pitch:** “Meridian is a resume audit built like a senior hiring manager: Smart, Grit, and Build scores, evidence from your resume, and consultant-level advice. It’s built, it works end-to-end, and we’re polishing and deploying now.”

**Expo:** “Meridian is live. Students sign in with .edu, upload a resume, get scores and recommendations in under a minute, and can share a PDF or link. We’re adding payments and a fuller onboarding next.”

---

## By pitch day (2 days)

### What’s done — the product is real

- **Sign-in & access** — Magic-link .edu sign-in, paywall ($9.99/mo), dev unlock for demos.
- **Audit engine** — Upload PDF/DOCX → Smart, Grit, Build scores; evidence trail (“cited from your resume”); red flags; peer percentiles (“Top X%”).
- **Recommendations** — Consultant-style: what’s wrong, what’s right, how to improve; line edits with “copy suggested line.”
- **Progress** — “Why your scores changed” vs last audit (when they have history).
- **Output** — PDF report, 7-day share link, one-line summary + copy to clipboard.
- **Stability** — Friendly errors, 5 MB limit, PDF/DOCX only, 90s timeout + “taking longer than usual” + retry.
- **UX** — One clear path: sign in → upload → audit → results → PDF → share. Onboarding copy, paywall CTA, “Share your results” block, “Top X%” prominent.
- **Polish** — Mobile-friendly (375px, 44px touch targets, no horizontal scroll). One voice everywhere (confident, kind, consultant-level).

**By the numbers:** 25 of 28 core items done. The rest is deploy.

### What we’re doing next (so you can say “still building”)

- **Edge cases** — Done. Very short or long resumes, missing sections → clear consultant-style messages, no crashes.
- **Deploy** — API + dashboard to production (Railway/Render + Vercel or similar); runbook; launch story (who it’s for, where we tell people).

**Pitch slide / talking point:**  
“We have a complete product: sign-in, upload, audit, scores, evidence, recommendations, PDF, and share. We’re in the final stretch—going live (edge cases done)—so judges see a real product with a clear roadmap.”

---

## By expo (1 month)

### Live and supportable

- **Deployed** — API and dashboard on production URLs; students can use it from campus or home.
- **Operations** — Runbook: how to restart, check logs, clear cache, who to contact (so you can fix things at 2 a.m.).
- **Launch story** — Defined audience (e.g. University of Tampa students), one-line pitch, and where you’ll tell people (career center, email, expo).

### Optional before expo (if time)

- **Edge cases** — Done; every resume type gets a clear message, no crashes.
- **Onboarding flow** — Short “get to know you” (school, year, major, what they’re applying to) before the main app; makes the expo demo feel more tailored.

### Right after expo / Month 2

- **Stripe** — Real payments ($9.99/mo).
- **Onboarding flow** — Full question sequence + app design pass so the whole product feels like one experience.
- **Backlog** — Shareable badge, “what are you applying to?” in the audit, GPA nudge when missing, etc. (see DEFERRED_BACKLOG.md).

**Expo slide / talking point:**  
“By the expo, Meridian is live. Students get a hiring-manager-style audit, scores they can share, and a clear path to improve. We’re already planning payments and a richer onboarding for the next wave.”

---

## Quick reference: status by milestone

| Milestone   | Done / Target |
|------------|----------------|
| **Pitch (2 days)** | 25/28 core features done. Product demoable end-to-end. Next: deploy. |
| **Expo (1 month)** | Deployed (API + dashboard). Runbook + launch story. Optional: edge cases, light onboarding. |
| **Month 2**        | Stripe, onboarding flow, app design pass; backlog items as capacity allows. |

---

## If they ask “what’s the roadmap?”

- **Now → pitch:** Finish edge-case handling so any resume is safe; prepare deploy (env, CORS, domains).
- **Pitch → expo:** Deploy API and dashboard; runbook and launch story; optionally onboarding or extra polish.
- **After expo:** Payments, fuller onboarding, then shareable badge and other backlog.

*Last updated: 2025-03-07. Use DEPLOYMENT_ROADMAP_ONE_MONTH.md for the full 28-item checklist.*
