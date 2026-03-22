# Meridian: Full Context for Gemini

**Purpose:** This essay gives Gemini (or any AI) complete context about Meridian—what it is, what has been built, what is planned, and the final vision—so it can answer questions accurately and in line with the product and roadmap. Everything below is the single source of truth for "what happened, is happening, and will happen."

---

## 1. What Meridian Is

**Meridian** is a career-readiness app for college students. It scores their resume the way a senior hiring manager would—on three dimensions called **Smart**, **Grit**, and **Build**—and tells them exactly what to fix before they apply to internships, jobs, or grad school. The tagline is: *"Your last check before Handshake"* and *"A career center open 24/7."*

**Positioning:** Handshake and LinkedIn make students feel like a number. Meridian treats them like the candidate they actually are: one place for their resume, their scores, and their plan. Recruiters spend seconds on a resume; students get one shot. Meridian is the bar they run against before they hit submit. Career centers are stretched; Meridian is the career center in their pocket—24/7 audit, track-specific playbooks, and a chat (Meridian Voice) for career Q&A.

**First campus:** University of Tampa ("Meridian for Spartans"). .edu-only sign-up. Promise: *"We don't sell your data to recruiters."*

**How we want to be known:** The **largest platform with 100% verified real students**—no fakes, no frauds, no bots. .edu-only means every profile is a verified student; recruiters can trust that when they see Meridian on an application. See `docs/MERIDIAN_POSITIONING.md`.

**Pricing:** $9.99/month (single-digit, "under $10" for students). Optional annual plan (e.g. 2 months free) for higher LTV.

**North star:** The user feels like they stumbled on the thing that will get them hired. Weight lifted. Stronger candidate. Valued. Not like Handshake and LinkedIn, which make you feel like shit.

**Long-term vision:** Meridian aims to become the **"Credit Score for Talent"**—high-velocity talent infrastructure that students and eventually employers trust. Quality is valued over anything: fewer features that are extremely high quality.

---

## 2. Who Is Behind Meridian

**Founder:** Dilan Kochhar. Data Science major at University of Tampa, minors in Math and CS. Aspiring AI entrepreneur. Timezone: America/New York (UTampa). He values truth, efficiency, high-output results, and a Zero-Hallucination policy in all AI-generated optimizations. Goal: scale Meridian into the Credit Score for Talent and reach $1M net worth by senior year (2028).

**Product discipline:** Questions are asked to get deeper analysis and ensure the product is perfect. Decisions are documented in specs and personality files. The Meridian Truth Standard (MTS) is non-negotiable: the engine's integrity is absolute; we do not alter rankings or scoring based on user pressure or emotional cues.

---

## 3. The Meridian Truth Standard (MTS) and Scoring

**Meridian Truth Standard:** We only use information explicitly stated or clearly implied in the resume. We do not invent facts. Scores are based only on what's on the resume. We don't suggest what they haven't proven. This is stated in the app ("Scores are based only on what's on your resume. We don't invent facts.") and enforced in the auditor and LLM prompts.

**Three dimensions (0–100 each):**

- **Smart:** Academic rigor—GPA (if stated), major difficulty, relevant coursework, honors, research, certifications. Weighted by what that field values. If no GPA is given, we do not invent one; we score from what is stated (major, coursework, honors, etc.). Pre-Health can use BCPM when present.
- **Grit:** Leadership and impact—quantifiable outcomes (numbers, %, $), leadership roles, work/experience density. Only what is stated. "Global Grit" multiplier for international markers (e.g. F-1, study abroad).
- **Build:** Track-specific proof—what that field's recruiters look for. Pre-Health: clinical hours, shadowing, research. Pre-Law: advocacy, legal internships, writing. Tech: tech stack, projects, deployments. Science: research, methods. Business/Finance/Consulting: quant impact, leadership. Etc.

**Tracks:** Pre-Health, Pre-Law, Tech, Science, Business, Finance, Consulting, Communications, Education, Arts, Humanities. Pre-Health and Pre-Law are assigned from **intent in the resume text** (e.g. pre-med, MCAT, shadowing, pre-law, LSAT). Other tracks default from major (e.g. CS → Tech, Biology → Science). Each track has cohort-specific definitions of Smart, Grit, and Build in the LLM prompt and in the dashboard (`trackDefinitions.ts`). Tier-1 benchmarks per track (e.g. "Below bar (85)") come from `benchmarks.json`.

**Scoring implementation:** Rule-based logic in `dilly_core/scoring.py`, `dilly_core/tracks.py`, `dilly_core/auditor.py`. When `MERIDIAN_USE_LLM=1`, the LLM auditor (`dilly_core/llm_auditor.py`) produces scores and findings; it can fall back to rule-based. Content-hash cache: same resume content re-audited within 24 hours returns the cached result (score stability). Canonical scoring doc: `SCORING_LOGIC.md`.

