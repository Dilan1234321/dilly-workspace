# Applications + Dilly — Conversational add & progress

**Goal:** Students can **manually** add applications (already in Career Center) **or** tell Dilly in natural language; Meridian **persists** the same `applications.json` record and **helps with progress** over time (nudges, next steps, prep, status updates).

**Existing foundation (use, don’t fork):**

- **API:** `GET/POST/PATCH/DELETE /applications` — `projects/dilly/api/routers/applications.py`
- **Model:** `company`, `role`, `status` (`saved` | `applied` | `interviewing` | `offer` | `rejected`), `applied_at`, `deadline`, `match_pct`, `job_id`, `job_url`, `notes`, `next_action`, `outcome_captured`, timestamps
- **UI:** `ApplicationsSection.tsx` — list, add modal, status chips, “Prep with Dilly” (hands off prompt + navigates to Practice)
- **Habits / nudges:** `GET /habits`, `GET /voice/proactive-nudges` already load applications via `_load_applications` and `compute_proactive_nudges` / funnel stats

---

## 1. Conversational “add application”

**User says things like:** “I applied to Stripe for a summer intern role yesterday,” “I’m saving a JP Morgan superday for next Friday,” “I have a phone screen with Amazon on Tuesday.”

**Flow:**

1. **Extract** (LLM + optional regex for dates): `company`, `role`, `status` (infer: “applied” vs “saved” vs “interviewing”), `applied_at` / `deadline`, `job_url` if mentioned, freeform `notes`, optional `job_id` if user is on a Meridian job.
2. **Disambiguate** in one turn if needed: “Is this the same as the Stripe internship you already have listed?” (match on normalized company + similar role).
3. **Confirm before write** (especially first time): short card in chat — “Add: **Stripe** · Summer Intern · Applied Mar 17?” [Add] [Edit] [Cancel].
4. **Persist:** `POST /applications` with auth (same as app). On success, return a line Dilly can say + optional deep link: `?tab=career&applications=1` or open Applications subview if you add a hash/query later.
5. **Privacy:** Respect “save what I tell Meridian” — if off, Dilly can still *discuss* but does not POST until user turns saving on (or offer one-off “save this application” with explicit consent).

**Deduping:** Prefer `job_id` when present; else fuzzy match `company` + `role` (Levenshtein or normalize “Inc.” / “LLC”) and **update** via `PATCH` instead of duplicate insert.

---

## 2. Progress tracking & “help however that may be”

Treat an application as a **small state machine** Dilly and the UI both understand:

| Moment | What Dilly / product does |
|--------|---------------------------|
| **Saved, not applied** | Nudge before deadline; “one thing before you submit” (ATS, bullet tweak) if linked to a job |
| **Applied, no response** | Use existing **silent apps** / funnel logic; suggest follow-up timing, thank-you note, or “want to log a rejection?” |
| **Interviewing** | Rituals: post-interview debrief; **Prep with Dilly** pre-filled with company + role; calendar export if deadline exists |
| **Offer / rejected** | Prompt `outcome_captured`; rejection reframes (already in emotional-support + proactive context); offer comparison if multiple `offer` |

**`next_action`:** After each meaningful chat turn about an app, Dilly can PATCH `next_action` (e.g. “Send thank-you by Friday”) so the Applications row stays the **single to-do line** for that company.

**Voice ↔ Applications:** When user says “I got the second round at Meta,” run extract → `PATCH` status + optional `notes` append (timestamped snippet in `notes` is OK within 500 chars or extend limit later).

---

## 3. Surfaces (where help shows up)

1. **Meridian Voice** — Tools: `add_application`, `update_application`, `list_applications` (read-only for grounding). System prompt: “You can log applications when the user asks; always confirm sensitive writes.”
2. **Applications page** — Show “Last updated by Dilly” or source badge optional; refresh list after Voice session if websocket/poll says apps changed (or optimistic refetch on tab focus).
3. **Weekly review / habits** — Already aggregates `applications_this_week`, `silent_apps`; extend copy to reference **named** companies from list when safe.
4. **Push / proactive** — Reuse `proactive_nudges`; add thin rules: deadline in 48h, interview tomorrow (needs calendar or explicit date in app).

---

## 4. Implementation order (suggested)

1. **Backend tools for Voice** — Structured JSON schema matching `AddApplicationRequest` / `PatchApplicationRequest`; server performs auth + save (no client-side token in LLM).
2. **Confirmation UX** — Inline confirm in Voice UI (or text) before POST.
3. **Dedupe + merge** — Server-side `POST /applications?merge=1` or helper used only from Voice path.
4. **Align handoff keys** — `ApplicationsSection` uses `meridian_pending_voice_prompt`; elsewhere may use `dilly_pending_voice_prompt` / `PENDING_VOICE_KEY` — unify so Prep-with-Dilly always lands correctly.
5. **Optional:** `GET /applications/summary-for-llm` — compact string list for context window limits.

---

## 5. Success metrics

- % of applications created via Voice vs form (both OK).
- Time from “I applied” utterance to row in list &lt; 30s with confirm.
- Uptake of `next_action` field populated after Dilly conversations.
- Fewer duplicate rows (dedupe hit rate).

---

*Last updated: 2026-03-19*
