# Context for New Chat — Meridian Voice & Data Capture

## Current Goal

Make Meridian Voice a **data-capturing and storing machine**: when students tell Meridian about skills, experiences, or projects that aren't on their resume, we save them permanently and use them everywhere (audits, job matching, recruiter search, profile txt).

---

## What We've Built (Recent Sessions)

### Voice data capture
- **beyond_resume** — General skills/tools/experiences captured from natural conversation. Stored in profile; extracted via LLM with conversation history (last 8 turns) so implicit mentions are caught (e.g. "I was debugging that Flask app" → Flask).
- **experience_expansion** — Per-role deep-dive data (skills, tools_used, omitted) from the "Help Meridian know you better" flow.
- **Permanent memory** — Voice never forgets. `beyond_resume` and `experience_expansion` are injected into the system prompt so the LLM always sees what's already captured.
- **Context-aware extraction** — Passes history + already_captured to avoid re-extracting. Deep-dive explicitly asks: "So, tell me some stuff about your experience and skills that you had no room to put in your resume."

### Where the data flows
- **candidate_document.py** — Voice-captured data in the embedding doc for recruiter search.
- **skill_tags.py** — `extract_skill_tags_from_voice_data(profile)` so recruiter matching uses Voice skills.
- **llm_auditor** — `supplementary_context` injects Voice data so re-audits reference what they told Meridian.
- **job_matching.py** — `_voice_captured_text(profile)` for rule-based keyword overlap + LLM prompt.
- **dilly_profile_txt** — `[VOICE_CAPTURED]` section in the .txt files. `write_dilly_profile_txt` is called after every Voice save (beyond_resume, experience_expansion, onboarding).

### Voice UX
- **Onboarding** — 5-question get-to-know-you flow; answers saved to profile (application_target, career_goal, voice_biggest_concern, voice_tone, voice_onboarding_answers).
- **Personalized first message** — Returning users get a greeting that references career goal, target companies, biggest concern.
- **voice_biggest_concern + onboarding answers** — Injected into Voice system prompt so Meridian acknowledges and addresses them.

### Backfill
- **backfill_dilly_profile_txt.py** — Regenerates all profile .txt files with the new [VOICE_CAPTURED] section. Run: `python3 projects/meridian/scripts/backfill_dilly_profile_txt.py`.

---

## Why We're Doing It

1. **Students have more than fits on a resume** — Skills, tools, side projects, leadership. Voice captures that so Meridian knows the full picture.
2. **Better matching** — Job recommendations and recruiter search should reflect everything the student told us, not just the resume.
3. **Smarter audits** — Re-audits can reference "as you mentioned to Meridian" when giving recommendations.
4. **Trust** — First message proves we read their profile; permanent memory proves we don't forget.

---

## Next Steps (Prioritized)

1. ~~**Re-index candidate after Voice saves**~~ — **Done.** `_reindex_candidate_for_voice(email)` called when Voice saves `beyond_resume` or `experience_expansion` so recruiter search stays in sync.

2. ~~**Verify Voice → profile persistence**~~ — **Verified.** Backend persists via `save_profile` before returning `profile_updates`; frontend merges into local state. No PATCH needed; data persists across sessions.

3. ~~**Onboarding step 2 → dedicated field**~~ — **Done.** `target_companies` (list) for job matching, profile txt, and PATCH. Step 2 parses comma-separated input.

4. ~~**Update IDEAS.md / WHATS_IN_THE_APP**~~ — **Done.** Voice data flow, [VOICE_CAPTURED], re-index, target_companies documented.

---

## Key Files

- `projects/meridian/api/voice_helpers.py` — System prompts, extraction, memory formatting
- `projects/meridian/api/routers/voice.py` — Voice endpoints, _append_beyond_resume_and_save, _compute_profile_updates
- `dilly_core/candidate_document.py` — _build_voice_data_block
- `dilly_core/skill_tags.py` — extract_skill_tags_from_voice_data
- `dilly_core/dilly_profile_txt.py` — build_dilly_profile_txt with [VOICE_CAPTURED]
- `projects/meridian/api/job_matching.py` — _voice_captured_text
- `projects/meridian/api/candidate_index.py` — index_candidate_after_audit (call this after Voice saves)
- `projects/meridian/scripts/backfill_dilly_profile_txt.py` — Backfill script
