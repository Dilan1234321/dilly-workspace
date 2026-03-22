# Meridian Voice — Understand the User on a Personal Level (Audit-Only)

**Goal:** Meridian Voice should understand the user practically on a personal level **using only what we get from their audits** (and the profile data tied to the audit flow). No separate "tell us about yourself" questionnaire — everything derived from resume audits, profile (major, minors, goals, deadlines, etc.), and how they use the app.

---

## What "Understand on a Personal Level" Means Here

- **Career-relevant personal:** Their strengths and gaps, their story (where they started vs now), what they’re aiming for, and what’s in reach vs a stretch.
- **Actionable:** Voice can give tailored advice, reality checks, and alternatives (e.g. data science → IT/AI at a finance firm, not generic finance).
- **Proactive:** Asks when the call is to add to calendar, nudges follow-through on action items, and calibrates tone to deadlines and progress.
- **Consistent memory:** References specific roles, bullets, and past conversations so it feels like one advisor who knows them.

---

## What We Already Have (Current Voice Context)

| Source | What Voice Gets Today |
|--------|------------------------|
| **Profile** | name, major, majors, minors, track, goals, career_goal, application_target, company, target_school, deadlines, voice_tone, voice_notes, first_audit_snapshot (scores only), achievements |
| **Latest audit** | scores, final_score, last_meridian_take, audit_findings, recommendations (top N), peer_percentiles, benchmark_copy, application_target |
| **Previous audit** | last_audit: scores + meridian_take (for delta and comparison) |
| **Resume** | Full parsed resume text (so Voice can quote bullets, roles, sections) |
| **Progress** | first_audit_snapshot vs latest scores; score_trajectory (potential if they complete recs) |
| **Behavior** | action_items (open tasks from Voice), voice memory (past conversation summaries), user_liked_last_response |
| **Intent hints** | scheduled_call, deadlines, jobs, tools_run, etc. |

**Already in system prompt:** Resume-native answers, major/minors fit and alternatives, scheduled-call → ask when and add to calendar, company-aware advice, tone and voice_notes.

---

## Gaps (What Would Make It Feel "Personal")

1. **Strongest signal and evidence quotes** — We have `strongest_signal_sentence` and `evidence_quotes` (per dimension) from the audit but don’t pass them into Voice context in a clear "this is your standout" block. Voice could open with "Your strongest signal right now is…" and quote their resume.
2. **Red flags and consistency** — `red_flags` and `consistency_findings` exist on the audit; not in Voice context. Voice could avoid suggesting things that contradict a red flag or remind them of a consistency fix.
3. **First audit "who they were"** — `first_audit_snapshot` is scores only. We don’t store first `meridian_take` or first `strongest_signal`. So we can’t say "When you first came in, Meridian said X; now it’s Y."
4. **Story over time** — We have multiple audits in history (full payload in `audits.json`). We don’t yet compute or pass: improvement pattern (which dimension moved most), track consistency, or a one-line "journey" summary.
5. **Inferred preferences** — From behavior: which recs they acted on (if we could infer from re-audit deltas), which deadlines they set, how they use Voice (voice_notes, liked responses). We have voice_notes and liked response; we don’t yet summarize "this user prefers short answers" or "cares most about Grit."
6. **Single "know me" brief** — No consolidated block like "What Meridian knows about this student" (3–5 bullets: strengths, main gap, goal, fit, next best move). Today the model has to infer from many separate fields.

---

## Roadmap

### Phase 1: Use Existing Audit Data Fully (Low Effort)

**Objective:** Every piece of audit output that’s already available is in Voice context in a form the model can use.

| Item | What to do |
|------|------------|
| **Strongest signal** | Pass `strongest_signal_sentence` in context. Add to system prompt: "When relevant, open or tie advice to their strongest signal (below)." |
| **Evidence quotes** | Pass `evidence_quotes` (smart/grit/build) in the context block so Voice can say "Your Grit proof is this line: …" without re-reading the full resume. |
| **Red flags** | Pass `red_flags` (and optionally `consistency_findings`) into context. Prompt: "Do not suggest things that contradict red flags; you can gently remind them of a red flag if relevant." |
| **Structure "what we know"** | Add a short "What we know about this student" section in the context (name, major/minors, track, goal, strongest signal, main gap from findings, one-line take). Reduces reliance on the model stitching everything from scattered fields. |

**Outcome:** Voice consistently references their standout line, avoids contradicting red flags, and has a clear "know me" summary.

---

### Phase 2: Richer First-Audit Snapshot (Medium Effort)

**Objective:** Remember "who they were" at first audit so Voice can talk about progress in concrete terms.

| Item | What to do |
|------|------------|
| **Expand first_audit_snapshot** | When saving first_audit_snapshot, add `meridian_take`, `strongest_signal_sentence`, and optionally `application_target`. Keep size small (one-liners only). |
| **Pass to Voice** | In `_build_voice_user_content`, if `first_audit_snapshot` has a take or strongest_signal, add: "At first audit Meridian said: [take]. Strongest signal then: [sentence]." |
| **Prompt** | "When they ask about progress or how far they’ve come, compare first-audit take and current take (or strongest signal then vs now)." |

**Outcome:** Voice can say "When you first ran your audit, Meridian’s take was … Now it’s …" and tie progress to their actual story.

---

### Phase 3: Inferred Story Over Time (Medium–High Effort)

**Objective:** Use audit history to infer a simple "journey" and patterns so Voice can speak to their trajectory.

