# Knowledge File Refresh Schedule

Meridian's track knowledge files are periodically updated with fresh sourced data. This file documents what to update, when, and where to get it.

---

## Refresh Cadence

| Track | Recommended Cadence | Why |
|-------|-------------------|-----|
| Pre-Law | **Annually** (August, before cycle opens) | ABA 509 reports release each fall for the prior cycle. LSAT medians shift each year. |
| Pre-Health | **Annually** (May, after MSAR updates) | AAMC MSAR updates each spring with the latest cycle's data. |
| Tech | **Semi-annually** (January + July) | Tech hiring markets shift fast. Levels.fyi and LinkedIn data refresh constantly. |
| Business | **Annually** (September, before recruiting season) | Recruiting cycles follow the academic calendar. GPA floors and firm norms rarely change dramatically year-to-year. |

---

## Pre-Law Sources

| Source | URL | Data Available |
|--------|-----|----------------|
| ABA 509 Required Disclosures | https://www.abarequireddisclosures.org | LSAT/GPA medians, 25th/75th percentiles, acceptance rates by school |
| LSAC Official Guide | https://officialguide.lsac.org | School-by-school program profiles, scholarship data |
| Law School Transparency (LST) | https://www.lawschooltransparency.com | Outcome data: bar passage, employment, debt |
| 7Sage Admissions | https://7sage.com/top-law-schools | Applicant data, cycle analysis, school profiles |
| Spivey Consulting Blog | https://spiveyconsulting.com/blog | Admissions insider commentary, trend analysis |

**What to update in `pre_law.json`:**
- `median_lsat`, `median_gpa`, `p25_lsat`, `p75_lsat`, `p25_gpa`, `p75_gpa` for each school
- `acceptance_rate` (changes year to year based on application volume)
- `notes` for any policy changes (e.g., LSAT-Flex, optional essays, new programs)

---

## Pre-Health Sources

| Source | URL | Data Available |
|--------|-----|----------------|
| AAMC MSAR | https://students-residents.aamc.org/choosing-medical-school/how-apply-medical-school/msar | GPA/MCAT medians by school |
| AAMC Facts & Figures | https://www.aamc.org/data-reports/students-residents/data/facts | Applicant and matriculant aggregate data |
| ADEA AADSAS | https://www.adea.org | Dental school admissions data |
| AACOMAS | https://aacomas.aacom.org | Osteopathic school data |
| TMDSAS | https://www.tmdsas.com | Texas medical schools (separate system) |

**What to update in `pre_health.json`:**
- `median_mcat`, `median_gpa` for each school tier
- `minimums` for clinical hours (AAMC guidance evolves)
- `notes` for any major policy changes (e.g., COVID-era flexibilities ending)

---

## Tech Sources

| Source | URL | Data Available |
|--------|-----|----------------|
| Levels.fyi | https://www.levels.fyi | Compensation, hiring volume, leveling by company |
| LinkedIn Job Insights | https://www.linkedin.com/business/talent/blog | Hiring trend reports |
| Glassdoor | https://www.glassdoor.com | Interview difficulty, process descriptions |
| Blind (anonymous) | https://www.teamblind.com | Recruiter signal, interview feedback |
| Company Career Blogs | (per company) | Official hiring criteria, program announcements |

**What to update in `tech.json`:**
- Company `dimension_weights` if hiring culture shifts
- `entry_points` when companies change or add new programs
- `notes` for layoff cycles, hiring freezes, or major culture changes

---

## Business Sources

| Source | URL | Data Available |
|--------|-----|----------------|
| Vault Guides | https://www.vault.com | Firm rankings, culture ratings |
| Wall Street Prep | https://www.wallstreetprep.com/knowledge | Recruiting timelines, technical prep |
| Management Consulted | https://managementconsulted.com | MBB recruiting data, salary reports |
| Mergers & Inquisitions | https://www.mergersandinquisitions.com | IB recruiting timelines, bulge bracket vs boutique |
| Breaking Into Wall Street | https://breakingintowallstreet.com | Technical skill benchmarks |

**What to update in `business.json`:**
- `gpa_floor` per firm (changes when markets tighten or loosen)
- `notes` on firm-specific culture shifts or new programs
- `common_gaps` severity when market norms evolve (e.g., quant skills becoming required for consulting)

---

## Company Hiring Criteria (Jobs)

**File:** `company_hiring_criteria.json`

**Policy:** Meridian only lists jobs from companies we have verified, high-confidence hiring criteria for. Add a company only when we can cite sources and apply their guidelines to students.

**To add a company:**
1. Research their public hiring criteria (career page, engineering blog, partner validation).
2. Add a rule: `source`, `company_pattern`, `confidence`, `criteria_source`, `criteria_for_llm`.
3. Add their Greenhouse board token to `scripts/job_scraper/config.py` (if Greenhouse).
4. Run the job scraper to fetch their jobs.

**Sources:** Company career pages, engineering blogs, partner-validated criteria. Never infer without a citeable source.

---

## How to Update

1. Visit the sources listed above for the relevant track.
2. Update the `last_updated` field with the new date (`"YYYY-MM"`).
3. Update the relevant fields (medians, notes, priorities).
4. Add a note under `notes` in the school/firm entry if a significant policy changed.
5. Commit with a message like `knowledge: update pre_law.json for 2026-2027 cycle`.

---

## Idea (Future): Automated Refresh

A script that:
- Scrapes ABA 509 and AAMC MSAR for updated medians
- Diffs against current JSON values
- Opens a PR or flags for human review

This would turn the manual process into a quarterly automated check.

---

## Idea (Future): Human Expert Review

Have an admissions advisor, law school counselor, or recruiter review and annotate these files. Their corrections become the highest-confidence source of truth and override all other sources.
