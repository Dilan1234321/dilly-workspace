# Implementation Guide: Recruiter View, Rigor Index API, Personalization, Two-Way Dialogue, Rituals

**Purpose:** What it takes to implement each of these five features—scope, dependencies, and effort so you can prioritize and plan.

---

## 1. Recruiter view

**Idea:** Recruiter uploads a JD and gets "Meridian-fit" attributes; or sees anonymized Meridian scores for a candidate pool.

### What you’re building

- **Option A — JD → Meridian-fit:** Recruiter pastes/uploads a job description; Meridian returns something like: target Smart/Grit/Build profile for the role, key resume signals the role cares about, maybe a short "what we’d look for" checklist.
- **Option B — Candidate pool:** Recruiter sees a list of candidates (e.g. who applied via Meridian) with anonymized Meridian scores only (Smart, Grit, Build, final)—no resume or PII. Sort/filter by dimension.

### What it takes

| Piece | Effort | Notes |
|-------|--------|--------|
| **Recruiter auth** | Medium | Separate from student auth. Options: (1) Same app, different role + login path (e.g. recruiter@company.com vs .edu), (2) Separate recruiter subdomain/app, (3) API-only with API keys. You need a way to know "this is a recruiter" and what they’re allowed to see. |
| **JD → Meridian-fit (Option A)** | Medium–High | Parse JD (or use LLM) to extract: role type, industry, seniority. Map to Meridian dimensions: e.g. "This role emphasizes Build (technical proof)" or "Smart 70+, Grit 65+, Build 80+." You can start rule-based (keywords → dimension weights) and add an LLM pass for nuance. Need a clear, documented definition of "Meridian-fit" so output is consistent. |
| **Candidate-pool view (Option B)** | Medium | Data: which candidates are visible? Only those who (1) applied through Meridian to a job that has recruiter access, or (2) opted in to "share my Meridian score with recruiters." You need consent and a pipeline (e.g. when student applies, store anonymized score + job_id; recruiter sees list for that job). No resume, no name—just scores and maybe track. |
| **UI** | Medium | For A: one screen (paste JD → see Meridian-fit). For B: list/table with columns like Track, Smart, Grit, Build, Final, maybe "Top dimension." Filter/sort. Could be a new route in the main app (e.g. /recruiter) or a separate small app. |
| **API** | Low–Medium | Option A: e.g. POST /recruiter/jd-fit with body `{ "job_description": "..." }` → `{ "meridian_fit": { "smart_min": 70, ... }, "signals": ["..."] }`. Option B: GET /recruiter/candidates?job_id=... (or similar) → list of anonymized score objects. Auth: recruiter token or API key. |

### Dependencies and order

1. Decide **recruiter identity and auth** (role in existing auth vs new app vs API keys).
2. **Option A:** Implement JD parsing + Meridian-fit rules (or LLM); then recruiter endpoint + minimal UI.
3. **Option B:** Define consent model and where you store "this student’s scores are visible to recruiter for job X"; then pipeline to attach scores to applications; then recruiter endpoint + UI.

### Rough effort

- **Option A only:** ~1–2 weeks (auth + JD-fit logic + one recruiter page).
- **Option B only:** ~1–2 weeks (consent + pipeline + recruiter list UI).
- **Both:** ~2–3 weeks if done together; recruiter auth is shared.

---

## 2. Rigor Index API

**Idea:** External callers send GPA + major (and optionally school); Meridian returns a single "Meridian-Adjusted GPA" or rigor score (the same 1.40x-style logic you use for Smart).

### What you’re building

- A **public or partner-facing API**: e.g. `POST /rigor-index` or `GET /rigor-index?gpa=3.5&major=Computer+Science` → `{ "meridian_adjusted_gpa": 4.55, "multiplier_used": 1.30, "major": "Computer Science" }`.
- Optionally: school parameter later so you can add school-specific adjustments; for now major-only is enough.

### What it takes

