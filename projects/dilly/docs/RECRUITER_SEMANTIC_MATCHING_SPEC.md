# Recruiter Semantic Matching — Full Spec (Meridian-Native)

**Goal:** A recruiter describes a role in Meridian; Meridian returns everyone who is a high match. Recruiters can sort/filter by major, college, cities willing to work in, track, scores, etc. No interview component; no dependency on Mercor.

This spec covers: **recruiter flow**, **deep semantic search**, **skill vectorization (resume/audit only)**, **continuous learning**, and **infrastructure**.

---

## Quality bar (Mercor-grade)

All components in this pipeline must meet this bar:

- **Consistent output** — Deterministic section order and formatting; same inputs → same document. No stray `None`, empty sections, or junk in the string we embed.
- **Schema-tolerant** — Support current and legacy shapes (e.g. audit_findings vs findings, evidence vs evidence_quotes, recommendations as object with title/action or text). Defensive access; no KeyError.
- **Length-bounded** — Candidate document and any stored text stay under defined caps (e.g. 8k chars total) so we never exceed embedding context. Truncate with clear rules, not mid-word.
- **Embedding-optimized** — Clean structure (e.g. `[Identity]`, `[Resume / experience]`, `[Meridian assessment]`) so the model sees coherent blocks. Normalized whitespace; one line per fact where possible.
- **Single source of truth** — One code path builds the canonical document; no duplicated logic between “full doc” and “parts.” Tests or demo script should assert on sample data so regressions show up.
- **Documented contract** — Module docstring and/or spec state which profile/audit keys are used and what happens when they’re missing. Future skill tags, embedding pipeline, and recruiter search should follow the same bar.

**Applied to:** `dilly_core/candidate_document.py`, `dilly_core/skill_tags.py`, `dilly_core/embedding.py` (truncate at word boundary, no crash, documented contract), `projects/meridian/api/candidate_index.py` (defensive load/save, float coercion guarded, documented contract), `projects/meridian/api/recruiter_search.py` (consistent sort, schema-tolerant filters, bounded limit/offset, documented contract), recruiter routes in `main.py` (defensive body parsing: limit/offset/min_* with try/except; invalid candidate_id → 400).

---

## 1. Recruiter flow (product)

### 1.1 Input

- **Role description**: Free-form text (job description or “we need a CS sophomore with Python and leadership experience for a summer internship”).
- **Optional structured filters** (applied after or during search):
  - **Major(s)** — e.g. Computer Science, Business
  - **College / school** — e.g. UTampa, or “any”
  - **Cities willing to work in** — from profile `job_locations` + `job_location_scope` (e.g. Tampa, Remote, Domestic)
  - **Track** — Tech, Pre-Health, Finance, etc.
  - **Min scores** — min Smart, Grit, Build, and/or final score
  - **ATS-ready** — only candidates who passed ATS check (if we store it)
  - **Application target** — internship, full_time, etc.

### 1.2 Output

- **Ranked list of candidates** (anonymized or identified per consent/policy):
  - **Match score** (0–100): combination of semantic similarity + skill fit + Meridian score fit.
  - **Meridian signals**: Smart, Grit, Build, final score, track (and optionally major, school, cities).
  - **Sort options**: by match score, by Smart, by Grit, by Build, by final score, by major, by college, by **top %** vs Meridian peers (Smart·Grit·Build average, Final, ATS readiness, or a General blend of available metrics).
- **Filters** applied in UI: same as above (major, college, cities, track, min scores, etc.).

### 1.3 Who is in the pool?

- **Source**: The matching engine only looks at people in **Meridian profiles** (`memory/dilly_profiles`). Each candidate must have a profile folder with both `profile.json` and `candidate_index.json`. No other source (e.g. parsed_resumes alone, external DB) is used.
- **Eligible candidates**: Students who have (1) completed at least one audit (so we have scores and a candidate “blob” for semantic/skill vectors), and (2) opted in to “recruiter visibility” or applied through Meridian to a job that grants recruiter access (per your consent model). Define one clear rule (e.g. “has audit + opted in to recruiter search” or “has audit + applied via Meridian”) and stick to it.

