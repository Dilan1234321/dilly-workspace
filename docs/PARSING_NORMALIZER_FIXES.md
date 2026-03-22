# Parsing / Normalizer Fixes (from kochhardilan05@gmail.com)

**Date:** 2025-03-07  
**Resume:** Dilan Kochhar (`kochhardilan05@gmail.com.txt`)

## What went wrong

1. **Most of the resume missing**  
   Professional Experience (KVR Properties, The Kochhar Education Foundation) and Skills were truncated or merged into Education. Output ended mid-sentence: "The Kochhar Education Foundation December 2022 -".

2. **Contact section wrong**  
   - "Tampa, FL Education:" appeared in Contact (label and location merged).  
   - "Location: Dilan Kochhar New York, NY" — candidate name was put in Location instead of name-first, location as city/state only.

3. **Education section wrong**  
   - "University: Honors College" — Honors College is a program, not the university; should be "University of Tampa" (or "University of Tampa - Honors College").  
   - "Degree: Associate's" — resume has B.S. in Data Science; Degree line should only appear for explicit A.A./A.S./Associate's.  
   - "Location: Computer Science Tampa, FL" — major and location jumbled.  
   - Rest of resume (Professional Experience text) was dumped into Education and then truncated.

## Root causes

1. **Parser:** PDF had one-word-per-line or few long lines. Section labels were **title case** ("Education:", "Professional Experience:") and often on the same line as content. `_inject_section_newlines()` only splits on **ALL CAPS** phrases, so "Education:" and "Professional Experience:" were never split. Everything stayed in `_top` (or one blob), so the normalizer received no separate Professional Experience section.

2. **Normalizer (LLM):**  
   - Treated _top as Contact + Education only and dumped the rest into Education, then output truncated (or model stopped).  
   - Output "Degree: Associate's" despite B.S. (prompt said "Degree only for Associate's" but didn't say "never for B.S./B.A.").  
   - Used "Honors College" as university name instead of "University of Tampa".  
   - Put name in Location and merged "Education:" into Contact.

## Fixes applied

- **Parser:** Inject newlines before title-case section labels with colon (e.g. "Education:", "Professional Experience:") so `get_sections()` sees them as separate section headers and splits content correctly.
- **Normalizer prompt:**  
  - Explicit: NEVER output "Degree: Associate's" unless the resume explicitly states A.A., A.S., or Associate of Arts/Science; for B.S./B.A./Bachelor's omit the Degree line.  
  - "University of Tampa - Honors College" → university is "University of Tampa", not "Honors College".  
  - Contact: full name first, then Email, Phone, Location (city, state only; never put candidate name in Location).  
  - Preserve ALL sections and ALL content; never truncate; if input has Professional Experience (or similar), output full [PROFESSIONAL EXPERIENCE] with every entry.
- **Self-check and auto-correction:** After the first normalization, the pipeline runs `validate_normalized_output(raw, output)`. If it detects truncation, name-in-Location, Education in Contact, "Honors College" as university, wrong Degree: Associate's, Company/Role swapped, or missing/incomplete Professional Experience, it runs one corrective LLM pass with those issues listed and replaces the output with the corrected resume. No user intervention needed.

**Debugging:** Set `MERIDIAN_DEBUG_NORMALIZER=1` when running (e.g. upload or script) to see logs: how many issues validation found, whether the correction pass ran, and whether it returned content or failed. Logger name: `meridian.normalizer`.
