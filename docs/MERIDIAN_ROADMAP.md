# Meridian: Detailed Roadmap (Post–Parsing & Audit)

**Purpose:** Step-by-step roadmap for where to go from here. Use this when you return after a long break. Every step is as detailed as possible so you (or an agent) can execute without guessing.

**Last updated:** 2025-03-07 (after parsing improvements, email filenames, reflow, contact promotion).

**Canonical context:** `SOUL.md`, `USER.md`, `docs/MERIDIAN_PARSED_RESUMES_SPEC.md`, `SCORING_LOGIC.md`, `docs/PHASE1_*`, `docs/PHASE1_BULLETPROOF_GAP_ANALYSIS.md`.

---

## 0. Current State (Where We Are Now)

### 0.1 What’s Done

| Area | Status | Notes |
|------|--------|--------|
| **Parse → structured file** | ✅ | `parse_resume()` → `get_sections()` → `build_structured_resume_text()` → `write_parsed_resume()`. Same request as audit. |
| **File identity** | ✅ | Key = `user_email` (when app sends) **or** parsed email from resume **or** candidate name. Filename = `{key}.txt` (email allowed: `user@example.com.txt`). `safe_filename_from_key()` handles `@`; `get_email_from_parsed()` used when no `user_email`. |
| **Parsed location** | ✅ | `projects/meridian/parsed_resumes/`. One file per identity; overwrite on re-upload (no version history). |
| **Structured format** | ✅ | `[SECTION_LABEL]` blocks (EDUCATION, WORK EXPERIENCE, etc.); contact/education formatted; acronym sections skipped; section keys normalized. |
| **LLM cleanup** | ✅ | When `MERIDIAN_USE_LLM=1` and `OPENAI_API_KEY`, `clean_structured_resume_with_llm()` overwrites the written file before audit. |
| **Scoring** | ✅ | Ground Truth V6.5 + Vantage Alpha tracks. Smart / Grit / Build 0–100; final composite; major multipliers; minor bonus; BCPM for Pre-Health. |
| **Evidence** | ✅ | `evidence_smart`, `evidence_grit`, `evidence_build` (and _display) in `AuditorResult`; API returns `evidence: { smart, grit, build }`. |
| **Evidence trail UI** | ✅ | Dashboard: Smart / Grit / Build buttons; click → “Why you got your score” shows `audit.evidence[selectedDimension]`; radar highlight for selected dimension. |
| **Recommendations** | ✅ | LLM personalized (generic, line_edit, action); schema has `current_line`, `suggested_line`, `score_target`; training append on each audit. |
| **Parser robustness** | ✅ | Normalization (spaced digits/email, glued words); reflow (one-word-per-line + second-pass short-line merge); contact promoted from other sections into `_top`; education unglue; section header blacklist; filename trailing strip. |

### 0.2 What’s Not Done (Explicit Gaps)

| Gap | Where | What’s missing |
|-----|--------|----------------|
| **Anomaly / red flags** | Backend + API + UI | No `get_red_flags(gpa, scores, track)`; no `red_flags` in `AuditResponseV2`; no “Red flags” card in dashboard. |
| **Peer benchmarking** | Backend + API + UI | No cohort loader from `training_data.json`; no percentile-by-track; no `percentiles` or `benchmark_copy` in response; no “vs cohort” in UI. |
| **Auth** | Entire flow | No .edu verification code, no session, no “logged-in user.” Upload is unauthenticated; `user_email` is optional form param (not from session). |
| **Dashboard → API with user_email** | Frontend | Upload FormData does not append `user_email`; when auth exists, dashboard should send logged-in user’s email so file is always `email.txt`. |
| **Exact resume quotes in evidence** | LLM prompt / optional pass | Evidence is narrative; “exact quotes” would require LLM to output short quoted snippets or a separate quote-extraction step. |

### 0.3 Key File Map

- **Parser / sections:** `dilly_core/resume_parser.py` (`parse_resume`, `get_sections`, `reflow_section_text`, `normalize_resume_text`).
- **Structured output:** `dilly_core/structured_resume.py` (`build_structured_resume_text`, `format_contact_section`, `format_education_section`, `promote_contact_into_top`, `write_parsed_resume`, `safe_filename_from_key`, `get_email_from_parsed`).
- **LLM structured cleanup:** `dilly_core/llm_structured_resume.py` (`clean_structured_resume_with_llm`).
- **Scoring / tracks:** `dilly_core/scoring.py`, `dilly_core/tracks.py`, `dilly_core/auditor.py`.
- **LLM audit:** `dilly_core/llm_auditor.py` (evidence, recommendations, track).
- **API:** `projects/meridian/api/main.py` (`/audit/v2`: file + optional `user_email` Form, `file_key` = user_email or get_email_from_parsed or candidate_name).
- **Dashboard:** `projects/meridian/dashboard/src/app/page.tsx`.
- **Schemas:** `projects/meridian/api/schemas.py` (`AuditResponseV2`).
- **Training:** `projects/meridian/prompts/training_data.json`; append: `dilly_core/training_append.py`.

