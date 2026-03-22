# Transcript Upload — Product Spec

**Status:** Implemented (MVP). Upload, parse, profile storage, audit GPA override, dashboard Transcript section with GPA advice and read-only courses. Future: BCPM in scoring, job-specific course recs, resume–transcript alignment in report.

**Summary:** Optional student-submitted transcript. Meridian stores it, parses courses + grades + GPA, keeps them in the profile (read-only), and uses them to give better GPA advice, resume–transcript alignment, and **job-specific course recommendations** (which courses to put on the resume for which job). Legal and ethical: student voluntarily uploads their own document; we don’t claim official school verification.

---

## 1. Core value: real GPA → clear advice

**Getting the transcript gives Meridian the student’s real GPA.**

- Today: GPA comes from the resume (or is missing). We don’t know if it’s rounded, wrong, or omitted for a reason.
- With transcript: We have the official cumulative GPA from the institution.

**Meridian can then give direct, actionable advice:**

- *“Your GPA is 3.4. We recommend not putting GPA on your resume if it’s below 3.5—many recruiters filter by that. Focus on highlighting your experience and coursework instead.”*
- Or, if above threshold: *“Your GPA is 3.7—definitely list it. It’s a strong signal for [their track].”*
- Thresholds can be track- or role-aware (e.g. Pre-Health might have a different bar; finance “3.5+” is common). Configurable per track or globally.

**Principle:** One source of truth (transcript) → one clear recommendation (list or don’t list, and why). No guessing.

---

## 2. Profile: all courses and grades — read-only

**Meridian writes every course and grade from the transcript into the student’s profile.**

- **Stored:** Course code/name, term (e.g. Fall 2024), credits, grade (letter or number). Optional: department, level (e.g. 3000-level).
- **Display:** A dedicated “Your transcript” or “Courses & grades” section in the app (e.g. under Profile or Education). User can see exactly what Meridian sees.
- **Not editable by the student.** The transcript is the source of truth. If they had a grade change or the transcript is outdated, they upload a new transcript; we don’t let them hand-edit courses/grades (avoids gaming and keeps “verified from your transcript” honest).

**Why this matters:**

- Transparent: they see what we’re using.
- Enables every downstream feature: course-based recommendations, resume alignment, “relevant coursework” for a job, BCPM calculation, etc.

---

## 3. Job-specific course recommendations: which courses to put on the resume

**For a given job (or role/track), Meridian recommends which courses from their transcript to put on their resume.**

- **Input:** Their transcript (courses + grades) + either (a) a job description they paste/select, or (b) their stated target (e.g. “Summer analyst,” “Pre-Health,” “Data science”).
- **Output:** A short, ordered list: *“For this role, we recommend highlighting these courses on your resume: [Course A], [Course B], [Course C]. Here’s why…”*
  - E.g. Finance role → Financial Accounting, Econometrics, Data Analysis, Corporate Finance.
  - Pre-Health → Orgo, Bio, Chem, Stats, Anatomy.
  - Tech → Data Structures, Algorithms, ML, Databases.

**How it can work:**

- Match job description keywords / requirements to course names and departments in the transcript.
- Use track/target to weight “signals” (e.g. quant courses for finance, BCPM for pre-health).
- Optionally factor in grades: “Prioritize courses where you got A/A- so they see strength.”
- Surface as: “Recommended coursework for [Job Title]” in Am I Ready?, in the report, or in a dedicated “Resume builder” step that says “Add these courses to your resume for this application.”

**Principle:** We don’t invent courses—we only recommend from the transcript. MTS: evidence-based.

---

## 4. More ideas (big picture)

### 4.1 Resume–transcript alignment

- Compare resume GPA vs transcript GPA. If different: *“Your resume says 3.8; your transcript shows 3.6. Recruiters may verify. We recommend using 3.6 or omitting GPA if below 3.5.”*
- Same for major, minor, honors, Dean’s List: “Your transcript shows [X]; your resume says [Y]. Align them so you don’t get caught in verification.”

