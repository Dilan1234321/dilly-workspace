# Tech Rubrics by Major (UTampa Tech Cohort)

**Definitions (unchanged):** Smart = **Technical Depth**, Grit = **Shipping and Ownership**, Build = **Technical Portfolio**. Only what goes into each dimension varies by major. Every point or bonus in scoring must be traceable to a cited guideline below or in `tech.json` / `company_hiring_criteria.json`.

**Rule:** Skills and tech only count when **tied to an outcome** (project, role, or measurable result). If a skill appears without outcome, we do not award points and we recommend: "Tie this skill to an outcome (e.g. project or role bullet with metric)."

**Sources:** tech.json, company_hiring_criteria.json, TECH_HIRING_GUIDELINES_ACCURACY.md, SHRM/recruiter research, major-specific hiring guides (see citations per major).

---

## Data Science

**Focus:** Data analysis, ML/AI, business impact. Employers prioritize business outcomes over model metrics alone; SQL and Python dominance; end-to-end projects with problem → approach → results → impact.

### Smart (Technical Depth)
- **GPA in technical major** (3.5+ for top companies) — tech.json, recruiter surveys.
- **Relevant coursework:** statistics, ML, data structures, databases, data viz. — Data scientist resume guides (MirrorCV, KraftCV 2026); 98% Python, SQL in listings.
- **Technical certifications:** AWS, GCP, TensorFlow, Databricks, Snowflake — tech.json; data science guides.
- **Research signal** (publication, lab, PI) — tech.json; academic rigor for data science roles.
- **Minor in Math, CS, Statistics, Economics** — MINOR_BONUS_PTS (research-backed); strengthens quant depth.

*Traceability:* Base from GPA × major multiplier (MAJOR_MULTIPLIERS); honors/research/minor from scoring.py; coursework from parser + outcome-tied skills.

### Grit (Shipping and Ownership)
- **Quantified impact** from internships/jobs: revenue, cost savings, accuracy, latency, % improvement — SHRM; "98% of hiring managers value quantified achievements"; data science guides: "lead with business problem, end with business result."
- **Leadership / ownership** in data projects: led analysis, drove adoption, presented to stakeholders — rubric_builder; tech.json.
- **Work/experience entry density** (month–year roles) — recruiter screening research.
- **Outcome-tied skills only:** e.g. "Used Python/SQL to reduce churn 18%, saving $2.4M" counts; "Skills: Python, SQL" with no outcome does not (recommend tying to outcome).

*Traceability:* quantifiable_impact_count, leadership_density, work_entry_count from scoring.py; outcome-tie enforced in Build/Smart skill logic.

### Build (Technical Portfolio)
- **Projects with end-to-end flow:** problem → approach → implementation → results → business impact — Data scientist guides (MirrorCV, Infinite Resume); avoid Kaggle-only without production/messy data.
- **Tech stack only when tied to outcome:** Python, SQL, pandas, scikit-learn, TensorFlow/PyTorch, Tableau/Power BI, AWS SageMaker, etc., in project or role bullets with metrics — 98% Python, 94% SQL (data science guides).
- **GitHub/portfolio** with READMEs and clear tech + outcome — 54% recruiters consider GitHub important (tech recruiter surveys).
- **Research contributions** (papers, datasets, models) — tech.json.
- **Deployed or real-data work** (not only cleaned toy datasets) — data science guides: "real data, production pipeline."

*Traceability:* From tracks.py audit_tech + new extraction rules (deployed app, hackathon, OSS); outcome-tie required for skill points.

---

## Computer Science

**Focus:** SWE, programming, systems, algorithms. FAANG-style bar: technical depth, quantifiable impact, GitHub, clean formatting, problem-solving.

### Smart (Technical Depth)
- **GPA in CS or equivalent** (3.5+ for top companies) — tech.json; Google rework.withgoogle.com resume guide.
- **Relevant coursework:** data structures, algorithms, systems, databases, OS, computer architecture — tech.json; FAANG resume guides.
- **Technical certifications:** AWS, GCP, Azure — tech.json.
- **Research signal** — tech.json; Google values diverse backgrounds + demonstrated coding ability.
- **Minor in Math, CS, etc.** — MINOR_BONUS_PTS.

