# Requirement: Scores Based on Real Hiring Guidelines (Student Cohort)

## Product requirement

**Meridian scores (Smart, Grit, Build) must be scored based on REAL HIRING GUIDELINES from companies in the student's respective cohort.**

- **Real hiring guidelines** = criteria from actual employers (career pages, OPM, recruiter research, SHRM, etc.), not generic or invented rules.
- **Student's respective cohort** = the set of employers and programs that hire or admit from that student’s track (and optionally school). Examples: Tech → employers that hire from that school/track; Pre-Health → med/dental/PA programs and clinical employers; Pre-Law → law schools and legal employers.

So the numbers should be defensible as: *“This is what employers (or programs) in your cohort actually look for, and here’s how your resume stacks up.”*

---

## Current state

| Layer | What we have | Gap vs requirement |
|-------|----------------------|---------------------|
| **Numeric scoring** | Rule-based formulas in `dilly_core` (GPA, impact, leadership, track-specific keywords). Track-specific weights and Build logic. | Formulas are not explicitly sourced to “companies in this cohort”; they are internal rules + research-backed design. |
| **Rubrics** | `rubric_builder.md`, `rubric_pre_health.md` cite employer/recruiter research (SHRM, Jobscan, hiring-manager surveys). Used to guide LLM recommendations and language. | Rubrics align to *industry* standards; they are not yet explicitly “employers that hire from this student’s cohort.” |
| **Company criteria** | `company_hiring_criteria.json` holds verified employer criteria (e.g. USAJobs, Stripe, Figma). Used for **job matching** (why_bullets, fit). | Not used to define or weight Smart/Grit/Build scoring. |
| **Cohort** | **Peer benchmark:** cohort = same-track (and optionally all-track) students for **percentiles** only. **LLM:** “cohort” = track for tailoring advice (e.g. “COHORT: TECH”). | “Cohort” is track-based; we do not yet have an explicit “employers that hire from this cohort” list driving the score rubric. |
| **School** | SCHOOL_METRICS_2026, school overrides (e.g. UT, Georgia Tech). | School-specific adjustments exist but are not framed as “employer guidelines for this school’s recruiters.” |

So today the numbers are **track-specific and research-backed**, but they are **not yet explicitly derived from “real hiring guidelines from companies in the student’s cohort.”**

---

## Target state

1. **Per-track (and optionally per-school) employer criteria**
   - Maintain or derive a set of “employers / programs that hire from this cohort” (e.g. from `company_hiring_criteria.json`, career-center data, or published employer lists per track).
   - Document the **real hiring guidelines** we use per track (sources: OPM, company career pages, SHRM, rubric_builder / rubric_pre_health, etc.).

2. **Scoring tied to those guidelines**
   - Either:
     - **Option A:** Keep current formulas but **document** how each component (Smart/Grit/Build) maps to stated employer criteria for that track (so the numbers are *interpretable* as “based on real hiring guidelines”), or  
     - **Option B:** **Derive or weight** the scoring rubric from cohort employer criteria (e.g. when we have verified criteria for a track, use them to set weights or thresholds).  
   - In both cases, the system should be able to state: “Scores are based on hiring guidelines from employers/programs that hire [track] candidates.”

3. **Transparency in the product**
   - UI/API can show a short line per audit: e.g. “Scored using hiring guidelines from employers that hire [Tech/Pre-Health/…] candidates” and link or cite the evidence (report Evidence section, and optionally a methodology doc).

4. **No overclaim before implementation**
   - In-app copy should only say “based on real hiring guidelines from companies in your cohort” once the above is in place. Until then, use accurate framing: e.g. “Scores use signals employers in your field look for (research-backed).”

---

## Implementation steps (recommended)

1. **Define “cohort employers” per track**  
   - For each track, list sources of real hiring guidelines (e.g. Tech: Stripe, Figma, SHRM, rubric_builder; Pre-Health: rubric_pre_health, med school admissions; Federal: USAJobs/OPM).  
   - Store in config or `company_hiring_criteria` (e.g. by track or source) so the pipeline can say “this track’s criteria come from X, Y, Z.”

2. **Map current scoring to those criteria**  
   - In `SCORING_LOGIC.md` (or a companion doc), add a section per track: “Employer criteria used: [sources]. How Smart/Grit/Build map to them.”  
   - Ensures the existing numbers are **interpretable** as cohort-employer-aligned even before changing formulas.

3. **Optional: cohort-specific weights**  
   - If we have verified employer criteria per track (or per school), add optional weights or thresholds in `dilly_core` so that when “cohort employer criteria” are available, they influence the score (or a separate “employer-fit” signal).

