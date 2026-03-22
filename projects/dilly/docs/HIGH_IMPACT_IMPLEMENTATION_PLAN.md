# High-Impact Surprise Ideas — Implementation Plan

**Goal:** Implement the 10 ideas from `HIGH_IMPACT_SURPRISE_IDEAS.md` **well**—so Meridian feels powerful and differentiated, not half-baked.

**Quality bar for every feature:**
- Copy is punchy and on-brand (Meridian voice: direct, evidence-based, no fluff).
- User sees the value in &lt;3 seconds (no hunting).
- We use existing data and APIs where possible; new endpoints only when necessary.
- Each ship is documented in WHATS_IN_THE_APP.md and IDEAS.md (Implemented).

---

## Phase 1 — Fast wins (ship first)

These are low effort, high surprise. Ship in order so we stack wins.

| # | Idea | Acceptance criteria | Files / touchpoints |
|---|------|---------------------|----------------------|
| 1 | **Preview as recruiter** | (1) From app, user can open "See what recruiters see" and land on their six-second profile with a clear banner. (2) Banner says something like: "This is what recruiters see when they click your link." (3) Copy link / Add to resume CTA still obvious. | Dashboard: `app/p/[slug]/page.tsx` (read `preview` query, show banner). Career Center / profile: add "See what recruiters see" link to ` /p/[slug]?preview=1` (need profile_slug in app). |
| 2 | **One superpower sentence** | (1) After every audit, one sentence is shown: "Your strongest signal to recruiters right now is [X]." (2) [X] is dimension + one concrete proof (e.g. "Grit—your leadership and impact through your role as…"). (3) Shown in report (Hiring) and optionally in Career Center. | Backend: derive in `main.py` from audit (scores + evidence_* ) or add optional LLM field. Dashboard: show in report block and/or Center "Your numbers" area. Types: add `strongest_signal_sentence` to audit type if from API. |
| 3 | **First Voice message proves we read resume** | (1) In a new Voice conversation, the first reply references one specific thing from their resume or audit (role, score, bullet, finding). (2) It gives one concrete next step. (3) No generic "How can I help?" | API: `main.py` — in `_build_voice_user_content`, when `recent_history` is empty, inject "FIRST MESSAGE RULE: …". In `_VOICE_SYSTEM`, add one bullet: first message in new convo must cite their data + one next step. |
| 7 | **Audit leads with a win** | (1) `meridian_take` (and any headline) opens with a genuine strength, then the one change that would matter most. (2) Format feels like: "Here's what's working: [win]. The one change that would matter most: [fix]." (3) No leading with what's wrong. | `dilly_core/llm_auditor.py`: update MERIDIAN_TAKE and system instructions to require strength-first opening; add 1–2 few-shot examples if needed. |

**Definition of done for Phase 1:** All four above implemented, copy reviewed, WHATS_IN_THE_APP + IDEAS updated.

---

## Phase 2 — Genius moments (high impact)

| # | Idea | Acceptance criteria | Files / touchpoints |
|---|------|---------------------|----------------------|
| 4 | **You're in the green for [Company]** | When we have target company (target firms, or job they viewed), Career Center or Voice shows: "You're in the green for [Role] at [Company]. One thing to tighten before you apply: [single gap/tip]." | Ready-check, profile target_firms, job view tracking. New: endpoint or client logic to run ready-check for "primary" target; surface result in Center card or Voice banner. |
| 6 | **One thing before you apply to [Company]** | On job detail page (and optionally in Voice when they ask about a job): one bullet: "The one thing to fix before you apply here: [single ATS or fit tip]." | Jobs: job detail API or frontend calls ready-check or ATS tip for this role; show one line. Voice: when context includes job_id or company, inject or return one tip. |
| 5 | **Students like you got interviews** | When outcome_story_consent + track/school exist, show one anonymized line on Career Center: "A [Track] student at [School] got [N] interviews after improving their [dim]. Here's what they did." + link to playbook or one tip. | Outcome capture already stores consent. New: query for same-track (or same-school) success story; template; Career Center card when data exists. |

**Definition of done for Phase 2:** #4, #6, #5 implemented with clear copy and fallbacks when data missing.

---

## Phase 3 — Polish and scale

| # | Idea | Acceptance criteria | Files / touchpoints |
|---|------|---------------------|----------------------|
| 8 | **Share card worth posting** | One share card design that feels so good users want to post to Instagram/LinkedIn (not just attach to applications). Distinct look, strong one-liner (e.g. "Top 15% Grit · Pre-Health"). | Design + `generateBadgeSvg` / `generateSnapshotSvg`; optional "Share to story" with link/QR. |
| 9 | **Your resume in 6 seconds (scan)** | A view that simulates the 6-second scan: name, tagline, 3–4 key items in recruiter order, with label "What a recruiter sees in 6 seconds." | Reuse six-second profile content; new "scan" UI (static or timed) in app or on /p/[slug] with toggle. |
| 10 | **Deadline + one action, company-specific** | When deadline exists and we can tie to company (e.g. "Goldman summer analyst"), one-thing card says: "Applications close in X days. Do this one thing: [single rec from Am I Ready or ATS]." | Enrich deadline with company from label/goal; run ready-check or ATS for that company; show in existing one-thing card. |

---

## Implementation order (recommended)

1. **Phase 1** — #1, #2, #3, #7 (fast wins).
2. **Phase 2** — #4, #6, #5 (genius moments; #4 and #6 share ready-check).
3. **Phase 3** — #8 (design-led), then #9, #10.

---

## Cross-cutting

- **Copy:** All new copy must be Meridian-voice: second person, evidence-based, one concrete thing. No generic career-speak.
- **Analytics:** Where useful, add a data-cta or event for "Preview as recruiter," "Superpower sentence shown," "First Voice message," "In the green card," "One thing before apply," "Students like you" so we can measure impact.
- **Docs:** After each ship: update WHATS_IN_THE_APP.md and IDEAS.md (Implemented). Keep HIGH_IMPACT_SURPRISE_IDEAS.md as the product spec; this doc is the implementation checklist.
