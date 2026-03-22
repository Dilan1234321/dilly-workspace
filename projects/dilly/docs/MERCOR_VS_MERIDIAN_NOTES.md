# Mercor vs Meridian — Notes for Meridian

Quick reference for the similar-but-different space. Use for positioning, product, and "how we're different" conversations.

**→ For the Meridian process (resume → parse → understand → match by scores → Target/Reach) and how Mercor notes apply, see [MERIDIAN_PROCESS_AND_MERCOR_NOTES.md](./MERIDIAN_PROCESS_AND_MERCOR_NOTES.md).**  
**→ For Mercor’s job matching *technologies* and how to integrate or adopt them in Meridian, see [MERCOR_JOB_MATCHING_TECHNOLOGIES_AND_MERIDIAN_INTEGRATION.md](./MERCOR_JOB_MATCHING_TECHNOLOGIES_AND_MERIDIAN_INTEGRATION.md).**

---

## What Mercor Is (Summary)

- **Company:** AI-powered hiring/staffing platform (SF, founded 2023). Connects experts (engineers, lawyers, doctors, etc.) with remote jobs and AI companies that need human expertise to train models. Clients include OpenAI, Anthropic. ~30k contractors; ~$10B valuation (2025).
- **Candidate flow:**
  1. **Profile** at work.mercor.com (resume, expertise).
  2. **Assessments first** — skill evaluations (written/verbal/coding). Same assessment used across many roles → pass once, qualify for many jobs. Recommended assessments based on open roles + your profile.
  3. **AI interview** (~20 min, role-specific; sometimes code review). Up to 3 retakes; can be reused across roles.
  4. **Browse/apply** — optional; matching often happens from assessment pool without applying to a specific listing.
- **Matching:** Reusable skill signals from assessments + AI interview; recommendations from profile/expertise; human review for suitability. Data not sold.

---

## Similarities (Why They Feel Alike)

| Area | Mercor | Meridian |
|------|--------|----------|
| **Career/jobs** | Match candidates to jobs (contract/remote, AI companies) | Help students get job-ready and hired (resume → stronger candidacy) |
| **AI in the loop** | AI interviews, assessment evaluation | Resume audit, scoring, recommendations |
| **Skill / quality signal** | Assessments + interview → "skill signals" | Smart / Grit / Build scores + audit findings |
| **One input, many outcomes** | One assessment → many roles | One resume → ATS-ready, shareable report, cohort benchmark |
| **Human + AI** | Human review of assessments/interviews | Auditor + (future) recruiter view / human-in-loop |

---

## Differences (Where Meridian Is Not Mercor)

| Dimension | Mercor | Meridian |
|-----------|--------|----------|
| **Who** | Experts/contractors (incl. professionals); global remote | Students / early-career; often campus/career-center-led |
| **What we do** | Staffing: connect people to paid contract work | Career acceleration: improve resume, scores, readiness; optional apply/job targeting |
| **Core product** | Assessments + AI interview → matching pool | Resume parse + audit + scores + recommendations + report |
| **Monetization** | B2B (companies pay for talent) | B2C/B2B (student sub + career center / institutional) |
| **Prestige** | N/A (role/skill fit) | Explicit "prestige-neutral" / anti-prestige; Grit/Build as alternative signals |
| **Rigor signal** | Implicit in assessments | Explicit (e.g. 1.40x rigor multiplier, track-specific logic) |
| **Output** | Get matched to jobs / get offers | Better resume, ATS readiness, shareable report, "do these 3 next" |

---

## How Mercor Does the "Heavy Lifting" (Matching Before the AI Interview)

This is the engine that matches users to jobs *before* they apply or do an AI interview. It’s the product lever that could be worth millions if we build the Meridian equivalent.

### 1. Structured profile from resume (input layer)

- **Resume upload → parse** → roles, skills, education, projects pre-filled.
- Profile also has: headline, target roles, seniority, availability, portfolio links, proficiency levels.
- So every candidate is a **normalized skill/experience graph**. No free-form blob; structured fields drive matching.

### 2. Role–assessment matrix (the unlock map)

- Each **listing (job)** has **required steps**: specific assessments, sometimes an AI interview.
- **Many listings share the same assessment.** So: Assessment A → [Listing 1, 2, 3, …]; Listing 1 → [Assessment A, B].
- Implication: **Pass assessment A once → you’re eligible for every role that requires A.** That’s the “one effort, many opportunities” lever.

### 3. Recommended assessments (the pre-interview heavy lift)

- **Recommended assessments** = f(active opportunities, your domain expertise, your profile/resume).
- The system answers: “Which assessments should *you* take so that when you pass them, you qualify for the *most* relevant roles?”
- So the “matching” before any interview is: **recommend the right next steps** (assessments) that **unlock many roles at once**. The user does one thing; the platform connects them to many jobs.

### 4. Job-fit ranking (Explore)

- **“Job fit”** filter: listings are prioritized by how well your **profile** matches the listing (skills, experience, etc.).
- So even “browse jobs” is matching: profile ↔ listing requirements, no application yet.

### 5. Instant offers (post-interview, no apply)

- When (verified interview + assessments + skills + availability) **meet a listing’s criteria**, you’re **surfaced as prequalified**.
- Hiring managers see you and can send an **Instant Offer** without you applying. So the platform **pushes candidates to employers** when there’s a strong match.

### Summary of the “heavy lifting”

