# Dilly Recruiter: Everything It Does — A Complete Essay

**A comprehensive account of every feature, API, and capability in the Dilly Recruiter product.**

---

## I. Introduction: What Is Dilly Recruiter?

**Dilly Recruiter** (also referred to as **Meridian Recruiter** in some docs) is the recruiter-facing side of the Meridian platform. It lets recruiters discover, evaluate, and engage with Meridian-verified college students using the same Smart/Grit/Build scoring framework that students see. Every candidate in the recruiter pool has been audited by Meridian, has a structured profile, and is 100% .edu-verified — no fakes, no bots.

The product consists of:

1. **Recruiter UI** — A desktop-friendly web app at `/recruiter` and `/recruiter/candidates/[id]`
2. **Recruiter API** — REST endpoints for search, JD-fit, candidate detail, bookmarks, notes, Voice search, and more
3. **Matching engine** — Semantic search, skill fit, Meridian fit, feedback blending, and LLM reranking

---

## II. Authentication & Setup

### API Key

- Recruiters authenticate via **API key** stored in `RECRUITER_API_KEY` on the server.
- The UI stores the key in `localStorage` under `meridian_recruiter_api_key` (or `RECRUITER_API_KEY_STORAGE`).
- Requests send the key via `X-Recruiter-API-Key` header or `Authorization: Bearer <key>`.
- **GET /recruiter/check** — No auth. Returns `{ recruiter_configured: bool, hint?: string }`. Used to debug: if `recruiter_configured` is false, add `RECRUITER_API_KEY` to `.env` and restart. If true but 401, the pasted key must match exactly.

### Candidate Pool

- **Source:** Only `memory/dilly_profiles/` — one folder per user with `profile.json` and `candidate_index.json`.
- **Indexing:** `backfill_candidate_index.py` indexes all profiles with at least one audit. Requires `OPENAI_API_KEY`.
- **Quality bar:** Only users with `profileStatus === "active"` and a valid `candidate_index.json` (embedding + skill_tags) are searchable.
- **Re-indexing:** Triggered after each audit and on PATCH /profile so profile-only changes (goals, career_goal, beyond_resume, experience_expansion) are reflected in recruiter matching.

---

## III. Search Flow

### Describe the Role

- **Role description** — Free-text textarea. The core input. Recruiters paste or type the job description.
- **Job title** — Optional. Used by JD-fit and can influence track inference.
- **Typo correction** — When the role description has obvious typos (e.g. "softwre eng", "machne lerning"), the backend uses an LLM to correct them before search. The corrected text is returned as `interpreted_as` so the recruiter sees what was actually searched. `skip_typo_correction: true` in the request body disables this. **POST /recruiter/typo-feedback** records feedback when the correction was wrong ("correct" | "wrong") for future improvement.

### Get Meridian-Fit (JD-Fit)

- **"Get Meridian-fit"** — Calls **POST /recruiter/jd-fit** with `job_description` (required) and optional `job_title`.
- **Returns:** `smart_min`, `grit_min`, `build_min`, `min_final_score`, `track`, `signals`, `unavailable`.
- **Purpose:** Infer what Smart/Grit/Build bars a role typically requires. Recruiters use this to pre-fill min filters.
- **"Use as filters"** — Fills `min_smart`, `min_grit`, `min_build`, and `track` in the search form.
- **JD-fit correction** — Recruiters can correct the inferred bars. **POST /recruiter/jd-fit-correction** saves `original_*` and `corrected_*` for feedback loop to improve accuracy.

### Filters

- **Major** — Single or comma-separated list. Matches `major` or `majors` in profile.
- **Track** — Tech, Pre-Health, Pre-Law, Humanities, Business, STEM, Other.
- **School** — `school_id` (e.g. utampa).
- **Cities** — Comma-separated. Matches `job_locations` in profile. Remote, Tampa, etc.
- **Min Smart / Grit / Build** — Hard cut. Only candidates meeting all specified minimums are returned.
- **Required skills** — Comma-separated. Passed as `required_skills`; overrides LLM-extracted role spec for must-have tags.

### Sort Options

- Best match (default)
- Smart
- Grit
- Build
- Final score
- Major
- School

### Pagination

- `limit` — 1–100 (default 50).
- `offset` — For pagination.

### Find Candidates

- **"Find candidates"** — Calls **POST /recruiter/search** with `role_description`, `filters`, `sort`, `limit`, `offset`, `required_skills`, and optionally `skip_typo_correction`.
- **Returns:** `{ candidates: [...], total: N, interpreted_as?: string }`.