---

## 2. Deep semantic search

### 2.1 Purpose

- **Recruiter describes role in natural language** → we find candidates whose **resume + audit** are semantically close to that description (same meaning, different words).
- Enables “unconventional” matches (e.g. “led a dev team” matches “leadership” even without the exact phrase).

### 2.2 How it works (no Mercor; Meridian-owned)

1. **Embedding model**
   - Use a **single** embedding model for both roles and candidates so similarity is comparable.
   - **Options**: OpenAI `text-embedding-3-small` (or `-large`), or open models (e.g. `sentence-transformers/all-MiniLM-L6-v2`, or a larger one). Hosted or self-hosted.
   - **Recommendation**: Start with OpenAI for speed and quality; add an open-model option later if you want to avoid API dependency or cost at scale.

2. **Candidate “document” (what we embed)**
   - **Meridian-profile-first**: Build one text blob per candidate from **profile + narrative + resume + audit** so recruiter matching reflects everything the student told Meridian (not just resume). Includes:
     - **Identity**: name, major(s), track, goals, career_goal, application_target, preferred locations, minors (from profile).
     - **What they told Meridian**: optional full text from `dilly_profile_txt` (voice, onboarding, notes) when present.
     - **Resume / experience**: from parser or audit evidence when no resume.
     - **Meridian assessment**: Smart/Grit/Build, track, meridian_take, recommendations.
   - Concatenate into a single string; embed once per candidate. Store the embedding in the **candidate index**. Index is updated after each audit and **on profile update** (PATCH /profile) so profile-only changes (e.g. career_goal, goals) are reflected in matching.

3. **Role “document” (what we embed)**
   - The recruiter’s **role description** (free-form). Optionally append a short “ideal profile” if the recruiter adds structured fields (e.g. “Major: CS, Min Build: 70”). Embed this at **query time** (no need to store unless you cache for “saved searches”).

4. **Similarity**
   - **Cosine similarity** (or dot product if vectors are normalized) between role embedding and each candidate embedding.
   - Map to a 0–100 **semantic_score** for UI (e.g. `semantic_score = 50 + 50 * cosine_sim`).

5. **Combining with other signals**
   - **Final match score** = weighted combination of:
     - `semantic_score` (embedding similarity),
     - `skill_fit_score` (from skill vectorization, below),
     - `meridian_score_fit` (how well Smart/Grit/Build meet role requirements if we have JD→scores or recruiter-entered mins).
   - Weights can be tuned and later learned from feedback (continuous learning).

### 2.3 Where it runs

- **Vector store** holds one embedding per candidate (and optionally per “saved role” if you add that).
- On recruiter search: embed the role → **k-NN search** in the vector store → get top-N candidate IDs + similarity scores → apply filters (major, college, cities, etc.) → then combine with skill_fit and meridian_score_fit and sort.

---

## 3. Skill vectorization engine (no interview)

### 3.1 Purpose

- Turn **resume + audit** into a **normalized, queryable representation** so we can match “role needs Python + leadership” to “candidate has Python + led a project.”
- No interview: all signals come from **parser + audit**.

### 3.2 What we have today

- **Parser**: education, experience, skills, projects (structured).
- **Audit**: Smart, Grit, Build, final_score, track, findings, recommendations, evidence quotes.

### 3.3 Skill vector design (two parts)

**A. Structured skill vector (for filtering and overlap)**

- **Schema**: list of **(skill_or_domain, level or count)**.
- **Sources**:
  - Parser: extract skills (e.g. Python, Excel, SQL), tools, majors, degree type.
  - Audit: map findings/recommendations to “evidence of” (e.g. leadership, teamwork, technical depth). Optionally use a small LLM pass: “From these findings, list 5–10 skill/competency tags.”