---

## 0B. Parsing Mastery — Get Every Parsed Resume 100% Accurate (Start Here)

**Goal:** Master parsing so every parsed resume text file is **100% accurate** before building the rest of the app. Each feature (reorganization per job, gap analysis, evidence, etc.) depends on this. Build carefully and thoughtfully.

**First place to start:** Define what “100% accurate” means, then run **one full audit** of the current parsed output against source documents so you have a **concrete list of errors** to fix. Without that, we’re guessing; with it, we have a prioritized fix list.

---

### Step 0 — Define the accuracy spec

**What must be correct for a parsed resume to count as “100% accurate”?**

| Field / area | Criterion |
|--------------|-----------|
| **Name** | Matches the candidate’s real name (no section header, no “Unknown” when name is on the doc, no “prediction on” / “well-educated” style garbage). |
| **Email** | At least one email extracted and present in [CONTACT] or _top; matches the document. |
| **Major** | Matches degree/major on the document when present; “Unknown” only when truly absent or unreadable. |
| **GPA** | If present on doc, extracted and in valid range; otherwise null. |
| **Section boundaries** | No section header used as content; no content lumped under wrong section; EDUCATION, EXPERIENCE, etc. align with the document. |
| **Section content** | No dropped lines; no invented text (MTS); reflow may merge one-word-per-line but must not change meaning. |
| **Contact** | Phone, email, location, LinkedIn (if present) in one place; promoted from elsewhere when they appeared at end or in wrong section. |
| **Education block** | University, major(s), minor(s), graduation date, honors (and GPA if present) correctly parsed and labeled; no glued words left (e.g. TheUniversityofTampa → The University of Tampa). |

Document this in a short **Parsing Accuracy Spec** (e.g. `docs/PARSING_ACCURACY_SPEC.md`) so every fix can be checked against it.

---

### Step 1 — Audit: compare parsed output to source (get the error list)

1. **List all sources** — Every resume we have in a form we can re-run: e.g. `assets/resumes/*.pdf`, `*.docx`, or wherever the originals live. If some parsed_resumes have no source, note them (e.g. “Unknown.txt — no source”).
2. **Re-run the pipeline** — For each source file: extract text → `parse_resume()` → `build_structured_resume_text()` → write to a **temp** file (or keep in memory).
3. **Compare** — For each candidate:
   - **Name:** Does parsed name match the obvious name on the doc (first line or header)?
   - **Email:** Is the doc’s email in the parsed output?
   - **Major / GPA / education:** Spot-check education section and parser’s `major` / `gpa`.
   - **Sections:** Do section headers and boundaries match the doc? Any content under the wrong section?
   - **Content:** Sample 2–3 sections; is anything missing or invented?
4. **Record every error** — One table or checklist per file: e.g. `Bridget_E._Klaus.txt: name OK, email OK, major OK, education block missing minor, section "Honors" merged into Experience`. Or a shared spreadsheet: File | Name | Email | Major | GPA | Sections | Content | Notes.
5. **Summarize by error type** — Count: how many files have wrong name? wrong major? missing email? bad section boundaries? reflow/glue issues? That gives the **priority order** for fixes.

**Where to do this:** A small script or notebook that (1) iterates over sources, (2) runs the parser + structured build, (3) writes a **parsing_audit_report.md** (or CSV) with one row per file and columns for each criterion (OK / FAIL) and a notes column. Optionally diff the structured text against the current `parsed_resumes/*.txt` to see what changed after recent parser edits.

---

### Step 2 — Fix in priority order

Use the audit to decide order. Suggested order (from `docs/PARSING_RESEARCH_AND_IMPROVEMENTS.md` and current code):