| Layer | What Mercor does |
|-------|------------------|
| **Input** | Parse resume → structured profile (skills, roles, education, projects, availability). |
| **Unlock map** | Roles ↔ assessments (many roles share one assessment). |
| **Recommendation** | “Take these assessments” = minimal set of actions that unlock the most relevant roles for *your* profile. |
| **Ranking** | Listings ranked by profile–listing fit (job fit). |
| **Employer pull** | When profile + assessments + interview meet listing criteria → prequalified pool → Instant Offer. |

The million-dollar behavior is: **recommend the right next steps that unlock many roles, then surface the candidate to employers when they’re qualified** (so employers come to them).

---

## Bringing This Into Meridian (Path to a Million-Dollar Product)

We already have pieces; we don’t have the full “unlock map” and employer pull.

### What Meridian already has

- **Structured profile**: Parsed resume, track, major, application target, (optional) job location preferences.
- **Structured signals**: Smart / Grit / Build scores, ATS readiness, audit findings, “Do these 3 next,” recommendations.
- **Job matching**: `job_matching.py` — profile + resume + audit → rule-based score + LLM match_pct and why_bullets; jobs DB; verified company criteria; location filter.
- **Apply destinations**: job_id → application email (“Apply on Meridian”).
- **Recruiter view (roadmap)**: Employer uploads JD or criteria; see “Meridian-fit” candidates.

### What we’re missing (Mercor-style heavy lifting)

1. **Role / job-type → Meridian signals (the unlock map)**  
   - Today: we match *user → jobs* by keywords, track, resume overlap.  
   - Mercor-style: define **what “qualified” looks like per role or job type** in *our* language: e.g. “Tech internship (partner X)” → Build ≥ 70, ATS-ready, track = Tech.  
   - So: **Job type / partner role → required Meridian signals** (score bands, ATS-ready, track, maybe keywords). That’s our version of “Assessment A unlocks roles 1, 2, 3.”

2. **Recommendations that “unlock” roles**  
   - Today: “Do these 3 next” comes from audit (fix resume, add evidence).  
   - Mercor-style: “Do these 3 next **so you qualify for [these job types / partners].**”  
   - Example: “Get Build to 75 and mark ATS-ready → you’ll be eligible for 12 partner tech internships.” So the **next steps** are explicitly tied to **unlocking** a set of opportunities.

3. **Eligibility / “you’re in the pool”**  
   - When the user’s signals meet a role’s requirements (by our map), we show: “You’re eligible for [X]” or “You’re now in the pool for partner internships.”  
   - Optionally: career center or recruiter sees them as “Meridian-qualified” for that role type (recruiter view / employer pull).

4. **Employer / recruiter pull**  
   - Mercor: hiring managers see prequalified candidates and send Instant Offers.  
   - Meridian: recruiters or career centers define “we need candidates with [criteria]”; we **match and surface** candidates who meet those criteria (recruiter view + optional “invite to apply” or “instant referral”).

### Concrete build path (MVP → million-dollar)

| Step | What to build | Outcome |
|------|----------------|---------|
| **1. Unlock map (data)** | For each job type or partner role we care about, store **required Meridian signals**: e.g. min Smart/Grit/Build, ATS-ready, track. | We know “what qualified looks like” per opportunity. |
| **2. “Next steps to qualify”** | From audit + unlock map: “You’re N points from qualifying for [job type]. Do these 3 things.” Surface which opportunities unlock when they hit the bar. | One audit → clear path to “eligible for X.” |
| **3. “You’re eligible” UX** | When user’s scores + ATS + track meet a role type’s requirements, show “You’re eligible for [these roles/partners]” and link to Apply or job list. | Users see the payoff of improving; same “one effort, many doors” feel. |
| **4. Recruiter view + match** | Recruiter (or career center) sets criteria (e.g. Build ≥ 70, Tech, ATS-ready). We return matched candidates (anonymized or full per policy). Optional: “Invite to apply” / referral. | Employers pull; we become the place that surfaces the right students. |

We don’t need to run assessments or be the employer. We need: **role-type → Meridian-signal requirements**, **recommendations that explicitly unlock those roles**, **eligibility visibility**, and **recruiter/career-center pull**. That’s the Meridian version of Mercor’s pre-interview heavy lifting.

---

## Notes for Meridian (Ideas / Positioning)

- **Positioning:** We're not a staffing platform. We're a **career accelerator**: we make your resume and profile stronger so you compete better everywhere (including on platforms like Mercor, or direct applications). "Get job-ready, then get jobs."
- **Apply layer:** Our "apply" / job-matching ideas (e.g. apply destinations, job targeting) are about **targeting and readiness** (what to apply to, how to tailor), not about being the employer of record or staffing middleman like Mercor.
- **Assessments:** Mercor's "assessments first" is a strong pattern: one effort → many opportunities. Meridian's parallel is **"one audit, one set of next steps → unlock many roles"** once we have the role→signals map and "you're eligible" UX.
- **Students vs experts:** Our wedge is students and career centers; Mercor's is experienced experts and AI labs. Different funnel, different buyers.
- **Add below:** competitor moves, pricing, or feature ideas as you learn them.

---

## Changelog

- **2026-03-16:** Initial notes (Mercor overview, matching process, comparison table, positioning takeaways).
- **2026-03-16:** Added "How Mercor does the heavy lifting" (profile, role–assessment matrix, recommended assessments, job-fit, Instant offers) and "Bringing this into Meridian" (unlock map, recommendations that unlock roles, eligibility UX, recruiter pull; MVP build path).
- **2026-03-16:** Linked to MERIDIAN_PROCESS_AND_MERCOR_NOTES.md for the full process (resume → parse → understand → match → Target/Reach) and Mercor-inspired mapping.