- **Normalization**: map free text to a **controlled vocabulary** (e.g. “Python”, “Leadership”, “Data analysis”) so overlap with role requirements is computable.
- **Storage**: per candidate, store `skill_tags: ["Python", "Leadership", "Data analysis", ...]` (and optionally levels). When recruiter search includes “required skills” (from JD or dropdown), **skill_fit_score** = overlap or weighted overlap between role skills and candidate tags.

**B. Dense vector (same as semantic search)**

- The **candidate embedding** used for semantic search already encodes “what the candidate is about” in a dense vector. So for “skill vectorization” you can:
  - Use **only** the embedding for both semantic match and “skill” match (simplest), or
  - Use **embedding + structured tags**: embedding for semantic similarity, structured tags for explicit skill filters and overlap score.
- **Recommendation**: do both. Structured tags for interpretable filters and overlap; embedding for deep semantic match.

### 3.4 Building the skill vector (pipeline)

- **When**: whenever we have a new or updated audit (and profile). Same trigger as “update candidate index” (see Infrastructure).
- **Steps**:
  1. Load parsed resume (if any) + latest audit.
  2. **Structured**: extract skill tags from parser; optionally run a small LLM: “Given this audit and resume, output a list of skill/competency tags (e.g. Python, Leadership, Research).”
  3. **Dense**: build candidate document (resume summary + audit summary); embed; store.
- **Output**: one **skill vector** (list of tags + optional levels) and one **embedding** per candidate, both stored in the candidate index.

---

## 4. Continuous learning

### 4.1 Goal

- Use **recruiter behavior and outcomes** to improve ranking and matching over time (no Mercor; Meridian-owned).

### 4.2 Feedback events to collect

- **View**: recruiter opened a candidate profile (signal: this candidate was relevant to this role).
- **Shortlist / save**: recruiter shortlisted or saved the candidate for the role (strong positive).
- **Pass / skip**: recruiter passed or skipped (negative or weak signal).
- **Contact / invite**: recruiter sent a message or invite (strong positive).
- **Outcome** (if available): candidate applied, got interview, or got offer (strong positive); or “rejected after review” (negative).

Store: `(recruiter_id, role_id_or_role_description_hash, candidate_id, event_type, ts)`.

### 4.3 How to use feedback

- **Re-ranking**: for a given role (or role type), boost candidates who were shortlisted/contacted/hired for similar roles in the past; down-rank candidates who were often passed.
- **Similarity**: “similar roles” can be defined by (a) same role embedding cluster, or (b) same saved search / same recruiter. Then: for role R, candidates C who were positive for roles similar to R get a **feedback_score** boost.
- **Weight learning**: treat final match score as `w1*semantic + w2*skill_fit + w3*meridian_fit + w4*feedback`. Use simple regression or a small ML model to learn `w1..w4` from “was shortlisted / contacted” as target. Retrain periodically (e.g. weekly) on recent events.
- **Calibration**: if recruiters often pass on top-ranked candidates, semantic or skill weights may be off; adjust or retrain.

### 4.4 Implementation scope (phased)

- **Phase 1**: Log events (view, shortlist, pass) in a **recruiter_events** table or append-only log. No re-ranking yet.
- **Phase 2**: Add **feedback_score** per (candidate, role_cluster_or_search): count of shortlists/contacts minus passes, normalized. Blend into final match score with a fixed weight.
- **Phase 3**: Learn weights (w1..w4) from feedback; retrain periodically.

---

## 5. Infrastructure

### 5.1 Candidate index (single source of truth for recruiter search)

- **Purpose**: one place that has, per candidate (identified by user_id or profile_id):
  - **Structured fields** for filters: major, majors, school_id, job_locations, job_location_scope, track, smart, grit, build, final_score, application_target, ats_ready (if you have it), consent/visibility flag.
  - **Skill vector**: list of skill tags (and optional levels).
  - **Dense embedding**: vector from embedding model (same dim as model, e.g. 1536 for OpenAI small).
