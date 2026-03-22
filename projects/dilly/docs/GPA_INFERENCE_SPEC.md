# GPA inference when missing — spec (deferred)

**Status:** Deferred. Implement when we want to nudge users to add GPA without inventing a number.

## Goal

When GPA is not on the resume, use other resume signals to decide whether to recommend adding it. **Never invent or display a GPA value.** Only add a recommendation (e.g. "Consider adding your GPA if it's 3.0 or above—it's a key Smart signal.").

## Signals

**"Probably strong" (suggest adding GPA):**
- Dean's List, honor roll, "top X% of class"
- Academic honors (Phi Beta Kappa, magna cum laude, etc.)
- Honors College, research scholar language
- Strong coursework/research in education section

**"Possibly omitting" (softer nudge):**
- No GPA and no academic honors
- Experience is strong but education block is bare
- Still never assume a number; only consider a gentle one-line nudge

**Don't nudge or back off when:**
- Resume is very sparse (don't pile on)
- Non-traditional / career-changer (GPA less central)
- Track is one where GPA is less critical (e.g. Humanities, very experience-heavy)

## Implementation sketch

1. **Parser / post-parse:** Add a small helper e.g. `gpa_recommendation(parsed)` that looks at: `parsed.gpa` (missing vs present), honors/Dean's List/top X% in education text, richness of education section. Returns: `"suggest_add_gpa" | "soft_nudge_gpa" | None`.

2. **Auditor / recommendations:** If `suggest_add_gpa`, append one **action** recommendation: "Add GPA if 3.0+" with short explanation. If `soft_nudge_gpa`, same rec with softer wording or one line in audit findings under Smart. If `None`, no GPA recommendation.

3. **Track-aware (optional):** Only suggest for tracks where GPA is clearly valued (Pre-Health, Pre-Law, Business, etc.); skip or soften for Humanities or experience-heavy tracks.

## Guardrails

- Never say "your GPA is probably low." Only: "If your GPA is strong, consider adding it."
- Don't use school name to infer GPA; only use honors/academic language on the resume.
- One recommendation per audit; don't over-nudge. Can skip if education section is very thin or track is GPA-agnostic.

## Reference

- IDEAS.md: New ideas #11 — "GPA inference when missing"
- This spec expands that into an implementable design for when we pick it up.
