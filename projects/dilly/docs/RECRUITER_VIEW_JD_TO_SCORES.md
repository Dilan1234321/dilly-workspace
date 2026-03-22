# Recruiter View (Option A): How We Get Smart/Grit/Build From a Job Description

**Goal:** Recruiter pastes a job description → Meridian returns a **Meridian-fit profile**: the Smart, Grit, and Build scores (or minimums) that indicate a good fit for that role. So we need a defensible way to go from JD text → three numbers (and optionally “why”).

---

## Aspirational bar (intentional uplift)

**Product goal:** One of Meridian’s goals is to help students get more interviews. We do that in part by showing a **higher bar** for each job than the “true” minimum. When students aim for that higher bar, they improve their resume more; by the time they apply, they’re stronger than many others who aimed lower, so they become stronger candidates.

So the **scores we show** for “what this job wants” (Smart, Grit, Build) are **intentionally higher than a neutral/accurate minimum**. We are not inflating **student** scores (those stay real); we are setting the **job’s bar** aspirational.

**Implementation:**

- **Option A — Uplift after LLM:** The LLM returns a “true” minimum bar (or “strong candidate” bar). We then add a **configurable uplift** (e.g. +5 or +8 per dimension, cap at 100) before storing or displaying. So we have one place to tune “how much” higher (e.g. `JD_FIT_UPLIFT = 8`).
- **Option B — Bake into prompt:** Ask the LLM for “the bar that would make a candidate stand out and get interviews—use a high bar, above the bare minimum.” The model outputs higher numbers by design; we don’t add a numeric uplift.
- **Recommendation:** Use **Option A** (LLM gives baseline, we add uplift). That way we can change uplift without re-prompting, and we can log or audit “true” vs “displayed” if we ever need to.

**Where it’s used:** Anywhere we show “what this job wants” (recruiter JD-fit view, Am I Ready?, job cards, etc.). Same inflated bar everywhere so students and recruiters see one consistent target.

---

## The challenge

For **students** we have: resume + track → auditor → Smart, Grit, Build. The rubric is fixed and we control it.

For **recruiters** we have: job description only. There is no “resume” to score. So we’re not scoring a person; we’re **inferring what the role values** in Meridian’s language. That is: “A strong candidate for this job would typically have at least Smart X, Grit Y, Build Z.”

So the question is: **how do we infer X, Y, Z from the JD?**

---

## Option 1: Rule / keyword-based

- Define keyword lists per dimension, e.g.:
  - **Smart:** “PhD”, “MS”, “quantitative”, “GPA”, “degree in”, “certification” → higher bar.
  - **Grit:** “lead”, “managed”, “ownership”, “drove”, “cross-functional” → higher bar.
  - **Build:** “years of experience”, “portfolio”, “projects”, “shipped”, “internship” → higher bar.
- Count or score presence → map to bands (e.g. 0–40, 41–60, 61–80, 81–100).

**Pros:** Deterministic, no LLM, explainable (“we saw 12 Smart keywords”).  
**Cons:** Brittle, misses nuance (“lead” in “lead developer” vs “lead a team”), doesn’t reflect relative importance (e.g. role might care more about Build than Smart). Hard to keep rules in sync with how we actually score students.

---

## Option 2: LLM with a fixed rubric (recommended)

We already define Smart, Grit, Build clearly for students (academic/rigor, leadership/impact, proof/readiness). We give the **same definitions** to an LLM and ask: *Given this job description, what minimum Smart, Grit, and Build scores (0–100) would indicate a good fit?*

- **Input:** JD text (and optionally role title).
- **Output:** Three integers (e.g. `smart_min`, `grit_min`, `build_min`) and optionally a one-line justification per dimension.
- **Prompt design:** Include:
  - Short, role-agnostic definitions of Smart, Grit, Build (so the model doesn’t need to know our tracks).
  - Instruction to output only 0–100 integers and to be consistent with “what a top-tier hiring manager for this role would expect in a strong candidate.”
  - Optional: “Which dimension matters most for this role?” (e.g. Build for a SWE role, Smart for a research role).

