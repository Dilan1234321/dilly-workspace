# "What are you applying to?" + Audit history — implementation plan

How we'll add **application_target** (tailor audit to internship / full-time / grad school) and **audit history** (list of past audits per user).

---

## How this differs from onboarding "Goals"

**Onboarding already asks "Your goals"** (multi-select): e.g. "I want an internship", "I want to get into grad school", "I want to gain experience", "I want to figure out what I actually want", plus pre-prof options like "I'm aiming for med school". Those are stored in profile as `goals: string[]` and are **aspirational** — what success looks like in general. They're used for messaging and the "What is Meridian" screen but are **not** currently passed to the audit API.

**Application target** is not a second onboarding question. It answers: *"What is **this** audit for?"* — the immediate context for *this* run. That can match their goals (e.g. they said "internship" in goals, and today they're polishing for internships) or not (e.g. goal = med school, but this week they're applying to a part-time job → they'd choose "part-time/internship" for this run).

**So we do not add any new question in onboarding.** We:

1. **Default from goals** when we need an application_target: e.g. if `goals` includes `grad_school` or `pursue_phd` → default "grad_school"; if `internship` → "internship"; if only "figure_out" or mixed → "exploring". We can add a "full_time" default when "gain_experience" is present and no stronger signal.
2. **Single selector only where they run the audit** (Resume Review tab or Career Center): "Tailor this audit for: Internship / Full-time job / Grad school / Just exploring." Pre-fill from the default above; they can change it per run. Optionally save their last choice to profile as `application_target` so the next run defaults to it (and they don't have to re-pick every time).

That way goals stay the high-level "what matters to you"; application_target is "what this run is for," defaulted from goals and optionally persisted as last choice.

---

## 1. "What are you applying to?" (application_target)

### 1.1 Backend — profile

- **profile_store.py**
  - In `ensure_profile_exists` default dict, add: `"application_target": None` (optional; stores last chosen so next audit defaults to it).
- **api/main.py**
  - In `update_profile` (PATCH /profile), add `"application_target"` to `allowed`. Validate value if present: one of `"internship" | "full_time" | "grad_school" | "exploring" | null`.
  - **Infer when missing:** When building the audit request, if the client doesn't send `application_target`, derive a default from profile `goals`: e.g. if `"grad_school"` or `"pursue_phd"` in goals → `"grad_school"`; if `"internship"` in goals → `"internship"`; if `"gain_experience"` (and no grad/internship) → `"full_time"`; else `"exploring"`. Use profile `application_target` if set (last run's choice) over this inference.

### 1.2 Backend — audit API

- **api/main.py** — `POST /audit/v2`
  - Add optional form field: `application_target: str | None = Form(None)`.
  - If not provided in the form, optionally load from profile: get user email from `_require_subscribed`/request, fetch profile, use `profile.get("application_target")`.
  - Pass `application_target` into the sync audit call (see 1.3).
- **dilly_core/llm_auditor.py**
  - Add optional parameter to `run_audit_llm`: `application_target: str | None = None`.
  - In `_call_llm`, add optional parameter `application_target: str | None = None`.
  - Extend the user prompt: if `application_target` is set, append one line to `track_instruction` (or a new variable), e.g.  
    `"Candidate is targeting: [internship | full-time job | grad school | exploring]. Tailor recommendations and framing for that application type."`
  - So the model gets e.g. "Candidate is targeting: internship. Tailor recommendations for internship applications (e.g. emphasize learning, growth, fit for short-term roles)."
- **dilly_core/auditor.py** (rule-based)
  - `run_audit` has no LLM; recommendations come from rules and benchmarks. Optional: add `application_target` to `run_audit` and pass it into `get_rule_based_recommendations` if we add target-specific rule sets later. For MVP we can **only** pass application_target to the LLM path; rule-based path ignores it.

### 1.3 Dashboard — UI

- **No new onboarding question.** Goals stay as-is (multi-select "Your goals").
- **One selector where they run the audit:** e.g. on **Resume Review** above the upload zone, or in **Career Center** near "Do this next": **"Tailor this audit for: Internship / Full-time job / Grad school / Just exploring."**
  - **Default:** From profile: use `appProfile.application_target` if set (last run's choice); else infer from `appProfile.goals` (e.g. grad_school/pursue_phd → Grad school, internship → Internship, gain_experience → Full-time, else Just exploring).
  - On run: send chosen value in FormData for `POST /audit/v2`. Optionally after a successful audit, PATCH profile with `{ application_target }` so next time the selector defaults to that.
- **Sending to audit:** Always send the current selector value (or inferred default) in FormData: `formData.append("application_target", applicationTarget);` so backend can tailor the run.

**Summary:** No duplicate of "goals" in onboarding. Profile can store `application_target` as last choice for defaulting. Backend infers from goals when not provided. One "Tailor this audit for" selector only in the audit flow/Career Center.

---

## 2. Audit history

### 2.1 Backend — storage

- **Per-user audit list**
  - Reuse the same per-user folder as profile: `memory/dilly_profiles/<uid>/` (uid = first 16 chars of sha256(lowercase email)).
  - Add a file: `audits.json` — a single JSON array of audit **summaries** (not full payloads for MVP to keep size down).
- **Summary shape (one object per audit)**  
  `{ "id": "uuid", "ts": <float unix>, "scores": { "smart", "grit", "build" }, "final_score": float, "detected_track": str, "candidate_name": str, "major": str }`  
  Optional: add `"meridian_take": str` for the one-liner if we want it in the list.
- **New module or in profile_store**
  - Add e.g. `projects/meridian/api/audit_history.py`:
    - `append_audit(email: str, summary: dict) -> None` — load `audits.json`, append summary, cap at 50 entries (drop oldest), write back.
    - `get_audits(email: str) -> list[dict]` — load `audits.json`, return list sorted by `ts` desc.
  - Or add these two functions to profile_store and store audits in the user’s folder (same uid as profile).
- **When to append**
  - In `api/main.py` inside `POST /audit/v2`, after building the full `AuditResponseV2` and before returning: get current user email from request, build summary from the response (id = uuid4().hex, ts = time.time(), scores, final_score, detected_track, candidate_name, major), call `append_audit(email, summary)`.

### 2.2 Backend — GET /audit/history

- New endpoint: `GET /audit/history`
  - Auth: require signed-in user (same as other protected routes).
  - Returns: `{ "audits": [ { id, ts, scores, final_score, detected_track, candidate_name, major }, ... ] }` from `get_audits(email)`.
  - Order: newest first (ts desc).

### 2.3 Dashboard — UI

- **Where to show**
  - **Career Center:** Add a card or section "Audit history" (e.g. below "Your numbers" / "Do this next") that shows the last 5–10 runs: date (formatted), final score, track. "View" could open the full report for the **current** audit only (we don’t store full payload per run in MVP); or we add "View" later when we store full payload per id.
  - **Resume Review tab:** Optional "Previous audits" collapsible or link to same list.
- **Data**
  - On load of Career Center (or when entering a tab that shows history), call `GET /audit/history`. Store in state (e.g. `auditHistory`). Render list from that.
- **MVP "View" behavior**
  - Without storing full audit per id, "View" for a past run could be disabled or show only the summary (scores + track + date). Later we can add GET /audit/history/:id returning full audit if we persist full payload per run.

**Summary:** One audits.json per user (in profile folder), append summary on each /audit/v2, cap at 50. GET /audit/history returns list. Dashboard shows list on Career Center (and optionally on Resume Review).

---

## 3. Order of implementation

| Step | Task |
|------|------|
| 1 | Profile: add `application_target` to default and PATCH allowed; validate value. |
| 2 | POST /audit/v2: accept `application_target` (Form + optional profile fallback); pass to LLM. |
| 3 | llm_auditor: add `application_target` param and one-line prompt tailoring. |
| 4 | Dashboard: add "What are you applying to?" selector; save to profile; send in FormData on audit. |
| 5 | audit_history module: append_audit, get_audits; call append from POST /audit/v2. |
| 6 | GET /audit/history endpoint. |
| 7 | Dashboard: fetch and display audit history list on Career Center. |

Steps 1–4 deliver application_target; 5–7 deliver audit history. Both can be done in one pass or separately.