- **Where to store**:
  - **Option A — Postgres + pgvector**: one table `recruiter_candidate_index` with columns: user_id, major, majors (array or JSON), school_id, job_locations (array), job_location_scope, track, smart, grit, build, final_score, application_target, ats_ready, skill_tags (array or JSON), embedding (vector type), updated_at. Index on embedding for k-NN; indexes on major, school_id, track, etc. for filter.
  - **Option B — Vector DB + relational**: e.g. Chroma or Qdrant for embeddings only; Postgres (or existing profile/audit store) for structured fields. Query: k-NN in vector DB → get candidate IDs → join to Postgres for filters and metadata. More moving parts but scales vector search independently.
- **Recommendation**: Start with **Postgres + pgvector** if you already use or can add Postgres; one DB for filters + vector, simpler ops.

### 5.2 When the index is updated

- **On audit complete**: when a student’s audit is saved, run the “index this candidate” pipeline: build candidate document (resume summary + audit summary), embed it, extract skill tags, read profile for major/school/cities; upsert into `recruiter_candidate_index` (only if consent/visibility allows).
- **On profile update**: if profile fields (major, school, job_locations, etc.) change, update the same row; optionally re-embed if you include profile in the candidate document (e.g. career_goal).
- **Batch backfill**: one-time or nightly job to (re)build index for all eligible candidates (has audit + consent). Handy after schema or embedding model changes.

### 5.3 Recruiter auth and API

- **Auth**: recruiters are separate from students. Options: (1) same app, different role (e.g. recruiter@company.com vs .edu), (2) separate recruiter subdomain/app, (3) API-only with API keys. You need “this request is a recruiter” and optionally “which company/tenant.”
- **APIs** (suggested):
  - **POST /recruiter/search** (or **POST /recruiter/roles** that returns matches)
    - Body: `{ "role_description": "...", "filters": { "major": ["Computer Science"], "school_id": "utampa", "cities": ["Tampa", "Remote"], "track": "Tech", "min_smart": 65, "min_grit": 60, "min_build": 70 }, "sort": "match_score" | "smart" | "grit" | "build" | "final_score" | "major" | "school", "limit": 50, "offset": 0 }`
    - Returns: `{ "candidates": [ { "candidate_id", "match_score", "semantic_score", "skill_fit_score", "meridian_fit_score", "smart", "grit", "build", "final_score", "track", "major", "school_id", "job_locations", ... } ], "total": N }`
  - **GET /recruiter/candidates/:id** — candidate detail (anonymized or full per policy) for when recruiter clicks through.
  - **POST /recruiter/feedback** — body `{ "candidate_id", "role_id_or_search_id", "event": "view" | "shortlist" | "pass" | "contact" }` for continuous learning.

### 5.4 Embedding pipeline

- **Model**: one embedding model (e.g. OpenAI `text-embedding-3-small`). Same for candidates and role queries.
- **Candidate embedding**: built from “candidate document” (resume summary + audit summary). Compute on audit complete (and on backfill). Store in `recruiter_candidate_index.embedding`.
- **Role embedding**: computed at **query time** from `role_description`; no storage unless you add “saved searches.”
- **Rate/cost**: if you use OpenAI, batch candidate embeddings where possible (e.g. backfill or nightly); per-query one embedding per search is cheap.

### 5.5 Search flow (end-to-end)

1. Recruiter submits **role description** + **filters** + **sort**.
2. **Embed** role description → role_vector.
3. **Vector search**: k-NN (e.g. top 500 or 1000) on `recruiter_candidate_index` by role_vector, with optional **pre-filter** on structured fields (major, school_id, track, min_smart, etc.) if the DB supports filter-before-k-NN (pgvector does).
4. **Post-filter**: apply any filters not done in DB (e.g. complex city logic).
5. **Score**: for each remaining candidate, compute skill_fit_score (overlap with role skills if extracted; else 0 or skip), meridian_fit_score (vs recruiter-entered min scores or JD→scores). Combine: `match_score = w1*semantic + w2*skill_fit + w3*meridian_fit (+ w4*feedback in Phase 2)`.
6. **Sort** by requested field (match_score, smart, grit, etc.); paginate (offset, limit); return list.