---

## IV. Matching Engine (How Search Works)

### Data Flow

1. **Load candidates** — From `memory/dilly_profiles/`. Each has `embedding`, `skill_tags`, `skill_tags_v2`, `tag_evidence`, `major`, `majors`, `school_id`, `job_locations`, `track`, `smart`, `grit`, `build`, `final_score`, `name`, `dilly_take`, `experience_highlights`, `audit_evidence`, `application_target`.
2. **Embed role** — Role description is embedded via `dilly_core.embedding.get_embedding`. Cached for 10 minutes.
3. **Extract role spec** — LLM extracts `must_have` and `nice_to_have` tags from the JD into Meridian's canonical ontology. Fallback: rule-based `_extract_role_skill_spec` for coding, AI/ML, leadership, volunteer phrases.
4. **Apply filters** — Major, track, school, cities, min_smart, min_grit, min_build (hard cut).
5. **Score each candidate** — Four components:
   - **Semantic score** — Cosine similarity between role embedding and candidate embedding, mapped to 0–100.
   - **Skill fit score** — Evidence-weighted overlap. Each role skill matched in candidate tags is weighted by `tag_evidence` quality (0.15 for "currently learning", 1.0 for "built/engineered/trained/deployed").
   - **Meridian fit score** — How well candidate meets min_smart/min_grit/min_build bars. 50 if no mins.
   - **Feedback score** — From `recruiter_feedback.jsonl`: shortlists + contacts − passes, normalized 0–100, compressed to [35, 65]. Blended with weight 0.06–0.09.
6. **Blend** — `match_score = w1*semantic + w2*skill_fit + w3*meridian_fit + w4*feedback`. Weights vary: when must-haves exist, skill_fit gets more weight (0.40).
7. **Must-have gating** — If must_have tags exist, `must_have_quality` (0–100) gates: quality ≤ 0 → match × 0.65; < 25 → × 0.78; < 50 → × 0.90; ≥ 80 → × 1.05.
8. **LLM rerank** — When sort is `match_score`, top candidates are sent to an LLM for reranking. LLM returns per-candidate: `rerank_score` (0–100, unique per candidate), `fit_level` (Standout | Strong fit | Moderate fit | Developing), `rerank_reason` (one sentence, evidence-based). `match_score` is updated to the rerank value for display; `rerank_reason` is shown on cards.
9. **Sort & paginate** — By requested sort key; return `offset` to `offset+limit`.

### Quality Bar (Mercor-Grade)

- **Consistent** — Same role + filters → same ordering (tie-break by email).
- **Schema-tolerant** — Defensive load; filters accept list or single value; missing keys → defaults.
- **Bounded** — limit 1–100, offset ≥ 0.
- **Evidence-weighted** — "Currently learning X" ≠ "built X in production". Tag evidence quality drives skill_fit.

---

## V. Search Results UI

### View Modes

- **Grid** — Card layout with avatar, name, match %, Smart/Grit/Build, fit level, rerank reason.
- **Table** — Compact rows with same data.

### Candidate Cards (Grid)

- Avatar (profile photo or initials)
- Name
- Match % (from match_score)
- Smart, Grit, Build (mini bars or numbers)
- Fit level pill (Standout, Strong fit, Moderate fit, Developing)
- Rerank reason (one sentence)
- "View profile →" link
- Bookmark icon (☆/★)
- Compare checkbox (when compare mode is on)

### Candidate Rows (Table)

- Same data in row format.
- Sortable columns.
- Bookmark and compare from table.

### Interpreted As

- When typo correction changes the JD, a banner shows "We interpreted your search as: [corrected text]". Recruiter can confirm or retry with `skip_typo_correction`.

### Search State Persistence

- Role description, filters, sort, limit, candidates, total, jdFit, interpretedAs are stored in `sessionStorage` under `meridian_recruiter_search_state`. When returning from a candidate profile, the search is restored.

---

## VI. Meridian Compare

- **"Meridian Compare"** — Toggle compare mode. All cards/rows get a checkbox.
- **Select 2** — Recruiter selects exactly 2 candidates.
- **Compare** — Opens a modal with:
  - **Score breakdown** — Bar chart comparing Smart, Grit, Build, Semantic, Skill fit, Dilly fit, Match. Click a metric to see description and scores.
  - **LLM comparison** — **POST /recruiter/compare** with `candidate_ids` (2), `role_description`, and optional `candidates` (names, scores, fit_level). Returns `{ comparison: string }` — 4–6 sections (Match Summary, Smart, Grit, Build, Key Differentiators, Recommendation) with evidence-based bullets. Conclusion aligns with algorithmic scores: the higher-scoring candidate is recommended, with specific evidence.