1. **Name** — Ensure source verification and section-scoping are strict; name only from _top; reject if not in source; fallback to filename when validation fails. Fix any remaining “header as name” or “Unknown” when name is visible.
2. **Email** — Ensure at least one email is always extracted when present on the doc; `get_email_from_parsed()` and contact formatting surface it; no email dropped in promotion/strip logic.
3. **Major / GPA** — Section-scoped: major and GPA only from education block (and _top when no education section); source verification (major phrase must appear in education/text). Fix any wrong major (e.g. Sydney Farah → Advertising and Public Relations, not Computer Science).
4. **Section boundaries** — Fix any “section header as content” or “content under wrong header” from the audit; tighten `get_sections()` and section header blacklist if needed.
5. **Section content / reflow** — Fix dropped lines, over-aggressive reflow, or glued words in education; use `_unglue_education_text` and reflow rules; spot-check long sections.
6. **Contact** — Ensure contact promotion from end-of-file or other sections works and doesn’t duplicate or drop; fix any remaining “contact in wrong place” cases.
7. **Education block** — University, major, minor, date, honors all correctly parsed and labeled; unglue remaining glued tokens; handle “EDUCATION” in contact remainder.

After each fix, **re-run the audit** (or the subset of failing files) and update the report until every file passes the accuracy spec.

---

### Step 3 — Lock the pipeline and regress

- Once the audit is green, **freeze** the parser/structured-resume behavior for a release (or document the “mastered” version).
- Add a **regression set**: a small set of source resumes + expected parsed outputs (or expected name/email/major/section list). In CI or pre-commit, run the parser on the set and diff or assert key fields so future changes don’t break 100% accuracy.
- **New resumes:** Every new resume that enters the system (e.g. new uploads) should be spot-checked or re-audited periodically so the corpus stays accurate.

---

### Summary: first place to start

| Order | Action |
|-------|--------|
| **1** | **Define the accuracy spec** (Step 0) — write `docs/PARSING_ACCURACY_SPEC.md` with the table above and any extra criteria. |
| **2** | **Run one full audit** (Step 1) — for every source resume, re-run parse + structured build; compare name, email, major, GPA, sections, content to the document; record every error in a report. |
| **3** | **Summarize by error type** — how many wrong name? wrong major? missing email? bad sections? |
| **4** | **Fix in priority order** (Step 2) — name → email → major/GPA → sections → content/reflow → contact → education. Re-audit after each batch of fixes. |
| **5** | **Lock and regress** (Step 3) — regression set + CI so we don’t regress. |

**Files to touch:** `dilly_core/resume_parser.py`, `dilly_core/structured_resume.py`, and optionally `dilly_core/llm_structured_resume.py`. Research and priorities: `docs/PARSING_RESEARCH_AND_IMPROVEMENTS.md`. After parsing is mastered, resume the app roadmap (Phase 1, auth, etc.).

---

## 1. Phase 1 Completion (Evidence + Anomaly + Peer Benchmarking)

**Order:** 1.1 → 1.2 → 1.3 (per `docs/PHASE1_IMPLEMENTATION_STEPS.md`). Evidence trail UI is already done; only optional backend polish and then Anomaly and Peer.

### 1.1 Evidence Trail — Optional Polish Only

- **1.1.1** **Exact quotes (optional):** If you want “exact resume quotes” in evidence:
  - Either extend the LLM prompt in `dilly_core/llm_auditor.py` to ask for 1–2 short quoted snippets per dimension (e.g. “Include a brief quote from the resume that supports this.”), **or**
  - Add a separate lightweight step that, given structured text and dimension, extracts 1–2 supporting sentences and attaches to `evidence_*_display`.
- **1.1.2** **Rule-based build evidence:** Rule-based path already sets `evidence_build` / `evidence_build_display` in `auditor.py` (track findings + snippet). No change required unless you want more structure.

**Checklist:** Evidence trail is **done** for v1. Only do 1.1.1 if product explicitly asks for quoted evidence.

---

### 1.2 Anomaly Detection (Red Flags)

**Goal:** Return a list of human-readable red-flag strings when e.g. high GPA + very low Build suggests “High-Risk / Low-Velocity.”

#### Step 1.2.1 — Define rules (product/advisor)

- Decide the exact rules. Example from gap analysis:
  - `(gpa >= 3.8 or smart >= 90) and build <= 10` → `"High-Risk / Low-Velocity: strong academics, minimal track-specific proof."`
- Optional: more rules (e.g. grit 0 + smart high; track mismatch). Document the final list in a short comment or table in the module.

#### Step 1.2.2 — Implement backend

