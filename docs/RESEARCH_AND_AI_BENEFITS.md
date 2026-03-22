# Research and How It Benefits the Meridian AI

This document summarizes the research that backs Meridian’s scoring and track logic and explains how that research directly improves the AI’s fairness, accuracy, and defensibility.

**Permanent policy (going forward for the rest of time):** Everything in the Meridian model must be backed by trusted, industry-standard research. This file is the living record: we keep updating it whenever we add or change scoring logic, track rules, Build rubrics, or any other material behavior. Major multipliers require a **minimum of 5 high-grade, industry-professional papers and/or sites** per major. **5 is the hard floor** (we never go below 5); we will scale to 10 when Meridian grows (e.g. enterprise, institutional contracts, or compliance needs). See `docs/MAJOR_MULTIPLIERS_RESEARCH.md`.

---

## 1. What “Research” Means Here

- **Peer‑reviewed or reputable sources:** Journal articles (e.g. *International Journal of STEM Education*, *CBE—Life Sciences Education*, *Nature*, Springer, ACS, RSC), institutional/federal data (e.g. UC Berkeley OPA, NCES, NSF), and widely cited policy/education reports (e.g. Education Next, AEI, Georgetown CEW, NCTQ, Rojstaczer/gradeinflation.com).
- **Major multipliers:** Each major’s multiplier must be justified by **at least 5** such sources for now (scale to 10 when Meridian gets big). We do not assign or change a multiplier based on one or two articles alone.
- **No arbitrary rules:** Every scoring parameter is tied to cited research. This aligns with the **Meridian Truth Standard (MTS)**: no hallucination; only evidence present in the resume or in cited research affects scores.

---

## 2. Research Areas and How They Benefit the AI

### 2.1 Major Multipliers (Smart Score)

**Research used:**

- **STEM vs. non‑STEM grading:** Tomkin et al. / Witteveen & Attewell (2022), “STEM courses are harder: evaluating inter-course grading disparities with a calibrated GPA model.” Calibrated GPA shows STEM courses grade ~**0.4 grade points** more stringently than non‑STEM for similar students.
- **Grade level by field:** Rojstaczer / Hermanowicz & Woodring — humanities grade ~0.3 points higher than natural sciences; field “consensus” correlates with rigor.
- **GPA by major:** UC Berkeley OPA (GPA by major), College Transitions, NCES — institutional and national data on average GPA by discipline.
- **Difficulty and attrition:** MyDegreeGuide, College Transitions, BigEconomics — which majors are hardest (e.g. chemistry, math, physics) vs. easier (e.g. education, management).
- **Education grade inflation:** Education Next (“Want a 3.8 GPA? Major in Education”), AEI — education majors receive very high GPAs relative to entrance exam performance.
- **Nursing/health rigor:** BSN admissions standards, science prereq rigor, clinical demands.

**How it benefits the AI:**

- **Fairer Smart score:** The same GPA in Chemistry vs. Communication is not treated the same. Harder‑grading majors get a higher multiplier so a 3.5 in a STEM major is not undervalued. The AI is not “making up” rigor; it is applying published evidence on grading stringency.
- **Defensible to users and recruiters:** Every multiplier is justified by **≥5 high-grade sources** per major (see `docs/MAJOR_MULTIPLIERS_RESEARCH.md` §5; scale to 10 when Meridian scales). We do not set or change multipliers based on one or two articles; the AI can cite a body of research (e.g. “research shows STEM grades are ~0.4 points stricter”) instead of an opaque rule.
- **Prestige‑neutral:** Multipliers are based on grading rigor and GPA distributions, not institution prestige. A Chemistry major at a non‑elite school is still weighted by the same evidence as at an elite school.

---

### 2.2 Track Assignment (Pre‑Health and Pre‑Law Are Tracks, Not Majors)

**Correct model:**

- **Pre‑Health** and **Pre‑Law** are **career tracks** (intent: med school, dental, PA, OT, law school, etc.), not majors.
- A student can be **any major** and pre‑med or pre‑law (e.g. Computer Science + pre‑med). Assignment to Pre‑Health or Pre‑Law must come from **resume text** (e.g. “pre‑med,” “MCAT,” “pre‑law,” “LSAT”), not from major alone.

**Research / convention used:**

- Standard usage in U.S. higher ed: “pre‑med,” “pre‑health,” “pre‑law” describe pathways and intentions, not degree names. Health professions (MD, DO, dental, PA, OT, pharmacy, vet, etc.) are grouped under the pre‑health umbrella; law under pre‑law.

**How it benefits the AI:**

