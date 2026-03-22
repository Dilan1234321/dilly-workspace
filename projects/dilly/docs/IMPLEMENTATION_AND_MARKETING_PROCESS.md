# Implementation & Marketing — The Meridian Process

**How we implement the process (resume → parse → understand → match → Target/Reach + many doors) and how we market it.**

---

# Part A — Implementation

## What’s already built

| Piece | Where | Status |
|-------|--------|--------|
| Parse + understand | Parser, LLM audit, Smart/Grit/Build, track, “Do these 3 next” | Live |
| Job requirements in our language | `company_hiring_criteria.json` → `meridian_scores` per company | Live |
| Target vs Reach | `job_matching.py`: required_scores, match_tier, to_land_this | Live |
| Jobs tab: Target / Reach | Dashboard jobs page: two sections, required scores, “To land this” on Reach | Live |
| Unlock map (doors) | `door_criteria.json`, `door_eligibility.py`, GET /door-eligibility | Live |
| Many doors card | Career Center: “One resume, one audit, many doors” + eligible + next_door nudge | Live |
| JD → Meridian scores | `dilly_core/jd_to_meridian_scores.py`: LLM infers min Smart/Grit/Build from any job description | Live |
| POST /jd-meridian-scores | Body: `{ job_description, job_title? }` → returns inferred scores (for paste-JD flows) | Live |
| GET /jobs/:id/required-scores | When company has no meridian_scores, infers from JD; Jobs detail shows "Based on job description" when JD-inferred | Live |

So the core process is **implemented**: one resume → scores → match to jobs by required scores → Target (you meet the bar) / Reach (here’s what to improve) + doors that unlock from the same scores.

---

## What to do next (prioritized)

### 1. Data: more jobs with required scores (high impact)

- **What:** Add `meridian_scores` to every company rule in `company_hiring_criteria.json` so more jobs get Target/Reach instead of “target by default.”
- **How:** For each new or existing rule, set min_smart, min_grit, min_build, min_final_score (and track where it makes sense). Use door_criteria and existing Stripe/Figma/USAJobs bars as a template.
- **Outcome:** More jobs show “Required: Smart ≥ X…” and “To land this: …” so the process is visible to every user.

### 2. “Do these 3 next” + unlock line (medium impact)

- **What:** Under “Do these 3 next,” add one line when `next_door` exists: “Unlock **[Tech internships]**: raise Build to 65.”
- **Where:** Same place we render the three actions (Career Center); consume `doorEligibility.next_door`.
- **Outcome:** Next steps explicitly tied to opening a door; reinforces “one audit, many doors.”

### 3. ATS-ready signal (medium impact)

- **What:** Add an `ats_ready` (or equivalent) signal to the audit response (rule or LLM), or derive from ATS scan when run. Use it in door_criteria and (optionally) in job required_scores.
- **Where:** Audit schema/response, door_eligibility.py, door_criteria.json.
- **Outcome:** “ATS-ready” door and any “ats_ready” job requirements become meaningful.

### 4. Jobs page: “You’re eligible for X” banner (low effort)

- **What:** When user has `eligible_count > 0`, show a short banner at top of Jobs: “You’re eligible for [door labels]. View jobs →.”
- **Where:** Jobs tab, above the Target/Reach sections; call GET /door-eligibility or pass from app state if already loaded.
- **Outcome:** Clear link from “many doors” to the job list.

### 5. Recruiter view (later)

- **What:** Recruiter or career center sets filters (e.g. Build ≥ 70, Tech, ATS-ready). We return candidates who meet those Meridian signals (anonymized or full per policy).
- **Where:** New or existing recruiter view; reuse same required_scores / door logic in reverse (employer defines bar, we match students).
- **Outcome:** Employers pull; “process” becomes a two-sided match.

---

## Rollout and QA

- **Launch:** No separate “launch” for the process—it’s live. Roll out **marketing** (see Part B) when you’re ready to emphasize it.
- **QA:** For each new company with `meridian_scores`, spot-check a few jobs: Target for a strong profile, Reach for a weaker one, and “To land this” text correct.
- **Monitoring:** Track Jobs tab usage (Target vs Reach views, clicks to apply), and door-eligibility eligible_count distribution, to tune bars and copy.

---

# Part B — Marketing

## Positioning (keep existing, add process)

- **Existing north star:** Meridian = largest platform of 100% verified real students. No fakes, no bots. (Keep this.)
- **Process layer:** We don’t just score resumes—we **match you to jobs in the same language**. One resume → we understand you (Smart, Grit, Build) → we show you **Target** jobs (you meet the bar) and **Reach** jobs (here’s exactly what to improve to land them). Plus: **one resume, one audit, many doors**—your scores unlock opportunity types and we tell you how to open more.

