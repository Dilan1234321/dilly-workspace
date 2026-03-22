# Six-Second Profile — Blueprint

**Purpose:** Single source of truth for what the six-second profile is, where its data comes from, and how it stays up to date as the user uses the app.

---

## What it is

- **Recruiter-facing page** at `/p/[slug]`. One link; recruiters absorb name, tagline, scores, proof, and story in ~6 seconds.
- **Shareable link** never changes; the **content** is built fresh on every request from **profile + latest audit**.
- **No cache.** Every time someone (recruiter or student) opens the link, the backend fetches the current profile and the user’s most recent audit and merges them. So the six-second profile **updates automatically** as the user:
  - Edits their profile (name, photo, tagline, bio, background color, career goal)
  - Runs a new audit (new scores, findings, meridian_take, peer percentiles)

---

## Data sources (backend)

| Source | Used for |
|--------|----------|
| **Profile** (`get_profile_by_slug(slug)`) | name, career_goal, profile_slug, profile_background_color, profile_tagline, profile_bio, schoolId, major, majors, photo (separate endpoint) |
| **Latest audit** (`get_audits(email)[0]`) | scores (smart/grit/build), final_score, audit_findings, evidence, evidence_quotes, candidate_name, major, detected_track, peer_percentiles, meridian_take, strongest_signal_sentence |
| **School lookup** | profile.schoolId → SCHOOLS[id]; else get_school_from_email(email) → school_name, school_short_name |

**Merge rules:**

- **Name:** `profile.name` if set, else `latest_audit.candidate_name`. On **first audit**, if profile has no name, backend backfills `profile.name` from `candidate_name`.
- **Track:** `profile.track` if set, else `latest_audit.detected_track`.
- **School:** From profile.schoolId → SCHOOLS, or from email domain (get_school_from_email).
- **Majors:** profile.majors or profile.major; if missing, latest_audit.major.
- Everything else: profile field or latest-audit field as in the table; no mixing of “previous” audits.

**API:** `GET /profile/public/{slug}` returns the merged object.  
**Photo:** `GET /profile/public/{slug}/photo` serves the profile photo (from profile store).  
**Response headers:** `Cache-Control: no-store, no-cache, private, max-age=0` so the page is never cached.

---

## What appears on the page (frontend)

Goal: **Recruiters understand everything about the candidate in 6 seconds.** Every section is scannable and high-signal.

| Section | Content | From |
|---------|---------|------|
| Header | Photo, name, tagline | Photo: profile. Photo API. Name/tagline: merged (profile + audit). Tagline: `profile_tagline` or derived (e.g. "Track · Top X% Dimension"). |
| Context line | School · Major(s) | `school_short_name` or `school_name`, plus `majors[]` (e.g. "UT · Biology, Chemistry"). Only when present. |
| Subline | "One link. One scan. Your full story." | Shown only when there is audit data (scores). |
| Hook | One-line Meridian take or derived line | `meridian_take` from latest audit, or derived from scores/percentiles. |
| Strongest signal | One sentence proof to recruiters | Latest audit `strongest_signal_sentence`. Left border, labeled. |
| Meridian score | Single overall score (0–100) | Latest audit `final_score`. |
| Scores | Smart, Grit, Build; each with "Top X% in cohort" when available | Latest audit `scores` and `peer_percentiles`. |
| Key findings | Up to 3 punchy lines | Latest audit `audit_findings` (via `toPunchyFindings`). |
| Targeting | Career goal | `profile.career_goal`. |
| Bio | Short bio | `profile.profile_bio`. |
| Footer | Profile URL, "Meridian Careers · Share Your Score", "Curated by Meridian — designed so recruiters understand you in 6 seconds." | Slug + branding + value prop. |

**When there is no audit** (no scores or all zeros): page still shows photo, name, tagline; then a single line: “Scores and key findings will appear here after the candidate runs their first Meridian audit.” No score grid, no findings.

---

## When it updates (summary)

- **Profile edits** (name, photo, tagline, bio, background color, career_goal, etc.) → next load of `/p/[slug]` uses the updated profile; latest audit unchanged until they run another audit.
- **New audit** → `get_audits(email)[0]` is the new audit; next load shows new scores, findings, meridian_take, peer_percentiles, and any backfilled name/track.
- **No caching** → recruiters and students always see the latest profile + latest audit.

---

## Touchpoints

| Layer | Location |
|-------|----------|
| API | `projects/meridian/api/main.py`: `GET /profile/public/{slug}`, `GET /profile/public/{slug}/photo` |
| Profile by slug | `projects/meridian/api/profile_store.py`: `get_profile_by_slug` |
| Audit history | `projects/meridian/api/audit_history.py`: `get_audits` (ordered, latest first) |
| First-audit backfill | `main.py`: after storing new audit, if `profile.name` is missing, set from `candidate_name` |
| Frontend page | `projects/meridian/dashboard/src/app/p/[slug]/page.tsx` |
| App copy (Career Center) | "Updates automatically when you edit your profile or run a new audit." |

---

## Out of scope for the six-second profile

- **Custom tagline** and **achievements** (sticker sheet) are for in-app share cards/snapshot only; they are **not** on the six-second profile. Recruiter-facing tagline is **profile_tagline** only.
