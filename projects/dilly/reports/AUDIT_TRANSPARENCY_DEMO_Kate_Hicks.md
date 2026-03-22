# Meridian Audit — Full Pipeline Transparency (Kate M. Hicks)

**Person from training data:** Kate M. Hicks (first example in `training_data.json`).  
**Run:** `python3 projects/meridian/scripts/audit_transparency_demo.py` from workspace root.

---

## STEP 1: Raw resume text (input)

This is the exact text taken from the training data `resume_excerpt` — what we start with.

```
Kate M. Hicks

Phone: 732-832-9360 | Email: kate21hix@gmail.com

SUMMARY

Motivated Business student at the University of Tampa with hands-on experience in leadership, event management, marketing, and student engagement. With demonstrated abilities to lead executive teams, plan large-scale programming, and execute strategic marketing initiatives. Recognized for strong communication, collaboration, and organizational skills.

EDUCATION

The University of Tampa - B.S. in Business Management
Expected Graduation: December 2027
- Dean's List, Fall Semester 2024, Fall Semester 2025
- Graduated high school in top 14% from Monmouth Regional High School

EXPERIENCE

Director of Events
PEACE Volunteer Center | August 2025 – Present
- Led and facilitated weekly executive board meetings, developing agendas and ensuring effective communication...
- Trained and mentored executive board members...
- Planned and executed monthly social-issue–based programming...
[... full text 2403 chars]
```

---

## STEP 2: Parse resume (name, major, GPA, sections)

**Parser output:**
- **name:** `'Kate M. Hicks'`
- **major:** `'Unknown'` (no explicit "Business Management" in the block the parser used)
- **gpa:** `None` (no GPA line extracted)
- **section keys:** `['_top', 'summary', 'education', 'experience']`

Each key maps to that section’s content. The parser infers section headers from the resume (no fixed list).

---

## STEP 3: Structured resume text (what gets written & sent to LLM)

This is the **labeled** version we write to disk and (when using the LLM) send as context. Sections are explicit so the model knows what is education vs experience vs leadership.

```
[CONTACT / TOP]
Kate M. Hicks
Phone: 732-832-9360 | Email: kate21hix@gmail.com

[EDUCATION]
The University of Tampa - B.S. in Business Management
Expected Graduation: December 2027
- Dean's List, Fall Semester 2024, Fall Semester 2025
- Graduated high school in top 14% from Monmouth Regional High School

[EXPERIENCE]
Director of Events
PEACE Volunteer Center | August 2025 – Present
- Led and facilitated weekly executive board meetings...
- Trained and mentored executive board members...
[... PR & Marketing Executive Board Member, Lead Mentor at Discover UTampa ...]

[SUMMARY]
Motivated Business student at the University of Tampa...
```

---

## STEP 4: Write to `parsed_resumes/`

- **Path:** `projects/meridian/parsed_resumes/Kate_M._Hicks.txt`
- Same content as Step 3. New uploads with the same identity overwrite this file.

---

## STEP 5: Run audit

- **use_llm:** `False` in this run (no `OPENAI_API_KEY` / `MERIDIAN_USE_LLM`).
- **text used:** normalized text (rule-based path). With LLM on, the audit would use the **structured** text above so the model sees `[EDUCATION]`, `[EXPERIENCE]`, etc.
- **text length:** 2402 chars

---

## STEP 6: Scores

| Dimension | Score |
|----------|--------|
| Smart    | 72.5  |
| Grit     | 81.0  |
| Build    | 8.0   |
| Final    | 60.2  |
| Track    | Humanities |

---

## STEP 7: Evidence (what the user sees per dimension)

These are the **one-sentence explanations** shown when the user clicks Smart / Grit / Build.

- **SMART:**  
  *You showcased high academic standard through your honors, including - Dean's List, Fall Semester 2024, Fall Semester 2025.*

- **GRIT:**  
  *You demonstrated leadership and impact through your role as a Motivated Business student at the University of Tampa with hands-on experience in leadership...*  
  *(Rule-based path picked summary; with LLM + structured text we’d get e.g. “Director of Events at PEACE Volunteer Center”, “Lead Mentor at Discover UTampa”.)*

- **BUILD:**  
  *You demonstrated Humanities readiness; track scoring applied.*

---

## STEP 8: Audit findings (narrative summary)

1. **Smart:** You showcased high academic standard due to your 3.50 GPA, and your placement in the honors program.
2. **Grit:** You demonstrated leadership and impact through your leadership roles, quantifiable outcomes, your work and experience history.
3. **Build:** You demonstrated Humanities readiness; track scoring applied.

---

## STEP 9: Recommendations

Rule-based run returned no recommendations (LLM path would add personalized line_edit / action / generic recs).

---

## How to see the LLM path (personalized explanations + recommendations)

1. Set `OPENAI_API_KEY` and `MERIDIAN_USE_LLM=1` (or `true`).
2. Run again:  
   `MERIDIAN_USE_LLM=1 python3 projects/meridian/scripts/audit_transparency_demo.py`
3. The same script will then:
   - Use **structured** resume text as the prompt context.
   - Call the LLM and show **LLM-generated** evidence (e.g. “your role as Director of Events at PEACE Volunteer Center”, “Lead Mentor at Discover UTampa”) and recommendations (line_edits, actions, etc.).

Every step (raw → parse → structured → write → audit → scores, evidence, findings, recommendations) is printed in order so you have full transparency.
