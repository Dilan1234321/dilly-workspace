# Resume Normalizer Examples — What to Include

Use this checklist when adding examples to `resume_normalizer_examples.json`. Goal: **cover a wide range of section headers and layouts** so the LLM reliably maps any real resume into Meridian’s canonical format.

---

## 1. Section headers to cover

The parser often emits **different names** for the same kind of content. Include at least one example that shows each of these **non-canonical** headers so the model learns the mapping.

| Parser might say … | Canonical section |
|-------------------|-------------------|
| Relevant Experience, Work Experience, Employment, Job Experience | **Professional Experience** |
| Leadership Experience, Activities, Involvement, Extracurriculars | **Campus Involvement** |
| Community Service, Volunteer, Affiliations, "Servant Leader, & Ambitious" | **Campus Involvement** |
| Volunteer \| [Something] (e.g. "Volunteer \| Willing Hearts: Singapore") | **Campus Involvement** |
| Honors & Awards, Honors and Achievements | **Honors** |
| Skills and Certifications (combined) | **Skills** + **Certifications** (split when possible) |
| Profile, Summary, Objective | Usually drop or fold into Contact; don’t create extra sections |
| References, Interests | Omit from canonical output |

**You already cover:** Relevant Experience, Leadership Experience, Skills and Certifications (Deng); Community Service, Servant Leader & Ambitious, contact-at-end (Yumna).

**Worth adding an example for:**  
- **Work Experience** or **Employment** (if you have a resume that uses only those headers).  
- **Volunteer** or **Affiliations** as a standalone section.  
- **Honors & Awards** as the main header (Yumna’s honors were in _top; a resume where the parser emits "Honors & Awards" as its own section would reinforce that).

---

## 2. Layout / structure quirks

| Quirk | Why it matters |
|-------|----------------|
| **Contact at end of doc** | Model must pull email/phone into [CONTACT / TOP] (Yumna covers this). |
| **Honors / achievements in _top** | Model must move them to [EDUCATION] or [HONORS] (Yumna). |
| **Education with high school + college** | Model should keep both, label clearly (Yumna). |
| **Associate’s degree** (community college) | Only time we output "Degree: Associate's" in Education; good to show once. |
| **GPA in a weird place** | Model should put GPA only under Education. |

**You already cover:** Contact at end, honors in _top, high school + college (Yumna).

**Worth adding:** One resume where Education clearly has an **Associate’s** (A.A. / A.S.) so the model sees "Degree: Associate's" in the output.

---

## 3. Content mix

| Content type | Canonical section | Note |
|--------------|-------------------|------|
| Paid jobs, internships | Professional Experience | Deng, Yumna both have this. |
| Clubs, leadership, volunteer, affiliations | Campus Involvement | Covered. |
| Standalone **Projects** section | Projects | If you have a resume with a clear "Projects" header and project list, add one example so the model sees Project name / Date / Location / Description. |
| Certifications only (no skills) | Certifications | Deng has skills + certs; one with certs-only is optional. |
| Research Experience | Usually **Professional Experience** or Campus Involvement | One example with "Research Experience" header helps. |

**Worth adding:** At least one example that has a **[PROJECTS]** section** (parser output "Section: projects" with 1–2 projects) so the model learns that format.

---

## 4. Extraction / PDF quirks

| Quirk | What to do |
|-------|------------|
| One-word-per-line or glued words | Include 1 example where the **input** has messy extraction; output should be cleaned (Yumna’s input is a bit like this). |
| Acronyms as false section headers (GPA, FL, CITI, etc.) | Prompt already says to fold into the right section; one example where input has "Section: gpa" or similar reinforces that. |
| Multi-column jumble | If you have a parsed resume where sections are clearly jumbled, one example helps. |

---

## 5. How many and which to add next

- **You have:** 2 examples (Deng, Yumna). That’s enough for a lot of cases.
- **Sweet spot:** 3–6 total. Add 1–2 more when you see **real** normalizer mistakes (e.g. a resume with "Work Experience" or "Projects" or "Honors & Awards" that the model maps wrong).
- **Priority order for the next 1–2 examples:**
  1. **Projects** — One resume where the parser emits a "projects" section so the model sees Project name / Date / Location / Description in the output.
  2. **Associate’s degree** — One resume with community college / A.A. or A.S. so the model sees "Degree: Associate's" in Education.
  3. **Honors & Awards** — One resume where the parser’s section key is literally "honors & awards" or "honors and achievements" (not just honors in _top).
  4. **Work Experience / Employment** — Only if you see real resumes that use only those headers and get mis-mapped.

---

## 6. Quick checklist when you find a new resume

When you’re about to add an example, ask:

- [ ] Does it introduce a **section header** we don’t already have in the examples? (e.g. "Projects", "Research Experience", "Honors & Awards")
- [ ] Does it show a **layout quirk** we don’t cover? (e.g. Associate’s only, contact only at end)
- [ ] Is the **canonical output** correct and consistent with our format (Company/Role/Date/Location/Description, etc.)?

If yes to the first or second, and you can write a correct canonical output, add it. If you already have 5–6 examples, consider replacing a similar one instead of adding more (to keep prompt size and cost in check).
