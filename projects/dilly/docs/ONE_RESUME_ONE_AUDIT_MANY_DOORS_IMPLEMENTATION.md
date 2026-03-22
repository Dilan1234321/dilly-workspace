# One Resume, One Audit, Many Doors — Implementation Plan

**Vision:** Meridian leans into "one resume, one audit, many doors." One strong audit + clear next steps unlock visibility to opportunities (job types, partners, career center pools) so students see the payoff of improving.

---

## Principles

1. **Doors = opportunity types we can name.** Examples: "Partner tech internships," "ATS-ready (any role)," "Pre-Health shadowing-ready," "Career center spotlight."
2. **Each door has required Meridian signals.** Min Smart/Grit/Build, track, ATS-ready, etc. Stored in one unlock map (data), evaluated in one place (API).
3. **"Do these 3 next" can tie to doors.** Optional: "Do this so you qualify for [X]." Not every action must; we keep audit quality first, then layer "unlocks X" where it fits.
4. **Eligible = we show it.** When the user meets a door's bar, we show "You're eligible for [door label]" and link to Jobs / Apply / career center as appropriate.

---

## Phase 1: Unlock map + eligibility API (backend)

### 1.1 Data: Door criteria (unlock map)

**File:** `projects/meridian/knowledge/door_criteria.json`

Each "door" is an opportunity type we can evaluate and show in the app.

```json
{
  "_policy": "Doors = opportunity types. Required signals are Meridian-native (scores, track, ATS).",
  "doors": [
    {
      "id": "ats_ready_any",
      "label": "ATS-ready applications",
      "short_label": "ATS-ready",
      "description": "Your resume is optimized for applicant tracking systems so you can apply with confidence.",
      "required": {
        "ats_ready": true,
        "min_final_score": 50
      },
      "cta_label": "View jobs",
      "cta_path": "/jobs",
      "order": 10
    },
    {
      "id": "tech_internship_partner",
      "label": "Partner tech internships",
      "short_label": "Tech internships",
      "description": "Qualify for tech internships from companies we've vetted (e.g. Stripe, Figma).",
      "required": {
        "track": "tech",
        "min_smart": 60,
        "min_grit": 55,
        "min_build": 65,
        "min_final_score": 60,
        "ats_ready": true
      },
      "cta_label": "View tech jobs",
      "cta_path": "/jobs?track=tech",
      "order": 20
    },
    {
      "id": "pre_health_ready",
      "label": "Pre-Health ready",
      "short_label": "Pre-Health ready",
      "description": "Signal readiness for shadowing, clinical roles, and pre-health applications.",
      "required": {
        "track": "pre_health",
        "min_smart": 55,
        "min_grit": 60,
        "min_build": 55,
        "min_final_score": 55
      },
      "cta_label": "See recommendations",
      "cta_path": "/",
      "order": 30
    }
  ]
}
```

- **required** keys: `min_smart`, `min_grit`, `min_build`, `min_final_score` (optional), `ats_ready` (boolean), `track` (must match detected_track). All specified keys must pass.
- **order**: lower = higher in UI.

### 1.2 API: Door eligibility

**Module:** `projects/meridian/api/door_eligibility.py`

- **`get_door_criteria()`** — Load and return list of doors from `door_criteria.json`.
- **`evaluate_doors(profile, audit) -> list[dict]`** — For each door, compute:
  - `eligible: bool` — User meets all required signals.
  - `gap: dict | null` — If not eligible: e.g. `{"min_build": 65, "current_build": 58}` so we can say "Raise Build to 65 to unlock."
- **Response shape** (for frontend):

```json
{
  "doors": [
    {
      "id": "ats_ready_any",
      "label": "ATS-ready applications",
      "short_label": "ATS-ready",
      "description": "...",
      "eligible": true,
      "gap": null,
      "cta_label": "View jobs",
      "cta_path": "/jobs"
    },
    {
      "id": "tech_internship_partner",
      "label": "Partner tech internships",
      "short_label": "Tech internships",
      "description": "...",
      "eligible": false,
      "gap": { "min_build": 65, "current_build": 58 },
      "cta_label": "View tech jobs",
      "cta_path": "/jobs?track=tech"
    }
  ],
  "eligible_count": 1,
  "next_door": { "id": "tech_internship_partner", "short_label": "Tech internships", "gap_summary": "Raise Build to 65" }
}
```