- **Expand / retract** — Animated chart expansion; smooth close.

---

## VII. Bookmarks & Collections

### General Bookmarks

- **Add/remove** — Bookmark icon on cards, table rows, or profile. Toggle adds/removes from general bookmarks.
- **API:** POST /recruiter/bookmarks (body: candidate_id), DELETE /recruiter/bookmarks/{candidate_id}, POST /recruiter/bookmarks/check (body: candidate_id → { bookmarked: bool }).

### Collections

- **Create** — "New collection name" input + Create. **POST /recruiter/collections** (body: name).
- **Add to collection** — "+" on card/row opens modal: "Add to General Bookmarks" or "Add to collection" with list of existing collections. Can create new and add in one step. **POST /recruiter/collections/add** (body: collection_name, candidate_id).
- **Remove from collection** — × in sidebar next to candidate name. **POST /recruiter/collections/remove**.
- **Rename** — Pencil icon on collection name; inline edit. **PATCH /recruiter/collections** (body: old_name, new_name).
- **Delete** — × on collection header. **DELETE /recruiter/collections?name=...**.

### Sidebar

- **Bookmarks** — General bookmarks list. Candidate names link to profiles.
- **Collections** — Each collection shows name + list of candidates. Links, remove.
- **Notes** — List of candidates who have notes, with count. **GET /recruiter/notes/candidates** returns `[{ candidate_id, count }]`.

### Storage

- Bookmarks and collections are keyed by recruiter API key. Same key = same bookmarks across sessions. Stored in `recruiter_bookmark_store` (file-based or equivalent).

---

## VIII. Candidate Detail Page

**Route:** `/recruiter/candidates/[id]`. `id` is the 16-char profile uid (candidate_id).

### Data Loading

- **GET /recruiter/candidates/{id}** — Optional query params: `role_description`, `fit_level`.
- When `role_description` is provided, the backend computes:
  - **jd_evidence_map** — JD requirements mapped to evidence (green/yellow/red). Each item: `{ requirement, status, evidence }`.
  - **why_fit_bullets** — 3 bullets on why they fit (tone varies by fit_level: Standout = strong conviction; Developing = candid gaps).
  - **why_bad_fit_bullets** — When fit_level is Developing: 3 bullets on why they're a weak fit.
  - **structured_experience** — Experience entries re-ranked by relevance to the role; each has `relevance`, `matched_bullets`, `fit_reason`.
- **Caching** — Results cached 10 minutes by `hash(candidate_id + role_description + fit_level)`.

### Displayed Fields

- Name, email, major, majors, minors
- School, track (cohort)
- Smart, Grit, Build, final score
- Dilly take (one-line audit summary)
- Application target, job locations
- Pronouns, LinkedIn URL
- **JD gap summary** — "Strong on X; weak on Y" from jd_evidence_map
- **Structured experience** — Role-ranked with fit_reason and matched_bullets
- **Why fit bullets** — 3 evidence-based bullets (or why_bad_fit when Developing)
- **JD evidence map** — Green/yellow/red requirements with evidence snippets

### Actions on Profile