| Item | What to do |
|------|------------|
| **Improvement pattern** | From last 2–5 audits: which dimension improved most, which stayed flat. Pass to context: e.g. "Score trend: Grit +12 over last 3 audits; Smart flat; Build +3." |
| **Track consistency** | If we have multiple audits: same track every time vs changed. "They’ve consistently been tracked as Tech" or "Track changed from Exploring to Pre-Health." |
| **Optional: one-line journey** | After N audits (e.g. 3+), optionally run a light LLM or rule-based pass: "In one sentence, summarize this student’s progress (e.g. 'Grit and leadership improved; Build still the lever')." Store in profile or compute on demand; pass to Voice. |

**Outcome:** Voice can reference "You’ve been steadily lifting Grit" or "Your track has stayed Tech — let’s double down on that."

---

### Phase 4: Behavioral Signals (Medium Effort)

**Objective:** Use how they use the product to tune tone and priorities (still audit-centric; no separate surveys).

| Item | What to do |
|------|------------|
| **Voice notes and liked responses** | Already in context. Add a single line when present: "User has asked to remember: [notes]. User tends to like [type of response] (from liked feedback)." So the model reinforces what works. |
| **Deadlines they set** | We already pass deadlines. Prompt: "Notice what they’re preparing for (e.g. career fair, firm X) — that’s their current priority." |
| **Re-audit cadence** | If we have audit timestamps: "Last audit was 2 weeks ago" vs "Hasn’t re-audited in 2 months." Voice can nudge "Ready to re-run and see how your edits landed?" when relevant. |
| **Acted-on recs (later)** | Harder: infer from "recommendation was add project X; next audit has project X" to mark rec as acted on. Could feed "They’ve already acted on: [list]. Still open: [list]." |

**Outcome:** Voice feels tuned to how they like to be talked to and what they’ve already done vs still need to do.

---

### Phase 5: "Personal Brief" or "Know Me" Block (Optional, Higher Effort)

**Objective:** A single, updatable "Meridian’s view of this student" that Voice (and maybe UI) can use so we don’t rely only on the model inferring from many fields.

| Item | What to do |
|------|------------|
| **Brief schema** | 3–5 bullets: (1) strengths (from scores + evidence), (2) main gap (from findings), (3) goal/fit (from career_goal, major, company), (4) how they learn/prefer (from voice_tone, voice_notes, liked feedback), (5) next best move (top recommendation or gap). |
| **When to update** | After each audit (or when profile/deadlines change): recompute the brief (rules or a small LLM call). Store in profile as `meridian_personal_brief` or similar. |
| **Pass to Voice** | At the top of the context block: "What Meridian knows about this student: [brief]. Use this to sound like you know them; add detail from resume and findings as needed." |

**Outcome:** One place that defines "who this person is" for Voice; easier to keep behavior consistent and to extend later (e.g. show in app, or use in job matching).

---

## Summary Table

| Phase | Focus | Effort | Delivers |
|-------|--------|--------|----------|
| **1** | Use existing audit data fully | Low | Strongest signal, evidence quotes, red flags, structured "what we know" in Voice context |
| **2** | Richer first-audit snapshot | Medium | First meridian_take and strongest_signal; Voice can compare "then vs now" |
| **3** | Inferred story over time | Medium–High | Improvement pattern, track consistency, optional one-line journey |
| **4** | Behavioral signals | Medium | Voice notes + liked feedback in prompt; re-audit cadence; later acted-on recs |
| **5** | Personal brief | Optional, High | Single "know me" block updated after each audit; Voice and UI use it |

---

## Voice onboarding (conversational "get to know you")

When a student **first opens Meridian Voice**, they go through a short conversational onboarding: Meridian asks 4–5 questions (what they're preparing for, main career goal, target companies/industries, biggest concern, how they like advice). Answers are stored in profile (`voice_onboarding_answers`, plus mapping to `application_target`, `career_goal`, `company`, `voice_biggest_concern`, `voice_tone`) and passed into every Voice context so Meridian can maximize help. This is separate from the main app onboarding; it lives entirely inside the Voice tab. See backend `_VOICE_ONBOARDING_QUESTIONS` and GET `/voice/onboarding-state`, and frontend Voice tab effect that fetches and shows the first question.

---

## Constraint: Audit-Only (for the roadmap phases)

The phases below focus on **audit-derived** understanding. The Voice onboarding above adds an explicit "get to know you" step so Meridian can tailor from day one. Personal understanding then comes from:

- Resume and audit outputs (scores, findings, recommendations, evidence, red flags, meridian_take, strongest_signal).
- Profile fields that are already part of the product (major, minors, goals, career_goal, deadlines, application_target, company).
- Behavior we can observe (audit history, re-audits, Voice usage, voice_notes, liked responses, action items).

If we later add one optional onboarding question (e.g. "In one line, what do you want next?"), it could feed the brief or goals — but the roadmap does not depend on it.

---

## Suggested Order

1. **Phase 1** first — fast wins, no new storage or LLM; just pass existing audit fields and add a small "what we know" block.
2. **Phase 2** next — extends first_audit_snapshot and makes progress feel concrete.
3. **Phase 4** (behavioral) in parallel or after Phase 2 — voice_notes and liked feedback are already there; prompt and context tweaks only.
4. **Phase 3** when we want to lean on audit history for "journey" and trends.
5. **Phase 5** if we want a single, maintainable "know me" artifact for Voice (and possibly for the app).

This order gets Meridian Voice to understand the user on a practically personal level using only audits and existing profile/behavior data, step by step.