*Traceability:* Same as Data Science; major multiplier from MAJOR_MULTIPLIERS (CS 1.30).

### Grit (Shipping and Ownership)
- **Quantified impact** in internships/jobs: latency, users, revenue, scalability — Google resume guide (quantifiable impact); recruiter surveys (72% <30s scan, look for impact).
- **Technical leadership:** tech lead, team lead, ownership — tech.json; Amazon Leadership Principles.
- **Work entry density** — recruiter research.
- **Hackathon wins / placements** — tech.json; Google "hackathons, coding competitions count as demonstrated coding ability."
- **Open source with measurable scope** — tech.json.
- **Outcome-tied skills only** — same rule as Data Science.

*Traceability:* Same extraction as global Grit; add hackathon, OSS from new extraction rules.

### Build (Technical Portfolio)
- **GitHub portfolio** with active repos, READMEs — tech.json; 54% recruiters value GitHub (surveys).
- **Deployed applications** (web, mobile, API) with live links — tech.json; Stripe/Figma validated criteria.
- **Internship at recognized tech company** — tech.json; common_gaps.
- **Projects with tech stack + outcome** — only count languages/tools when tied to project or role bullet with metric.
- **Competitive programming** (Codeforces, LeetCode, ICPC) — tech.json; Jane Street/Citadel/Two Sigma.
- **Technical blog/writing** — tech.json; Stripe values writing.

*Traceability:* audit_tech; new extraction: deployed_app_link, hackathon_mention, recognized_tech_employer, competitive_programming.

---

## Cybersecurity

**Focus:** SOC, incident response, certs, hands-on tools (SIEM, EDR), scripting, quantifiable security outcomes.

### Smart (Technical Depth)
- **GPA in Cybersecurity or related** — same multiplier logic; Cybersecurity 1.28 in MAJOR_MULTIPLIERS.
- **Relevant coursework:** security, networks, systems, scripting — SOC analyst guides (CyberDefenders, CVCraft).
- **Certifications:** CompTIA Security+, CySA+, GIAC (GSEC), CSA (EC-Council), Splunk — "certifications critical for entry-level" (SOC analyst guides).
- **Minor in CS, Math, Criminal Investigation** — MINOR_BONUS_PTS.

*Traceability:* GPA + mult; certs from new extraction (certification list); coursework from parser.

### Grit (Shipping and Ownership)
- **Quantified security impact:** alerts triaged, incidents investigated, MTTR, false positive reduction % — SOC analyst guides (metrics).
- **Leadership / ownership** in security projects or teams — rubric_builder.
- **Work entry density** — same as other majors.
- **Outcome-tied tools only:** e.g. "Used Splunk to reduce MTTR by 30%" counts; "Skills: Splunk" alone does not.

*Traceability:* Same Grit signals; security-specific metrics from extraction (e.g. alerts, MTTR in bullets).

### Build (Technical Portfolio)
- **Hands-on lab / practical experience:** TryHackMe, LetsDefend, CTFs — SOC analyst guides.
- **SIEM/EDR/analysis tools tied to outcome** — Splunk, Sentinel, Wireshark, etc. in bullets with results.
- **Scripting (Python, Bash) in security context with outcome** — SOC guides.
- **Incident response / threat intel** with measurable scope — MITRE ATT&CK, procedures.
- **GitHub or writeups** for security projects — tech.json style portfolio.

*Traceability:* audit_tech extended for cybersecurity keywords + outcome-tie; new extraction for certs, lab platforms.

---

## Mathematics (Science track — not Tech)

**Mathematics** (plain) is assigned to **Science** track in `dilly_core/tracks.py`, not Tech. Math majors are scored with the **Science** Build rubric (research, publication, lab/coursework).

