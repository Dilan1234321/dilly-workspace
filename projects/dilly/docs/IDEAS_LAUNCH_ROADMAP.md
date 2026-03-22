# Meridian — Ideas → Launch Roadmap (1 Month)

> **Superseded.** The canonical roadmap is **[ROADMAP.md](./ROADMAP.md)**. Ideas and launch scope are tracked there; this file is kept for historical reference only.

**Goal:** One place that maps every idea in IDEAS.md to what gets built by launch (Month 1) vs after.

**Assumptions:** ~6 hrs/day productive work, ~30 days to launch. First campus: University of Tampa.

---

## Ideas status at a glance

| # | Idea | By launch? | Phase / Week | Notes |
|---|------|------------|--------------|--------|
| — | **Cohort + benchmark on dashboard** | ✅ Yes | Phase 2, Week 2 | Definitions + optional benchmark line |
| — | **“What are you applying to?”** | ✅ Yes | Phase 2, Week 2 | internship / full-time / grad school |
| — | **Shareable badge** | ✅ Yes | Phase 2, Week 2 | Meridian score badge for LinkedIn |
| — | **Resume length / 1-page nudge** | ✅ Yes | Phase 2, Week 2 | Detect >1 page, suggest trim |
| — | **Evidence traceability** | ⏳ Optional | Phase 2 or 3 | Tooltip/snippet for evidence; lower priority |
| — | **GPA inference when missing** | ⏳ Optional | Phase 2 or 3 | Gentle nudge only; no invented number |
| 1 | Live resume editing UI | ❌ No | Post-launch | High effort; defer |
| 3 | App-exclusive workshops | ❌ No | Post-launch | Content + UX |
| 4 | Free certifications hub | ❌ No | Post-launch | Curation + UI |
| 5 | Podcasts section | ❌ No | Post-launch | Content + player |
| 6 | Exclusive training programs | ❌ No | Post-launch | Content |
| 7 | Mentors on the app | ❌ No | Post-launch | Directory + contact |
| 8 | JobBook | ❌ No | Post-launch | Jobs/internships list |
| — | Per-student links | ❌ No | Post-launch | Career center → student report link |
| — | Proof layer (Phase B) | ❌ No | Post-launch | GitHub/LinkedIn/certs check |
| — | Recruiter view | ❌ No | Post-launch | Job description → Meridian-fit |
| — | “Email me my report” | ❌ No | Post-launch | Same PDF, email link |

---

## By launch (must-have or strong should-have)

These are the only **ideas** from IDEAS.md that are explicitly in the 1-month launch plan. The rest of launch is stability, production readiness, and support (see LAUNCH_ROADMAP.md).

### Week 2 — Pre-launch features (from LAUNCH_ROADMAP Phase 2)

1. **“What are you applying to?”** (IDEAS #2)  
   - **What:** Optional dropdown/chips: Internships / Full-time job / Grad school / Just exploring.  
   - **Why by launch:** Differentiates advice (internship vs full-time vs grad) with low backend change.  
   - **Where:** Backend: optional `application_target` on `/audit/v2`; dashboard: one selector; LLM prompt: one line to tailor recommendations.  
   - **Effort:** ~12 hrs.

2. **Shareable badge** (IDEAS #10)  
   - **What:** “Meridian [Score]” or “100 Grit” image; Download badge + optional “Copy badge link” / “Add to LinkedIn” CTA.  
   - **Why by launch:** Shareability and social proof with limited scope (static or simple generated image).  
   - **Where:** Backend: endpoint or static assets; dashboard: “Share your score” after audit.  
   - **Effort:** ~10 hrs.

3. **Cohort + definitions on dashboard** (IDEAS “Cohort + benchmark”)  
   - **What:** One short sentence under Track · Major: what Smart / Grit / Build mean for that cohort; optional benchmark line (e.g. “X points above/below Tech bar”).  
   - **Why by launch:** Clarifies scores and adds perceived rigor.  
   - **Where:** Dashboard only; optional use of benchmarks.json.  
   - **Effort:** ~6 hrs.

4. **Resume length / 1-page nudge** (IDEAS #9)  
   - **What:** Detect “likely >1 page” (e.g. text length or PDF page count); add `resume_length_note` to audit; show small callout + optional generic rec to trim.  
   - **Why by launch:** High-value, scoped feature (detect + one message).  
   - **Where:** Parser or auditor; audit response; dashboard callout.  
   - **Effort:** ~8 hrs.

### Optional by launch (if time)

- **Evidence traceability** — Click or tooltip on evidence sentence showing the exact resume snippet. Improves trust; can ship as “tooltip with snippet” in Phase 2 or 3.  
- **GPA inference when missing** (IDEAS #11) — No invented number; use signals (honors, Dean’s List, or lack of) to suggest “consider adding GPA if strong” or “strengthen other dimensions.” Can be one extra rec type or a short note in findings.

---

## Explicitly not by launch (post-launch)

Stayed in IDEAS.md; implement when you have bandwidth after launch.

| Idea | Reason |
|------|--------|
| **Live resume editing UI** (IDEAS #1) | Large build (editor, persistence, re-audit flow). Core value already works with upload → audit → copy suggestions. |
| **App-exclusive workshops** (IDEAS #3) | Needs content and in-app UX. Better after launch and usage data. |
| **Free certifications hub** (IDEAS #4) | Curation + UI. “Build” already improved by recommendations; certs hub is a separate product surface. |
| **Podcasts section** (IDEAS #5) | Content production + player. Post-launch. |
| **Exclusive training programs** (IDEAS #6) | Content-heavy. Post-launch. |
| **Mentors on the app** (IDEAS #7) | Needs mentor onboarding and contact/booking flow. Post-launch. |
| **JobBook** (IDEAS #8) | Jobs/internships list and filtering is a big feature. Post-launch. |
| **Per-student links** | Career center link → report without login. Requires tokenized report view; useful after campus rollout. |
| **Proof layer (Phase B)** | Cross-check resume vs GitHub/LinkedIn/certs. Research and integration effort; post-launch. |
| **Recruiter view** | Job description → Meridian-fit or candidate pool. Different user; post-launch. |
| **“Email me my report”** | Same 7-day PDF; delivery via email. Nice-to-have; post-launch. |

---

## Week-by-week (ideas only)

- **Week 1:** No new ideas. Focus on stability, errors, limits, onboarding, mobile, runbook (LAUNCH_ROADMAP Phase 1).  
- **Week 2:** Ship the four ideas above: “What are you applying to?”, badge, cohort + definitions, 1-page nudge. Plus billing plumbing (no Stripe yet).  
- **Week 3:** No new ideas. Production readiness: deploy, security, rate limit, logging, tests, copy (Phase 3).  
- **Week 4:** No new ideas. Launch checklist, support, soft launch, buffer (Phase 4).  

If Week 2 is tight, drop **badge** first (keep “What are you applying to?” and 1-page nudge); add badge in Month 2.

---

## Summary

- **By launch (1 month):** 4 ideas — “What are you applying to?”, shareable badge, cohort + definitions, 1-page nudge. Optional: evidence traceability, GPA nudge.  
- **Post-launch:** Live editor, workshops, certs, podcasts, training, mentors, JobBook, per-student links, proof layer, recruiter view, “Email me my report,” and any optional items not done in Month 1.  
- **Full task breakdown:** Use LAUNCH_ROADMAP.md for phases, tasks, and hours; use this doc to see which IDEAS are in scope for launch.

When you implement an idea, check it off in LAUNCH_ROADMAP and add a line under *Implemented* in IDEAS.md.