| Piece | Effort | Notes |
|-------|--------|--------|
| **Reuse scoring logic** | Low | You already have `MAJOR_MULTIPLIERS` in `dilly_core/scoring.py`. You need one function: given (gpa, major) → (effective GPA or "rigor score", multiplier). Normalize major string (e.g. "CS" → "Computer Science") and look up multiplier; cap output at 4.0 if you want to stay in "GPA-like" scale, or return raw (gpa × multiplier) and document it. |
| **API endpoint** | Low | New route in `main.py`: read gpa + major from query or body; call the function; return JSON. No auth for a public "rigor index" demo, or API key / partner auth if you want to limit abuse. |
| **Versioning and docs** | Low | Document the formula (e.g. "Meridian-Adjusted GPA = min(4.0, GPA × Major_Multiplier)"). Add a version or formula_id in the response so partners can rely on behavior. |
| **Rate limiting** | Low | If public: rate limit by IP or API key so one client can’t hammer the endpoint. |

### Dependencies

- None beyond existing `dilly_core/scoring.py` (and possibly `tracks.py` if you need Pre-Law/Pre-Health special cases). You can start with "major only" and one number (e.g. adjusted GPA or rigor score).

### Rough effort

- **~2–4 days:** extract rigor function, add endpoint, document, add rate limit.

---

## 3. Personalization

**Idea:** Every touchpoint uses the user’s name, goals, and concrete resume/audit details; tone and examples match their track. "Your Data Science Club presidency is your strongest Grit signal."

### What you’re building

- **Voice:** Already gets name, track, major, goals, scores, evidence. Tighten prompts so the model **always** uses at least one concrete detail (role, finding, score) and **never** gives a generic opener. Add explicit instruction: "Never say 'your resume' without citing a specific line, role, or score."
- **In-app copy:** Where you have generic CTAs or tips, swap in track-specific or goal-specific lines (you have `getPlaybookForTrack`, track definitions; use them in Career Center, Insights, empty states).
- **Emails (if any):** Use name, track, and one concrete fact (e.g. "Your Smart score went up 8 points") in subject and body.

### What it takes

| Piece | Effort | Notes |
|-------|--------|--------|
| **Voice prompt hardening** | Medium | In the Voice system prompt and any "first message" or "synthesis" prompts: add rules like "Always use the user’s name or a concrete detail from their resume/audit in your first sentence"; "Never give generic advice without tying it to a specific finding or score." You may need 1–2 prompt iterations and a quick review of sample replies. |
| **Track-specific copy** | Low–Medium | Audit Career Center, Insights, and onboarding for generic strings. Replace with `getPlaybookForTrack(track)`, `getDefinitionsForTrack(track)`, or simple "For your track (Tech/Pre-Health/…), we care about …" where it fits. |
| **Evidence in copy** | Low | Where you show "Your strongest signal" or "Top dimension," you already have evidence. Ensure that same evidence is available to Voice and appears in at least one in-app line (e.g. "Your strongest signal to recruiters is Grit—your leadership in X."). |

### Dependencies

- No new backend; only prompts, copy, and possibly a small "personalization helper" that returns one sentence (e.g. strongest signal + track) for use in multiple places.

### Rough effort

- **~3–5 days:** prompt updates, copy audit and track-specific replacements, light testing.

---

## 4. Two-way dialogue

**Idea:** Voice doesn’t just answer—it asks a short clarifying question or offers a menu of options. "Do you want a quick check or a full mock audit?" "Which matters most: interview prep or resume gaps?"

### What you’re building

- **Clarifying questions:** When the user’s intent is ambiguous, the model replies with one short question (e.g. "Which company or role should we check?") instead of guessing.
- **Option menus:** When several actions are possible, the model outputs a structured menu, e.g. "I can (a) run Am I Ready for a company (b) generate cover letter lines (c) prep interview bullets. Which do you want?" and the frontend can show chips/buttons for (a)(b)(c) that send the corresponding follow-up.

### What it takes

| Piece | Effort | Notes |
|-------|--------|--------|
| **Prompt design** | Medium | In the Voice system prompt: add instructions like "If the user’s request is ambiguous (e.g. 'help me get ready'), ask one short clarifying question before giving advice" and "When multiple tools or actions apply, offer a clear menu (a)(b)(c) and ask which they want." Optionally: ask the model to output a structured block (e.g. `options: ["Am I Ready check", "Cover letter lines", "Interview prep"]`) so the frontend can render buttons. |
| **Structured reply parsing** | Low–Medium | If you want chips/buttons, you need either (1) the model to return a list of options in a consistent format (e.g. JSON or markdown list), and the frontend parses it and shows buttons, or (2) a separate small LLM call or rule that maps common intents to options. (1) is simpler; (2) is more reliable if the model is inconsistent. |
| **Frontend** | Low–Medium | When the assistant message contains an option menu, show 2–4 chips below it (e.g. "Am I Ready", "Cover letter", "Interview prep"). Clicking a chip sends that as the next user message. You already have quick-reply chips; this is "dynamic" chips based on the last assistant message. |