- **New file:** `dilly_core/anomaly.py` (or add a clearly marked block in `dilly_core/auditor.py`).
- **Function:** `get_red_flags(gpa: Optional[float], scores: Dict[str, float], track: str) -> List[str]`.
  - Inputs: `gpa` from `parsed.gpa`, `scores` = `{"smart": ..., "grit": ..., "build": ...}`, `track` = `result.track`.
  - Return: list of strings (e.g. `["High-Risk / Low-Velocity: strong academics, minimal track-specific proof."]`). No flags → return `[]`.
- Implement each agreed rule as a condition; append the corresponding string to the list. Keep logic pure (no I/O).

#### Step 1.2.3 — Schema

- In `projects/meridian/api/schemas.py`, add to `AuditResponseV2`:
  - `red_flags: List[str] = []` (default empty so existing clients don’t break).

#### Step 1.2.4 — API

- In `projects/meridian/api/main.py`, in the `/audit/v2` handler, after you have `result` and `scores`:
  - `from dilly_core.anomaly import get_red_flags` (or wherever you put it).
  - `red_flags = get_red_flags(parsed.gpa, scores, result.track)`.
  - Include `red_flags` in the response dict you return (e.g. `red_flags=red_flags` in the constructor or dict for `AuditResponseV2`).

#### Step 1.2.5 — Dashboard

- In `projects/meridian/dashboard/src/app/page.tsx`:
  - Add to the `AuditV2` type: `red_flags?: string[]`.
  - After the audit result is set, if `audit.red_flags?.length > 0`, render a section (e.g. above or below Audit Findings): title “Red flags” or “Anomalies”, amber/red card, list `audit.red_flags` as items. Style consistently with the rest of the dashboard.

**Checklist:** Backend module → schema → API → UI. Test with a resume that triggers a rule (e.g. high GPA, very low Build).

---

### 1.3 Peer Benchmarking (Percentiles vs Cohort)

**Goal:** Show “Top X%” per dimension using `training_data.json` as the cohort, by track.

#### Step 1.3.1 — Cohort loader

- **Where:** Either in `projects/meridian/api/main.py` at startup (or first request) or in a small helper module used by the API.
- **What:** Load `projects/meridian/prompts/training_data.json`. Build a list of “scored examples”: each entry has at least `track`, `smart_score`, `grit_score`, `build_score` (and optionally `major`, `candidate_name`). If the file has multiple entries per person, keep one per person (e.g. latest or first); dedup by a stable key (e.g. email or name+major).
- **Cache:** Keep the list in memory (e.g. a module-level list or a singleton) so you don’t re-read the file on every request. Optionally invalidate on a long interval or never for now.

#### Step 1.3.2 — Percentile computation

- **Function:** `compute_percentiles(track: str, smart: float, grit: float, build: float, cohort: List[dict]) -> Dict[str, float]`.
  - Filter `cohort` by `track` (exact match on `track` field).
  - For each dimension (`smart`, `grit`, `build`): compute percentile of the candidate’s value within the track cohort (e.g. % of cohort with score ≤ candidate’s score). Return e.g. `{"smart": 85.0, "grit": 72.0, "build": 90.0}` (0–100).
- **Edge cases:** If cohort for that track is empty, return e.g. 50.0 for each or omit; document the choice.

#### Step 1.3.3 — Optional human copy

- **Function:** `benchmark_copy_from_percentiles(percentiles: Dict[str, float], track: str) -> Dict[str, str]`.
  - For each dimension, e.g. if `percentiles["grit"] >= 95` → “Top 5% Grit for {track} candidates.”; if 80–95 → “Top 20% …”; etc. Return `{"smart": "...", "grit": "...", "build": "..."}`. Optional for v1.

#### Step 1.3.4 — Schema

- In `projects/meridian/api/schemas.py`, add to `AuditResponseV2`:
  - `percentiles: Optional[Dict[str, float]] = None` (e.g. `{"smart": 85, "grit": 72, "build": 90}`).
  - Optionally: `benchmark_copy: Optional[Dict[str, str]] = None`.

#### Step 1.3.5 — API

- In `/audit/v2`, after computing `scores` and having `result.track`:
  - Get cohort (from cache/loader).
  - `percentiles = compute_percentiles(result.track, scores["smart"], scores["grit"], scores["build"], cohort)`.
  - Optionally `benchmark_copy = benchmark_copy_from_percentiles(percentiles, result.track)`.
  - Add `percentiles` (and optionally `benchmark_copy`) to the response.

#### Step 1.3.6 — Dashboard

