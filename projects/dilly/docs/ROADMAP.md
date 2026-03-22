# Meridian — Roadmap

**This is the one and only roadmap.** All other roadmap docs (MERIDIAN_ROADMAP.md, LAUNCH_ROADMAP.md, IDEAS_LAUNCH_ROADMAP.md, etc.) are superseded by this document. Point here for vision, phases, and status.

**Horizon:** April 11th — a fully functional app that feels like the greatest thing for their careers.

**North star:** The user feels like they stumbled on the thing that will get them hired. Weight lifted. Stronger candidate. Valued. (Not like Handshake and LinkedIn, which make you feel like shit.)

Five weeks. Three priorities: **make it real** (deploy), **make it worth $10** (career tools), **make it spread** (growth + engagement).

---

## Current status

| Phase | Status | Summary |
|-------|--------|---------|
| **Phase 0** | Done | Design system, copy doc, profile schema. |
| **Phase B** | Done | Auth, profile API, audit v2, payment plumbing, deployable backend. |
| **Phase 1** | Done | Full onboarding: Welcome, Verify, School theme, Name, Major, Pre-prof, Track, Goals, What is Meridian, Resume upload, Payment. |
| **Phase 2** | Done | App shell (Career Center, Resume Review, Voice), audit history, playbook, progress, explain-delta, PDF/share. |
| **Phase 3** | In progress | E2E polish done. UI/UX overhaul done. Deploy + Resend + Stripe + hardening remaining. |
| **Phase 4** | Not started | Career tools: Goal banner, Am I Ready, Interview prep, Gap analysis, Cover letter lines. |
| **Phase 5** | Not started | Growth: Shareable badges, Meridian Snapshot, Track leaderboard. |
| **Phase 6** | Not started | Engagement: Deadline countdown, Gamification, Milestone nudges. |

---

## Completed phases (0, B, 1, 2)

### Phase 0: Foundation
Design system (`DESIGN_SYSTEM.md`), voice & copy doc (`MERIDIAN_ONBOARDING_COPY.md`), profile schema (`PROFILE_SCHEMA.md`).

### Phase B: Backend
Auth (verify-by-code, dev_code), GET/PATCH /profile, /audit/v2, payment (dev-unlock + Stripe placeholder + webhook), protected routes. Runbook in `STEPS_25_TO_28_DETAIL.md`.

### Phase 1: Onboarding (screens 1-12)
Welcome → Verify → School theme → Name → Major → Pre-prof → Track → Goals → What is Meridian → Resume upload → Payment → Main app. Profile persisted via PATCH /profile at each step. Condensed steps 9+10 into one screen.

### Phase 2: Main app
App shell with bottom nav (Career Center, Resume Review, Voice). Career Center with color-coded scores, meridian_take, peer percentile, clickable audit history, profile editing. Resume Review with application_target, collapsible report sections, explain-delta, PDF, share. Voice with full resume-aware context, personalized suggestions, localStorage persistence.

---

## Phase 3 — Ship It (Week 1: Mar 7-14)

**Goal:** Get the app live and accessible. Nothing else matters until real people can open it.

| Task | Deliverable | Done |
|------|-------------|------|
| 3.1 | **E2E polish** — Security audit, returning-user fix, onboarding persistence, beta access. | Done |
| 3.2 | **UI/UX overhaul** — Score colors, collapsible report, clickable history, profile edit, condensed onboarding. | Done |
| 3.3 | **Error states** — Auth, subscribe, audit, voice, profile errors all handled inline. | Done |
| 3.4 | **Mobile-first** — Viewport, touch targets, responsive. | Done |
| 3.5 | **Deploy frontend** — Vercel (Next.js dashboard). | |
| 3.6 | **Deploy backend** — Railway or Render (FastAPI API). | |
| 3.7 | **Resend production** — Real .edu email verification. Needs `RESEND_API_KEY`, production domain. | |
| 3.8 | **Stripe production** — Real checkout sessions. Needs Stripe live keys, webhook URL. | |
| 3.9 | **Backend hardening** — Rate limiting on verification codes, server-side session invalidation, fix file-based race conditions. | |

**Outcome:** A URL students can visit, sign up with their .edu, pay, and use.

---

## Phase 4 — Career Tools That Justify $10 (Week 2-3: Mar 15-28)

**Goal:** Features that make a student think "this is worth way more than $10." Each one uses existing resume/audit data — no external dependencies.

| Task | Deliverable | IDEAS # |
|------|-------------|---------|
| 4.1 | **Goal setting & home-screen banner** — User sets a specific goal ("Land summer analyst at Goldman", "Get into med school"). Persistent banner at top of Career Center until done. Voice and recommendations reference it. Stored via PATCH /profile. | #16 |
| 4.2 | **"Am I Ready?" one-tap check** — User enters a company or role; returns Ready / Not yet / Stretch + 1-3 concrete gaps. LLM call using audit data + target. New endpoint: `POST /ready-check`. | #17 |
| 4.3 | **Interview prep from evidence** — Per-dimension prompts from their actual resume. "Recruiter asks about leadership — here's how to answer using your Grit evidence." 30-second scripts. New section in Career Center. LLM call using audit evidence + track. | #23 |
| 4.4 | **Gap analysis & personalized roadmap** — Compare scores to top performers in track. 3-month plan: "Missing technical projects? Here are 3 things to do this month." Ties into goal setting. LLM-generated, shown as card in Career Center. | #13 |
| 4.5 | **Cover letter & outreach lines** — One-click generation of opening lines and hooks citing actual Smart/Grit/Build evidence. Copy to clipboard. New endpoint: `POST /generate-lines`. | #21 |

