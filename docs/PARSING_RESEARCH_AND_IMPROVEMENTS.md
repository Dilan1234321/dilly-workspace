# High-Value ML/AI Parsing & Agentic AI Research — Takeaways for Meridian

Research summary and actionable improvements for Meridian’s resume parser. Goal: reduce the “1–2 resumes that still mess up” by applying ideas from layout-aware parsing, agentic document processing, and validation/self-correction.

---

## 1. Sources (high-value papers/systems)

| Source | Focus | Key claim |
|--------|--------|------------|
| **Alibaba / SmartResume** (Zhu et al., 2024) — *Layout-Aware Parsing Meets Efficient LLMs* | Layout-aware parsing + task decomposition + index-based extraction + post-processing | Layout normalization + parallel task decomposition + **source verification** and **post-processing** raise F1 sharply (e.g. RealResume 0.919→0.959); ~20% of resumes are multi-column; fine-tuned 0.6B can match large LLMs at 3–4× lower latency. |
| **DocETL** (2024) — Agentic query rewriting for document processing | Decompose complex extraction into sub-tasks; agent-guided plan evaluation | **25–80% accuracy gains** over single-pass baselines by rewriting and decomposing tasks; task-specific validation prompts and optimization over execution plans. |
| **MSLEF** (Multi-Segment LLM Ensemble Finetuning) | Segment-specific models + weighted voting | **92.6% F1** vs 90.6% single model; **~21% residual error reduction**; error on unusual layouts drops by >1/3 with segment-aware ensemble. |
| **Self-Refine / Retry patterns** | Iterative refinement with feedback | **FEEDBACK → REFINE** without extra training; validation + retry with evaluation feedback (e.g. re-prompt with “previous attempt failed because …”) improves robustness. |
| **LiLT / SmolDocling** | Layout transformers; universal doc markup | Layout-aware models handle multi-column and visual structure; language-independent layout understanding. |
| **Refuel / industry** | LLM resume parsing + validation | ~95% accuracy with LLMs vs 60–70% rule-based when using **confidence scores** and **validation against guidelines**; feedback on incorrect extractions improves subsequent parsing. |

---

## 2. Takeaways applicable to Meridian

### 2.1 Layout and reading order (Alibaba, LiLT-style)

- **~20% of resumes use non-linear (e.g. multi-column) layouts.** Raw PDF/DOCX text order often breaks “top-to-bottom, left-to-right”; name or education can appear in a sidebar and be missed or misordered.
- **Takeaway:** Add an optional **layout-normalization** step before your existing parser: detect multiple columns (e.g. by horizontal gaps or line lengths), sort blocks top-to-bottom then left-to-right, then concatenate into a single stream. Even a simple heuristic (e.g. “if many lines have similar short length, treat as two columns and interleave by vertical position”) can fix the worst 1–2 edge cases.
- **Where in Meridian:** After `normalize_resume_text()` and before `get_sections()` / `extract_name()` / `extract_major()`, optionally run a “linearize layout” pass that reorders lines by (y, x) if you have coordinates, or by simple heuristics on line lengths and blank gaps.

### 2.2 Task decomposition and parallel extraction (Alibaba, DocETL)

- **Single-pass “extract everything” underperforms.** Decomposing into **separate tasks** (e.g. name/contact, education/major/GPA, experience) with **specialized prompts** improves accuracy; DocETL-style decomposition gives 25–80% gains on complex docs.
- **Takeaway:** Split parsing into **named sub-tasks** (name, major+GPA, education block, normalized text). Run each with a narrow prompt and merge. If you already use an LLM for audit, you can use the same LLM for **parsing** in 2–3 focused calls (name+contact; education+major+GPA; rest for sections) instead of one big “parse this resume” call. Reduces cross-field confusion and improves the “1–2 bad resumes.”
- **Where in Meridian:** Today `resume_parser.py` is rule/heuristic-based. Option A: add an **optional LLM parsing path** (e.g. when `MERIDIAN_USE_LLM=1`) that does 2–3 small extractions (name; major+GPA+education; sections) and falls back to rules on failure. Option B: keep rules but add **section-specific extractors** (e.g. `extract_name_from_top()`, `extract_education_block_only()`) and call them in a fixed order so failures are localized.

