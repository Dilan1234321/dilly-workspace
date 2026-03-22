# Meridian — Onboarding Profile Schema

Shape of the data we collect during onboarding and use in the app (Career Center, tailoring, theme). Use this for frontend state, API request/response, and any persistence (e.g. after verify).

---

## Profile (onboarding + app)

```ts
type OnboardingProfile = {
  /** Verified .edu email (set after code verification) */
  email: string;
  /** True after verification code is accepted */
  verified: boolean;
  /** "draft" until user pays; "active" after payment. Drafts older than 3 days are deleted by cron. */
  profileStatus: "draft" | "active";
  /** User's display name (collected in onboarding) */
  name: string | null;
  /** School id from email domain (e.g. "utampa"). Drives theme and copy. */
  schoolId: string | null;
  /** User's major (free text or from list) */
  major: string | null;
  /** True if they said they're on a pre-professional track */
  preProfessional: boolean;
  /** If preProfessional, selected track: "Pre-Health" | "Pre-Law" | etc. */
  track: string | null;
  /** Selected goal keys or labels. Multiple allowed. */
  goals: string[];
  /** When profile was last updated (ISO string or timestamp) */
  updatedAt?: string;
};
```

---

## Field details

| Field | When set | Example |
|-------|----------|---------|
| `email` | Screen 1 (submitted) + confirmed on Screen 2 | `"you@spartans.ut.edu"` |
| `verified` | After code check on Screen 2 | `true` |
| `profileStatus` | `"draft"` on create; `"active"` when user pays. Drafts &gt; 3 days deleted by cron. | `"draft"` / `"active"` |
| `name` | Screen 4 (Name) | `"Jordan"` |
| `schoolId` | After verify; derived from email domain (e.g. spartans.ut.edu → utampa) | `"utampa"` |
| `major` | Screen 5 | `"International Business"` |
| `preProfessional` | Screen 6 | `true` |
| `track` | Screen 7 (if preProfessional) | `"Pre-Health"` |
| `goals` | Screen 8 | `["internship", "aiming_med_school"]` |
| `updatedAt` | On each save | `"2025-03-11T12:00:00Z"` |

---

## Persistence and lifecycle

- **On verify:** Profile is created with `profileStatus: "draft"`. User fills name, major, track, goals during onboarding (PATCH per screen).
- **On payment:** Stripe webhook sets `profileStatus: "active"` for that user. The profile is then permanent.
- **If they don't pay:** Draft profiles older than 3 days are deleted by a cron job that calls `GET /cron/cleanup-draft-profiles?token=CRON_SECRET`. Set `CRON_SECRET` in env and schedule the endpoint (e.g. daily).
- **API:** GET /profile and PATCH /profile; allowed PATCH fields include `name`, `profileStatus`, `major`, `preProfessional`, `track`, `goals`, etc.

---

## School theme from profile

Use `schoolId` to look up theme:

- In app: `getSchoolById(profile.schoolId)` from `@/lib/schools` → `theme.primary`, `theme.secondary`, `theme.backgroundTint`.
- Screen 3 (theme switch): Render with that theme and copy (e.g. "Meridian for Spartans" for utampa).

---

## Pre-professional tracks (Screen 7)

User selects one specific track; we map to a **category** for scoring and copy:

- **Pre-Health category:** Pre-Med, Pre-PA, Pre-Dental, Pre-Vet, Pre-PT, Pre-OT, Pre-Pharmacy (scoring uses TRACK_DEFINITIONS["Pre-Health"]).
- **Pre-Law category:** Pre-Law.

Tracks match what University of Tampa offers (College of Natural and Health Sciences + Pre-Health/Pre-Law Advising). Stored `track` value is the specific choice (e.g. `"Pre-Med"`). Backend/dashboard use `get_track_category(track)` or `getTrackCategory(track)` to get `"Pre-Health"` or `"Pre-Law"` when needed.

---

## Goals list (reference for Screen 8)

**All users:** `internship`, `gain_experience`, `meet_like_minded`, `get_involved_university`, `grad_school`, `pursue_phd`, `figure_out`.

**Pre-professional (one goal option per track):** aiming_med_school, aiming_pa_school, aiming_dental_school, aiming_vet_school, aiming_pt_school, aiming_ot_school, aiming_pharmacy_school, aiming_law_school. Labels: "I'm aiming for [med/PA/dental/vet/PT/OT/pharmacy/law] school."

---

*Part of Phase 0. Extend when we add more schools or profile fields.*
