# Tech Hiring Guidelines — Documented Companies (Accuracy Tiers)

**Purpose:** Track which companies we have successfully captured hiring guidelines for, at what confidence level. Used for Meridian scoring (scores based on what top tech companies look for) and for in-app company-specific score comparison. **UTampa-only app:** Tech cohort = UTampa majors that map to Tech track.

**Accuracy definition:** ~90% = criteria are traceable to official or high-confidence published sources (career pages, OPM, validated company criteria in our codebase); we can defensibly say "Meridian scores align to this company's stated bar."

---

## Tier 1: Validated (~90%+ accuracy)

Criteria in our codebase or from official/regulatory sources; used for job matching and score comparison.

| Company / Source | Scope | Criteria source | Where in codebase |
|------------------|--------|------------------|---------------------|
| **Stripe** | Tech (SWE, design eng) | Stripe Engineering Blog, stripe.com/careers; validated in company_hiring_criteria | `company_hiring_criteria.json` (greenhouse, company_pattern: Stripe); `tech.json` companies |
| **Figma** | Tech (eng, design) | figma.com/careers, design community hiring insights; validated | `company_hiring_criteria.json` (greenhouse, Figma); `tech.json` |
| **USAJobs / Federal (OPM)** | All (federal roles) | OPM.gov, USA Staffing, agency hiring manuals | `company_hiring_criteria.json` (usajobs) |

---

## Tier 2: Documented from public sources (high confidence, not validated)

Sourced from FAANG/tech career pages, Levels.fyi, LinkedIn Job Market Insights, Glassdoor Interview Reports, engineering blogs. We use these for **rubric building** and **average-FAANG weights**; not yet "validated" in our pipeline. Confidence ~80–85% for rubric alignment.

| Company | Scope | Sources | Where in codebase |
|---------|--------|---------|---------------------|
| **Google / Alphabet** | Tech | rework.withgoogle.com (resume review guide), FAANG resume guides, recruiter surveys | `tech.json` companies |
| **Meta / Facebook** | Tech | metacareers.com job posts, internship criteria, "Move Fast" culture docs | `tech.json` |
| **Amazon / AWS** | Tech | 16 Leadership Principles (public), bar raiser process (public), career pages | `tech.json` |
| **Microsoft** | Tech | Careers, Explore program, growth mindset (public) | `tech.json` |
| **Apple** | Tech | Limited public criteria; craft/portfolio focus from career and recruiter reports | `tech.json` |
| **Netflix** | Tech | Culture memo, senior-focused hiring (public) | `tech.json` |

---

## Tier 3: Documented from industry research (rubric-only)

Used to define **per-major** rubrics (Data Science, CS, Cybersecurity, etc.). Not company-specific; aggregated from recruiter surveys, SHRM, Jobscan, data-science/cyber/actuarial hiring guides.

| Domain | Use | Sources |
|--------|-----|---------|
| Data Science / ML hiring | Data Science, Math+CS rubric | MirrorCV, KraftCV, Infinite Resume data scientist guides; 98% Python, SQL, business impact over model-only metrics |
| Cybersecurity hiring | Cybersecurity rubric | CyberDefenders, SOC analyst guides; certs (CompTIA, GIAC), SIEM/EDR, incident response metrics |
| Actuarial hiring | Actuarial Science rubric | SOA/CAS exam progress, Actuarial Ninja, Acturhire; exam passage as primary filter, Excel/VBA, R/Python, reserving/pricing |
| MIS / BIT hiring | BIT, MIS rubrics | BI tools (Tableau, Power BI), ERP, database, outcome-focused bullets; ATS + human recruiter research |
| SWE / general tech | Computer Science, Math rubric | SHRM, recruiter surveys (72% &lt;30s scan), quantifiable impact, GitHub, tech stack by category |

---

## How we use this

- **Meridian scores (canonical):** Based on **top tech company** hiring guidelines. Composite weights = **average FAANG** (from Tier 1 + Tier 2). Every point/bonus is traceable to a cited guideline (see per-major rubrics and SCORING_LOGIC).
- **In-app company comparison:** When a user views a **tech company** in the app, we show **that company’s** required/expected scores (from `company_hiring_criteria.json` or `tech.json` when we have `meridian_scores`). Users compare their Meridian score (scored with top companies in mind) to that firm’s bar. Firms may have lower or equal requirements depending on the company.
- **Adding a company at ~90%:** When we add a new company with high-confidence criteria (official or validated), add it to `company_hiring_criteria.json` with `meridian_scores` and optional `track: "tech"`; then add a row here in Tier 1 with source and codebase location.

---

## UTampa Tech majors (cohort)

All majors below map to **Tech** track in `dilly_core/tracks.py`. Per-major rubrics are in `TECH_RUBRICS_BY_MAJOR.md`.

- Data Science  
- Computer Science  
- Cybersecurity  
- Actuarial Science  
- Business Information Technology (BIT)  
- Management Information Systems (MIS)  
- Mathematics with Computer Science  
- Financial Enterprise Systems  

**Note:** **Mathematics** (plain) is **Science** track, not Tech. Math majors are scored with the Science Build rubric (research, publication, lab/coursework). Math+CS is Tech.
