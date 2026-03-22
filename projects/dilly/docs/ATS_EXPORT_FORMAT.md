# ATS Export Format

**Purpose:** Document the Export to ATS CSV format so recruiters can import shortlisted Meridian candidates into Greenhouse, Lever, Bullhorn, and similar ATS systems.

---

## How to Export

1. Bookmark candidates and/or add them to collections in the recruiter view.
2. On any candidate profile, click **Export to ATS**.
3. A CSV downloads with all shortlisted candidates (bookmarks + all collections).

---

## CSV Columns

| Column | Description | ATS mapping |
|--------|-------------|-------------|
| First Name | Candidate first name | Required (Greenhouse, Lever) |
| Last Name | Candidate last name | Required (Greenhouse, Lever) |
| Email | Candidate email | Required for resume matching |
| Phone | Phone number (if on profile) | Optional |
| School | University name (e.g. University of Tampa) | Optional |
| Major | Major(s) | Optional |
| Track | Pre-professional track (Pre-Health, Tech, etc.) | Optional / custom field |
| Smart | Meridian Smart score (0–100) | Custom field |
| Grit | Meridian Grit score (0–100) | Custom field |
| Build | Meridian Build score (0–100) | Custom field |
| Meridian Profile | Full Meridian profile URL | URL / custom field |
| Meridian Take | Fit summary (TL;DR from audit) | Notes / custom field |
| Job Locations | Preferred locations | Optional |
| Source | Always "Meridian" | Source field |

---

## ATS Import Tips

- **Greenhouse:** Map First Name, Last Name, Email to default fields. Map Meridian Profile to a URL custom field. Map Smart/Grit/Build to number custom fields if desired. Upload resumes separately (match by email).
- **Lever:** Similar mapping. Use Meridian Take for internal notes.
- **Bullhorn:** Map to standard candidate fields. Custom fields for Meridian scores and profile link.

---

## Meridian's Value in the Export

- **Scores** — Smart, Grit, Build give recruiters a quick signal before opening the profile.
- **Meridian Profile** — One link to the full Meridian view (scores, evidence, experience, fit).
- **Meridian Take** — Pre-written fit summary to paste into ATS notes or share with hiring managers.
