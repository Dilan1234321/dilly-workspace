# First-Audit Quality: Make It So Good They Pay

**Goal:** The first free audit should make college students feel they *need* to pay — "I cannot apply anywhere without fixing this."

From REALITY_CHECK.md and PRODUCT_BAR_AVOID_REALITY_CHECK.md: if the first audit is "meh," they churn. One shot.

**Student feedback:** "Recommendations felt generic, not like it read my resume." Meridian must feel like it was **born and raised in their resume** — every finding and recommendation cites something specific from the document.

**Track strategy:** Pre-Health first (do it carefully and well); then expand to other tracks.

---

## What We Shipped (this pass)

1. **LLM prompt (dilly_core/llm_auditor.py)**  
   - Added a **FIRST-AUDIT QUALITY** block: treat every audit as if it's the only one they'll see.  
   - Bar: meridian_take = headline that makes them stop; every recommendation copy-paste ready or one concrete step; no filler; name standout strength or the one lever that moves the needle.  
   - Goal: "I need to fix this before I send another application."

2. **Hiring report (dashboard)**  
   - **Meridian's take** is now **above the fold** on the full report (right after the cover block: score, track, candidate). So the first thing they see after the score is the consultant headline.  
   - **Start here:** one top fix surfaced immediately — first line_edit with suggested_line (and Copy button) or first action rec, so they have one copy-paste or one concrete next step without scrolling.

3. **"Born and raised in the resume" (LLM prompt)**  
   - New rule: **BORN AND RAISED IN THE RESUME**. Every audit_finding, evidence sentence, and recommendation must cite something that appears in the resume (exact role title, org name, section, or verbatim phrase). Never "your clinical experience" without naming where (e.g. "your Medical Scribe role at Tampa General"). Never "your research" without naming lab/PI/project. In recommendations: always point at a specific place ("Under [Role] at [Company]," "In the bullet that says [exact words]"). If a rec could apply to another candidate after swapping only the name, it is too generic.  
   - **FORBIDDEN** strengthened: never refer to "your experience," "your roles," "your clinical work," or "your research" without naming the specific role, org, lab, or section.  
   - **AUDIT_FINDINGS**: each finding must name at least one specific role, org, lab, or honor from the resume.  
   - **JSON audit_findings** example updated to require "cite specific" in each dimension.

4. **Pre-Health track (priority, done first)**  
   - Pre-Health cohort block expanded with **RESUME-NATIVE RULE**: every finding and recommendation must prove you read the resume. Name at least one specific role/org/experience in audit_findings. In every recommendation: use current_line to quote the exact phrase, or name the section and role ("Under 'Clinical Experience,' in your [Role] at [Place]"). Never "add shadowing hours" without saying where (e.g. "Add total hours and specialty to your shadowing line with [Dr. X or setting]"). **meridian_take** for Pre-Health must name something from their resume (standout or the one fix).  
   - Smart/Grit/Build descriptions for Pre-Health now require citing what is on the page (e.g. "your 3.7 in Biology," "your role as [exact title] at [org]," "your shadowing with [Dr./Specialty]").

---

## Product bar (reminder)

- Evidence cited from *their* resume; recommendations copy-paste ready; track-specific; no generic fluff.  
- Paywall moment = value (what they get next: re-audit, job-fit, ATS), not friction.

---

## Questions for you (to go further)

1. **Track focus** — Optimize first for one track (e.g. Pre-Health at UTampa) or keep improving across all tracks equally?
2. **LLM vs rules** — In production, is the free audit always run with the LLM (`MERIDIAN_USE_LLM=1`)? If some users get rule-based only, the prompt changes won’t affect them; we could add a rule-based "first audit" pass (e.g. richer fallback recommendations).
3. **Student feedback** — Any recurring themes? ("Recommendations felt generic," "didn’t understand my scores," "wanted more line edits") so we can target the next improvements?
4. **First-audit-only UI** — Do you want a one-time "Your first audit" moment (e.g. short headline or CTA like "Your top 3 fixes" or "Copy all line edits") that only shows when `auditHistory.length === 1`?

---

## Possible next steps

- **Meridian's take quality:** Add 1–2 few-shot examples in training_data that have especially punchy meridian_take lines (strength or one lever) so the model sees the bar.  
- **Evidence specificity:** Light post-check or prompt tweak so evidence sentences always name role/org/project (no "your leadership roles").  
- **Track in the headline:** Surface track in the report title or first line ("Your Pre-Health audit" / "Your Tech audit") so it’s obvious it’s for them.  
- **"Copy all line edits":** Single button that copies all suggested_line values to clipboard for power users.
