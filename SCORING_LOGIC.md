# Meridian Scoring Logic (Ground Truth V6.5)

Canonical source: `meridian_core/scoring.py`, `meridian_core/tracks.py`, `meridian_core/auditor.py`.

---

## 1. Track assignment

**From:** `get_track_from_major_and_text(major, raw_text)` in `meridian_core/auditor.py`.

- **Pre-Health:** Major contains biology, biochemistry, chemistry, health, nursing, psychology, biomedical, allied; **or** (when major is Unknown) text contains pre-med, medical, clinical, shadowing, osteopathic, LECOM, BS/DO, MCAT, patient care, EMT, scribe, medical assistant, hospital, physician, AMAT, AMSA.
- **Pre-Law:** Major contains political science, criminology, philosophy, history, international studies, law; **or** text contains pre-law, paralegal, legal, moot court, mock trial, juris.
- **Builder:** Otherwise (tech/quant/business).

---

## 2. Smart score (0–100)

**Formula:** `(GPA × 15 × major_multiplier) + honors_pts + research_pts`  
**Capped:** 0–100.

| Component | Rule |
|-----------|------|
| **Base** | `GPA × 15 × major_multiplier`. If no GPA in text, default 3.5. |
| **Major multiplier** | See table in §5. Unknown = 1.00. |
| **Pre-Health BCPM** | If track is Pre-Health and BCPM (science GPA) is present: `effective_gpa = (GPA × 0.4) + (BCPM × 1.5 × 0.6)`, then base = effective_gpa × 15 × mult. |
| **Honors** | `honors_pts = min(30, honors_count × 10)`. Honors keywords: dean's list, scholarship, honors, cum laude, magna, summa. |
| **Research** | +25 if any of: research, publication, laboratory, bench, sequencing, wet-lab, pi, principal investigator. |

---

## 3. Grit score (0–100)

**Formula:** `(quantifiable_impact × 15) + (leadership_density × 12) + (work_entry_count × 5)`  
**Capped:** 0–100.

| Component | Rule |
|-----------|------|
| **Quantifiable impact** | Count of `\d+%` or `$\d+` in text (after normalizing spaces). Each count × 15. |
| **Leadership density** | Count of keywords: president, founder, executive, director, chair, lead, vp, vice president, manager, representative, captain. Each count × 12. |
| **Work entry count** | Count of month–year matches: `(Jan|Feb|…|Dec)\s+\d{4}`. Each count × 5. |
| **International (Global Grit)** | If international markers (F-1, OPT/CPT, study abroad, etc.): Grit × 1.10, cap 100. |

---

## 4. Build score (0–100, track-specific)

**Builder** (`audit_builder`):

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

---

## 5. Major multipliers (Smart base)

| Major | Multiplier |
|-------|------------|
| Biochemistry | 1.40 |
| Data Science, Computer Science, Physics | 1.30 |
| Mathematics, Cybersecurity | 1.25 |
| Biology, Allied Health, Biomedical Sciences, Nursing, Chemistry | 1.15 |
| Finance, Economics | 1.10 |
| Accounting | 1.05 |
| History, International Studies, Psychology, Criminology, Political Science, Unknown | 1.00 |
| Marketing, International Business | 0.90 |
| Management, Communication | 0.85 |

---

## 6. Final score (composite)

- **Default (Pre-Health, Builder):** `0.30×Smart + 0.45×Grit + 0.25×Build`, rounded to 2 decimals.
- **Pre-Law:** `0.45×Smart + 0.35×Grit + 0.20×Build`, rounded to 2 decimals.

---

## 7. Signal extraction (from raw text)

Implemented in `extract_scoring_signals()` in `meridian_core/scoring.py`: GPA (regex), BCPM (regex), honors (keyword count), has_research (keyword), quantifiable_impact (regex `\d+%`/`$\d+`), leadership_density (keywords), work_entry_count (month YYYY regex), international_markers, longitudinal_clinical_years, outcome_leadership_count, research_longevity_years. No hallucination: only detected values; defaults (e.g. GPA 3.5) when missing.
