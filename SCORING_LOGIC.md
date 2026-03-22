# Meridian Scoring Logic (Ground Truth V6.5)

Canonical source: `dilly_core/scoring.py`, `dilly_core/tracks.py`, `dilly_core/auditor.py`.

**Product requirement:** Scores must be based on **real hiring guidelines from companies in the student's respective cohort.** See `projects/meridian/docs/COHORT_EMPLOYER_SCORING_REQUIREMENT.md` for the requirement, current gap, and implementation path. This doc describes the current formulas; the target is to tie them explicitly to cohort employer criteria.

---


## 1. Track assignment

**From:** `get_track_from_major_and_text(major, raw_text)` in `dilly_core/auditor.py`.  
**Registry:** `dilly_core/tracks.py` (`ALL_TRACKS`, `MAJOR_TO_DEFAULT_TRACK`, `get_default_track_for_major`).  
**Scope:** University of Tampa catalog; concentrations resolve to base major (e.g. Biology–Pre-Professional → Biology).

**Pre-Health and Pre-Law are tracks (intent), not majors.** They are assigned **only when the resume text** mentions that intent (e.g. pre-med, MCAT, shadowing, pre-law, LSAT). Any major can be pre-health or pre-law.

**Order:** Explicit "track: X" in text > **Pre-Health (text only)** > **Pre-Law (text only)** > **default for major** > Humanities (fallback for unknown majors).

| Track | When assigned |
|-------|----------------|
| **Pre-Health** | **Text only:** pre-med, pre-dental, pre-pa, pre-ot, pre-pharmacy, pre-vet, MCAT, shadowing, clinical, pre-health, etc. (umbrella for health professions). |
| **Pre-Law** | **Text only:** pre-law, law school, LSAT, moot court, mock trial, paralegal, juris, etc. |
| **Tech** | Default for: Data Science, Computer Science, Cybersecurity, Actuarial Science, BIT, MIS, Mathematics with Computer Science, Financial Enterprise Systems. |
| **Science** | Default for: Biochemistry, Allied Health, Biomedical Sciences, Nursing, Public Health, Health Science, Human Performance, Biology, Chemistry, **Mathematics**, Physics, Marine Science, Marine Biology, Marine Chemistry, Environmental Science, Environmental Studies, Forensic Science, Psychology. |
| **Business** | Default for: Finance, Economics, Accounting, Marketing, International Business, Management, Business Management, Entrepreneurship, Sport Management. |
| **Communications** | Default for: Communication, Communication and Media Studies, Communication and Speech Studies, Advertising and Public Relations, Journalism. |
| **Education** | Default for: Secondary Education, Elementary Education, Music Education, Professional Education. |
| **Arts** | Default for: Art Therapy, Art, Animation, Design, Graphic Design, Film and Media Arts, New Media, Dance, Music, Music Performance, Musical Theatre, Theatre, Visual Arts, Museum Studies. |
| **Humanities** | Default for: Political Science, Criminology, Criminology and Criminal Justice, History, International Studies, History & International Studies, Philosophy, Law Justice and Advocacy, English, Writing, Liberal Studies, Sociology, Spanish, Applied Linguistics. |
| *(no fallback track)* | Unknown or unlisted majors fall back to Humanities. |

---

## 2. Smart score (0–100)

**Formula:** `(GPA × 15 × major_multiplier) + honors_pts + research_pts + minor_pts`  
**Capped:** 0–100.

| Component | Rule |
|-----------|------|
| **Base** | `GPA × 15 × major_multiplier`. If no GPA in text, default 3.5. |
| **Major multiplier** | See table in §5. Unknown = 1.00. |
| **Pre-Health BCPM** | If track is Pre-Health and BCPM (science GPA) is present: `effective_gpa = (GPA × 0.4) + (BCPM × 1.5 × 0.6)`, then base = effective_gpa × 15 × mult. |
| **Honors** | Tiered: Latin (summa, magna, cum laude) = 15 pts each; Dean's list = 8 pts; Scholarship/honors = 5 pts. Cap total at 30. Fallback: `honors_count × 10` when weighted sum not available. |
| **Research** | +25 if any of: research, publication, laboratory, bench, sequencing, wet-lab, pi, principal investigator. |
| **Minor(s)** | Bonus only when minor is in the research-backed table (`MINOR_BONUS_PTS`); see `docs/MINOR_BONUS_RESEARCH.md`. Every University of Tampa minor (Catalog 2025–2026) is included with a cited tier. **Unlisted minor = +0**. Multiple minors: highest bonus used. |

---

## 3. Grit score (0–100)