### 2.3 Index-based / span-based extraction (Alibaba)

- **Returning pointers (line or span indices) instead of full text** reduces hallucination and drift. LLM outputs “name is in lines 1–2,” then you **re-extract from source**; long descriptions are not rewritten by the model.
- **Takeaway:** If you introduce LLM-based parsing, prefer **span/index output** where possible: e.g. “major is in line range [12, 14]” then slice `lines[12:15]` from the normalized text. Use that for major, degree, and long blocks (education, experience). Only generate free-form text when necessary (e.g. name string).
- **Where in Meridian:** In an LLM parsing path, prompt for “return line numbers or character spans” for education block and major; then `normalized_text.split('\n')[start:end]` (or equivalent) so the final `ParsedResume` always reflects the **exact document text**, not a paraphrase.

### 2.4 Post-processing and source verification (Alibaba)

- **Grounded re-extraction:** Use model output only as **pointers**; re-read text from the document.
- **Source verification:** Discard any extracted entity whose key fields (e.g. name, major) **cannot be found** in the original text (substring or normalized match). This prunes hallucinations.
- **Takeaway:** Add a **verification step** after name and major extraction: if the chosen name string (or its tokens) does not appear in the first N lines of the resume, reject it and try next candidate or filename. Same for major: if the “extracted” major phrase does not appear in the text (or in the education section), flag or fall back to “Unknown” / next heuristic.
- **Where in Meridian:** In `extract_name()` and `extract_major()`, after picking a candidate, check that the candidate string (or a normalized form) appears in `normalized_text` (or in `sections.get("education", "")` for major). If not, skip that candidate and try the next strategy. Cuts the “prediction on” / “well-educated” style errors.

### 2.5 Validation + retry (Self-Refine, Retry patterns, DocETL)

- **Validation:** Run a lightweight validator on parser output (e.g. “name has 2–4 words and no email,” “major is in MAJOR_KEYWORDS or Unknown,” “GPA is a number in [0, 4] or null”).
- **Retry:** If validation fails, re-run extraction with **feedback** in the prompt (e.g. “Previous attempt returned name ‘X’; that failed because it’s a section header. Extract the real candidate name.”) or switch to a different strategy (e.g. filename, or take second-best candidate).
- **Takeaway:** Add a **parse validator** (rules or a tiny LLM call) that checks `ParsedResume` for obvious errors. On failure, either (1) retry with one alternative strategy, or (2) inject feedback and retry once. This directly targets the “1–2 resumes” that fail.
- **Where in Meridian:** New function `validate_parse(parsed: ParsedResume, raw_text: str) -> Tuple[bool, List[str]]` that returns (ok, list of issues). Call it after `parse_resume()`. If not ok, optionally call a **second-pass parser** (e.g. “fix name only” or “fix major only”) with the issue message, or fall back to filename / Unknown for that field.

### 2.6 Segment-aware / section-aware extraction (MSLEF)

- **Different sections benefit from different handling.** Header (name, contact), education (major, GPA, dates), experience, skills each have different structure; ensemble or section-specific logic reduces error on unusual layouts.
- **Takeaway:** You already have `get_sections()`. **Restrict search by section** where possible: e.g. only consider lines from `_top` and first 5 lines for **name**; only search `education` (and maybe `_top`) for **major** and **GPA**. Avoid matching “Biology” from a sentence in Experience; prefer the same string in the Education block. This reduces mis-attribution on the 1–2 odd layouts.
- **Where in Meridian:** In `extract_major()` and GPA extraction, **limit the search to** `sections.get("education", "") + sections.get("_top", "")` (or similar) instead of full `normalized_text`. In `extract_name()`, prefer lines from `_top` only (or first block before EDUCATION). Makes parsing more robust when the same word appears in multiple sections.

### 2.7 Confidence and fallbacks

