# Meridian Core — Ground Truth V6.5 & Vantage Alpha

Canonical scoring and track logic for the Meridian Auditor. **Zero hallucination:** only evidence present in the resume affects scores.

## Layout

- **`resume_parser.py`** — **Unified resume parser:** layout-agnostic extraction for all formats. Normalizes PDF text, detects sections, extracts name (multi-strategy + filename fallback), major (education block + keyword scan), and GPA. Use `parse_resume(raw_text, filename?)` → `ParsedResume`. Handles messy layouts (e.g. Vir Shah, Resume.pdf).
- **`scoring.py`** — Rule-based: major multipliers, Smart/Grit/Build formulas, International multiplier, signal extraction.
- **`tracks.py`** — Vantage Alpha rules: Pre-Health, Pre-Law, Builder.
- **`auditor.py`** — Rule-based pipeline: `run_audit(...)` → `AuditorResult`. Name/major use parser when not provided.
- **`llm_auditor.py`** — **LLM-based pipeline:** `run_audit_llm(...)` → same `AuditorResult`. Uses OpenAI-compatible API; MTS enforced via prompt (evidence-only). Set `MERIDIAN_USE_LLM=1` and `OPENAI_API_KEY` to use.

## Usage (rule-based)

```python
from meridian_core.auditor import run_audit

result = run_audit(
    pdf_extracted_text,
    candidate_name="Jane Doe",
    major="Data Science",
    gpa=3.9,  # optional
)
```

## Usage (LLM)

```python
from meridian_core.llm_auditor import run_audit_llm

# Requires OPENAI_API_KEY (and optionally MERIDIAN_LLM_MODEL, OPENAI_BASE_URL)
result = run_audit_llm(
    pdf_extracted_text,
    candidate_name="Jane Doe",
    major="Data Science",
    fallback_to_rules=True,  # use rule-based if LLM fails
)
```

## API

- **POST /audit/v2** — PDF or DOCX upload → audit → `AuditResponseV2`. If `MERIDIAN_USE_LLM=1` and `OPENAI_API_KEY` is set, uses LLM; else rule-based.

## Dashboard

- **Next.js** app in `projects/meridian/dashboard`: Premium Medical dark theme, PDF upload, Radar chart (Smart/Grit/Build), Audit Findings feed. Uses `/audit/v2`.