- Add to `AuditV2` type: `percentiles?: Record<string, number>`, optionally `benchmark_copy?: Record<string, string>`.
- In the “Why you got your score” area or a new “Vs cohort” block: for each dimension, show percentile (e.g. “Top 15% Smart for Pre-Health”) and/or the benchmark copy string. Place it near the radar or under the dimension buttons.

**Checklist:** Load cohort → compute percentiles by track → add to response → show in UI. Verify with a few tracks that have enough entries in `training_data.json`.

---

## 2. Auth: .edu Only, Verification Code, No Password

**Spec:** `docs/MERIDIAN_PARSED_RESUMES_SPEC.md` (App auth: .edu only, no password; verification code; rate limit; expiry; resume upload only when logged in).

### 2.1 Design (Already Documented)

- **.edu only:** Sign-up / sign-in accept only .edu emails.
- **No password:** User enters .edu email → backend sends verification code → user enters code in app → if match, logged in.
- **Rate limit:** e.g. 3–5 codes per email per hour.
- **Expiry:** Code valid 10–15 minutes.
- **.edu check:** Validate domain is .edu before sending; reject non-.edu.
- **Resume upload:** Only when logged in; upload overwrites that user’s parsed file (key = their email).

### 2.2 Backend Tasks (When You Build Auth)

1. **Storage for pending codes**
   - Store (email, code, expires_at) in DB or file (e.g. SQLite, JSON, or Redis). If file: one file or one record per email; clear or overwrite on new code request.

2. **Endpoint: Request code**
   - `POST /auth/request-code` (or similar).
   - Body: `{ "email": "user@university.edu" }`.
   - Validate: domain is .edu (regex or allowlist).
   - Rate limit: check how many codes sent for this email in the last hour; if >= 3 (or 5), return 429.
   - Generate 6-digit (or alphanumeric) code; set `expires_at = now + 10–15 min`.
   - Store (email, code, expires_at).
   - Send email (SendGrid, Resend, AWS SES, etc.) with the code. Do not return the code in the response.
   - Return 200 with a generic message (“If this email is .edu, we sent a code.”) to avoid email enumeration.

3. **Endpoint: Verify code and sign in**
   - `POST /auth/verify` (or similar).
   - Body: `{ "email": "user@university.edu", "code": "123456" }`.
   - Look up stored code for that email; check not expired; compare code (constant-time).
   - If valid: create session (e.g. JWT or server-side session); return token or set cookie. Include email (and optionally name) in the token/session.
   - If invalid or expired: return 401. Optionally delete the used code.

4. **Protected upload**
   - Either: same `POST /audit/v2` but require `Authorization: Bearer <token>` (or cookie). From token/session, get `user_email`; use it as `file_key` (do not trust `user_email` from form if it can differ from session).
   - Or: separate “authenticated upload” endpoint that expects session and uses session email as key. Prefer one endpoint that accepts optional auth and uses session email when present.

5. **Email sending**
   - Choose provider (Resend, SendGrid, SES). Store API key in env. Implement a thin “send_verification_email(to, code)” that uses the provider’s API. Template: short message, code, expiry time.

### 2.3 Frontend Tasks (When You Build Auth)

1. **Sign-in / sign-up screen**
   - Single flow: input .edu email → “Send code” → input 6-digit code → “Verify” → on success store token (or cookie) and redirect to dashboard/home.

2. **Resume upload**
   - If logged in: send token (or cookie) with upload request; backend sets `file_key = session email`. Optionally hide or omit `user_email` form field when auth is present.
   - If not logged in: redirect to sign-in or show “Sign in to upload.”

3. **Session persistence**
   - Store JWT in localStorage or httpOnly cookie; on app load, check session and show “Update resume” vs “Sign in.”

### 2.4 File Naming After Auth

- Once auth is in place, **always** use the logged-in user’s email as `file_key` for `write_parsed_resume`. So the file is always `{email}.txt` for that user. No `Unknown.txt` for authenticated users; parser-extracted email remains fallback when auth is not used (e.g. demo or batch).

---

## 3. App Flow and Dashboard Tweaks

### 3.1 When Auth Exists

- Home: if not logged in → show sign-in (or “Send code”); if logged in → show “Update resume” and last audit (if any).
- Upload: always tied to session; backend uses session email; filename = `email.txt`.

### 3.2 Before Auth (Current)

- Dashboard can send optional `user_email` in the upload form (for testing or when you have email from another source). API already supports `user_email` as Form param; if provided, it’s used as `file_key`. To test: add a text input on the dashboard for “Your email (optional)” and append it to FormData as `user_email` so the saved file is `email.txt`.

---

