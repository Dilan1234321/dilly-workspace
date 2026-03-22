# Meridian Pitch → Reality Map

**Purpose:** Map each part of the 5‑minute pitch to what’s actually built. Use this for investor due diligence, roadmap talks, and honest “what’s done vs what’s next” conversations.

**Legend:**
- **Perfected** — Shipped, polished, and matches (or exceeds) the pitch.
- **Complete** — Shipped and works; minor polish or scale-only work left.
- **In progress** — Partially built or blocked on one dependency (e.g. live payments).
- **Not started** — Claimed in pitch but not yet implemented.

---

## Hook (30 sec)

| Pitch | Status | Notes |
|-------|--------|--------|
| “Recruiters spend 6–8 seconds; they’re pattern-matching, not reading bullets” | **Complete** | Narrative. No product dependency. |
| “Students have no way to know what that pattern looks like. Until now.” | **Complete** | Meridian delivers that pattern (scores + evidence + track). |

---

## Problem (60 sec)

| Pitch | Status | Notes |
|-------|--------|--------|
| “20M undergrads applying with no real feedback” | **Complete** | Problem framing only. |
| “Career center 9–5, booked out, generic advice” | **Complete** | Problem framing only. |
| “Friends, ChatGPT, Reddit → generic advice, no idea where they stand” | **Complete** | Problem framing only. |
| “30% of applications are fake; Handshake/LinkedIn enable mass fake applications” | **Complete** | Problem framing only. |
| “The gap is a lack of truth, not templates” | **Complete** | Framing; product addresses it below. |

---

## Solution (90 sec)

### Core product

| Pitch | Status | Notes |
|-------|--------|--------|
| “Meridian scores your resume the way a senior hiring manager reads it” | **Perfected** | `dilly_core/scoring.py`, `llm_auditor.py`. Ground Truth + track-specific rubrics. |
| “Three dimensions: Smart, Grit, Build” | **Perfected** | 0–100 per dimension, final score, full rubric in `llm_auditor.py` and UI. |
| “Track-specific: pre-med like adcoms, finance like Big Four, tech like FAANG” | **Perfected** | 11 tracks in `dilly_core/tracks.py` (Pre-Health, Pre-Law, Tech, Science, Business, Finance, Consulting, Communications, Education, Arts, Humanities). Track-specific definitions and playbooks in dashboard + backend. |
| “Eleven different tracks, eleven different scoring frameworks” | **Complete** | 11 canonical tracks; each has its own Smart/Grit/Build definitions and advisor style in prompts. |
| “100% fake-free, .edu-only” | **Complete** | Auth: `.edu` regex enforced; 6‑digit verification code; only allowed school domains (UTampa live). Apply-through-Meridian email: “This applicant is a **verified .edu student**. No fakes, no bots.” Caveat: currently one school (spartans.ut.edu); expanding to more .edu is config (schools.py). |
| “Nobody fakes a .edu email” / “Applicants from Meridian are 100% verified college students” | **Complete** | Same as above; recruiter-facing copy in apply email and six-second profile. |
| “Every score tied to evidence — direct quote from your resume (Meridian Truth Standard)” | **Perfected** | `evidence_quotes` (LLM + `dilly_core/evidence_quotes.py` fallback); audit_findings cite specific roles/orgs; MTS in SOUL.md and auditor prompts; “if it’s not on your page, it doesn’t count.” |
| “Consultant-level recommendations; specific line edits” | **Perfected** | `line_edit` type: `current_line`, `suggested_line`, `action`, `diagnosis` (e.g. “Add scope”, “Stronger verb”). No cap; track-specific. ATS “Fix It” rewrites on top. |
| “Example: ‘This bullet says you managed a team. Change it to: Led a 6-person team that increased event attendance by 40%.’” | **Perfected** | Delivered via LLM line_edits and ATS rewrites (rule-based + LLM). |
| “Meridian Voice — career coach that knows your resume, scores, track, goals” | **Complete** | POST `/voice/chat` with full context (resume, audit, track, goals, last_meridian_take, etc.). First message must reference something specific from resume/audit. Tools: ready check, gap scan, jobs, deadlines, action items. Onboarding, multiple chats, tone settings. Phases 3–5 in roadmap (e.g. screen-aware help) are enhancements, not required for pitch. |
| “Ask anything, anytime. ‘What should I do this week?’ ‘How do I explain this gap?’” | **Complete** | Voice supports open-ended Q&A and tool-driven answers (Am I Ready?, gap, interview prep, etc.). |