4. **API + UI**  
   - Audit response (or profile) can include a short `scoring_basis` or `cohort_criteria_source` string for the UI.  
   - Update in-app copy to: “Scores are based on real hiring guidelines from employers in your cohort” once (1)–(3) are done and documented.

---

## Is this possible?

**Yes — in stages.**

- **Short term (high confidence):** Map current scoring to **cited, real** hiring guidelines per track (SHRM, recruiter research, OPM, rubric_builder / rubric_pre_health, and any verified company criteria we have). Document the mapping so every Smart/Grit/Build component is traceable to a stated employer or industry source. No formula change required; we make the existing numbers **interpretable** as “based on real hiring guidelines.” This satisfies the requirement for transparency and defensibility.
- **Medium term:** Add per-track (and optionally per-school) “cohort employer criteria” in config; optionally adjust weights or thresholds when we have verified criteria for that track. Scores stay on a single 0–100 scale; we’re just making the rubric explicitly cohort-employer-sourced.
- **Strictest interpretation (“every number comes from a specific company in this student’s cohort”):** Harder. It would require either (1) a large, maintained list of employers per cohort with machine-readable criteria, or (2) per-job scoring (we already do company criteria for job matching). For a **single** Meridian score, the practical approach is: “Scores are based on hiring guidelines from employers/programs that hire [track] candidates,” with track-level (and when available school-level) criteria documented and mapped to Smart/Grit/Build.

So: **yes, it’s possible** to have scores that are legitimately “based on real hiring guidelines from companies in the student’s cohort” by (a) defining cohort as track (and optionally school), (b) tying our rubric to real sources per track, and (c) documenting and surfacing that link. Full per-company, per-student granularity is optional and can come later.

---

## What problems will we run into?

| Problem | Why it happens |
|--------|----------------------------------|
| **Defining “cohort”** | “Companies in the student’s cohort” could mean: same school’s recruiters, same track (Tech/Pre-Health), same region, or same target role. Schools rarely publish a definitive “employers who hire our students” list; career-center data is often internal. So we don’t have a clean, universal cohort–employer list per student. |
| **Sparse employer criteria** | We have only a few verified company criteria (e.g. USAJobs, Stripe, Figma). Most employers don’t publish clear, structured hiring guidelines. So we can’t “score from Company X” for most companies. |
| **Conflicting criteria** | Different employers want different things (e.g. Stripe vs. big banks). We need one 0–100 score per dimension, not one per company. So we must aggregate or choose a representative set of criteria. |
| **Keeping criteria current** | Hiring practices and job requirements change. If we cite “Company X career page 2024,” it can go stale. We need a way to refresh without constant engineering. |
| **Legal / fairness** | If we claim “based on Company X’s guidelines,” we must be accurate and non-discriminatory. Overclaiming or misattributing could create risk. Sourcing to published, neutral research (SHRM, OPM) and clearly cited rubrics reduces that. |
| **User expectations** | Students may ask “which companies?” or “does Company Y use this?” We need a clear, honest line: e.g. “Employers that hire [track] candidates; our rubric is built from recruiter research and published employer criteria,” without implying every employer uses our exact formula. |

---

## How can we overcome them?

| Problem | Mitigation |
|--------|------------|
| **Defining “cohort”** | **Use track as the primary cohort.** Define “employers/programs that hire [Tech/Pre-Health/Pre-Law/…] candidates” from industry research + verified company criteria. Optionally add **school** later: when we have career-center or published employer lists per school, attach them as an overlay (e.g. “UT Tech employers”) without requiring them for launch. |
| **Sparse employer criteria** | **Tier our sources.** Tier 1 = verified company criteria (company_hiring_criteria.json). Tier 2 = cited industry/recruiter research (rubric_builder, rubric_pre_health, SHRM, OPM). Tier 3 = general track standards. Map Smart/Grit/Build to Tier 1+2; document “when we have Tier 1 for your track we use it; otherwise we use Tier 2.” We don’t need hundreds of companies; we need a clear, defensible chain from score to real criteria. |
| **Conflicting criteria** | **One rubric per track.** Don’t try to show “Stripe score vs Figma score.” Aggregate into “signals employers in [track] look for” and document: “Our Tech rubric is informed by [Stripe, Figma, SHRM, recruiter surveys]. Smart/Grit/Build map to the common themes (e.g. technical depth, impact, communication).” Same for Pre-Health (admissions + clinical employers), Pre-Law, etc. |
| **Keeping criteria current** | **Lightweight refresh cadence.** (1) When we add a new company to company_hiring_criteria, we tag it by track and optionally update the track’s “criteria source” blurb. (2) Once a year, review rubric_builder / rubric_pre_health and linked sources; update if hiring research has shifted. (3) Don’t promise “real-time employer criteria”; promise “based on real hiring guidelines” with a stated methodology and refresh cycle. |
| **Legal / fairness** | **Cite, don’t invent.** Only claim “based on real hiring guidelines” where we have a clear source (OPM, company career page, SHRM, published survey). In-app and in docs: “Scores use hiring signals from [sources]. We don’t speak for any specific employer.” Avoid naming companies in score explanation unless we use their verified criteria (e.g. “Federal roles: OPM qualifications”). |
| **User expectations** | **Clear in-product copy.** e.g. “Scores are based on hiring guidelines from employers that hire [Tech/Pre-Health/…] candidates. We use recruiter research and published employer criteria; open your report to see what from your resume drove each number.” Optional: a one-pager per track (“How we score [Tech]”) that lists high-level criteria and sources so students and career centers can see the logic. |