## 4. Parsing and LLM Improvements (From Research)

**Source:** `docs/PARSING_RESEARCH_AND_IMPROVEMENTS.md`, `docs/RESEARCH_AND_AI_BENEFITS.md`.

- **Layout / reading order:** If you have coordinates (e.g. from a PDF layer), add a “linearize layout” pass (e.g. sort blocks by (y, x)) before `get_sections()`. Otherwise, simple heuristics (e.g. detect two columns by line length and interleave) can help the worst cases.
- **Task decomposition:** Optional LLM parsing path: 2–3 focused calls (name+contact; education+major+GPA; sections) and merge; or keep rule-based but add section-scoped extractors (e.g. `extract_major` only from education block).
- **Source verification:** After extracting name/major, check that the string (or normalized form) appears in the source text; if not, reject and try next candidate or filename. Already partially there with `validate_parse`; tighten as needed.
- **Validation + retry:** Keep or extend `validate_parse(parsed, raw_text)`; on failure, retry with feedback (e.g. “name failed: section header”) or fallback (filename, Unknown).
- **Section-scoped extraction:** Restrict name to `_top` (already done in many paths); restrict major/GPA to education (and maybe _top) only to avoid picking “Biology” from a sentence in Experience.

Implement these when you want to push the “1–2 resumes that still mess up” toward zero; they are incremental on top of current parser and structured resume.

---

## 5. Product and Scale (Credit Score for Talent)

- **Positioning:** Meridian = “Credit Score for Talent”; high-velocity, truth-first, evidence-based.
- **Monetization:** App at $19.99/mo; professional consultant in their pocket; no generic advice—cite specific roles, orgs, projects.
- **Prestige-neutral:** Per AGENTS.md, do not weigh Ivy League or prestige higher; focus on behavioral grit, technical veracity, impact metrics.
- **Data:** Only ingest data explicitly for public use or authorized (e.g. user uploads); no scraping of private/protected sites.

---

## 6. Maintenance and Ops

- **Retrain brains:** When you change track weights or benchmarks, run `projects/meridian/retrain_brains.py` (or equivalent) and update `models/campus/meridian_brain.pkl` and `models/pro/meridian_brain.pkl` if used. See `memory/2026-03-01.md`.
- **Training data:** Each LLM audit appends to training via `dilly_core/training_append.py`; `training_data.json` grows. Periodically review for duplicates (same person, multiple entries) and canonicalize if needed (see `docs/AUDITED_CANDIDATES_OVERVIEW.md`).
- **Benchmarks / cohort:** If you change percentile cohort source (e.g. from `training_data.json` to a dedicated cohort file), update the loader and the percentile logic in one place; keep schema and UI in sync.
- **Env:** `OPENAI_API_KEY`, `MERIDIAN_USE_LLM` (1/true/yes to enable LLM audit and LLM structured cleanup). Optional: email-sending keys for auth when built.

---

## 7. Suggested Order of Execution (When You Return)

1. **Phase 1.2 — Anomaly (red flags):** Small, self-contained. Implement 1.2.1–1.2.5; test; ship.
2. **Phase 1.3 — Peer benchmarking:** Cohort from `training_data.json`, percentiles by track, API + UI. Implement 1.3.1–1.3.6; test with several tracks; ship.
3. **Optional:** Evidence exact-quotes (1.1.1) if product asks.
4. **Auth:** When ready, implement 2.2–2.4 (backend then frontend); then 3.1–3.2 so upload is always keyed by session email.
5. **Parsing/LLM:** Pick one or two items from §4 (e.g. source verification, section-scoped major) and implement; measure on the known “bad” resumes.
6. **Ongoing:** Retrain, training data hygiene, and doc updates as you ship.

---

## 8. One-Line Reminders

- **File key:** `user_email` (from app) **or** `get_email_from_parsed(parsed)` **or** `candidate_name` **or** `"Unknown"`. Filename = `safe_filename_from_key(key)` → `email.txt` when key is email.
- **Structured file:** Built in same request as audit; written to `parsed_resumes/`; LLM cleanup overwrites when `MERIDIAN_USE_LLM=1`.
- **MTS:** Do not change scoring or rankings for user pressure; only for technical bugs or logic flaws. No hallucination; evidence and recommendations must be grounded in parsed content.
- **Spec:** When in doubt, see `docs/MERIDIAN_PARSED_RESUMES_SPEC.md` and USER.md.

---

*Roadmap maintained by Atlas (CTO, Meridian AI). Update this file when you complete steps or change priorities.*