- **Shortlist** — Fires feedback event "shortlist". Button on profile.
- **Pass** — Fires feedback event "pass".
- **Contact** — Opens contact modal (see Contact / Outreach).
- **Bookmark** — Add to bookmarks or collection.
- **View full Meridian profile** — Link to `/p/[slug]/full` (student's shareable full profile).
- **Export to ATS** — Download shortlist as CSV (see Export).

### Feedback Events

- **POST /recruiter/feedback** — Body: `candidate_id`, `event` (view | shortlist | pass | contact), optional `role_id_or_search_id`.
- **View** — Fired automatically when candidate detail loads.
- Stored in `memory/recruiter_feedback.jsonl`. Phase 2: `feedback_score` blended into match_score for search ranking.

---

## IX. Similar Candidates

- **"Others like this"** — On candidate profile. **GET /recruiter/candidates/{id}/similar?limit=6&role_description=...**
- **Returns** — Candidates similar by embedding + score similarity. Excludes the target. When `role_description` is provided, each similar candidate also gets `match_score` (JD match).
- **Blend** — 70% embedding cosine sim + 30% score penalty (how different Smart/Grit/Build are).

---

## X. Ask AI (Consultant-Style Chat)

- **Chat at bottom of candidate profile** — Recruiters ask natural-language questions about the candidate.
- **POST /recruiter/candidates/{id}/ask** — Body: `question` (required), `role_description` (optional). **Streaming SSE**.
- **Context injected** — Candidate profile (cleaned), Smart/Grit/Build evidence quotes, scores, dilly_take, structured experience (role-ranked), JD evidence map, role description.
- **Rules** — Evidence-based only. Cite specific experience. Never invent. If context insufficient, say so. Use bullets. Focus on Smart, Grit, Build dimensions.
- **Formatting** — Supports **bold**, *italic*, __underline__, ~~strikethrough~~, [color]text[/color] (red, blue, green, etc.).
- **Quick actions** — "How do they handle technical ambiguity?", "Biggest risk for this JD?", "3 interview questions from Build gaps."

---

## XI. Recruiter Notes

- **Private notes per candidate** — Persist across sessions. Shared across recruiters using the same API key (team-level).
- **GET /recruiter/candidates/{id}/notes** — Returns `{ entries: [{ text, at }, ...] }`.
- **POST /recruiter/candidates/{id}/notes** — Body: `note` (string). Adds entry.
- **PUT** — Replaces all notes (if implemented).
- **Storage** — `recruiter_notes_store` keyed by API key + candidate_id.

---

## XII. Meridian Voice Search (Conversational Discovery)

- **Floating Voice FAB** — On recruiter search page. Tap to open chat.
- **Describe in plain English** — e.g. "Find me 5 PM candidates who have shipped production code".
- **POST /recruiter/voice/search** — Body: `query` (required), optional `role_description`, `conversation_history`.
- **Intent parsing** — LLM extracts `role_description`, `filters` (major, track, school_id, cities), `limit` (3–15), `min_smart/grit/build`. When `conversation_history` is provided, treats query as refinement (e.g. "Narrow to CS majors").
- **Runs search** — Same `recruiter_search.search()` with parsed params.
- **Evidence summarization** — Batch LLM: for each candidate, 1–2 sentence evidence summary. Returns `{ candidates, total, role_description }`.
- **Results in chat** — Inline candidate cards: name, match %, Smart/Grit/Build, evidence summary, profile link.
- **Multi-turn** — "Narrow to CS majors" refines prior search using conversation_history.
- **Timeout** — 90 seconds backend.

---

## XIII. Contact / Outreach

- **Email relay** — Recruiter sends intro message; Meridian emails the student with reply-to set to recruiter.
- **POST /recruiter/contact** — Body: `candidate_id`, `recruiter_email` (required), `recruiter_name`, `company`, `job_title`, `message` (required, 80–1500 chars).
- **Throttle** — Rate limit per candidate + recruiter_email to prevent spam.
- **Email** — Sent via `email_sender.send_recruiter_outreach_email`. Student gets email; reply-to = recruiter.
- **Logging** — Stored in `recruiter_outreach_store` (candidate_id, recruiter_email, message, status, error).

---

## XIV. Export to ATS

- **"Export to ATS"** — Downloads shortlisted candidates (bookmarks + all collections) as CSV.
- **GET /recruiter/export/shortlist** — Returns `{ candidates: [...] }` with fields: first_name, last_name, email, phone, school, major, track, smart, grit, build, meridian_profile_link, dilly_take, job_locations, source.
- **Format** — Aligned to Greenhouse, Bullhorn, and similar ATS bulk-import formats.
- **Cap** — 200 candidates max.

---

## XV. Company Advice

- **Submit recruiter advice for a company** — Shown to students on that company's page.
- **POST /recruiter/company-advice** — Body: `company_slug` (e.g. stripe, figma), `text`.
- **Validation** — Company must exist (from GET /companies). Stored in `company_recruiter_advice`.

---

## XVI. Batch Candidate Lookup

- **GET /recruiter/candidates/batch?ids=id1,id2,id3** — Returns minimal info (candidate_id, name) for up to 100 IDs. Used by sidebar to resolve names for bookmarks/collections/notes.

---

## XVII. API Summary (All Endpoints)

| Method | Path | Purpose |
|--------|------|---------|
| GET | /recruiter/check | Server config check (no auth) |
| POST | /recruiter/search | Semantic search |
| POST | /recruiter/typo-feedback | Typo correction feedback |
| POST | /recruiter/jd-fit | JD → Meridian-fit bars |
| POST | /recruiter/jd-fit-correction | Save JD-fit correction |
| GET | /recruiter/candidates/batch | Batch name lookup |
| GET | /recruiter/candidates/{id} | Candidate detail |
| POST | /recruiter/candidates/{id}/ask | Ask AI (streaming) |
| GET | /recruiter/candidates/{id}/similar | Similar candidates |
| GET | /recruiter/candidates/{id}/notes | Get notes |
| POST | /recruiter/candidates/{id}/notes | Add note |
| POST | /recruiter/voice/search | Conversational search |
| POST | /recruiter/company-advice | Submit company advice |
| POST | /recruiter/feedback | Log feedback (view/shortlist/pass/contact) |
| POST | /recruiter/contact | Email relay outreach |
| GET | /recruiter/bookmarks | Get bookmarks + collections |
| POST | /recruiter/bookmarks | Add bookmark |
| DELETE | /recruiter/bookmarks/{id} | Remove bookmark |
| POST | /recruiter/bookmarks/check | Check if bookmarked |
| POST | /recruiter/collections | Create collection |
| PATCH | /recruiter/collections | Rename collection |
| POST | /recruiter/collections/add | Add to collection |
| POST | /recruiter/collections/remove | Remove from collection |
| DELETE | /recruiter/collections | Delete collection |
| GET | /recruiter/notes/candidates | List candidates with notes |
| POST | /recruiter/compare | Compare 2 candidates |
| GET | /recruiter/export/shortlist | Export shortlist CSV |

---

## XVIII. UI Components & Layout

### Layout

- **Recruiter layout** — `layout.tsx` wraps `/recruiter` and `/recruiter/candidates/[id]` with nav.
- **RecruiterNavLeft** — Back to search, logo.
- **RecruiterNavRight** — API key entry, settings.

### Main Search Page

- Left: Search form (role, job title, filters, Get Meridian-fit, Find candidates).
- Center: Results (grid or table), compare mode, Meridian Compare modal.
- Right: Bookmarks sidebar (bookmarks, collections, notes).
- Bottom-right: RecruiterSearchVoice FAB.

### Candidate Detail Page

- Header: Name, avatar, scores, actions (Shortlist, Pass, Contact, Bookmark).
- Sections: JD gap summary, why fit/bad fit bullets, structured experience, JD evidence map.
- Bottom: Ask AI chat.
- Sidebar: Similar candidates, recruiter notes.

---

## XIX. Data Stores

- **recruiter_feedback_store** — `memory/recruiter_feedback.jsonl` (append-only). Events: view, shortlist, pass, contact.
- **recruiter_bookmark_store** — Bookmarks and collections keyed by API key.
- **recruiter_notes_store** — Notes keyed by API key + candidate_id.
- **recruiter_outreach_store** — Outreach log (candidate, recruiter, message, status).
- **recruiter_typo_feedback_store** — Typo correction feedback.
- **jd_fit_corrections_store** — JD-fit corrections for model improvement.

---

## XX. Integration with Student App

- **Apply on Meridian** — When students apply through the Jobs page, recruiters receive emails with subject `[Meridian Verified] Name – Title at Company`. Reply-to = student. Body includes profile link and report PDF link.
- **Six-second profile** — Students share `/p/[slug]`. Recruiters can open that link from the candidate's profile or from the apply email.
- **Full Meridian profile** — `/p/[slug]/full` — Shareable full profile with privacy toggles. Recruiter "View full Meridian profile" links there.

---

## XXI. Summary

Dilly Recruiter is a full recruiter workflow:

- **Discover** — Semantic search, JD-fit, filters, Voice search, typo correction.
- **Evaluate** — Candidate detail, JD evidence map, why fit/bad fit bullets, structured experience, Ask AI, Meridian Compare.
- **Organize** — Bookmarks, collections, notes.
- **Engage** — Contact (email relay), feedback (shortlist, pass, contact).
- **Export** — Shortlist to CSV for ATS import.
- **Contribute** — Company advice for students.

The matching engine blends semantic similarity, evidence-weighted skill fit, Meridian score fit, and recruiter feedback. LLM reranking adds fit_level and evidence-based rerank_reason. All candidates are Meridian-verified .edu students with structured profiles and audit-backed scores.

---

*Last updated: 2026-03-19. This document is the single comprehensive reference for everything Dilly Recruiter does.*