---

## Roadmap: Overcome problems and score correctly

Phased plan to get scores based on real hiring guidelines from the student’s cohort. Each phase has clear deliverables and unblocks the next.

---

### Phase 1 — Document and map (no formula change)

**Goal:** Every Smart/Grit/Build component is traceable to a real, cited source per track. Scores are defensible as “based on real hiring guidelines” without changing the engine.

| Step | Deliverable | Notes |
|------|-------------|--------|
| 1.1 | **Per-track criteria sources doc** | One section per track (Tech, Pre-Health, Pre-Law, Business, Science, etc.) in a single doc (e.g. `docs/SCORING_SOURCES_BY_TRACK.md`). For each track: list Tier 1 (verified company criteria from company_hiring_criteria.json) and Tier 2 (rubric_builder, rubric_pre_health, SHRM, OPM, recruiter surveys). Cite URLs or doc names. |
| 1.2 | **Map formulas to those sources** | In SCORING_LOGIC.md (or the same doc), add per track: “Smart: [GPA, honors, research] maps to employer criteria [list sources]. Grit: [impact, leadership, work entries] maps to [sources]. Build: [track keywords] maps to [sources].” Ensures every current formula element is tied to a stated employer/industry source. |
| 1.3 | **Single “scoring basis” blurb per track** | One sentence per track for the UI, e.g. “Scores use hiring guidelines from employers that hire Tech candidates (SHRM, recruiter research, company career pages).” Store in config or code (e.g. `TRACK_SCORING_BASIS[track]`) for Phase 3. |

**Outcome:** We can honestly say “scores are based on real hiring guidelines” and point to the doc. No engine change.

---

### Phase 2 — Cohort employer config and tagging

**Goal:** Explicit “cohort employer criteria” per track in config; company criteria tagged by track so the pipeline knows which employers/sources apply to which cohort.

| Step | Deliverable | Notes |
|------|-------------|--------|
| 2.1 | **Tag company_hiring_criteria by track** | In `company_hiring_criteria.json` (or a small companion), add a `tracks` array per rule (e.g. USAJobs → ["All"] or ["Federal"], Stripe/Figma → ["Tech"]). If no tag, treat as “general” and don’t claim track-specific. |
| 2.2 | **Per-track cohort criteria config** | New file or section, e.g. `knowledge/cohort_criteria_by_track.json`: for each track, list `sources` (names/IDs from company_hiring_criteria + “rubric_builder”, “rubric_pre_health”, “SHRM”, “OPM”) and optional `scoring_basis_short` (the UI sentence from Phase 1.3). API can read this to return “what we use for this track.” |
| 2.3 | **API: return scoring_basis with audit** | Audit response (or profile) includes `scoring_basis` or `cohort_criteria_source`: the short blurb for the student’s track. Dashboard can show it under “Your numbers” or in the report. |

**Outcome:** Backend and UI can say “for your track we use these sources” and show the blurb. Still no formula change.

---

### Phase 3 — Product copy and transparency

**Goal:** In-app copy and report state clearly that scores are based on real hiring guidelines from the cohort; users can see the logic.

