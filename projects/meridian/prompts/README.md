# Meridian LLM prompts and rubrics

## Rubrics (industry-backed criteria)

- **`rubric_pre_health.md`** — Pre-Health/medical school. Sourced from AAMC Premed Competencies, AAMC Holistic Review (E-A-M), and published admissions criteria from Arizona–Phoenix, Pitt, UNMC, Rowan/CMSRU, Oakland/OUWB, Harvard, Stanford, UCSF, Ohio State, Temple, UCI, and others. Use for scoring and recommendations so the LLM follows what medical schools actually evaluate.
- **`rubric_builder.md`** — Builder/recruiter track. Sourced from SHRM, hiring-manager and recruiter surveys (ResumeTemplates, Jobseeker, Jobscan), and quantifiable-achievement research. Use so the LLM follows what employers and recruiters prioritize (communication, professionalism, impact metrics, experience fit).

To use rubrics in the LLM: load the appropriate rubric (by detected track) into the system prompt so the model grades against industry standards, not opinion. (Wiring is in `meridian_core/llm_auditor.py` when implemented.)

---

## Few-shot training (training_data.json)

Your resumes are used to **train** the LLM by turning them into **few-shot examples**: the model sees 2–4 example (resume → scores + findings) and grades new resumes in the same style.

## 1. Put your resumes in one folder

- Default: **`assets/resumes/`** (workspace root).
- Or set **`RESUME_DIR`** to any folder.
- **Supported:** `.pdf` and `.docx`. For image-based or blurry PDFs, OCR is used automatically when native text is too short (requires optional deps below).

## 2. Generate training data (run once, or when you add resumes)

From the **workspace root** (with venv activated):

```bash
pip install -r projects/meridian/scripts/requirements-build.txt   # pypdf + python-docx (required)
python -m projects.meridian.scripts.build_training_data
```

- Runs the **rule-based** Meridian auditor on every **PDF and DOCX** in `RESUME_DIR`.
- Saves **`projects/meridian/prompts/training_data.json`** with resume excerpts and scores/findings.
- **DOCX:** requires `python-docx`. **Image/blurry PDFs:** when pypdf returns &lt; 100 chars, the script tries OCR if `pdf2image` and `pytesseract` are installed (and system has **poppler**, **tesseract** — e.g. `brew install poppler tesseract`).

Optional env vars:

- `RESUME_DIR` — folder of PDFs/DOCX (default: `assets/resumes`).
- `MERIDIAN_TRAINING_DATA` — output path (default: `projects/meridian/prompts/training_data.json`).
- `MERIDIAN_EXCERPT_CHARS` — max chars per resume in the file (default: 2400).
- `MERIDIAN_PDF_OCR_THRESHOLD` — try OCR when pypdf returns fewer than this many chars (default: 100).

## 3. Use the LLM with training enabled

- Set **`MERIDIAN_USE_LLM=1`** and **`OPENAI_API_KEY`** so the API uses the LLM.
- The LLM auditor **automatically** loads `training_data.json` and injects **3 examples** (by default) into the prompt so it grades like your rule-based system.

Optional:

- `MERIDIAN_FEW_SHOT=0` — turn off few-shot (no examples).
- `MERIDIAN_FEW_SHOT_N=4` — use 4 examples instead of 3.
- `MERIDIAN_TRAINING_DATA` — path to a different training JSON.

## Summary

| Step | What to do |
|------|------------|
| 1 | Put PDFs and/or DOCX in `assets/resumes/` or set `RESUME_DIR`. |
| 2 | `pip install -r projects/meridian/scripts/requirements-build.txt` then run `python -m projects.meridian.scripts.build_training_data`. |
| 3 | Set `MERIDIAN_USE_LLM=1` and `OPENAI_API_KEY`; restart API. |

The LLM will then be “trained” on your resumes via few-shot examples. To retrain after adding or changing resumes, run step 2 again.