### 4.2 “Relevant coursework” section generator

- For a specific job or target, Meridian generates a *“Relevant coursework”* block: pick the top 4–6 courses from the transcript that best match the role, with grades if strong. User can one-click “Add to resume” (copy) or use it as a checklist. All courses must exist on transcript—no inventing.

### 4.3 BCPM / Pre-Health (and other track logic)

- Compute BCPM (science GPA) from transcript course codes/grades. Use it for Pre-Health scoring and for advice: “Your BCPM is 3.6—consider listing it for health professions” or “Your overall is 3.4 but BCPM is 3.8; lead with BCPM where allowed.”

### 4.4 Honors, Dean’s List, Latin honors

- Parse from transcript. If on transcript but missing on resume: *“Your transcript shows Dean’s List [terms]. Add it to your resume.”* If on resume but not on transcript: flag (possible mistake or different school).

### 4.5 Major / minor verification

- Ensure resume major and minors match transcript (and current/declared). Recommend adding a minor if it’s on the transcript and relevant to the job.

### 4.6 Audit findings that cite transcript

- Findings can reference transcript explicitly: *“Your transcript shows strong performance in [X, Y, Z]. Your resume doesn’t mention [X]. Consider adding a bullet for [role type].”*

### 4.7 “What if I add this course?” (from transcript)

- User asks: “Should I put Econometrics on my resume?” Meridian already has it on the transcript; we say yes/no and suggest a one-line way to list it (e.g. “Econometrics (A)”) for the kind of role they’re targeting.

### 4.8 Transcript-informed scoring

- Use transcript GPA (and optionally BCPM, major) for Smart score instead of resume-only. More accurate, fairer. Resume still drives experience/build; transcript drives academic truth.

### 4.9 Recruiter-facing badge

- “Transcript-informed” or “GPA and coursework verified from transcript provided by student.” Not “officially verified by school”—honest, but still a credibility signal.

### 4.10 One place to manage “what’s on my resume” vs “what’s on my transcript”

- Simple view: “On your resume” vs “On your transcript.” Gaps = things we can recommend adding (e.g. courses, honors). Mismatches = things to fix (GPA, major).

---

## 5. Legal and ethics (short)

- **Voluntary:** Student uploads their own transcript; optional. “We can help you more if you do.”
- **Consent:** Clear copy at upload: we use it to verify GPA and coursework, improve scores and recommendations, and suggest what to put on your resume.
- **No misrepresentation:** We do not say the school or registrar verified it. “Verified from the transcript you provided” is the ceiling unless we add real institutional verification later.
- **Privacy:** Same care as resume—secure storage, retention, who can access. Policy updated to cover transcript data.

---

## 6. Implementation touchpoints

- **Upload:** Optional step in onboarding or Profile; PDF (and maybe image). Store per user.
- **Parser:** Extract GPA, major(s), minor(s), degree, honors, and full course list (code/name, term, credits, grade). Transcript-specific parser or LLM with strict “only what appears in document” (MTS).
- **Profile schema:** `transcript_uploaded_at`, `transcript_gpa`, `transcript_courses[]` (read-only), optional `transcript_honors`, `transcript_major/minor` for comparison.
- **Scoring:** When transcript present, use transcript GPA (and BCPM if applicable) for Smart; optionally feed course rigor into Build.
- **Recommendations:** GPA list/don’t list rule; resume–transcript alignment; job-specific “which courses to put on resume”; “Relevant coursework” generator for a JD/target.
- **UI:** “Your transcript” / “Courses & grades” read-only section; recommendation blocks in report, Am I Ready?, or Resume Builder.

---

*Document created to capture transcript upload vision: real GPA → advice, read-only courses/grades in profile, job-specific course recommendations, and expanded ideas. This is a big thing we’re doing.*