**Formula:** `(impact_weighted_sum × 15) + (leadership_weighted_sum × 12) + (work_entry_count × 5)`  
**Capped:** 0–100.

| Component | Rule |
|-----------|------|
| **Quantifiable impact** | Magnitude-weighted: 1–9% = 0.5×, 10–24% = 1.0×, 25–49% = 1.5×, 50–99% = 2.0×, 100%+ = 2.5×. $ amounts = 1.0×. "Doubled", "tripled", "2x" = 100%+. Sum of weights × 15. |
| **Leadership** | Tiered: Founder/founded = 2.0×, Executive (president, vp, director, chair) = 1.5×, Lead (lead, manager, captain) = 1.0×, Representative = 0.5×. Sum of weights × 12. |
| **Work entry count** | Count of month–year matches: `(Jan|Feb|…|Dec)\s+\d{4}`. Each count × 5. |
| **International (Global Grit)** | If international markers (F-1, OPT/CPT, study abroad, etc.): Grit × 1.10, cap 100. |

---

## 4. Build score (0–100, track-specific)

**Humanities** (also used as fallback for unknown majors):

- `build_raw = (tech_stack hits × 8) + (projects × 7)`.
- Tech stack keywords: python, sql, javascript, aws, docker, excel, tableau, react, git, machine learning, pandas, seaborn, r, java, typescript.
- Projects: regex count of Project|Built|Developed|Created|Deployed.
- +10% if `commit_velocity_per_week ≥ 3`; +20% if `research_semesters ≥ 1` (or note if has_research but research_semesters == 0).
- Capped 0–100.

**Pre-Health** (`audit_pre_health`):

- `build_raw = (clinical keyword hits × 12) + (25 if has_research else 0)`.
- Clinical keywords: clinical, shadowing, emt, patient, hospital, scribing, volunteer, medical, surgery, direct patient.
- +25% if longitudinal clinical ≥ 1 year; +20% if research longevity ≥ 2 years.
- Elite note: GPA ≥ 3.8.
- Capped 0–100.

**Pre-Law** (`audit_pre_law`):

- `build_raw = sum(12 per legal keyword)`. Legal: debate, legal, advocacy, court, internship, writing, justice, political, international, moot court, mock trial, paralegal.
- +20% if outcome_leadership_count > 0.
- Capped 0–100.

**Tech (per-major rubrics, outcome-tied):** Tech scoring is being refactored to use **per-major** rubrics (Data Science, Computer Science, Cybersecurity, Mathematics, Actuarial Science, BIT, MIS, Mathematics with Computer Science, Financial Enterprise Systems). Definitions stay: Smart = Technical Depth, Grit = Shipping & Ownership, Build = Technical Portfolio. **Skills and tech only count when tied to an outcome** (project or role bullet with measurable result); otherwise we do not award points and recommend "Tie [skill] to an outcome." See:
- `projects/meridian/knowledge/TECH_RUBRICS_BY_MAJOR.md` — what counts per major, with citations.
- `projects/meridian/knowledge/TECH_SCORING_EXTRACTION_AND_RECOMMENDATIONS.md` — extraction rules (deployed app, hackathon, recognized employer, certs, actuarial exams, etc.) and tie-to-outcome recommendation.
- `projects/meridian/knowledge/TECH_HIRING_GUIDELINES_ACCURACY.md` — companies documented at ~90% accuracy for rubric and in-app company comparison.

---

## 5. Major multipliers (Smart base)

**Canonical reference:** `docs/MAJOR_MULTIPLIERS_RESEARCH.md` — every multiplier is justified with cited research (STEM vs non-STEM grading gap, Berkeley GPA by major, difficulty/attrition studies, education grade inflation, etc.). One multiplier per University of Tampa catalog major; Unknown = 1.00.

**Tiers (summary):**

| Tier | Range | Rationale |
|------|--------|-----------|
| Hardest STEM (grading rigor) | 1.32–1.40 | Chemistry, Physics, Biochemistry, Mathematics — calibrated GPA studies show ~0.4 pt lower grades in STEM. |
| Hard STEM/quant | 1.22–1.30 | Data Science, Computer Science, Actuarial, Cybersecurity, Marine Chemistry, etc. |
| Moderate STEM / health / quant | 1.12–1.18 | Biology, Nursing, Environmental Science, Finance, Economics, BIT/MIS, etc. |
| Slightly above baseline | 1.05–1.12 | Accounting, Public Health, Allied Health, Biomedical Sciences, Human Performance, Art Therapy, Environmental Studies. |
| Baseline | 1.00 | Pre-Law majors, English, Writing, Sociology, Spanish, Applied Linguistics, Psychology, Entrepreneurship, Sport Management, Unknown. |
| Softer grading typical | 0.92–0.94 | Education, Arts, Marketing, International Business, Advertising/PR, Journalism. |
| Highest grade inflation | 0.86 | Management, Business Management, Communication (and variants). |