What math majors typically have (for grad school, teaching, or industry):
- **Proof-based coursework:** real analysis, abstract algebra, topology, number theory, differential equations.
- **Research:** REU, thesis, publication, problem-solving projects.
- **Teaching:** TA, tutor, grading, mentoring.
- **Competitions:** Putnam, AMC, AIME, math contests.
- **Quantitative work in context:** MATLAB, Python, LaTeX when tied to coursework or research outcomes.

The **Mathematics with Computer Science** major remains in **Tech** and uses the CS-style Build rubric (programming, deployed apps, GitHub, competitive programming).

---

## Actuarial Science

**Focus:** Exam progress (SOA/CAS), Excel/VBA, R/Python/SQL, reserving/pricing/risk, quantifiable actuarial outcomes.

### Smart (Technical Depth)
- **GPA** — MAJOR_MULTIPLIERS 1.30.
- **Exam progress:** SOA/CAS exams passed (list officially: e.g. "SOA Exam P") — "primary filter" (Actuarial Ninja, Acturhire); 2–3 exams before graduation ideal.
- **Relevant coursework:** probability, statistics, actuarial science — exam-aligned.
- **Minor in Math, Statistics, Economics** — MINOR_BONUS_PTS.

*Traceability:* GPA + mult; exam extraction (new): SOA Exam P/FM, CAS, etc.

### Grit (Shipping and Ownership)
- **Quantified impact** in internships: reserve sizes, policies analyzed, % improvements — Actuarial resume guides.
- **Domain experience:** pricing, reserving, experience studies, regulatory reporting — SOA/CAS focus.
- **Leadership / teamwork** — actuarial work is collaborative; stakeholder communication.
- **Outcome-tied skills:** Excel, VBA, R, Python, SQL in project/role with metrics — "tie exam knowledge to real-world applications" (Actuarial Ninja).

*Traceability:* Grit signals + actuarial_exams_passed (new); domain keywords in bullets.

### Build (Technical Portfolio)
- **Internship or project in actuarial/insurance context** with outcomes — Acturhire.
- **Data analysis + presentation** (extract, analyze, present to actuaries/stakeholders) — actuarial guides.
- **Exams and certifications section** — listed clearly for ATS and recruiters.

*Traceability:* audit_tech adapted for actuarial keywords; exam/cert extraction.

---

## Business Information Technology (BIT)

**Focus:** Bridge of business and tech; BI tools, databases, ERP, cloud; outcome-focused bullets; stakeholder impact.

### Smart (Technical Depth)
- **GPA in BIT** — MAJOR_MULTIPLIERS (e.g. 1.22 for BIT).
- **Relevant coursework:** databases, systems, business analytics, ERP — MIS/BIT hiring guides (CVowl, recruiter research).
- **Certifications:** cloud (AWS, Azure), data/BI — industry research.
- **Minor in Business Analytics, MIS** — MINOR_BONUS_PTS where applicable.

*Traceability:* Same as other majors.

### Grit (Shipping and Ownership)
- **Quantified impact:** e.g. "increased data retrieval speed 30%," "reduced report generation time 25%" — MIS/BIT guides; "show measurable impact."
- **Leadership, cross-functional work** — BI/ERP roles value stakeholder communication.
- **Work entry density** — same.
- **Outcome-tied skills only:** SQL, Tableau, Power BI, SAP in bullets with results — "avoid skill lists; show context" (recruiter research).

*Traceability:* Same Grit; BIT keywords in Build.

### Build (Technical Portfolio)
- **Database / BI projects** with tech stack + outcome — SQL, Tableau, Power BI, SAP BI.
- **ETL, data warehousing, system integration** with metrics — MIS/BIT guides.
- **Internship or role** using ERP, cloud, or BI tools with measurable impact.

*Traceability:* audit_business + BIT-specific list; outcome-tie required.

---

## Management Information Systems (MIS)

**Focus:** Similar to BIT; BI tools, ERP, databases, Excel; business outcomes; ATS + human recruiter priorities.