---

## Phase 5 — Growth & Shareability (Week 3-4: Mar 28 - Apr 4)

**Goal:** Features that make students share Meridian and create social proof on campus.

| Task | Deliverable | IDEAS # |
|------|-------------|---------|
| 5.1 | **Shareable badges for LinkedIn** — Generated image: "Top 15% Grit in Pre-Health — Meridian." Download badge + "Add to LinkedIn" CTA. Backend generates image/SVG from scores + track. New endpoint: `GET /badge/{audit_id}`. | #10 |
| 5.2 | **Shareable Meridian Snapshot** — One-pager: radar chart + composite score + 2-3 evidence bullets. For career fair follow-ups, Handshake notes, LinkedIn DMs. PDF or image. Extension of existing PDF infrastructure. | #19 |
| 5.3 | **Track leaderboard (opt-in)** — "Top 10% Grit in Pre-Health at UTampa" with optional rank (#12 of 89). Anonymous/pseudonymous, privacy-first. Opt-in toggle in profile. Uses existing audit log data. | #20 |

---

## Phase 6 — Engagement & Retention (Week 4-5: Apr 4-11)

**Goal:** Features that bring students back daily and create habit.

| Task | Deliverable | IDEAS # |
|------|-------------|---------|
| 6.1 | **Application deadline countdown & sprint plan** — User adds deadlines; countdown on Career Center home. Near deadline: prioritized "2-week sprint" to-dos. Stored in profile; shown as card above "Do this next." | #18 |
| 6.2 | **Gamification: progress bars & celebrations** — "3 steps from Strong Grit" progress toward next tier. Celebration when scores cross 50, 70, 85. Streak tracking ("3 audits this month"). Visual only, no new endpoints. | #39 |
| 6.3 | **Milestone nudges** — "Grit up 8 points since last week." "You just passed 60% of Pre-Health students." Shown in Career Center on return visits (compare saved vs current). | #36 |

---

## Post-launch (after April 11)

Valuable but too complex or content-dependent for the 5-week window:

| Idea | Reason deferred |
|------|-----------------|
| Live resume editing UI (#1) | Needs a full editor; core value works with upload + audit + copy suggestions. |
| Workshops, podcasts, training (#3-6) | Needs content creation and curation. |
| Mentors on the app (#7) | Needs mentor network and onboarding flow. |
| JobBook (#8) | Needs job data source and filtering UI. |
| Mock audits (#14) | Needs JD parsing and mock-scoring logic. |
| Verified Talent badge + pipeline (#12) | Needs employer partners (e.g. Raymond James). |
| Seal of Truth / transcript (#15) | Needs .edu transcript integration. |
| Campus clubs & contacts (#26) | Needs UTampa-specific data. |
| Job alerts (#27) | Needs job data source. |
| Resume reorganization per JD (#30) | High complexity; canonical resume → job-tailored versions. |
| Daily Companion AI full (#28) | Voice improvements cover MVP; full proactive version post-launch. |
| Proof layer (GitHub/LinkedIn) | Research and integration effort. |
| Recruiter view | Different user persona entirely. |
| Technical expansion (#31-35) | Rigor Index API, RAG, predictive scores, self-correction. |
| "What if" scenarios (#22) | Interesting but complex simulation logic. |
| GPA inference (#11) | Nice-to-have; small but not critical for launch. |

---

## Vision summary

### Onboarding (screens 1-12)

Welcome → Verify → School theme → Name → Major → Pre-prof → Track → Goals → What is Meridian + Resume upload (combined) → Payment → Main app.

### Main app

| Section | Name | Purpose |
|---------|------|---------|
| Home | **Career Center** | Scores, goal banner, meridian_take, peer percentile, progress, history, playbook, gap analysis, deadlines. |
| Resume | **Resume Review** | Upload, audit, scores, recs, application_target, PDF, share, interview prep, cover letter lines. |
| Chat | **Meridian Voice** | Resume-aware career coach with full audit context. |
| Check | **Am I Ready?** | One-tap readiness check for any company/role. |

---

## Order of work

1. **Phase 0** — Done.
2. **Phase B** — Done.
3. **Phase 1** — Done.
4. **Phase 2** — Done.
5. **Phase 3** — In progress (deploy + production services remaining).
6. **Phase 4** — Next (career tools).
7. **Phase 5** — Then (growth).
8. **Phase 6** — Then (engagement).
9. **Post-launch** — After April 11.

---

*Roadmap updated: March 7, 2026. Horizon: April 11. This is the single source of truth for vision, phases, and status.*