Full major-by-major table and citations: see `docs/MAJOR_MULTIPLIERS_RESEARCH.md`.

---

## 6. Final score (composite)

- **Default (all tracks except Pre-Law):** `0.30×Smart + 0.45×Grit + 0.25×Build`, rounded to 2 decimals.
- **Pre-Law:** `0.45×Smart + 0.35×Grit + 0.20×Build`, rounded to 2 decimals.

### 6.1 Tech track: average FAANG weights (canonical Meridian score)

Meridian scores for **Tech** are based on **top tech company** hiring guidelines. The **canonical** composite weight for Tech is the **average of FAANG** dimension weights (from `projects/meridian/knowledge/tech.json`):

| Company | Smart | Grit | Build |
|---------|-------|------|-------|
| Google | 0.40 | 0.35 | 0.25 |
| Meta | 0.35 | 0.40 | 0.25 |
| Amazon | 0.30 | 0.45 | 0.25 |
| Apple | 0.40 | 0.30 | 0.30 |
| Microsoft | 0.35 | 0.35 | 0.30 |
| **Average** | **0.36** | **0.37** | **0.27** |

So for **Tech**, final score = `0.36×Smart + 0.37×Grit + 0.27×Build` (rounded to 2 decimals). This is the single "Meridian score" shown to the user (scored with top companies in mind).

**Company-specific comparison in the app:** When a user views a **tech company** (e.g. in job matching or company detail), the app shows **that company’s** required or expected scores (from `company_hiring_criteria.json` or `tech.json` when we have `meridian_scores`). Users compare their **canonical** Meridian score (and optionally per-pillar Smart/Grit/Build) to that firm’s bar. Those firms may have **lower** or **equal** requirements depending on the company; the canonical score is calibrated to top tech, so other firms may list lower minimums.

**Traceability:** tech.json companies; TECH_HIRING_GUIDELINES_ACCURACY.md; TECH_RUBRICS_BY_MAJOR.md.

---

## 7. Signal extraction (from raw text)

Implemented in `extract_scoring_signals()` in `dilly_core/scoring.py`: GPA (regex), BCPM (regex), honors (keyword count), has_research (keyword), quantifiable_impact (regex `\d+%`/`$\d+`), leadership_density (keywords), work_entry_count (month YYYY regex), international_markers, longitudinal_clinical_years, outcome_leadership_count, research_longevity_years. No hallucination: only detected values; defaults (e.g. GPA 3.5) when missing.

---

## 8. Recommendations (personalized, high-impact)

When the LLM is used (`MERIDIAN_USE_LLM=1`), recommendations are **personalized** and can be one of three types (MTS: no invented facts; line edits must reflect what the candidate actually did, stated more strongly):

| Type | Purpose | Fields |
|------|--------|--------|
| **generic** | Short advice when no specific line or single action fits | `title`, `action` |
| **line_edit** | Rewrite a specific resume line for more impact (same facts) | `title`, `current_line`, `suggested_line`, `action` (reason) |
| **action** | Concrete next steps to raise a score (projects, hours, roles) | `title`, `action`, `score_target` (Smart/Grit/Build) |

- **Generic:** e.g. "To raise Build, add clinical or shadowing with Month YYYY so the scorer counts it."
- **Line edit:** Quote exact phrase in `current_line`, give `suggested_line` (same facts, stronger framing); `action` explains why (e.g. "More professional; signals quantifiable impact.").
- **Action:** e.g. "Get 50+ shadowing hours and add 'Physician shadowing, Dr. X, Jan 2025 – Present' to boost Build." Optional `score_target` tells the user which score this helps.

Fallback when LLM is off: benchmark-based generic recommendations per track (see `projects/meridian/api/benchmarks.json`). Schema: `projects/meridian/api/schemas.py` (`AuditRecommendation`); prompt: `dilly_core/llm_auditor.py`. **Training from every resume:** (1) Static few-shot examples in `training_data.json` include `recommendations` on multiple examples (e.g. Kate, Bridget, Deng, Aidan, Matthew, Michael, Gabriel, Shreya) so whichever 3–4 are chosen by track, the model sees the format. (2) Every new audit with the LLM is appended via `dilly_core/training_append.py` including that audit\u2019s recommendations, so the training set grows with personalized recs from every audited resume.