**Pros:** Handles any JD, any industry; can capture “this role cares more about Build than Smart.” One prompt, one call; we can tune with a few example JDs.  
**Cons:** LLM cost and variability; we should validate on 5–10 JDs where we have intuition (e.g. senior SWE → high Build; consulting → high Grit).

**Calibration:** Run the prompt on a few real JDs (tech, consulting, finance, etc.) and compare to our track benchmarks (e.g. `benchmarks.json`). If the model consistently says “Tech role → Build 75+” and our Tech bar is ~75, we’re aligned. If not, adjust the prompt (e.g. “Use the same scale as Meridian student audits: 70+ = Strong, 85+ = Elite”).

---

## Option 3: Hybrid (LLM + track fallback)

1. **Infer role type / track from JD** (keywords or small LLM call): e.g. “software engineer” → Tech, “analyst” + “finance” → Finance, “clinical” → Pre-Health.
2. **Start from that track’s bar** in `benchmarks.json` (e.g. Tech tier-1 bar: Smart 80, Grit 75, Build 85).
3. **LLM adjusts** from that baseline: “This JD emphasizes leadership more than typical Tech roles → nudge Grit up, Build down slightly.” Output final three numbers.

**Pros:** Anchored to our real benchmarks; LLM only does delta.  
**Cons:** More moving parts; need to maintain “JD → track” mapping and handle ambiguous JDs.

---

## Recommendation: Start with Option 2 (LLM only)

- **Single source of truth:** One prompt that takes JD and returns `smart_min`, `grit_min`, `build_min` (and optionally `signals` or `why` per dimension).
- **Definitions in the prompt:** Use role-agnostic wording so it works for any role:
  - **Smart:** Academic/technical rigor: education, coursework, certifications, problem-solving bar the role expects.
  - **Grit:** Leadership, ownership, impact: evidence of driving outcomes, leading projects/teams, resilience.
  - **Build:** Concrete proof: relevant experience, projects, portfolio, or domain-specific evidence (e.g. clinical hours, deals, shipped products).
- **Output contract:** e.g. JSON `{ "smart_min": 70, "grit_min": 65, "build_min": 80, "signals": ["Strong technical bar", "Leadership expected", "Shipped products matter"] }`. Recruiter UI shows the three numbers and the signals.
- **Fallback when LLM is down:** Return a neutral profile (e.g. 60, 60, 60) and a message “Meridian-fit unavailable; try again later,” or optionally a very simple keyword-based guess (Option 1) as backup.

Once this is live, we can add **Option 3** later (track inference + benchmark baseline + LLM delta) if we want tighter alignment with our student scoring.

---

## What we’ll build (implementation)

1. **Backend:**  
   - `POST /recruiter/jd-fit` (or same with recruiter auth): body `{ "job_description": "..." }`.  
   - Call LLM with the JD-to-Smart/Grit/Build prompt; parse response to `smart_min`, `grit_min`, `build_min`, optional `signals`.  
   - **Apply aspirational uplift:** e.g. `smart_min = min(100, smart_min + JD_FIT_UPLIFT)` (same for grit, build). Configurable constant (e.g. 5–10).  
   - Return JSON (the uplifted numbers). On LLM failure, return 60/60/60 and `unavailable: true`.

2. **Prompt:**  
   - Stored in code or a small template; same definitions as above; output format strict (e.g. JSON only, or “one line per dimension: Smart: 70 Grit: 65 Build: 80”).

3. **Recruiter UI (later):**  
   - One screen: textarea for JD, “Get Meridian-fit” button, then show the three numbers and the signals.

So: **we’ll know what the Smart/Grit/Build scores are for a JD by asking an LLM, with a fixed rubric (our same three dimensions), to infer the minimum bar a strong candidate would meet.** We then **add a configurable uplift** so the bar we show is intentionally higher—students aim higher, build stronger resumes, and become more competitive. We can tune both the prompt and the uplift with a few example JDs before launch.