So: **Verified students** + **score-based matching and clear next steps** (Target/Reach + many doors).

---

## Key messages (process-specific)

Use these in order of detail:

1. **One line:**  
   *“We score your resume, then match you to jobs that want those same scores. You see Target roles you’re ready for and Reach roles plus exactly what to improve.”*

2. **Two lines:**  
   *“One resume, one audit, many doors. We parse you, score you on Smart, Grit, and Build, and match you to jobs that ask for those signals. Target = you meet the bar. Reach = we show the bar and what to do to land the job.”*

3. **Full process (when you have time):**  
   *“You submit your resume. We parse it and score you on Smart, Grit, and Build so we understand you in one language. We then match you to jobs whose requirements are in that same language. You get two lists: Target—jobs where you already meet the bar (we show the required scores)—and Reach—jobs where we show the required scores and exactly what to improve to get there. On top of that, your audit unlocks ‘doors’ (e.g. ATS-ready, partner tech internships); we tell you how to open more.”*

---

## Who we’re talking to and what we say

| Audience | Angle | Where to use |
|----------|--------|----------------|
| **Students** | “See which jobs you’re ready for (Target) and which are reach—with a clear path to get there.” “One resume, many doors.” | In-app (Jobs tab, Career Center, onboarding), social, campus flyers |
| **Career centers** | “We don’t just audit—we match students to jobs by the same criteria and show Target vs Reach so they know where they stand and what to do.” “One audit, many doors.” | Sales, demos, HOW_TO_SAY, one-pager |
| **Recruiters / employers** | “Students come to you with Meridian scores; you can filter by the same signals.” (Later: recruiter view.) | Recruiter pitch, MERIDIAN_POSITIONING |
| **Advisors / investors** | “We turned resume scoring into a matching engine: same language for candidate and job, Target/Reach, and unlockable doors—like a Mercor for students, but we don’t staff, we accelerate.” | MERIDIAN_PITCH_ONE_PAGER, advisor calls |

---

## Differentiation

- **vs generic resume tools:** We don’t just “improve your resume”—we **match you to jobs that want the same signals** and show you **Target** (ready) vs **Reach** (with a concrete path). One resume, one audit, many doors.
- **vs Mercor:** We’re not staffing. We’re a **career accelerator**: we get you job-ready and show you which roles you’re in range for (Target/Reach) and which opportunity types you’ve unlocked (doors). “Get job-ready, then get jobs.”

---

## Channels and tactics

| Channel | Tactics |
|---------|--------|
| **In-app** | Jobs tab subcopy (“Matched to your Smart, Grit & Build. Target = you meet the bar. Reach = what to improve.”). Career Center “Many doors” card. Onboarding or tooltip: “Your scores unlock jobs and doors.” |
| **Campus** | Flyers/emails: “One resume. Your scores. Target jobs you’re ready for + Reach jobs with a path.” Partner with career center on “many doors” / “Target vs Reach” workshop. |
| **Website / landing** | Hero or feature block: “We match you to jobs in your language. Target = ready. Reach = here’s what to improve.” “One resume, one audit, many doors.” |
| **Pitch / one-pager** | Add one bullet: “Jobs matched to your Meridian scores: Target (you meet the bar) and Reach (we show what to improve). One resume, many doors.” Update MERIDIAN_PITCH_ONE_PAGER and HOW_TO_SAY when you emphasize this. |
| **Social / short-form** | “Target = jobs you’re ready for. Reach = jobs we tell you how to get. One resume, one audit.” “Your scores unlock doors. We show you which ones and how to open more.” |

---

## Copy snippets (drop-in)

- **Jobs tab (already in product):** “Matched to your Smart, Grit & Build. Target = you meet the bar. Reach = what to improve to land the job.”
- **Career Center (already in product):** “One resume, one audit, many doors. Your audit unlocks these opportunities. Improve your scores to open more.”
- **Website hero or feature:** “One resume. We parse it, score you, and match you to jobs that want those same scores. Target roles you’re ready for—Reach roles with a clear path.”
- **Pitch:** “We match students to jobs by Meridian scores. They see Target jobs where they meet the bar and Reach jobs with exactly what to improve—plus opportunity types they’ve unlocked. One resume, one audit, many doors.”

---

## Changelog

- **2026-03-16:** Created. Implementation: what’s done, what’s next (data, Do these 3 + unlock, ATS-ready, Jobs banner, recruiter view). Marketing: positioning, messages, audiences, differentiation, channels, copy snippets.
