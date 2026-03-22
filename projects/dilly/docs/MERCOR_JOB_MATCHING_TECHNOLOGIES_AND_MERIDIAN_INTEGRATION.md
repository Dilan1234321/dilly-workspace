# Mercor Job Matching Technologies & Meridian Integration

Summary of **what technologies Mercor uses** for job matching and **how Meridian could integrate or adopt** similar capabilities. Complements [MERCOR_VS_MERIDIAN_NOTES.md](./MERCOR_VS_MERIDIAN_NOTES.md) (product/positioning) and [MERIDIAN_PROCESS_AND_MERCOR_NOTES.md](./MERIDIAN_PROCESS_AND_MERCOR_NOTES.md) (process/unlock map).

---

## 1. Technologies Mercor Uses (What We Know)

### 1.1 Semantic search & matching

- **Deep semantic search** across:
  - Resumes, portfolios, social profiles, GitHub, prior interview transcripts
- **Natural language role descriptions** from employers → converted into search intents to scan candidate pools
- **Profile–listing fit** (not just keywords): algorithms understand explicit requirements, implicit needs, and cultural indicators, then match against **candidate skill vectors**
- **Unconventional matches**: surfaces candidates whose background doesn’t obviously align with traditional criteria but whose assessed capabilities fit the role

*Implication:* Matching is **vector/semantic** (embeddings + similarity) and **structured** (skill vectors), not only keyword or rule-based.

### 1.2 Proprietary AI video interview

- **~20-minute** automated video interviews
- **Proprietary LLMs** for the interviewer and evaluation
- **Multi-modal**: speech recognition (transcription), **computer vision** (non-verbal, body language), **NLP** (technical depth, reasoning)
- **Structured outputs**: “skill vectors,” “capability maps,” “dynamic skill vectors” that feed into matching and ranking
- **Adaptive**: follow-up questions tailored to candidate responses
- **Reusable**: one interview can qualify for many roles; up to 3 retakes

*Implication:* The “heavy” signal is **interview-derived vectors**, not only resume parsing.

### 1.3 Skill vectorization & assessment

- **Skill vectorization engine** (from the platform analysis):
  - Cross-domain skill transfer for role flexibility
  - Continuous calibration via performance feedback (successful placements, early departures)
  - Dynamic skill weights by role requirements
  - Multi-dimensional technical competency mapping
- **Assessments** (written/verbal/coding) produce reusable signals; **role–assessment matrix**: pass assessment A → eligible for every role that requires A
- **LLM-based evaluation rubrics** (e.g. truthfulness, instruction-following, verbosity) for interview answers

*Implication:* Matching is driven by **normalized, multi-dimensional skill/capability vectors** and a **role–assessment (unlock) map**.

### 1.4 Continuous learning

- **Real-world feedback**: successful placements and bad matches/early departures refine matching and assessment
- **Dual use of data**: same experts in talent pool and RLHF services → behavioral data that improves “what drives success in AI roles”

*Implication:* Their moat is **proprietary data + feedback loops**, not only the model architecture.

### 1.5 Infrastructure & scale