- **ATS-ready:** Use existing ATS logic (e.g. from audit or ATS scan). If we don't have it on audit, treat as false for now; we can add `ats_ready` to audit response later.

### 1.3 Endpoint

- **GET `/door-eligibility`** (auth required). Reads profile + latest audit; returns the JSON above. Used by dashboard and (later) Voice.

---

## Phase 2: Dashboard — "Many doors" surface

### 2.1 Eligible doors card

- **Where:** Hiring tab (and optionally Jobs page). After "Do these 3 next" or near the radar.
- **Content:** "One resume, one audit, many doors." List doors where `eligible === true`: label + short description + CTA (e.g. "View jobs"). If none eligible, show 1–2 "Almost there" doors from `next_door` / first ineligible with smallest gap.

### 2.2 "Do these 3 next" + unlock (optional enhancement)

- **Backend:** When building "Do these 3 next," we can optionally inject one item: "Raise [Build] to [65] to unlock [Tech internships]." Source: `next_door.gap_summary` + door label. Implement as a **fourth** item that’s clearly "Unlock a door" so we don’t push out red-flag or line-edit items.
- **Alternative (simpler):** Don’t merge into the 3. Instead, add a single line under "Do these 3 next": "Unlock **Tech internships**: raise Build to 65." (From `next_door`.)

Start with the card only; add the one-line unlock nudge in the same or next iteration.

### 2.3 Copy and placement

- **Headline:** "One resume, one audit, many doors."
- **Subline:** "Your audit unlocks these opportunities. Improve your scores to open more."
- **Eligible:** "You're eligible for: [door labels]. [CTA per door]."
- **Not yet:** "Unlock [door]: [gap_summary]."

---

## Phase 3: Enrich unlock map + recruiter pull (later)

- Add more doors (e.g. by partner, by career center program).
- **Recruiter view:** When we have recruiter/career-center view, "doors" can map to recruiter filters: e.g. "Show me candidates eligible for tech_internship_partner." Same criteria, employer pull.

---

## File and API Summary

| Item | Location |
|------|----------|
| Unlock map | `projects/meridian/knowledge/door_criteria.json` |
| Eligibility logic | `projects/meridian/api/door_eligibility.py` |
| Endpoint | `GET /door-eligibility` in `main.py` |
| Dashboard card | Hiring tab in `page.tsx` (or shared component); optional line under "Do these 3 next" |
| Jobs page | Optional: "You're eligible for [X]" banner if `eligible_count > 0` |

---

## ATS-ready note

Today audit may not have a single `ats_ready` boolean. Options: (1) Add to audit response (LLM or rule-based); (2) Require ATS scan to be run and store result on profile/audit; (3) For door criteria, treat "ats_ready" as "final_score >= X" or omit from first doors. Phase 1 can use (3) or a simple heuristic so we don’t block shipping.

---

## Implemented (2026-03-16)

- **knowledge/door_criteria.json** — Unlock map with 4 doors: ATS-ready (min_final_score 50), Tech internship partner, Pre-Health ready, Business ready.
- **api/door_eligibility.py** — `get_door_criteria()`, `evaluate_doors(profile, audit)`, gap evaluation and `next_door` for "unlock" nudge.
- **GET /door-eligibility** — Auth required; returns doors with eligible/gap/gap_summary, eligible_count, next_door.
- **Dashboard (Career Center)** — "One resume, one audit, many doors" card after "Do these 3 next": shows eligible doors with CTA links, and "Unlock [X]: [gap_summary]" when next_door is present. Fetches on load and when centerRefreshKey updates (e.g. pull-to-refresh).

---

*Last updated: 2026-03-16*
