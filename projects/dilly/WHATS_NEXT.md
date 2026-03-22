# What's Next — Meridian

**Goal:** Meridian aims to be the **best and most powerful** career-acceleration app for students: the place they trust for resume quality, interview readiness, job matching, and recruiter visibility.

When the user asks **"what's next"**, answer from this file: state the idea and explain **how it benefits Meridian** in that goal.

---

## Done

### Tech cohort: security_metrics + regression (March 2026) ✅
- **Cybersecurity security_metrics_in_bullets:** `ScoringSignals.security_metrics_count`; extraction for alerts triaged, MTTR, incidents investigated, false positive reduction, etc. Cybersecurity Grit bonus in auditor: +5 pts per count, cap 20. See TECH_SCORING_EXTRACTION_AND_RECOMMENDATIONS.md.
- **Tech scoring regression:** `scripts/tech_scoring_regression.py` + `scripts/fixtures/tech_scoring_regression_expected.json` (inline snippets). Asserts outcome_tied_hits, skills_without_outcome, security_metrics_count, deployed_app, build_min/max. Run from workspace root to gate scoring changes.

### Tech cohort: tie-to-outcome in LLM path (March 2026) ✅
- **Implemented:** "Tie skills to outcomes" recommendation now merged into the LLM audit path for Tech. `llm_auditor._append_tech_tie_to_outcome_if_needed()` runs after `_to_auditor_result`; when track is Tech and `get_tech_outcome_tied_signals` finds skills without outcome, the same action rec is appended so it appears whether the audit used LLM or rule-based path.

### voice/firm-deadlines (March 2026) ✅
- **Implemented:** POST /voice/firm-deadlines returns saved (user calendar deadlines matching firm) + suggested (LLM-generated typical cycle dates with disclaimer). Frontend shows both with calendar vs estimate icons; Voice app features updated so Meridian can answer "when is [firm]'s deadline?".

### Observability (request logging, request_id, failure logging) ✅
- **Implemented:** `main.py`: request_id in middleware; request log (method, path, status, duration); `[API] FAIL audit|voice|ats request_id status` on 4xx/5xx. No PII.

---

## Backend

### Extend errors + validation to more routes ✅
- **Implemented:** Auth (magic link, verify, redeem-gift, beta-unlock, gift-checkout, create-checkout, dev-unlock, webhook) use Pydantic + `errors.*`. Report (report_pdf, report_pdf_get, email-to-parent, apply-through-meridian) use Pydantic + `errors.*`. Profile (get, update, photo, transcript, parent-invite, public profile) use `errors.*`. Audit (file validation, explain-delta, ready-check, post_badge, batch) use `errors.*`. New schemas: RedeemGiftRequest, BetaUnlockRequest, GiftCheckoutRequest, ReportEmailToParentRequest, ApplyThroughMeridianRequest.

### Performance (compression, async) ✅
- **Implemented:** `main.py`: `GZipMiddleware` added for response compression. Audit, voice, and ATS route handlers are all `async def`; heavy work (LLM, file I/O) runs in-process; for future scaling, consider `asyncio.to_thread()` for CPU-bound audit steps.

### OpenAPI and API docs ✅
- **Implemented:** `openapi_helpers.py`: `ERROR_RESPONSES` (400, 401, 403, 404, 429, 500, 503) with `ErrorResponse` model. Key routes (auth send/verify-code, audit/v2, profile get, report/pdf) document these. App has description, version, openapi_tags for all routers. Route summaries added to audit, badge, explain-delta, ready-check.

---

## UI (Career Center)

### Streamline Career Center (hero + More, less scroll) ✅
- **Implemented:** Hero: compact single-row scores (Smart, Grit, Build) tappable → Report; smaller Voice CTA ("Ask Meridian" + input + chips). Compact row: ATS, Jobs, Recruiter. Collapsible "More from your career center." Quick links (Report, New audit, Edit resume, Jobs, Calendar, Insights, Stickers) sticky above nav when on Center, Hiring, Calendar, or Practice.

### Recruiter feedback Phase 1 ✅
- **Implemented:** POST /recruiter/feedback; memory/recruiter_feedback.jsonl (append-only). Recruiter UI: candidate detail fires "view" on load; Shortlist, Pass, Contact buttons fire respective events.

### Recognized tech employers (move to editable file) ✅
- **Implemented:** List moved to `knowledge/recognized_tech_employers.txt`. One name per line, lowercase; # for comments. `dilly_core/scoring.py` loads at runtime via `_get_recognized_tech_employers()`; falls back to built-in list if file not found.

### Recruiter feedback Phase 2 (use in ranking) ✅
- **Implemented:** `get_feedback_scores()` reads recruiter_feedback.jsonl; feedback_score = shortlists + contacts − passes, normalized to 0–100 (50 = neutral). Blended into match_score with weight 0.09. Response includes `feedback_score` per candidate.

### Live resume editing UI ✅
- **Implemented:** `/resume-edit` route. Parses structured_text from latest audit into section cards. Inline-editable fields, collapsible experience/project cards, bullet editor (Enter = new bullet, Backspace = remove). Auto-save to `resume_edited.json` in user profile folder. Re-audit from edited text via `POST /resume/audit`. "Edit" in quick links bar + "Edit resume" action in Review hub. 375px mobile-first. Backend: `GET /resume/edited`, `POST /resume/save`, `POST /resume/audit`. Router: `api/routers/resume.py`.

### Application target context pass ✅
- **Implemented:** Free-text `application_target_label` field (e.g. "Goldman Sachs, Summer Analyst") stored in profile. Career Center shows a "Tailored for" card — tap to edit. Label injected into the LLM audit as a specific targeting block so every recommendation is personalized for that exact company/role. Report now shows the label prominently. Backend: `application_target_label` added to `/profile` PATCH allowed fields and passed through `run_audit_llm`.

