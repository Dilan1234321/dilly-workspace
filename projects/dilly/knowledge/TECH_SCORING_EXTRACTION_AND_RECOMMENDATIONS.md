# Tech Scoring: Extraction Rules and "Tie to Outcome" Recommendation

**Purpose:** (1) Define extraction rules for new signals used in Tech (and per-major) scoring. (2) Define the rule that **skills and tech only count when tied to an outcome**; when not tied, do not award points and surface a recommendation. Every point or bonus remains traceable to a cited guideline (see TECH_RUBRICS_BY_MAJOR.md and tech.json).

**Differentiation:** ATS scores the resume against ATS systems (formatting, keywords). Meridian scores score the resume against **what companies actually look for** (academics, skills in context, leadership, impact, portfolio). So we require outcome-tied evidence for skills.

---

## 1. Outcome-tie rule

- **Definition:** A **skill** or **technology** (language, framework, tool, cert) counts toward Smart or Build **only if** it appears in a **project or role bullet** that also contains a **measurable outcome** (%, $, time, count of users, latency, accuracy, etc.).
- **If a skill appears only in a "Skills" section or in a bullet with no metric:**  
  - Do **not** award points for that skill in the scoring formula.  
  - Add a **recommendation** (e.g. to the audit's `recommendations` list):  
    *"Tie [skill/tool name] to an outcome: add a project or role bullet that uses this skill and includes a measurable result (e.g. %, $, time saved, users impacted)."*
- **Implementation notes:**
  - Parser/auditor must distinguish "skill in skills section only" vs "skill in experience/project bullet with outcome."
  - Outcome detection: same as `quantifiable_impact_count` (e.g. `\d+%`, `$\d+`, or explicit patterns like "reduced … by X%", "served N users"). A bullet that contains both a skill keyword and an outcome pattern counts as outcome-tied for that skill.
  - One recommendation per distinct skill (or group) that appears without outcome; cap to avoid noise (e.g. top 3–5).

**Traceability:** TECH_RUBRICS_BY_MAJOR.md (all Tech majors): "Skills and tech only count when tied to an outcome"; tech.json common_gaps: "Resume lists tools without demonstrating how they were used."

---

## 2. New extraction rules (signals to add)

These signals support the Tech (and per-major) rubrics. Add to `ScoringSignals` or to a Tech-specific extraction layer; keep zero-hallucination (only detected values).

| Signal | Description | Detection (regex / heuristic) | Used in | Citation |
|--------|-------------|------------------------------|--------|----------|
| **deployed_app_or_live_link** | Has deployed app or live link (portfolio, demo) | URL patterns in resume (github.io, vercel.app, herokuapp, netlify.app, "live at", "deployed at", "link:") or "deployed" + project context | Build (Tech) | tech.json: "Deployed applications with live links" |
| **hackathon_mention** | Hackathon participation or placement | "hackathon", "hackathon win", "1st place", "2nd place", "won", "placed", "finalist" in same sentence/section as hackathon | Grit (Tech) | tech.json: "Hackathon wins or placements"; Google: hackathons count as demonstrated coding ability |
| **recognized_tech_employer** | Internship or job at recognized tech company | Employer name match against a maintained list (e.g. FAANG, Stripe, Figma, Microsoft, etc. from tech.json + company_hiring_criteria) | Build (Tech) | tech.json: "Internship experience at recognized tech company" |
| **competitive_programming** | Competitive programming presence | "codeforces", "leetcode", "icpc", "competitive programming", "putnam", "coding competition" | Build (Tech) | tech.json: "Competitive programming (Codeforces, LeetCode, ICPC)"; Jane Street/Citadel |
| **actuarial_exams_passed** | SOA or CAS exams passed | "SOA Exam P", "SOA Exam FM", "CAS Exam", "Exam P", "Exam FM", "passed" + actuarial exam context | Smart/Build (Actuarial Science) | Actuarial Ninja, Acturhire: exam progress primary filter |
| **certifications_list** | Professional certifications (tech, security, cloud) | Section "Certifications" or "Certificates" + keywords: AWS, GCP, Azure, CompTIA, Security+, CySA+, GIAC, GSEC, CSA, Splunk, TensorFlow, etc. | Smart/Build (per major) | tech.json; SOC analyst guides (certs critical) |
| **security_metrics_in_bullets** | Security-specific quantifiable outcomes | In bullets: "alerts triaged", "MTTR", "mean time to", "incidents investigated", "false positive reduction", "%" near security terms | Grit (Cybersecurity) | SOC analyst guides: measurable achievements |
| **research_semesters** | Already in signals; keep | Filled by parser or caller when "X semesters research" or similar | Build (Tech) | tech.json: research density |
| **commit_velocity_per_week** | Already in signals; keep | Filled by caller/API when available (e.g. from GitHub); not from PDF | Build (Tech) | tech.json: +10% for ≥3/week |

**Implementation:**  
- Add new fields to `ScoringSignals` (or a `TechScoringSignals` extension) for: `deployed_app_or_live_link: bool`, `hackathon_mention: bool`, `recognized_tech_employer: bool`, `competitive_programming: bool`, `actuarial_exams_passed: int` (or list), `certifications_list: list[str]`.  
- Add parsing in `extract_scoring_signals` or in a Tech-specific `extract_tech_signals(raw_text, parsed_resume)` that runs when track is Tech.  
- **Recognized tech employer list:** Maintain in knowledge (e.g. `knowledge/recognized_tech_employers.txt` or JSON) from tech.json companies + company_hiring_criteria; normalize company names from resume (e.g. "Google", "Alphabet") for match.

---

## 3. Outcome detection in bullets (for outcome-tie)

- Reuse/align with existing **quantifiable_impact** logic: `\d+%`, `$\d+`, and patterns like "reduced … by X%", "increased … to Y", "N users", "X% accuracy", "latency … ms", "saved $", "reduced time by".  
- **Scope:** For "skill tied to outcome," require the **same bullet** (or same experience/project block) to contain both:  
  - at least one **skill/keyword** from the track’s tech stack or certification list, and  
  - at least one **outcome pattern** above.  
- Skills only in a standalone "Skills" or "Technical Skills" section with no outcome in that section do **not** count; recommend tying to outcome.

---

## 4. Recommendation text (tie to outcome)

When the auditor finds one or more skills/tools that are **not** tied to an outcome:

- **Template:**  
  *"Tie [skill/tool] to an outcome: add a project or role bullet that uses this skill and includes a measurable result (e.g. %, $, time saved, users impacted)."*
- Optionally list up to 3–5 specific skills that were found without outcome (e.g. "Tie Python, SQL, and React to outcomes …").  
- **Type:** Recommendation (e.g. `type: "action"` or `"tie_to_outcome"`), **score_target:** Build (and optionally Smart if it’s about coursework/certs).  
- **Traceability:** TECH_RUBRICS_BY_MAJOR.md; tech.json common_gaps: "Resume lists tools without demonstrating how they were used."

---

## 5. Traceability summary

| Rule or signal | Citation |
|----------------|----------|
| Only count skill when tied to outcome | TECH_RUBRICS_BY_MAJOR.md (all majors); tech.json common_gaps |
| Recommend "tie to outcome" when not tied | Same |
| deployed_app_or_live_link | tech.json Build |
| hackathon_mention | tech.json Grit; Google resume guide |
| recognized_tech_employer | tech.json Build |
| competitive_programming | tech.json Build; quant firms |
| actuarial_exams_passed | Actuarial Ninja, Acturhire |
| certifications_list | tech.json Smart; SOC/cyber guides |
| security_metrics_in_bullets | SOC analyst guides |
| research_semesters, commit_velocity_per_week | tech.json (existing) |

Implementing these in `dilly_core/scoring.py` and `dilly_core/tracks.py` (or a dedicated Tech scoring module) will align scoring with the rubrics and keep every point traceable.
