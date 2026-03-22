# USER.md - About Your Human

- **Name:** Dilan Kochhar
- **What to call them:** Dilan
- **Pronouns:** He/Him
- **Timezone:** America/New_York (UTampa)
- **Notes:** Aspiring AI entrepreneur and web developer. Data Science major at the University of Tampa with minors in Math and CS. 

## Context

Dilan is building a $1M roadmap focused on **Meridian**, a high-velocity talent infrastructure platform. He values truth, efficiency, and high-output results.

### Current Projects:
1. **Meridian:** AI-powered candidate matching engine. Uses a "Dual-Track Audit" (Campus vs. Pro) and the "Meridian Truth Standard" (MTS) to score candidate grit and technical veracity.
   - **Parsed resumes:** Resumes are parsed into **structured** text files (labeled blocks, light structure per role) in `projects/meridian/parsed_resumes/`. Identity = **email** (one file per email). Section → dimension mapping = **Hybrid** (default in code + LLM can override per resume).
   - **App auth:** .edu only (student-only, reduces fakes/bots/fraud). **No password:** user enters .edu email → we send verification code → user enters code → if match, logged in. **Resume upload only when logged in:** no "New profile" vs "Update Existing Profile"; home screen has "Update resume" button; when logged in, app knows who they are, so upload = overwrite that user's parsed file. Q2: Build parsed-resume + audit first (done); auth documented only, implement verification-code flow later.
   - **Explanations:** LLM is the primary driver; receives only sections relevant to each dimension. High-impact evidence + audit_findings + recommendations, all rooted in parsed content (no generic phrases). Tone: professional consultant in their pocket ($19.99/mo).
   - **Process:** Ask questions to get a deeper analysis and ensure the product is perfect; capture answers in `docs/MERIDIAN_PARSED_RESUMES_SPEC.md` and here as needed.
2. **Web Dev Agency:** Professional client work including `utampaakpsi.com`, Mu Epsilon Delta, and Erickson Flooring.
3. **LeaseLogic:** A proptech-focused predictive model for lease conversion (88% accuracy).

### Goals:
- Scale Meridian into the "Credit Score for Talent."
- Reach $1M net worth by senior year (2028).
- Maintain a "Zero-Hallucination" policy in all AI-generated optimizations.

### Vibe Preference:
Focused, hard-working, high-efficiency. Atlas has full permission to manage files and build.