**Persona:** All resume feedback uses the voice of **Meridian Hiring Manager**—a top-level hiring manager, job consultant, and career advisor in one. Red flags, recommendations, evidence, and findings are direct, constructive, and actionable. See `dilly_core/MERIDIAN_HIRING_MANAGER.md`.

---

## 4. What Is Built (Current State)

### 4.1 Onboarding (pre–main app)

- **Welcome:** .edu email, "Get my verification code."
- **Verify:** Send 6-digit code (Resend when `RESEND_API_KEY` set; dev_code when `MERIDIAN_DEV=1`), user enters code, success → next.
- **School theme:** UTampa (sunset, silhouettes), "Meridian for Spartans."
- **Name, Major, Pre-professional? (Yes/No), Track (if yes), Goals (multi-select):** All saved via PATCH `/profile`. Goals include e.g. internship, gain experience, grad school, PhD, "figure out what I actually want," plus pre-prof options like "I'm aiming for med school."
- **What is Meridian:** Tailored bullets (major, track, goals) + "Handshake and LinkedIn make you feel like a number. We treat you like the candidate you actually are." CTA: "Show me my career center."
- **Bridge:** Clarity copy, then resume ask.
- **Resume ask:** Drop zone (PDF/DOCX), "Continue to payment" / "I'll upload later."
- **Payment:** $9.99/mo copy; dev-unlock when `MERIDIAN_DEV=1`; Stripe placeholder for live.

Profile (name, major, preProfessional, track, goals, application_target) is persisted. Loaded on main app via GET `/profile`.

### 4.2 Main App (after subscribed)

**Shell:** Bottom nav: **Career Center** | **Resume Review** | **Voice**. Profile block on Career Center (name, major, goals from profile).

**Career Center tab:** Welcome, "Everything you need is here," school line ("Meridian for [shortName]"). **Your numbers:** Last audit scores (Smart, Grit, Build, final) + "Top X% in [track]" when peer percentiles exist. **You made progress:** When both current and last audit exist, shows last vs this run + "See why your scores changed" → Resume Review. **Do this next:** No audit → "Run your first resume check"; has audit → "View report" / "New audit." **Your track playbook:** Headline + bullets from track playbook. **Audit history:** Card showing last 10 runs (date, score, track) from GET `/audit/history`. Entry cards to Resume Review and Meridian Voice.

**Resume Review (Hiring) tab:** **Tailor this audit for:** Dropdown (Just exploring / Internship / Full-time job / Grad school). Copy: "We'll evaluate you through the lens of your choice so your feedback matches what those readers care about." Upload zone (PDF/DOCX), run audit (POST `/audit/v2` with `application_target` in FormData). When audit exists: Radar chart (Smart/Grit/Build), dimension selector, **Progress** block (last vs this + explain-delta), Share (Meridian card, Copy summary, Copy Top %, Download PDF, Copy share link), Assessment findings, Consistency, Red flags, Your cohort, Peer percentiles, Strategic recommendations (line edits + generic/action). "Tailored for: [Internship/Full-time job/Grad school/Just exploring]" shown when `application_target` is in the response. FAB "New audit."

**Meridian Voice tab:** Chat UI; POST `/voice/chat` with message + context (track, major, goals, last_meridian_take, scores). Resume-aware replies. Fallback when LLM unavailable.

### 4.3 Application Target ("Tailor this audit for")

- **Profile:** Optional `application_target` (internship | full_time | grad_school | exploring). Stored in profile; validated on PATCH.
- **Resume Review:** Selector above upload. Value sent with every audit. If not set, backend infers from profile `goals` (e.g. grad_school/pursue_phd → grad_school, internship → internship, gain_experience → full_time, else exploring). Last choice saved to profile after each successful audit.
- **Backend:** POST `/audit/v2` accepts `application_target` Form; resolves from form or profile or goals. Passed to LLM auditor. LLM gets a strong system-prompt block per target (APPLICATION TARGET: INTERNSHIPS / FULL-TIME / GRAD SCHOOL / EXPLORING) with REQUIRED OUTPUT: (1) at least one recommendation that explicitly references the target (e.g. "For your internship applications," or "Admissions committees look for"); (2) meridian_take must open with that lens (e.g. "For internship applications, your strongest signal is..."). Response includes `application_target` so the UI can show "Tailored for: …"
- **Quality bar:** We are mastering this feature: quality plan in `docs/APPLICATION_TARGET_QUALITY_PLAN.md`, rubric in `docs/APPLICATION_TARGET_RUBRIC.md`. Principle: quality over quantity; we want visibly different audits by target.