### Dependencies

- Voice and frontend only; no new backend endpoints. Depends on prompt stability so the model actually outputs menus when you want them.

### Rough effort

- **~3–5 days:** prompt updates, optional structured-format for options, frontend chip rendering from last message.

---

## 5. Rituals

**Idea:** Recurring, lightweight content: "Daily tip," "Today’s focus," weekly recap, deadline reminders ("48 hours until your X deadline"). Reason to open the app daily or weekly.

### What you’re building

- **Daily tip / Today’s focus:** One piece of content per day when the user opens the app (e.g. on Career Center load). Could be from a curated list (e.g. 30 tips, rotate by day-of-year) or a single LLM call: "Given track and maybe last audit, output one sentence: today’s focus or tip."
- **Weekly recap:** Once per week (e.g. Sunday or "7 days since last open"), show or email a short summary: e.g. "This week: you ran 1 audit, your Build went up 5 points. Next: try Am I Ready for [target]."
- **Deadline reminders:** "Your [label] deadline is in 48 hours." You already have deadlines and an urgent banner; this is making the reminder more ritual-like (e.g. a dedicated "Upcoming" or "Don’t forget" line on Career Center or in a daily digest).

### What it takes

| Piece | Effort | Notes |
|-------|--------|--------|
| **Daily tip / focus** | Low–Medium | **Curated:** 30–60 tips in a JSON or code array; index by day-of-year or hash(user_id + date) so it’s stable per user per day. **LLM:** one light call on first app open of the day: "User track: X. Latest score: Y. Output one sentence: today’s one focus or tip." Cache by (user, date) so you don’t call every load. Show in a small card on Career Center or as a banner. |
| **Weekly recap** | Medium | You need "last 7 days" data: audits run, score deltas, goals. Either compute on demand when user opens app on "recap day" or run a weekly job that precomputes and stores a short recap per user. Show in-app (e.g. "This week" card) or send by email. Email requires a scheduler and template. |
| **Deadline reminders** | Low | You already have deadlines and "X days left." Add a single line or card that surfaces the next deadline in a ritual frame: e.g. "Don’t forget: [label] in 48 hours." Could be the same as your existing deadline banner, just worded as a ritual. |
| **Scheduling** | Low–Medium | For "first open of the day" you don’t need a cron; you just check on app load whether you’ve already shown today’s tip. For weekly recap email you’d need a cron or queue (e.g. every Sunday 9am, or "48h before deadline" send). |

### Dependencies

- Profile + audit history (you have these). For weekly recap email: Resend or another sender + a small job runner or cron.

### Rough effort

- **Daily tip (curated, in-app):** ~1–2 days.
- **Daily focus (LLM, in-app):** ~2–3 days (cache keyed by user+date).
- **Weekly recap in-app:** ~2–3 days.
- **Weekly recap email:** +1–2 days if you already have email sending.
- **Deadline ritual copy:** ~0.5 day (reuse existing deadline logic).

---

## Summary table

| Feature | Rough effort | Main dependency |
|---------|-------------|------------------|
| **Recruiter view** | 1–3 weeks (depends on A vs B vs both) | Recruiter auth; JD-fit definition or candidate consent pipeline |
| **Rigor Index API** | 2–4 days | None; reuse `dilly_core/scoring.py` |
| **Personalization** | 3–5 days | Voice prompts + copy audit |
| **Two-way dialogue** | 3–5 days | Voice prompts + optional dynamic chips in UI |
| **Rituals** | 3–7 days (depends on daily vs weekly vs both) | Curated list or LLM + cache; optional email scheduler |

**Suggested order if you do all five:**  
(1) **Rigor Index API** — quick win, no product dependency.  
(2) **Personalization** — improves existing experience everywhere.  
(3) **Two-way dialogue** — improves Voice without new infra.  
(4) **Rituals** — daily tip is fast; weekly recap or email adds time.  
(5) **Recruiter view** — separate product surface and auth; do once you’re ready to support B2B.

If you tell me which one you want to build first (or a combo, e.g. Rigor API + Personalization), I can outline concrete implementation steps next (files to add, endpoints, prompt text).
