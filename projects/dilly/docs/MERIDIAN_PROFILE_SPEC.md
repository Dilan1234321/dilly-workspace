# Meridian Profile — Full Student Profile Spec

**Purpose:** A comprehensive profile of everything the student does in Meridian. For student reflection and optional recruiter view. The recruitment profile (JD-tailored) is a slice of this.

---

## Vision

| View | Description |
|------|-------------|
| **Meridian Profile** | Full profile as a whole — identity, scores, activity, progress, reflection. Student reflection first; recruiters can see if student allows. |
| **Recruitment Profile** | Meridian profile tailored to a specific JD. What recruiters see when searching. Button to "View full Meridian profile" opens the untailored version. |

---

## Who Sees It

- **Students:** Own profile at `/profile` (authenticated). Desktop-optimized, mobile-friendly.
- **Recruiters:** Button on candidate's JD-tailored profile → opens public full profile (if student allows).
- **Public:** Shareable link `/p/[slug]/full` — students can share; respects privacy toggles.

---

## What's On It

### Identity
- Name, photo, school, major(s), minors, track
- Career goal, application target
- Job locations

### Scores & Resume
- Latest Smart/Grit/Build, Meridian take
- Audit history (count, score trend)
- Structured experience, skills

### Activity & Progress
- Applications: count, targets, companies, status (applied / interview / offer)
- Achievements / stickers unlocked
- Career center usage (companies viewed, advice read)
- Interview prep usage
- Voice usage (topics or counts, not full transcripts)

### Reflection
- Strengths and growth areas from audits
- Optional "my story" or narrative

### Privacy Controls
- On/off toggles per section (students control what recruiters see)

---

## Data Model

**Real-time aggregation** — no new persisted document. API aggregates from:
- `profile.json` (identity, preferences)
- `audits.json` (scores, history)
- Application targets / audit history
- Achievements
- Voice feedback store
- etc.

**Privacy fields** (in profile):
- `meridian_profile_privacy`: `{ "scores": true, "activity": true, "applications": true, "experience": true }` — each `true` = visible to recruiters

---

## Routes

| Route | Auth | Description |
|-------|------|-------------|
| `GET /profile/meridian` | Yes | Full aggregated profile for current user |
| `GET /profile/public/{slug}/meridian` | No | Public full profile; respects privacy toggles |
| `/profile` | Yes | Student's own full Meridian profile page |
| `/p/[slug]/full` | No | Public shareable full profile |

---

## Recruiter Integration

On `/recruiter/candidates/[id]` (JD-tailored view):
- Add button: **"View full Meridian profile"**
- Opens `/p/[slug]/full` in new tab (or same tab)
- Only shown if student has `meridian_profile_visible_to_recruiters: true` (or equivalent)

---

## Nav / Entry Points

- **Career Center:** Card or link "My Meridian Profile" → `/profile`
- **Explore / Connect:** "View my full profile" link
- **Settings:** Link to profile + privacy toggles

---

## Update Cadence

Real-time — profile is aggregated on each request.