### Smart (Technical Depth)
- Same structure as BIT — MAJOR_MULTIPLIERS 1.22 for MIS.
- Coursework: MIS, databases, analytics, ERP.
- Certifications: cloud, BI, data privacy (GDPR, HIPAA) where relevant — MIS officer skills (CVowl).

*Traceability:* Same.

### Grit (Shipping and Ownership)
- Quantified impact in system/reporting/analytics roles — "reduced report generation time," "supporting strategic decision-making" with numbers.
- Leadership, stakeholder management — MIS roles are cross-functional.
- Outcome-tied skills only — same rule.

*Traceability:* Same as BIT.

### Build (Technical Portfolio)
- BI/ERP/database projects with outcomes — Tableau, Power BI, SAP, Oracle, Excel advanced.
- Data warehousing, ETL, system integration with metrics.
- Internship or work in MIS/analytics context.

*Traceability:* Same as BIT; can share rubric with BIT with minor wording differences.

---

## Mathematics with Computer Science

**Focus:** Blend of Math and CS; algorithms, systems, ML; same as CS for Build/Grit emphasis, with stronger math coursework for Smart.

### Smart (Technical Depth)
- GPA — MAJOR_MULTIPLIERS 1.30 (Mathematics with Computer Science).
- Coursework: math (probability, linear algebra, numerical methods) + CS (data structures, algorithms, systems, ML) — tech.json; Math+CS double focus.
- Research, certifications — same as CS.
- Minor bonus — Math & CS minor 10 pts (MINOR_BONUS_PTS).

*Traceability:* Same as CS + math coursework.

### Grit (Shipping and Ownership)
- Same as Computer Science — quantified impact, leadership, hackathons, OSS, outcome-tied skills.

### Build (Technical Portfolio)
- Same as Computer Science — GitHub, deployed apps, internships, competitive programming, technical writing.
- Math+CS projects (e.g. ML, numerical methods, systems) with outcome.

*Traceability:* Same as audit_tech; major-specific keyword boost for math+CS terms when tied to outcome.

---

## Financial Enterprise Systems

**Focus:** Finance + systems/tech; financial systems, data, reporting; blend of finance and BIT/MIS signals.

### Smart (Technical Depth)
- GPA — MAJOR_MULTIPLIERS 1.18 (Financial Enterprise Systems).
- Coursework: finance, systems, data, accounting — finance + tech.
- Certifications: finance or tech (CFA, AWS, etc.) where relevant.
- Minor in Finance, Economics, BIT — MINOR_BONUS_PTS.

*Traceability:* Same as other majors.

### Grit (Shipping and Ownership)
- Quantified impact in finance or systems roles — revenue, efficiency, accuracy.
- Leadership, cross-functional — finance tech roles.
- Outcome-tied skills only — SQL, Excel, Tableau, financial systems in bullets with results.

*Traceability:* Same Grit.

### Build (Technical Portfolio)
- Financial systems, reporting, or data projects with tech + outcome — finance + BIT-style.
- Internship or role in financial services or fintech with measurable impact.

*Traceability:* Blend of audit_finance and audit_tech; outcome-tie required.

---

## Cross-cutting rules (all Tech majors)

1. **Outcome-tie:** A skill or tool counts only when it appears in a project or role bullet with a measurable outcome (%, $, time, users, etc.). Otherwise: no points; recommend "Tie this skill to an outcome."
2. **Traceability:** Every point or bonus in the scoring engine must map to a cited guideline in this doc, tech.json, or company_hiring_criteria.json.
3. **Composite weights (canonical):** Average FAANG (see SCORING_LOGIC or cohort_criteria) for the single Meridian score; company-specific bars shown in-app from company_hiring_criteria / tech.json.
4. **Extraction rules:** See TECH_SCORING_EXTRACTION_AND_RECOMMENDATIONS.md for new signals (deployed app, hackathon, certs, exams, recognized employer, etc.) and "tie to outcome" recommendation logic.
