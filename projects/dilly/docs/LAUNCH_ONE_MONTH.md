# Launch in one month — blow everyone away

**Goal:** Ship Meridian in ~4 weeks so the first impression is *“This is the one.”* Not “nice beta” — premium, clear, shareable.

---

## What “blow everyone away” means

1. **First 30 seconds** — Clean, confident, no “coming soon” or half-built feel. One promise: *Run Meridian before every application.*
2. **First audit** — Scores feel fair; recommendations are specific and actionable; “Cited from your resume” shows we’re not making stuff up. Feels like a consultant in their pocket.
3. **One wow moment** — Something they want to share or screenshot: e.g. “Top X% in my track,” or shareable snapshot (radar + score + one line), or “Why your scores changed” after a second audit.
4. **No rough edges** — No 500s with stack traces, no broken flows, no placeholder copy. Mobile works. Errors are friendly.
5. **Shareability** — So good they tell a friend or post it. Share link + one-line summary + optional snapshot/badge.

---

## What we already have (strengths)

- **Auth & paywall** — Magic-link .edu sign-in, $9.99/month, server-side enforcement. Dev unlock for testing.
- **Audit quality** — Cohort-specific Smart/Grit/Build, evidence with exact quotes when possible, red flags (content + score anomaly), peer percentiles, tier-1 benchmark.
- **Consultant voice** — Meridian voice doc, recommendations and red flags in “top hiring manager + consultant” tone.
- **Progress & explainer** — Last vs this audit; “Why your scores changed” (LLM or fallback).
- **Takeaway & share** — One-line summary, PDF report, 7-day share link.
- **Polish already in** — Calibration note (MTS), copy suggested line, dimension breakdown (why it’s low / what you did right / how to improve).

**Gaps to close for launch:** Soft launch (no Stripe at launch; add Stripe in month 2—may change mind), one shareable wow, end-to-end polish, and a clear launch story.

---

## Four-week plan

### Week 1 — Ship-ready foundation

- **Soft launch (Stripe in month 2)**  
  - Launch without real payment: invite-only or dev-unlock for early users; “Subscribe (coming soon)” or “Request access” is fine.  
  - **Stripe in month 2:** Add Stripe Checkout for $9.99/month when ready. (You may change your mind and add Stripe before launch—this doc assumes month 2.)

- **Stability**  
  - Friendly error messages (no raw 500s).  
  - Upload limits (e.g. 5 MB) and timeout handling.  
  - One smoke-test path: sign in → upload → audit → PDF → share link. No crashes.

- **Copy & CTAs**  
  - Replace every “coming soon” with either the real action or one clear line (“Payment coming soon” is ok if we’re soft launch).  
  - Paywall: one CTA, one line on what’s included (unlimited audits, full reports, red flags, peer comparison).

### Week 2 — Wow moment & shareability

- **One shareable wow** (pick one for launch):  
  - **Option A — Shareable snapshot**  
    - Page or image: radar + final score + one-line summary (no full resume).  
    - “Copy link” or “Download image” for Handshake note, LinkedIn, career fair.  
  - **Option B — “Top X%” front and center**  
    - We already have peer percentiles. Surface “Top X% in [Track]” prominently after audit (and in PDF).  
    - Makes the number feel real and shareable.  
  - **Option C — “Why your scores changed”**  
    - We have explain-delta. Make it the hero of the second audit: “Here’s exactly why your Grit went up.”  
  - Recommendation: **B** is fastest (data exists); **A** is highest share potential. Do B for launch, add A in month 2 if time.

- **Share flow**  
  - “Copy share link” and “Copy one-line summary” are already there. Add one visible “Share your results” block (link + summary + optional “Top X%” line).

### Week 3 — Polish & mobile

- **Onboarding**  
  - School pick + sign-in: one short paragraph (what Meridian does, why .edu). No dead ends.

- **Mobile**  
  - Radar and cards readable at 375px; buttons tappable (44px); no horizontal scroll.  
  - Test: one full flow on a phone.

- **Meridian voice pass**  
  - Scan every user-facing string (errors, empty states, paywall, recommendations section). One tone: confident, kind, consultant-level.

- **Edge cases**  
  - Very short resume; very long resume; missing sections. Graceful messages, no crashes.

### Week 4 — Launch

- **Deploy**  
  - API + dashboard live; env vars set; soft launch (no Stripe; add in month 2).  
  - Domain + basic SEO: title, description ($9.99/month).

- **Launch story**  
  - Who is it for? (e.g. “University of Tampa students” or “college students.”)  
  - One line: e.g. “Run Meridian before every application. Recruiters spend seconds on a resume—we hold you to the bar that gets interviews.”  
  - Where do we tell people? (career center, email, Instagram, etc.)

- **Runbook**  
  - How to restart, where logs are, how to clear cache. So you can fix things at 2 a.m.

---

## Must-have vs nice-to-have for launch

| Must-have | Nice-to-have (post-launch) |
|-----------|----------------------------|
| Auth + paywall; soft launch (dev-unlock / invite) | Stripe (month 2) |
| One shareable wow (Top X% or snapshot) | Shareable badge image |
| No 500s, friendly errors, upload limits | Cache-stats endpoint |
| Mobile usable | Perfect mobile layout |
| One clear launch audience + message | Multi-school marketing |
| Runbook / how to run & recover | Full DevOps |

---

## Deferred (backlog)

- Optional target (“What are you applying to?”) — `DEFERRED_BACKLOG.md`
- Stripe — planned for month 2 (may change); see `DEFERRED_BACKLOG.md`
- GPA inference — `GPA_INFERENCE_SPEC.md`
- Shareable snapshot image (if we only do “Top X%” for launch) — can add week 2 of month 2

---

## Summary

- **Week 1:** Soft launch (no Stripe yet) + stability + copy.  
- **Week 2:** One wow (Top X% or snapshot) + share block.  
- **Week 3:** Polish, mobile, voice, edge cases.  
- **Week 4:** Deploy, launch story, runbook.

That’s the path to a launch that blows people away: reliable, premium feel, one thing they want to share, and a clear story.
