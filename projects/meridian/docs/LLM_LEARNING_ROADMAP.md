# Meridian LLM Learning Roadmap

**Goal:** The auditor should *learn* from (1) what you tell it and (2) research on how companies, med schools, law schools, etc. actually evaluate undergrad resumes — so it becomes the best resume parser → accurate grader → highest impact for college students (jobs + specialized schools).

---

## What “Learning” Can Mean Here

| Approach | How it learns | Best for |
|----------|----------------|----------|
| **Research-backed rubric** | You (or we) curate criteria from AAMC, LSAC, recruiter guides, etc. into a single “grading rubric” that goes in the system prompt. Update the rubric as you add research or give feedback. | Fast to ship; clear, auditable criteria; no infra. |
| **RAG (retrieval-augmented)** | Ingest articles, PDFs, official guides into a vector DB. At audit time, retrieve relevant chunks and add them to the prompt so the LLM reasons over real standards. | When you have lots of docs and want “cite this source” style behavior. |
| **Few-shot examples** | You label examples: “This resume should get Smart 82, Grit 78 because…” The prompt includes 2–5 such examples so the LLM mimics your grading. Add/swap examples as you correct it. | Aligning to *your* taste and edge cases. |
| **Fine-tuning** | Train (or adapt) a model on many (resume, scores, findings) pairs. | Later, when you have 100s–1000s of labeled audits and want a dedicated model. |
| **Feedback loop** | When you (or users) say “this score was wrong,” we store that and either (a) update the rubric, (b) add a few-shot example, or (c) flag for future fine-tuning. | Continuous improvement from real use. |

**Recommendation for v1:** Combine **research-backed rubric** + **few-shot examples** + a simple **feedback loop** that updates the rubric and examples. Add **RAG** when you have a stable set of source docs (e.g. AAMC, LSAC, 2–3 recruiter guides).

---

## Proposed Architecture (Learnable Auditor)

```
┌─────────────────────────────────────────────────────────────────┐
│  SOURCES OF TRUTH (you + research)                               │
│  • Rubric: med / law / recruiter criteria (from internet + you)  │
│  • Few-shot: 3–5 example (resume snippet → scores + reasoning)   │
│  • Optional: RAG docs (PDFs/articles in vector DB)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PROMPT BUILDER                                                  │
│  System = MTS + Rubric + Few-shot ( + RAG chunks if enabled)     │
│  User   = “Audit this resume” + raw resume text                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LLM (e.g. gpt-4o-mini / gpt-4o)                                 │
│  → JSON: scores, audit_findings, evidence                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  FEEDBACK LOOP (optional but important)                          │
│  “This score was wrong” / “Use this as an example”               │
│  → Update rubric or add to few-shot store                        │
└─────────────────────────────────────────────────────────────────┘
```

- **Rubric:** One (or three: Pre-Health / Pre-Law / Builder) markdown files that we pull from the internet + your notes. They define what “good” looks like for each track and what to count (e.g. clinical hours, BCPM, outcome-based leadership).
- **Few-shot:** A small store (e.g. JSON or DB) of (resume_excerpt, scores, findings, your_reasoning). We inject 2–5 into the prompt so the model grades like you.
- **RAG (later):** When we have stable URLs/PDFs (e.g. AAMC Core Competencies, LSAC advice, 2–3 recruiter blogs), we embed them and retrieve by “how do med schools evaluate resumes?” at runtime.
- **Feedback:** When you say “that audit was wrong” or “this is a perfect example,” we either append to the rubric, add a few-shot example, or tag for later fine-tuning.

---

## What the LLM Would Account For (Research-Backed)

**Pre-Health (med school–oriented)**  
- AAMC Core Competencies, clinical vs. shadowing, BCPM, research longevity, service to underserved, “elite” GPA floors.  
- Sourced from: AAMC docs, med school admissions blogs, your Medical Fraternity input.

**Pre-Law**  
- GPA/LSAT weight, outcome-based leadership, advocacy, writing rigor, legal internships, professionalism.  
- Sourced from: LSAC, law school admissions guides, your notes.

**Builder (recruiters / companies)**  
- Impact metrics (%, $), tech stack depth, project velocity, leadership density, “culture fit” signals.  
- Sourced from: recruiter surveys, engineering hiring blogs, your experience.

**Cross-cutting**  
- Prestige-neutral (per your AGENTS.md): don’t upweight Ivy League; focus on grit, veracity, impact.  
- International / “Global Grit” where appropriate.

---

## Questions So We Can Build the Right v1

1. **Rubric first or few-shot first?**  
   - **Option A:** I draft one “research-backed rubric” (one file per track: Pre-Health, Pre-Law, Builder) from public info + your SOUL/USER/INFERENCE_STANDARDS; you edit and we put it in the prompt.  
   - **Option B:** You give 2–3 example resumes + “this is what the scores and findings should be and why”; we do few-shot first, then add a short rubric.  
   - Which do you want to prioritize, or both in parallel?

2. **Who provides “what I tell it”?**  
   - Only you (Dilan) for now, or will you have a small group (e.g. Medical Fraternity President, a recruiter) giving feedback? That changes whether we build “edit rubric in repo” vs “feedback form → update rubric/examples.”

3. **Research sources:**  
   - Do you have specific URLs or PDFs you already trust (e.g. AAMC page, LSAC page, one or two recruiter articles)? If you list them, we can structure the rubric (and later RAG) around those first.

4. **Where should the rubric live?**  
   - In the repo (e.g. `projects/meridian/prompts/rubric_pre_health.md`) so you and OpenClaw can edit in place, or in a database/admin UI later?

5. **Feedback loop in v1:**  
   - For the first version, is it enough to “learn” by you editing the rubric and adding few-shot examples by hand (e.g. we add a “Save as example” in the dashboard that appends to a JSON file), or do you want a formal “thumbs down + correct score” flow that auto-suggests rubric changes?

Once you answer these, next step is: **implement the prompt builder that loads rubric + few-shot (+ optional RAG) and wires it into the existing LLM auditor** so the model really is “learning” from your input and from research-backed criteria.