### 5.6 Scale and performance

- **Candidates**: 10k–100k → single Postgres + pgvector is fine; use an index (e.g. HNSW or IVFFlat) on the embedding column. 1M+ → consider dedicated vector DB (Qdrant, Weaviate) or read replicas.
- **Latency**: embed role (~50–200 ms) + vector k-NN (~10–50 ms) + filters + blend (~few ms). Target **&lt;2 s** end-to-end.
- **Availability**: same as your main API; no separate Mercor or external matching dependency.

### 5.7 Data and privacy

- **Consent**: only index and show candidates who opted in to “recruiter search” (or your chosen rule). **Meridian’s current rule:** all students consent by joining the app; no separate opt-in flag. Store consent in profile or a dedicated table if you add an opt-out later; respect it in the index pipeline and API.
- **Anonymization**: if you return anonymized lists first, expose PII only after recruiter action (e.g. “request contact”) and with student consent if required.
- **Retention**: recruiter_events and feedback logs; define retention and access policy.

---

## 6. Summary table

| Piece | What we build (no Mercor) |
|-------|----------------------------|
| **Recruiter input** | Role description (free text) + filters (major, college, cities, track, min scores, etc.) |
| **Recruiter output** | Ranked candidates, sortable by match score, major, college, cities, scores |
| **Deep semantic search** | One embedding model; candidate doc = resume summary + audit summary; role = description; k-NN similarity → semantic_score |
| **Skill vectorization** | Structured skill tags from parser + audit (optional LLM); dense embedding from same candidate doc; no interview |
| **Continuous learning** | Log recruiter events (view, shortlist, pass, contact); feedback_score and/or learned weights to improve ranking |
| **Infrastructure** | Candidate index (Postgres + pgvector or vector DB + relational); update on audit/profile; recruiter auth; POST /recruiter/search, GET /recruiter/candidates/:id, POST /recruiter/feedback |

---

## 7. Build order: Phase 1 first, recruiter flow later

**Recruiter flow** (recruiter describes role → ranked candidates, filters, sort, UI) is **high priority later**. We build the foundation first so that when we turn on recruiter flow, the data and pipelines are ready.

### Phase 1 — Foundation (start now, no recruiter UI/API)

1. **Candidate document builder** — Build the single “candidate document” (resume summary + audit summary) used for embeddings and semantic search. Lives in `dilly_core`; called from audit-complete pipeline and (later) index backfill.
2. **Skill tags extraction** — From parser + audit → normalized skill tags. Rule-based first (parser skills, major, track, findings); optional LLM pass later. Store in audit summary or profile so they’re ready for the index.
3. **Candidate index (minimal) + embedding pipeline** — When an audit completes: build candidate doc → embed (OpenAI or open model) → store embedding + metadata (e.g. in profile folder or SQLite). No recruiter API yet; index is populated so recruiter search can use it later. Consent/visibility: only index when we have a clear “recruiter search opt-in” (or your rule); default to opt-in later so schema is ready.

### Phase 2 — Recruiter flow (high priority later)

4. **POST /recruiter/search** — Recruiter auth, embed role, k-NN over stored embeddings, filters (major, college, cities, track, min scores), blend semantic + skill_fit + meridian_fit, sort, return.
5. **Recruiter UI** — Role input, filters, sort, results list.
6. **Feedback events** — Log view/shortlist/pass/contact; then feedback_score and weight blending; then learned weights (optional).

### Original suggested order (reference)

1. Candidate index schema and consent/visibility.
2. Candidate document builder and embedding pipeline (on audit complete + backfill).
3. Skill tags and storage in index.
4. POST /recruiter/search.
5. Recruiter UI.
6. Feedback events and continuous learning.

This gives you recruiter-described roles, high-match ranking, deep semantic search, skill vectorization without interview, and continuous learning, all Meridian-native and with no dependency on Mercor.