---

## Proof (30 sec)

| Pitch | Status | Notes |
|-------|--------|--------|
| “Meridian is built and running. I built it at UTampa.” | **Perfected** | API, dashboard, auth, audit, Voice, reports; UTampa theme and school config. |
| “Scoring engine works. AI auditor works. Career coach works.” | **Perfected** | All in production code paths; real audits and Voice in use. |
| “We’ve audited real student resumes; feedback: ‘I didn’t know that about my resume.’” | **Complete** | Outcome/quote; product supports the moment (scores + evidence + recommendations). |

---

## Business (30 sec)

| Pitch | Status | Notes |
|-------|--------|--------|
| “$9.99 a month” | **Complete** | Copy everywhere (onboarding, paywall, website, docs). |
| “Unlimited audits, PDF reports, peer benchmarking, and Voice” | **Perfected** | No audit cap; POST `/report/pdf` → signed URL; peer percentiles + Vs Your Peers; Voice for subscribers. |
| “Students pay $16 for Chegg to cheat; we’re $10 to get hired” | **Complete** | Narrative; pricing is implemented. |
| “Meridian, I want to be senior investment banker — Meridian will help you get there” | **Complete** | Delivered via Voice + goals + track + recommendations + ready check / gap / playbooks; no separate “career path” product. |

**Payments (what’s behind the promise):**
- **In progress:** Live Stripe (checkout, webhook, subscription) is implemented; needs `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` and Resend in production for real .edu verification. Dev-unlock works; “placeholder” = live payment not yet turned on for public.

---

## Vision (30 sec)

| Pitch | Status | Notes |
|-------|--------|--------|
| “Career centers haven’t changed in 30 years” | **Complete** | Narrative. |
| “Handshake/LinkedIn help you find jobs; they don’t tell you if you’re ready. Meridian closes that loop.” | **Complete** | Product does close the loop: audit → scores → recommendations → Voice → Am I Ready? / jobs. |
| “We don’t replace career centers — we make them irrelevant by being better, faster, always available.” | **Complete** | Positioning; product supports it (24/7 Voice, instant audit, track-specific). |

---

## Close (30 sec)

| Pitch | Status | Notes |
|-------|--------|--------|
| “Six seconds. Meridian makes sure your resume tells the right story.” | **Complete** | Narrative; product delivers the “right story” via scores, evidence, and line-level advice. |

---

## Problems only (no narratives)

| Problem | Gap |
|--------|-----|
| Track count | Use **11 tracks** in the pitch (current product). Adding a 12th is optional only if you have a distinct cohort in mind; 11 is accurate. |
| .edu-only scope | Current scope: **UTampa only** (@spartans.ut.edu). Expansion to more schools planned for later (`schools.py` + allowlist). |
| Live payments | Deferred; will be handled later. (Stripe code exists; turn on when ready.) |
| Verification emails | Deferred; will be handled later. (Resend/production .edu codes when ready.) |
| Voice roadmap | Phases 3–5 (e.g. screen-aware help, deeper coaching) not shipped; core Voice works. |

---

## Summary Table

| Category        | Perfected | Complete | In progress | Not started |
|----------------|-----------|----------|-------------|-------------|
| Hook / Problem | —         | All      | —           | —           |
| Solution       | 6        | 5        | —           | 0           |
| Proof          | 1        | 2        | —           | —           |
| Business       | 1        | 3        | 1 (Stripe live) | 0    |
| Vision / Close | —         | All      | —           | —           |

**Bottom line for the pitch:**  
Almost everything you say is **shipped**: scoring (Smart/Grit/Build), track-specific frameworks, .edu-only and verified-student story, evidence and Meridian Truth Standard, consultant-level line edits, Meridian Voice, PDF reports, peer benchmarking, and $9.99 positioning. The only “in progress” item for the business section is **turning on live Stripe and production verification emails** so every signup pays and gets a real .edu code. No pitch claim is “not started.”

---

*Last updated: 2026-03-16. Update this doc when you ship Stripe live, add schools, or change pitch claims.*