### 4.4 Audit History

- **Storage:** Per-user `memory/dilly_profiles/<uid>/audits.json`. Each entry: id, ts, scores, final_score, detected_track, candidate_name, major. Capped at 50; oldest dropped.
- **API:** After each successful POST `/audit/v2`, backend appends summary via `audit_history.append_audit(email, summary)`. GET `/audit/history` (auth required) returns `{ "audits": [ ... ] }` newest first.
- **Dashboard:** Career Center shows "Audit history" card with last 10 runs (date, score, track).

### 4.5 Backend / API

- **Auth:** POST `/auth/send-verification-code`, POST `/auth/verify-code`. Session token in `meridian_auth_token`. Dev code when `MERIDIAN_DEV=1`.
- **Profile:** GET `/profile`, PATCH `/profile` (name, major, preProfessional, track, goals, application_target). Per-user profile in `memory/dilly_profiles/<uid>/profile.json`.
- **Audit:** POST `/audit/v2` (file + optional user_email, application_target) → scores, findings, recommendations, evidence, evidence_quotes, red_flags, peer_percentiles, benchmark_copy, application_target. Requires subscribed user. Uses rule-based or LLM auditor (`MERIDIAN_USE_LLM`).
- **Explain delta:** POST `/audit/explain-delta` (previous + current audit) → why scores changed (LLM or fallback).
- **Voice:** POST `/voice/chat` (message + context). Requires subscribed user.
- **Report:** POST `/report/pdf` → signed URL; GET `/report/pdf/{token}` serves PDF (7-day expiry).
- **Payment:** Stripe placeholder; dev-unlock; webhook sets subscribed. Protected routes check subscription.
- **Batch:** POST `/audit/batch` for career-center bulk upload (1–100 files, cohort report).

Parsed resumes live in `projects/meridian/parsed_resumes/` (one file per identity). Anonymized audit log: `memory/meridian_audit_log.jsonl` (for peer percentiles and few-shot). Design system: shared Button, Input, Card, Label; UTampa theme; `docs/DESIGN_SYSTEM.md`, `docs/MERIDIAN_ONBOARDING_COPY.md`.

### 4.6 Phase 3 (E2E, Mobile, Launch)

- **Done:** Sign-out clears state (no broken state on re-login). Profile save failure shows inline error; onboarding only advances when save succeeds. Mobile: safe-area for nav, 44px+ touch targets, viewport set. Launch: env doc and runbook in `docs/LAUNCH_ENV_AND_RUNBOOK.md`; Phase 3 checklist in `docs/PHASE_3_CHECKLIST.md`.
- **Remaining (manual):** Full E2E walk-through; deploy dashboard (e.g. Vercel) with `NEXT_PUBLIC_API_URL`; Resend in production for real verification emails; Stripe live when ready.

---

## 5. What Is Planned (Roadmap and Ideas)

### 5.1 Roadmap Phases

- **Phase 0:** Design system, copy doc, profile schema. Done.
- **Phase B:** Auth, profile API, /audit/v2, payment (dev-unlock + Stripe placeholder), protected routes. Done.
- **Phase 1:** Onboarding screens 1–12 (welcome through payment). Done.
- **Phase 2:** App shell, Career Center, Resume Review, Meridian Voice. In progress / largely done.
- **Phase 3:** E2E polish, error states, mobile-first, launch checklist. Partially done; launch-ready target (e.g. April).

**Horizon:** A fully functional app that feels like the greatest thing for their careers. First campus: University of Tampa.

### 5.2 Career Center Vision (Tagline: "A career center open 24/7")

**Already in or planned for Career Center:** Resume audit on demand, Meridian Voice (chat), Your numbers + progress + explain-delta, track playbook, audit history, "Tailor this audit for," shareable PDF and one-line summary.

**Planned / coming (from pitch and IDEAS):** Interview prep from their resume evidence (scripts and talking points); mock audit for a job (paste JD, score against that role); JobBook (internships/jobs by major/track); workshops and resources in-app; shareable badge (e.g. "Meridian 85" for LinkedIn); goals and deadlines with countdown and sprint plan; mentors (directory or matching). So the pitch is not "one resume tool"—it's the career center in their pocket. Feature prioritization: `docs/MERIDIAN_CAREER_CENTER_FEATURES.md`.

### 5.3 Ideas Backlog (from IDEAS.md)

