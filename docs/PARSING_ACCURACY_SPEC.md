# Parsing Accuracy Spec

**Purpose:** Define what “100% accurate” means for a parsed resume. Every parser fix and regression test is checked against this spec.

**Canonical source:** `projects/meridian/docs/ROADMAP.md` (parsing is a cross-cutting concern across phases).

---

## Criteria

| Field / area | Criterion | Pass condition |
|--------------|-----------|----------------|
| **Name** | Matches the candidate’s real name. | No section header or label as name; no “Unknown” when the name is clearly on the doc; no garbage (e.g. “prediction on”, “well-educated”). Name line may be normalized (e.g. “De Loe” → “DeLoe”). |
| **Email** | At least one email extracted and present. | Email appears in `[CONTACT]` or top; matches the document. Spaced/glued emails (e.g. “user @ domain . com”) normalized to a valid address for filename/key. |
| **Major** | Matches degree/major on the document when present. | Parser’s `major` matches what’s in the education section; “Unknown” only when truly absent or unreadable. No wrong major (e.g. from another section). |
| **GPA** | If present on doc, extracted and in valid range. | Numeric GPA in plausible range (e.g. 2.0–4.0 for 4.0 scale); otherwise null when not on doc. Not invented. |
| **Section boundaries** | Sections align with the document. | No section header used as body content; no content under the wrong section; EDUCATION, EXPERIENCE, etc. match doc structure. |
| **Section content** | No dropped or invented content. | No dropped lines; no invented text (MTS). Reflow (e.g. one-word-per-line merged) may change layout but must not change meaning. |
| **Contact** | Phone, email, location, LinkedIn in one place. | All contact info from the doc present in contact/top; promoted from elsewhere when they appeared at end or in wrong section. |
| **Education block** | University, major(s), minor(s), date, honors, GPA correct. | Correctly parsed and labeled; no glued words (e.g. TheUniversityofTampa → The University of Tampa). |

---

## How to run the audit

From your **workspace root** (the folder that contains `assets/resumes` and `projects/meridian`).

**Option A — Use a virtual environment (recommended on macOS/Homebrew):**

```bash
# One-time: create and activate a venv
python3 -m venv .venv
source .venv/bin/activate   # on Windows: .venv\Scripts\activate

# Install deps into the venv
pip install -r projects/meridian/api/requirements.txt

# Run the audit
python projects/meridian/scripts/parsing_audit.py --sources assets/resumes --out docs/parsing_audit_report.md
```

**Option B — If you already have a venv** (e.g. for the API):

```bash
source .venv/bin/activate   # or wherever your venv lives
pip install -r projects/meridian/api/requirements.txt
python projects/meridian/scripts/parsing_audit.py --sources assets/resumes --out docs/parsing_audit_report.md
```

If every row shows "Extraction failed", ensure the script is run with the **activated venv** (so `pypdf` and `docx2txt` are available) and that `assets/resumes` is readable.

## Audit process

1. **Run parsing audit script** on all source resumes (`assets/resumes/*.pdf`, `*.docx`).
2. **Compare** parsed output to the source document for each criterion.
3. **Record** PASS / FAIL / REVIEW per file and per criterion in `parsing_audit_report.md`.
4. **Summarize** by error type (name, email, major, GPA, sections, content, contact, education) to prioritize fixes.
5. **Fix** in priority order; re-run audit until all files pass.

---

## Regression

After the audit is green:

- Freeze parser/structured-resume behavior for a release (or document the “mastered” version).
- Add a regression set: a small set of source resumes + expected key fields (name, email, major) or expected parsed outputs. Run parser on the set in CI/pre-commit and diff or assert so future changes don’t break accuracy.

**Implemented:**

- **Regression set:** `projects/meridian/scripts/fixtures/parsing_regression_expected.json` — expected name, email, major, GPA for 10 resumes (PDF/DOCX). Update when parser output is intentionally changed.
- **Runner:** `projects/meridian/scripts/parsing_regression.py` — runs the parser on each fixture, compares to expected, exits 0 only if all pass.

**Run (from workspace root, with venv activated):**

```bash
python projects/meridian/scripts/parsing_regression.py --sources assets/resumes
```

**CI / pre-commit:** Run the same command as a gate; exit code 1 on any mismatch. Example (GitHub Actions):

```yaml
- name: Parsing regression
  run: python projects/meridian/scripts/parsing_regression.py --sources assets/resumes
```
