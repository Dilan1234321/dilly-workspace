# Application target — quality plan

**Principle:** At Meridian, quality over quantity. We’d rather have fewer features that are extremely high quality. "Tailor this audit for" is a strong idea; this doc is the plan to **master** it so the user feels we’re truly evaluating them through the right lens.

---

## What "mastered" means

1. **The audit actually changes** — Findings and recommendations are visibly different by target (internship vs grad school vs full-time). Not just a label; the reader can tell which lens was used.
2. **The user trusts it** — The product clearly states what we optimized for and shows at least one unmistakably tailored line (e.g. "For your internship applications, …").
3. **The choice feels first-class** — The selector isn’t an afterthought; it’s part of the story: "We’ll evaluate you through the lens of [X]."
4. **We can validate quality** — We have a clear bar for "good tailoring" and can check that the model meets it.

---

## Phase 1: Prompt and output quality (backend)

### 1.1 Stronger, unambiguous system instructions per target

- **Current:** One block per target with "You MUST tailor..." and a few phrases.
- **Upgrade:** 
  - For each target, add 2–3 **concrete output rules**, e.g.:
    - "At least one recommendation must start with 'For your internship applications,' or 'Internship recruiters look for'."
    - "The meridian_take (one-line headline) must explicitly reference their goal, e.g. 'For internship applications, your strongest signal is...' or 'For admissions, your research story...'."
  - Add one **negative** rule: "Do not use language that assumes they are applying for [other target], e.g. for internship do not say 'when you join as a full-time hire'."

### 1.2 Guaranteed visible tailoring in the response

- **Requirement:** The LLM must return at least **one** recommendation (or the meridian_take) that is **obviously** target-specific. We enforce this in the prompt so that every run has at least one line the user can point to and say "that’s for my goal."
- **Optional:** Add a structured field `tailoring_note` (one sentence) that the model must fill: e.g. "This audit emphasized learning agility and fit for short-term roles." We can surface this in the UI so the user sees "What we optimized for" in one line.

### 1.3 Rubric for "good tailoring" (internal quality bar)

- Document what good looks like per target:
  - **Internship:** Findings/recommendations mention learning, growth, short-term contribution, coachability; at least one line addresses "internship applications" or "internship recruiters."
  - **Grad school:** Findings/recommendations mention research, rigor, fit for program, admissions; at least one line addresses "admissions" or "for your [med/law/grad] applications."
  - **Full-time:** Findings/recommendations mention ownership, impact, readiness for a full-time role; language is not internship-focused.
  - **Exploring:** Recommendations are framed as useful for both internship and early full-time; no single-path assumption.
- Use this rubric to review sample outputs and tighten prompts until we consistently hit the bar.

---

## Phase 2: Product and UX (dashboard + copy)

### 2.1 Make the choice part of the story

- **Placement:** Keep the selector on Resume Review, but add one line of copy above or below it:  
  *"We’ll evaluate you through the lens of [Internship / Full-time / Grad school] so your feedback matches what those readers care about."*
- **Optional:** On Career Center, show their current "Tailor for" (from profile) with a short line: "Your next audit will be tailored for [X]. Change this when you run an audit."

### 2.2 Show "what we optimized for" in the report

- **Option A (static):** Under "Tailored for: [X]", show 2–3 short bullets per target (written by us), e.g.  
  - Internship: "We emphasized learning agility, growth potential, and fit for short-term roles."  
  - Grad school: "We emphasized research readiness, academic rigor, and fit for your target program."
- **Option B (from model):** If we add `tailoring_note` from the LLM, show it in a small card: "What we optimized for: [tailoring_note]."
- **Option C (both):** Static intro + one model-generated sentence so we guarantee clarity and a bit of personalization.

### 2.3 At least one visibly tailored line in the UI

- We already ask the model for at least one recommendation that’s clearly target-specific (Phase 1.2). In the dashboard, we could optionally **highlight** that line (e.g. a small "Tailored for your goal" badge or a subtle background) so the user’s eye goes to it. Not required for MVP of "mastered," but increases perceived quality.

---

## Phase 3: Validation and iteration

### 3.1 Spot-check and tune

- Run the same resume with "Internship" and "Grad school"; compare findings and recommendations. If they’re too similar, strengthen the prompt (more imperative language, more examples, or add the "at least one recommendation must start with..." rule).
- Run 3–5 resumes per target and review against the rubric (Phase 1.3). Note where the model drifts (e.g. internship language in a grad-school run) and add negative instructions or examples.

### 3.2 Document and lock

- Once we’re happy, document the final prompt shape and the rubric in this repo so future changes don’t dilute the feature. Consider a short "Application target — prompt and quality bar" section in a main Meridian doc.

---

## Implementation order (recommended)

| Step | What | Why first |
|------|------|-----------|
| 1 | Add explicit prompt rules: "At least one recommendation must start with 'For your [target] applications,' or equivalent" and "meridian_take must reference their application target." | Guarantees visible difference in every run. |
| 2 | Add optional `tailoring_note` (one sentence) to the LLM response and surface "What we optimized for" in the dashboard. | Trust: user sees we actually optimized. |
| 3 | Add one line of copy next to the selector: "We’ll evaluate you through the lens of [X] so your feedback matches what those readers care about." | Makes the choice feel first-class. |
| 4 | Write the internal rubric (what good looks like per target) and run 3–5 spot-checks; tune prompt until we hit the bar. | Quality bar we can maintain. |
| 5 | Optional: static "What we emphasized" bullets per target in the report; or highlight the visibly tailored recommendation. | Polish. |

---

## Out of scope (for now)

- Changing **scores** by target (e.g. different weighting of Smart/Grit/Build for internship vs full-time). Possible later, but adds complexity and we’d need a clear rubric; for "mastered" we focus on **language and recommendations** first.
- A/B testing or analytics on which target is most used. Nice to have, not required for quality.

---

*This plan is the bar for "we mastered application target." Ship when: (1) every run has at least one unmistakably tailored line, (2) meridian_take is target-aware, (3) copy and UI make the choice feel first-class, (4) we have a rubric and have validated with spot-checks.*
