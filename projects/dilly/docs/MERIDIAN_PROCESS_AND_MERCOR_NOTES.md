# The Meridian Process — Your Idea + Notes from Mercor

**Single place for:** (1) The product process we're building (resume → parse → understand → match by scores → Target/Reach jobs), and (2) What we took from Mercor and how it shows up in Meridian.

---

## Part 1 — The Process (Your Idea)

### The flow we're building

1. **User submits resume**  
   One upload. No lengthy forms.

2. **Meridian parses it amazingly well**  
   Structured sections (education, experience, skills, projects), track detection, consistency checks. So we have a **normalized profile**, not a blob.

3. **Meridian starts to know and understand them**  
   From that resume we get:
   - **Smart** — academic/rigor signal (GPA, major, coursework, rigor multiplier).
   - **Grit** — ownership, impact, leadership (roles, bullets, tenure).
   - **Build** — track readiness (projects, clinical hours, stack, certs).
   - **Track** — Tech, Pre-Health, Business, etc.
   - **Recommendations** — "Do these 3 next," line edits, strategic fixes.

   So: **one resume → we understand them in Meridian’s language (scores + track + findings).**

4. **Meridian matches their scores to jobs whose requirements are in the same language**  
   Each job (or company) has **required Meridian scores**: e.g. min Smart 62, min Grit 58, min Build 68, track Tech. We compare user’s audit to those requirements.

5. **Jobs tab: Target and Reach**  
   - **Target** — Jobs where they **meet** the required scores. Show the required scores so they see the bar they cleared.  
   - **Reach** — Jobs where they **don’t quite** meet the bar. Show required scores **and** what to do to land the job (e.g. "Raise Build to 68. Raise Grit to 58.").

So the process is: **Resume → Parse → Understand (scores + track) → Match to jobs by score requirements → Target (you’re in) vs Reach (here’s what to improve).**

---

## Part 2 — What We Took from Mercor (Notes)

Mercor doesn’t use our score language; they use assessments + AI interview. But the *patterns* map cleanly.

### From Mercor: Structured profile from resume

- **Theirs:** Resume upload → parse → roles, skills, education, projects pre-filled. Profile drives matching.
- **Ours:** Same. Parse → structured resume + Smart/Grit/Build + track. That’s our “structured profile.”

### From Mercor: Requirements map (roles ↔ signals)

- **Theirs:** Each listing has required assessments; many listings share one assessment. So “pass A once → eligible for many roles.”
- **Ours:** Each job (or company) has **required Meridian scores** (min_smart, min_grit, min_build, track). So “meet this bar → you’re a **Target** for that job.” Same idea: **requirements in one language, match once.**

### From Mercor: Recommend the right next steps that unlock many roles

- **Theirs:** “Take these assessments” = the set that unlocks the most relevant roles for *your* profile.
- **Ours:** “Do these 3 next” + “One resume, one audit, many doors.” When we have an unlock map (doors), we say: “Do X so you qualify for [these doors/roles].” And for **Reach** jobs we say: “To land this: raise Build to 68, raise Grit to 58.” So **next steps explicitly unlock or get you closer to specific jobs.**

### From Mercor: Job-fit ranking

- **Theirs:** Listings ranked by how well profile matches the listing (job fit).
- **Ours:** Jobs ranked by match_pct (rule + LLM), then **split by Target vs Reach** using required_scores. So “fit” = meet the bar (Target) or show how close and what to improve (Reach).

### From Mercor: Employer pull (later)

- **Theirs:** When you’re prequalified, hiring managers see you and can send Instant Offer.
- **Ours (roadmap):** Recruiter view — employers/career centers set criteria (e.g. Build ≥ 70, Tech); we surface matching students. Same “employers pull when there’s a strong match.”

---

## Part 3 — Where This Lives in the Product

| Your idea | Mercor parallel | Where it is in Meridian |
|-----------|-----------------|--------------------------|
| Parse resume well | Structured profile | Resume parser, audit (LLM + few-shot), structured_text, ATS scan |
| Know & understand them | Profile + signals | Smart/Grit/Build, track, findings, “Do these 3 next” |
| Match scores to jobs with similar requirements | Role–assessment matrix; job fit | company_hiring_criteria.json (meridian_scores per company), job_matching.py (required_scores, match_tier, to_land_this) |
| Target = show required scores | Job fit; prequalified | Jobs tab “Target” section; required_scores on each card |
| Reach = required scores + what to do to land it | Recommended assessments to unlock roles | Jobs tab “Reach” section; to_land_this (“Raise Build to 68…”) on each card and in detail view |
| One input, many outcomes | One assessment → many roles | “One resume, one audit, many doors” (door_criteria.json, door_eligibility API, Many doors card on Career Center) |

---

## Part 4 — Copy / Messaging (Process + Mercor)

- **Process:** “Submit your resume. We parse it, score you on Smart, Grit, and Build, and match you to jobs that ask for those same signals. Target = you meet the bar. Reach = we show you the bar and what to improve.”
- **Mercor-inspired:** “One resume, one audit, many doors. Your scores unlock opportunity types; we tell you exactly what to do to open more.”
- **Jobs tab:** “Matched to your Smart, Grit & Build. Target = you meet the bar. Reach = what to improve to land the job.”

---

**→ For implementation roadmap and marketing plan (what to build next, how to roll out, how to market this process), see [IMPLEMENTATION_AND_MARKETING_PROCESS.md](./IMPLEMENTATION_AND_MARKETING_PROCESS.md).**

---

## Changelog

- **2026-03-16:** Created. Process (resume → parse → understand → match by scores → Target/Reach) + Mercor notes mapped to Meridian; table of where each piece lives; messaging.
- **2026-03-16:** Linked to IMPLEMENTATION_AND_MARKETING_PROCESS.md for how we implement and market it.