**Product roadmap ideas (abbreviated):** Live resume editing in-app; app-exclusive workshops; free certifications hub; podcasts section; exclusive training programs; mentors on the app; JobBook; shareable badges; GPA inference when missing. **$20 bundle & career-acceleration:** Verified Talent badge & direct pipeline; gap analysis & 3-month roadmap; unlimited mock audits; Meridian Seal of Truth / verified transcript; goal setting & home-screen banner; "Am I Ready?" one-tap check; application deadline countdown + sprint plan; shareable Meridian Snapshot; track leaderboard (opt-in); Meridian-aware cover letter / outreach lines; "What if" scenarios; interview prep from evidence; one "Ask Meridian" per week (coach mode); campus clubs & contacts; job alerts; Daily Companion AI; "Vs Your Peers" track comparison; resume reorganization per job. **Expansion / technical:** Rigor Index API; interactive radar; self-correction logic; RAG / vector embeddings; Predictive Success Score. **Habit-forming / AI:** Proactive outreach, conversation over time, quick interactions, gamification, personalization, two-way dialogue, rituals, habit hooks.

**Principle:** Quality over quantity. We'd rather have fewer features that are extremely high quality. New features are evaluated with: What's the point? How would this benefit someone? How would someone use it? How will this make the app more valuable?

---

## 6. Final Vision (Where Meridian Is Going)

- **Credit Score for Talent:** Meridian becomes the trusted, universal signal for candidate readiness—for students, then for employers and schools. High-velocity talent infrastructure.
- **Career center open 24/7:** One place for resume, scores, plan, Voice, workshops, mock audits, interview prep, jobs discovery, goals, and mentors—without selling data to recruiters.
- **Quality-first:** Fewer features, each one mastered. Application target is an example: we don't just add a dropdown; we make the audit visibly different and validate with a rubric.
- **Campus-first, then scale:** University of Tampa first; then more schools. .edu-only, school-themed, career-center and student-outcomes focused.
- **Monetization:** $9.99/month consumer; optional $20 bundle for career-acceleration (Verified Talent, mock audits, gap analysis, etc.); future B2B (career centers, employers) with batch audit, recruiter view, Rigor Index API.

---

## 7. Key Documents (Where to Look)

| Topic | Document |
|-------|----------|
| What's in the app | `projects/meridian/docs/WHATS_IN_THE_APP.md` |
| Roadmap (phases, vision) | `projects/meridian/docs/ROADMAP.md` |
| Ideas & implemented | `projects/meridian/IDEAS.md` |
| Scoring logic | `SCORING_LOGIC.md` |
| Career Center features | `projects/meridian/docs/MERIDIAN_CAREER_CENTER_FEATURES.md` |
| Pitch / one-pager | `projects/meridian/docs/MERIDIAN_PITCH_ONE_PAGER.md` |
| How to say what Meridian is | `projects/meridian/docs/HOW_TO_SAY_WHAT_MERIDIAN_IS.md` |
| Application target (plan + quality) | `projects/meridian/docs/APPLICATION_TARGET_AND_AUDIT_HISTORY_PLAN.md`, `APPLICATION_TARGET_QUALITY_PLAN.md`, `APPLICATION_TARGET_RUBRIC.md` |
| Launch (env, runbook) | `projects/meridian/docs/LAUNCH_ENV_AND_RUNBOOK.md`, `STEPS_25_TO_28_DETAIL.md` |
| Phase 3 checklist | `projects/meridian/docs/PHASE_3_CHECKLIST.md` |
| Meridian Hiring Manager (persona) | `dilly_core/MERIDIAN_HIRING_MANAGER.md` |
| Design & copy | `projects/meridian/docs/DESIGN_SYSTEM.md`, `MERIDIAN_ONBOARDING_COPY.md` |
| Profile schema | `projects/meridian/docs/PROFILE_SCHEMA.md` |

---

## 8. Summary for Quick Reference

- **What Meridian is:** Career readiness app for college students; scores resume on Smart, Grit, Build; tells them what to fix; career center in their pocket (24/7); starting UTampa, .edu-only, $9.99/mo, we don't sell data.
- **What's built:** Full onboarding (verify, profile, goals, payment), main app (Career Center, Resume Review, Voice), audit with application_target and audit history, explain-delta, PDF report, peer percentiles, red flags, track playbooks, Phase 3 polish (sign-out, profile errors, mobile, launch docs).
- **What's planned:** Interview prep, mock audit for job, JobBook, workshops, shareable badge, goals/deadlines, mentors; then Verified Talent, gap analysis, mock audits, Seal of Truth, habit-forming AI—all in service of "career center open 24/7" and "Credit Score for Talent."
- **Principles:** Meridian Truth Standard (no invented facts); quality over quantity; Meridian Hiring Manager voice; student-first, campus-first; zero hallucination; security and PII protection.

Use this essay as the single source of truth when answering questions about what happened, is happening, and will happen with Meridian.