| Step | Deliverable | Notes |
|------|-------------|--------|
| 3.1 | **Update in-app copy** | Replace “Scores use signals employers in your field look for (research-backed)” with “Scores are based on real hiring guidelines from employers that hire [track] candidates.” Use the per-track blurb from Phase 1.3 / 2.2. Only do this after Phase 1–2 are done so we don’t overclaim. |
| 3.2 | **Report: cite sources** | In the Hiring report (e.g. under the radar or in Evidence), add one line: “Scored using hiring guidelines from employers that hire [Tech/Pre-Health/…] candidates. Sources: [short list or link].” Link to the per-track doc if we publish it. |
| 3.3 | **Optional: one-pager per track** | Public or in-app “How we score [Tech]” (and Pre-Health, Pre-Law, etc.): high-level criteria (Smart/Grit/Build), which employer/industry sources we use, and that we don’t speak for any single employer. Reduces “which companies?” confusion. |

**Outcome:** Users and career centers see that scores are cohort-employer-grounded and where the logic comes from.

---

### Phase 4 — Optional formula alignment

**Goal:** When we have strong verified criteria for a track, optionally nudge weights or thresholds so the formula better matches those criteria. Still one 0–100 scale per dimension.

| Step | Deliverable | Notes |
|------|-------------|--------|
| 4.1 | **Compare rubric to current formula** | For 1–2 tracks (e.g. Tech, Pre-Health), table: “Employer criteria say X; our formula currently does Y; gap Z.” Decide if we need to reweight (e.g. more weight on quantifiable impact for Tech) or add a threshold. |
| 4.2 | **Implement track overrides (if any)** | In dilly_core, optional per-track overrides: e.g. `Tech: grit_weight_boost` or `Pre-Health: clinical_threshold`. Load from cohort_criteria_by_track or SCORING_LOGIC. Keep defaults so unknown tracks behave as today. |
| 4.3 | **Document and re-run mapping** | Update the Phase 1 mapping doc so it still accurately describes how we compute scores after overrides. |

**Outcome:** Scores not only map to real criteria but, where we have strong Tier 1 criteria, the formula reflects them. Optional; Phases 1–3 already satisfy “scored correctly” for transparency and defensibility.

---

### Phase 5 — Refresh and governance

**Goal:** Criteria stay current; we don’t overclaim or drift.

| Step | Deliverable | Notes |
|------|-------------|--------|
| 5.1 | **Refresh cadence** | Document: (1) When we add a company to company_hiring_criteria, tag by track and update cohort_criteria_by_track if needed. (2) Annual review of rubric_builder, rubric_pre_health, and SCORING_SOURCES_BY_TRACK; update if hiring research or links changed. Put in a runbook or COHORT_EMPLOYER_SCORING_REQUIREMENT. |
| 5.2 | **Legal/positioning guardrails** | In docs and product: “We don’t speak for any specific employer”; only cite sources we actually use; avoid naming companies in score explanation unless we use their verified criteria. Review once with legal/compliance if needed. |

**Outcome:** Sustainable “scores based on real hiring guidelines” without staleness or overclaim risk.

---

### Roadmap summary

| Phase | Focus | Delivers “scored correctly”? |
|-------|--------|------------------------------|
| **1** | Document + map formulas to real sources | Yes — defensible and transparent. |
| **2** | Cohort employer config + API scoring_basis | Yes — pipeline and UI know “what we use for this track.” |
| **3** | In-app copy + report citation + optional one-pagers | Yes — users see it clearly. |
| **4** | Optional formula alignment to criteria | Stronger alignment where we have Tier 1 criteria. |
| **5** | Refresh cadence + guardrails | Keeps it correct over time. |

**Minimum to “score correctly”:** Phases 1 + 2 + 3. Phases 4 and 5 make it better and sustainable.

---

## Summary

- **Feasible:** Yes, by tying scores to track-level (and optionally school-level) real hiring guidelines and documenting the mapping. Full per-company, per-student scoring is not required for the requirement.
- **Main risks:** Fuzzy cohort definition, few verified company criteria, conflicting employer preferences, staleness, and overclaiming. All can be mitigated with track-first cohort definition, tiered sources (company + research), a single rubric per track, a simple refresh process, and careful citation in product and docs.

---

## References

- `SCORING_LOGIC.md` — current formulas and track logic  
- `projects/meridian/prompts/rubric_builder.md` — Builder track, employer/recruiter research  
- `projects/meridian/prompts/rubric_pre_health.md` — Pre-Health, admissions/employer signals  
- `projects/meridian/knowledge/company_hiring_criteria.json` — verified company criteria (job matching)  
- `projects/meridian/api/company_criteria.py` — job_is_verified, get_verified_companies  
- `projects/meridian/api/peer_benchmark.py` — cohort = same-track peers for percentiles  
- `dilly_core/llm_auditor.py` — cohort/track prompts for LLM
