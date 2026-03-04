# Meridian for Pre-Health · Medical Research Conference Demo

**Audience:** Medical fraternity (e.g. Mu Epsilon Delta) at a medical research conference.  
**Goal:** Show how Meridian helps pre-med students understand and improve their **medical school readiness** in one audit.

---

## What We Show in 30 Seconds

1. **Upload a resume (PDF).** Any pre-med / Pre-Health resume.
2. **Meridian detects Pre-Health** and scores three pillars that matter for admissions:
   - **Smart** — GPA (including BCPM/science GPA at 1.5× when present), honors, research.
   - **Grit** — Leadership, quantifiable impact, work/experience density.
   - **Build** — Clinical hours, shadowing, research density, longitudinal commitment (1yr+ clinical = +25%; 2yr+ lab = +20%).
3. **Evidence-only.** Every finding cites the resume. No invented metrics (Meridian Truth Standard).
4. **Personalized recommendations** so they know exactly what to add (e.g. “Add clinical or shadowing hours with Month YYYY,” “Add BCPM if you have a science GPA”).

---

## Talking Points for the Frat

- **“Credit score for talent.”** Meridian gives a single, evidence-based read on how strong a candidate looks on paper — like a credit score, but for admissions readiness.
- **Pre-Health is first-class.** We built a dedicated Pre-Health track: BCPM weighted 1.5×, clinical and shadowing keywords, research longevity, and a 3.8 GPA “Elite” floor so they know where they stand.
- **Every audit trains the system.** Resumes run through the auditor are automatically added (anonymized) to our training set so the AI keeps getting better at grading like adcoms care about.
- **Zero hallucination.** We only score what’s on the page. If something isn’t there, we don’t claim it — and we tell them what’s missing so they can fix it.

---

## What the Engine Actually Measures (Pre-Health)

| Signal | How it’s used |
|--------|----------------|
| **GPA / BCPM** | Smart score; BCPM blended at 1.5× when present. 3.8+ = Elite status. |
| **Clinical / shadowing / EMT / scribe** | Build score; longitudinal (1yr+) = +25%. |
| **Research** | Smart +25 pts; 2+ years in same lab = Build +20%. |
| **Leadership** | Grit (density × 12). |
| **Quantifiable impact** (% or $) | Grit (count × 15). |
| **Work/experience entries** | Grit (count × 5). |

---

## How to Run the Demo

1. Start API: `cd projects/meridian && python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000` (or use `run_meridian_api.sh`).
2. Start dashboard: `cd projects/meridian/dashboard && npm run dev`.
3. Open dashboard, upload a Pre-Health resume. Point out:
   - **Track: Pre-Health** and the **Medical school readiness** line in the log.
   - **Audit findings** that mention BCPM, clinical, research, Elite floor.
   - **Recommendations** (personalized when LLM is on; otherwise tier-based).

**Optional:** Set `MERIDIAN_USE_LLM=1` and `OPENAI_API_KEY` so recommendations are personalized and the model uses the latest few-shot examples (including any audits from the demo).

---

## One-Liner for the Conference

**“Meridian is a resume auditor that scores pre-meds on what actually matters for medical school — GPA and BCPM, clinical hours, research, and leadership — with evidence-only feedback and no made-up metrics. Every audit you run also helps train the system for future candidates.”**