- **24-hour** hiring cycles; assessments sync across applications (complete once, qualify for many)
- **Job-fit ranking**: listings ordered by profile–listing match
- **Instant offers**: when (interview + assessments + skills + availability) meet listing criteria, candidates are surfaced as prequalified; hiring managers can send offers without a formal application
- **API**: [mercor.com/docs/api](https://mercor.com/docs/api) exists (company/developer side); talent-facing docs at [talent.docs.mercor.com](https://talent.docs.mercor.com)

*Implication:* Matching is **real-time**, **ranking-based**, and **employer-pull** (prequalified pool + instant offer).

---

## 2. Technology Stack (Inferred)

| Layer | Mercor (inferred) | Public / confirmable |
|-------|-------------------|----------------------|
| **Resume/profile parsing** | Parse → structured profile (roles, skills, education, projects); pre-fill from resume | Yes (talent docs) |
| **Semantic search** | “Deep semantic search”; likely **embeddings** (text/transcripts) + vector similarity | Described, not stack |
| **Skill vectors** | Multi-dimensional vectors from assessments + interview; used for ranking and fit | Described in analysis |
| **AI interview** | Proprietary LLMs, ASR, computer vision, NLP | Yes |
| **Matching/ranking** | ML algorithms; profile–listing fit; feedback loops | Yes |
| **APIs** | Company-side API (mercor.com/docs/api); talent flow via product, not a public “matching API” | API exists; scope unclear |

We do **not** know: exact embedding models, vector DB, or whether they expose a **matching API** for third parties (e.g. Meridian) to call.

---

## 3. How Meridian Could Integrate or Adopt

Two broad directions: **integrate with Mercor** (if they offer it) vs **adopt similar technologies** in Meridian’s own stack.

### 3.1 Integrate *with* Mercor (if available)

- **Check Mercor’s API** (company/partner docs) for:
  - **Candidate submission**: send anonymized or consented Meridian profiles (e.g. scores + structured fields) for matching to Mercor roles
  - **Job feed**: pull Mercor job listings into Meridian’s Jobs tab (with attribution)
  - **Match scores**: API that returns “fit” or “recommended roles” for a given profile
- **Use case for Meridian**: “Get job-ready in Meridian → we can also refer you to / surface opportunities on Mercor” (career accelerator → optional staffing bridge).
- **Blocker**: No evidence yet of a **public “matching API”** or partner integration; their API may be employer-focused (post jobs, receive candidates). Worth a direct inquiry if partnership is a goal.

### 3.2 Adopt similar technologies inside Meridian (no Mercor dependency)

We already have **concepts** that mirror Mercor; we can add **tech** that gets us closer to their level of matching without partnering.

| Mercor capability | Meridian today | Possible tech adoption |
|-------------------|----------------|------------------------|
| **Structured profile** | Parsed resume, Smart/Grit/Build, track, “Do these 3 next” | Keep extending structured profile (skills, goals, ATS-ready); optional **embedding** of profile text for semantic match |
| **Semantic job–candidate match** | Keyword + rule-based + LLM match_pct in `job_matching.py` | Add **embeddings**: embed job descriptions + (resume + audit summary); **vector similarity** as a signal alongside current scoring |
| **Skill / score vectors** | Smart, Grit, Build (3 dims); required_scores per job | Keep and extend; optional **fine-grained skill tags** from audit (e.g. Python, leadership) and **role–score map** (unlock map) |
| **Unlock map** | door_criteria, company meridian_scores, JD→scores | Expand to **role-type → required Meridian signals**; “do these 3 next to unlock X” |
| **Ranking by fit** | match_pct, Target/Reach, to_land_this | Add **semantic similarity score** (and optionally **learning from apply/outcomes** later) |
| **Employer pull** | Recruiter view (roadmap) | Same; use Meridian signals (scores, track, ATS-ready) as the “vector” employers filter on |

Concrete **tech additions** that would move Meridian toward “Mercor-style” matching:

1. **Embeddings + vector similarity (high impact)**  
   - Embed: job description (and optionally title, company); candidate “blob” (resume summary + audit summary + scores/track).  
   - Use a single embedding model (e.g. OpenAI `text-embedding-3-small`, or an open model) and a **vector store** (e.g. in-memory for small job set, or Pinecone/Weaviate/pgvector if we scale).  
   - In `job_matching.py`: compute **semantic similarity** between candidate and each job; combine with current rule/LLM match_pct (e.g. weighted blend).  
   - Outcome: better handling of paraphrased JDs and “unconventional but good” matches.

2. **Structured skill/track signals (medium impact)**  
   - From audit or parser: extract **skill tags** (e.g. Python, Excel, “led team”) and **track/role-type**.  
   - Store per job: **required_skills** or **preferred_skills** (from JD or company criteria).  
   - Match: overlap + level (e.g. “has X of required Y”).  
   - Outcome: “job fit” in Mercor terms without needing their API.

3. **Unlock map + recommendations (already in progress)**  
   - **door_criteria.json** + **meridian_scores** per company/JD = our “role–assessment” map.  
   - “Do these 3 next **to qualify for [these roles/partners]**” = Mercor-style “recommended assessments that unlock roles.”  
   - Tech here is mostly **data and UX**; keep extending criteria and surfacing “you’re eligible” / “you’re N points from eligible.”

4. **Learning from outcomes (later)**  
   - If we get **apply clicks**, **interviews**, or **hires** (from partners or self-reported), use them as **positive/negative feedback** to re-rank or tune scoring (similar to Mercor’s “continuous learning”).  
   - Requires event pipeline and (optionally) a small ML layer; start with logging, then add simple ranking tweaks.

---

**→ Full Meridian-native spec (recruiter describes role → high-match candidates; semantic search + skill vectors + continuous learning + infrastructure): [RECRUITER_SEMANTIC_MATCHING_SPEC.md](./RECRUITER_SEMANTIC_MATCHING_SPEC.md). No interview; no Mercor dependency.**

---

## 4. Recommended next steps

1. **Clarify Mercor API**  
   - Read [mercor.com/docs/api](https://mercor.com/docs/api) (and any partner docs); determine if there is a **matching or candidate-submission API** we could call from Meridian.  
   - If yes: design a thin “Mercor bridge” (e.g. “Share to Mercor” or “See Mercor roles that match you”) with consent and attribution.

2. **Add semantic layer in Meridian (no Mercor dependency)**  
   - Pick one embedding model + one vector store (or in-memory for MVP).  
   - In `job_matching.py`: add an optional **semantic_score** per job; merge with existing `match_pct` (e.g. `0.7 * rule_llm_match + 0.3 * semantic_similarity`).  
   - Embed jobs on ingest or on-demand; embed candidate once per audit (or per profile update).

3. **Extend unlock map and copy**  
   - Add more role-types / partners to **door_criteria** and **company meridian_scores**.  
   - Surface “You’re eligible for X” and “Do these 3 next to unlock Y” so the **product** feels like “one effort, many doors” even before we add more tech.

4. **Document and iterate**  
   - Keep this doc and [MERCOR_VS_MERIDIAN_NOTES.md](./MERCOR_VS_MERIDIAN_NOTES.md) updated as we learn more about Mercor’s stack or their API.  
   - Revisit “integrate with Mercor” if they launch a partner or matching API.

---

## 5. References

- [MERCOR_VS_MERIDIAN_NOTES.md](./MERCOR_VS_MERIDIAN_NOTES.md) — Product comparison, heavy lifting, Meridian build path  
- [MERIDIAN_PROCESS_AND_MERCOR_NOTES.md](./MERIDIAN_PROCESS_AND_MERCOR_NOTES.md) — Process (resume → match → Target/Reach) and unlock map  
- Mercor talent docs: [talent.docs.mercor.com](https://talent.docs.mercor.com) (profile, assessments, AI interview, apply)  
- Mercor company API: [mercor.com/docs/api](https://mercor.com/docs/api)  
- External analysis: e.g. Digidai “Mercor comprehensive platform analysis” (skill vectors, semantic search, video interview architecture)

---

*Changelog: 2026-03-16 — Initial doc: Mercor technologies summary, inferred stack, integration vs adoption, recommended next steps.*
