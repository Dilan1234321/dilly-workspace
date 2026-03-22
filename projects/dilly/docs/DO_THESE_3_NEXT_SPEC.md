# "Do These 3 Next" — Detailed Spec

**Goal:** Reduce overwhelm. Instead of a long list of findings and recommendations, surface exactly **3 prioritized actions** so the student knows what to do first.

---

## Why It Matters

- **Overwhelm kills action.** A resume audit returns 5–15 findings + 3–8 recommendations. Students don't know where to start.
- **Prioritization is the value.** Meridian already has the data; the gap is *ordering* it by impact and clarity.
- **One clear list.** "Do these 3 next" becomes the default answer to "What should I do?"

---

## Inputs (What We Have)

1. **Audit findings** — `audit_findings[]` (strings, often with dimension or severity implied)
2. **Recommendations** — `recommendations[]` with `type` (generic, line_edit, action), `title`, `action`, optional `current_line`, `suggested_line`, `diagnosis`, `score_target`
3. **Scores** — `scores.smart`, `scores.grit`, `scores.build` (weakest dimension = higher priority for that dimension's recs)
4. **Red flags** — `red_flags[]` (recruiter turn-offs; fix these first if present)
5. **Career goal / target** — Optional; can prioritize recs that align with goal

---

## Selection Logic (How to Pick 3)

### Priority order

1. **Red flags first** — If any red flags (e.g. missing dates, consistency issues, length), surface 1–2 as actions. "Fix: [red flag message]"
2. **Line edits** — High impact, low effort. "Rewrite this bullet" with Copy button. Prefer `line_edit` recs that have `suggested_line`.
3. **Action recs** — "Add dates to Experience," "Add one quantifiable result." Prefer those tied to weakest dimension.
4. **Strategic recs** — "Get 20+ shadowing hours," "Add a technical project." Lower priority (longer to complete) but include if < 3 items so far.

### Rules

- **Max 3 items.** Never more.
- **Mix types when possible.** 1 line edit + 1 action + 1 strategic, or 2 line edits + 1 action.
- **Concrete over vague.** "Add dates to your Research Assistant role" beats "Improve your experience section."
- **Tie to evidence when possible.** "Rewrite: [current line] → [suggested]" so they know exactly what to change.

---

## Output Format

Each of the 3 items:

```ts
{
  title: string;        // Short action label, e.g. "Add dates to Research Assistant"
  detail?: string;     // Optional elaboration
  type: "line_edit" | "action" | "strategic" | "red_flag";
  recIndex?: number;    // Index into audit.recommendations for linking
  currentLine?: string; // For line_edit: what to replace
  suggestedLine?: string; // For line_edit: replacement
  copyable?: boolean;   // Show Copy button
}
```

---

## Where It Surfaces

1. **Career Center** — Replace or augment "One thing to do this week" with "Do these 3 next" card. Show all 3 with checkboxes or numbered list. Each item links to the full recommendation in the report (or opens Hiring tab).
2. **Insights** — Same card, below scores or in a prominent spot.
3. **After audit** — On the report/results screen, a sticky or top card: "Your next 3 moves."

---

## Implementation Options

### Option A: Client-side only (no new API)

- `getTopThreeActions(audit: AuditV2): ActionItem[]` in `meridianUtils.ts`
- Heuristic: red flags first, then line_edits (by impact), then actions, then strategic. Fill until 3.
- Fast, no latency. Good for MVP.

### Option B: LLM-assisted (API)

- `POST /top-actions` with audit JSON. LLM returns 3 prioritized, concrete actions.
- More nuanced (can consider career goal, track, nuance). Adds latency and cost.
- Use when client heuristic isn't good enough.

### Option C: Hybrid

- Client heuristic for 90% of cases. Optional "Refine with AI" that calls LLM for smarter ordering when user has complex profile.

---

## Recommendation

**Start with Option A.** The data structure (recommendations with type, red flags) is rich enough. Implement `getTopThreeActions` and surface in Career Center. If users say "the 3 aren't right," add Option B later.

---

## Copy / UX

- **Card title:** "Do these 3 next"
- **Subtitle:** "Prioritized from your audit. Tackle one at a time."
- **Per item:** Number (1, 2, 3) + title + optional "Copy" or "View in report" link.
- **CTA:** "View full recommendations" → Hiring tab.

---

*Last updated: March 2026*