### Streak + daily check-in ✅
- **Implemented:** Daily streak counter in Career Center. `POST /streak/checkin` records check-in per day; auto-fires on app load. Career Center shows streak card with fire emoji, daily micro-action, and "Do it" CTA. Streak resets gracefully if a day is missed. Data stored in `profile.streak` JSON. Achievement badges at 7d/30d.

### Live bullet score preview in Resume Editor ✅
- **Implemented:** `POST /resume/bullet-score` — fast rule-based scorer (no LLM, sub-100ms). Evaluates: strong action verb (+30), quantification (+35), length/specificity (+20), tech keywords (+15). Returns 0-100 score, label (Strong/Good/Needs work/Weak), and 1-2 hints. `BulletRow` in Resume Editor shows a colored dot after 900ms debounce; inline hint for scores <80. Green = Strong, Gold = Good, Orange = Needs work, Red = Weak.

### Structured mock interview mode ✅
- **Implemented:** `/mock-interview` route — dedicated structured interview session page. 5 behavioral questions, STAR format, turn-by-turn. Per-answer scoring (1-5 with label, strengths, improvements). Session summary at end with top 2 improvements and per-question breakdown. Questions tailored to audit track and target role. Backend: `POST /voice/mock-interview` with LLM-powered structured JSON scoring. Practice tab "Mock interview" card now routes to this page instead of generic Voice chat.

### Application Tracker ✅
- **Implemented:** Application tracker on **Get Hired** (`/?tab=resources`) — **Pipeline** / **Application tracker** block with full Kanban (Saved → Applied → Interviewing → Offer → Rejected), stats, add/edit/delete, **Prep with Dilly AI**. **`/applications`** redirects to **`/?tab=resources&view=applications`** (scrolls to tracker). **`/career?tab=applications`** redirects the same way (tracker no longer on Career Hub tab). Auto-populated when student clicks **Apply on Meridian** on Jobs. Backend: `GET/POST /applications`, `PATCH /applications/{id}`, `DELETE /applications/{id}` in `api/routers/applications.py`.

### Voice intelligence: screen-aware + score trajectory ✅
- **Screen-aware Voice help:** `current_screen` (e.g. "center", "insights", "hiring", "resume-edit") is sent in Voice context payload; `build_voice_system_prompt` injects a screen-specific description block so Meridian answers "where do I…?" and "how do I fix this?" referencing the exact screen. `format_voice_user_content` also appends `Current screen: <id>` to the inline context blob. "Ask Meridian" buttons added to Career Center, Insights, and Resume Review headers.
- **Score trajectory in Voice:** `build_voice_system_prompt` reads `score_trajectory` from context; when completing top recommendations would gain ≥3 pts on any dimension, it injects a coaching block (e.g. "Completing these would push your Grit score up 8 pts → 78"). Meridian can now answer "how much can I improve?" accurately.
- **Removed (March 2026):** Proactive “quick insight” first message when opening Voice on an empty convo (deadline / trajectory / top rec injection). Users start with empty chat + starter chips only.

---

### Conversation memory summary + trajectory chip ✅
- **Conversation memory summary:** When the user leaves Voice (closes overlay or switches tab from voice), we compute how many items were added to voice memory this session. If > 0, a compact card appears on Career Center: "From your last Voice chat: Meridian saved N things to your profile (skills, experience, etc.). We use these for jobs and audits." Shown for 24h with "Open Voice" and dismiss. Ref snapshot on enter (overlay open or mainAppTab === "voice"); profile_updates.voice_memory now syncs to voiceMemory state so the count is accurate.
- **Voice follow-up chip "How much can I improve?":** After every Voice response (streaming and non-streaming), if the user has an audit with score trajectory gains ≥3 on any dimension, we append "How much can I improve?" to the follow-up suggestions. Tapping it sends that prompt so Meridian returns the trajectory answer with specific gains.

---

### Emotional + Practical Support ✅
- **Implemented:** Voice emotional support block in system prompt. _classify_emotional_context() detects rejection, nerves, celebration, imposter syndrome, transitions. Proactive rejection context when user has rejected apps. Starter chips and rotating examples for emotional sharing.

### Second Brain for Career ✅
- **Implemented:** Career Hub at `/career`. Timeline, search, connections, progress, decision log. GET /career-brain/*, POST /career-brain/decision-log. Profile decision_log. Entry from Explore and Quick links.

### Eliminate Repetitive Work ✅
- **Implemented:** `/templates` hub with cover letter (full), thank-you, follow-up, LinkedIn, resume tailoring, interview prep. POST /templates/* endpoints. Personalized from profile; user edits before sending. Entry from Explore and Quick links.

---

## Next

**Pick by impact and effort; evaluate with: What's the point? Who benefits? How do they use it? How does it make Meridian more valuable?**

- **Full backlog:** Ideas / On hold in `projects/meridian/IDEAS.md`; more Voice ideas in `docs/MERIDIAN_VOICE_SMART_ROADMAP.md`.

---

## Product (from IDEAS.md)

- **Ideas / On hold** in `projects/meridian/IDEAS.md` are the backlog. When picking "what's next," choose by impact and effort; each should still be evaluated with: What's the point? Who benefits? How do they use it? How does it make Meridian more valuable?

---

**Keep this file updated:** When a "what's next" item is done, move it to a "Done" or "Implemented" note and add the next priority. When new strategic priorities appear, add them here with the same structure: idea + how it benefits Meridian's goal to be the best and most powerful app.