- **Industry practice:** Attach **confidence scores** to extracted fields; low confidence triggers human review or alternative strategy.
- **Takeaway:** For name and major, compute a simple **confidence** (e.g. name: 1.0 if from first line and passes `_looks_like_name`, 0.7 if from filename, 0.5 if from later line; major: 1.0 if match in MAJOR_KEYWORDS, 0.5 if fuzzy). If confidence &lt; threshold, prefer **filename** for name and **Unknown** for major, or mark for optional LLM second pass.
- **Where in Meridian:** Extend `ParsedResume` with optional `name_confidence` and `major_confidence` (or a small `confidence` dict). Auditor or API can use this to (1) prefer filename when `name_confidence < 0.7`, and (2) log or flag low-confidence parses for review.

### 2.8 Hybrid PDF extraction (Alibaba)

- **Metadata + OCR fusion:** Use PDF text when available; run OCR on **image regions** (e.g. after masking out text bboxes) and fuse. Handles embedded images, non-standard fonts, and custom encodings.
- **Takeaway:** If the 1–2 failing resumes are PDFs with images or odd fonts, add an **OCR fallback**: if extracted text is very short or clearly broken (e.g. all single letters), re-extract the page image(s) with Tesseract or an API and merge with metadata text. Then run the same parser on the merged stream.
- **Where in Meridian:** In the pipeline that calls the parser (e.g. `auditor.py` or the API), before `parse_resume(text)`, check `len(text.strip())` or “ratio of single-letter tokens”; if below a threshold, try OCR and concatenate. Keeps the parser unchanged but fixes “empty or garbage” extractions.

---

## 3. Prioritized action list (to fix “1–2 resumes”)

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 1 | **Source verification** for name and major (reject if not found in text / education section) | Low | High — removes hallucinated names and majors. |
| 2 | **Section-scoped extraction**: major and GPA only from education (and _top); name only from _top / first block | Low | High — avoids picking “Biology” or a header as name. |
| 3 | **Parse validator + one retry** (e.g. validate name/major; on fail, retry with feedback or filename/Unknown) | Medium | High — catches and corrects the tail failures. |
| 4 | **Optional layout linearization** for multi-column (simple heuristic: two-column detection and reorder) | Medium | Medium — fixes order-dependent misses. |
| 5 | **Confidence scores** on name/major and use filename when name confidence low | Low | Medium — better fallbacks and debuggability. |
| 6 | **OCR fallback** when extracted text is too short or clearly broken | Medium | Medium — fixes bad PDFs. |
| 7 | **Optional LLM parsing path** with task decomposition (name; education+major+GPA) and span-based output | High | High — largest gain but more infra. |

**Implemented (in `dilly_core/resume_parser.py`):** (1) **Source verification** — `_name_appears_in_source()` and `_major_appears_in_source()`; every name/major candidate is verified to appear in the document (name in _top zone, major in education when present) before being returned. (2) **Section-scoped extraction** — Name extraction restricted to `sections["_top"]` when available; major from full-text fallback is rejected unless it appears in the education block when one exists. (3) **Parse validator + one retry** — `validate_parse()` checks name (no contact/header words), major (no garbage phrases), GPA range; on failure, one correction round: name → filename when name looks like header and filename given, major → Unknown when major fails heuristic.

---

## 4. References (short)

- Zhu et al., *Layout-Aware Parsing Meets Efficient LLMs: A Unified, Scalable Framework for Resume Information Extraction and Evaluation*, 2024 (Alibaba; layout + task decomposition + verification).
- DocETL: Agentic query rewriting and evaluation for complex document processing, 2024 (decomposition, validation, 25–80% gains).
- MSLEF: Multi-Segment LLM Ensemble Finetuning for resume parsing (92.6% F1; segment-specific models).
- Self-Refine: iterative refinement with self-feedback (no extra training).
- LiLT / SmolDocling: layout transformers and universal document markup.
- Refuel / industry: LLM resume parsing with confidence and validation (~95% accuracy).

---

*Doc created from research across layout-aware parsing, agentic document processing, and validation/retry literature. Apply these takeaways in `dilly_core/resume_parser.py` and the audit pipeline to reduce the remaining 1–2 parsing failures.*