- **No false positives:** A Political Science major who never says “pre‑law” is not assigned Pre‑Law; they get the default track for their major (e.g. Humanities). The AI only assigns Pre‑Health or Pre‑Law when the candidate’s own words indicate that intent.
- **Captures real diversity:** Pre‑med Biology and pre‑med English are both scored on the Pre‑Health Build rubric (clinical, shadowing, BCPM, etc.) when the resume states pre‑health intent. The AI does not assume intent from major.
- **Clear logic for users:** “We assign Pre‑Health only when your resume mentions pre‑med, pre‑dental, shadowing, MCAT, etc.” is easy to explain and audit.

---

### 2.3 Default Tracks by Major (Where Majors “Belong”)

**Reorganization:**

- Majors that are often associated with pre‑health (e.g. Biochemistry, Nursing) are **academic disciplines**, not “Pre‑Health” as a major. Their **default** track (when the resume does **not** mention pre‑health or pre‑law) is the academic track that fits the major:
  - **Health‑ and life‑science majors** (Biochemistry, Allied Health, Nursing, Public Health, etc.) → default to **Science** (they are science majors).
  - **Liberal‑arts / social‑science majors** often associated with pre‑law (Political Science, History, Criminology, Philosophy, etc.) → default to **Humanities** (they are humanities/social‑science majors).

**How it benefits the AI:**

- **Pre‑Health** and **Pre‑Law** are assigned only when text says so. Otherwise, the AI uses a sensible **academic** default (Science or Humanities) so Build rubrics (e.g. Science: research, lab; Humanities: writing, analysis) match the major when intent is unspecified.

---

### 2.4 Pre‑Health Keyword Set (Umbrella Term)

**Research / convention:**

- Pre‑health is an umbrella for: pre‑med (MD/DO), pre‑dental, pre‑PA, pre‑OT, pre‑pharmacy, pre‑vet, pre‑physical therapy, etc. Resume text may say “pre‑med,” “pre‑dental,” “shadowing,” “MCAT,” “clinical,” etc.

**How it benefits the AI:**

- The AI detects **any** of these signals and assigns the Pre‑Health track so that the same Build rubric (clinical hours, shadowing, research, BCPM) applies regardless of which health profession the candidate names. One consistent rubric, many professions.

---

## 3. Summary Table

| Research area            | Sources (examples)                          | Benefit to the AI                                                                 |
|--------------------------|---------------------------------------------|------------------------------------------------------------------------------------|
| Major multipliers        | STEM grading studies, Berkeley GPA, NCES, Education Next, nursing/health rigor | Fairer, defensible Smart score; prestige‑neutral; no arbitrary numbers             |
| Pre‑Health / Pre‑Law     | Standard higher‑ed usage (tracks, not majors) | Correct assignment only when resume states intent; supports any major + pre‑health/pre‑law |
| Default track by major   | Academic discipline of each major            | Sensible Build rubric when intent not stated (Science vs. Humanities)              |
| Pre‑health keyword set   | Common pre‑health terms (pre‑med, pre‑dental, etc.) | One Pre‑Health rubric for all health professions                                  |

---

## 4. Where to Find the Details

- **Major multipliers (every value, 10+ sources per major):** `docs/MAJOR_MULTIPLIERS_RESEARCH.md`
- **Scoring formula and tier summary:** `SCORING_LOGIC.md` §5
- **Track assignment logic (text‑only Pre‑Health/Pre‑Law):** `dilly_core/auditor.py` (`get_track_from_major_and_text`)
- **Default track per major:** `dilly_core/tracks.py` (`MAJOR_TO_DEFAULT_TRACK`)

---

## 5. Ongoing Research Documentation (Policy)

Going forward, whenever we change or add anything material in the model, we update the research file(s) accordingly:

- **Scoring formula changes** (Smart, Grit, Build, composite weights): document in this file and/or `SCORING_LOGIC.md` with cited sources.
- **Track assignment rules:** document rationale and any conventions/sources (e.g. pre-health as umbrella term).
- **Build rubrics** (keywords, point values, bonuses): tie to industry or institutional standards where applicable (e.g. AAMC for Pre-Health).
- **Major multipliers:** never set or change based on one or two articles; maintain at least 5 high-grade sources per major in `docs/MAJOR_MULTIPLIERS_RESEARCH.md` (scale to 10 when Meridian gets big).
- **Recommendations:** When using the LLM, recommendations can be **generic** (advice), **line_edit** (rewrite a specific line for impact without lying), or **action** (concrete next steps to raise Smart/Grit/Build). Line edits must reflect only what the resume states, reframed more strongly; no invented metrics. See `SCORING_LOGIC.md` §8.

This keeps Meridian auditable and defensible: every behavior can be traced to credible, industry-standard research.

---

*Last updated: 2025-03-05. Research is used to make the AI fairer, more accurate, and auditable under the Meridian Truth Standard. Policy: ongoing updates + 5-source minimum per major multiplier (scale to 10 when Meridian gets big).*
