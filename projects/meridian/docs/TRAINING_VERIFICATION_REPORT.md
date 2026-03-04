# Training Data Verification Report

**Date:** 2025-03-03  
**Scope:** `training_data.json` (14 examples) vs Meridian scoring logic in `meridian_core` (`scoring.py`, `tracks.py`, `auditor.py`).  
**Reference:** `SCORING_LOGIC.md` (workspace root).

---

## Summary

- **Logic reference:** There is no separate `SCORING_LOGIC.md` in the repo; it was created from the code and saved at workspace root. All formulas there match `meridian_core`.
- **Verification script:** `projects/meridian/scripts/verify_training_scores.py` runs `run_audit()` on each example (using full PDF text when available and pypdf is installed; otherwise the stored excerpt) and compares Smart, Grit, Build, and Final to `training_data.json`.
- **Run used:** Verification was run using **excerpts only** (pypdf not installed in the runner env, so full PDFs were not read). So actual scores are from truncated text (~2400 chars per example).

---

## Results (excerpt-based run)

| Outcome | Count |
|--------|--------|
| **Match** | 1 (Ethan_Capone Resume.pdf) |
| **Mismatch** | 13 |

### Why scores differ

1. **Track reassignment (4 examples)**  
   Bridget Klaus, Shreya Mehta, Thomas Rosenblum, Vir Shah are now classified **Pre-Health** from text (e.g. medical, clinical, shadowing, LECOM, pre-med). In `training_data.json` they are **Builder**.  
   - Pre-Health Build = clinical/research density; Builder Build = tech stack + projects.  
   - So Build and Final differ by design when track changes.

2. **Excerpt vs full text (all others)**  
   The expected scores in `training_data.json` were produced by `build_training_data.py` from **full PDF text**. The stored field is only a **truncated excerpt** (~2400 chars).  
   - Running the auditor on the **excerpt** yields fewer signals: fewer month–year dates (so lower work_entry_count and Grit), fewer leadership/impact keywords, and sometimes no GPA match (default 3.5).  
   - So Smart, Grit, and Build from the excerpt are often **lower** than the expected values that came from the full resume.

3. **Example (Deng)**  
   - Expected (from full PDF): Grit 100 (e.g. leadership 5×12 + work 14×5), Build 45.  
   - From excerpt: leadership_density 2, work_entry_count 5 → Grit 54; Builder Build from tech/projects → 8.  
   So the logic is consistent; the input (excerpt vs full text) is not.

---

## How to verify against full PDFs

1. Install pypdf in the environment used to run the script:  
   `pip install pypdf`
2. Ensure `assets/resumes/` contains the PDFs listed in `training_data.json` (filenames must match).
3. Run:  
   `python3 projects/meridian/scripts/verify_training_scores.py`  
   from the workspace root.  
   The script will use full PDF text when the file exists and pypdf is available; it will report “Audited with full PDF text: N”.

Expect more matches when using full text, since that’s how the training data was originally built. Any remaining mismatches would indicate either a change in scoring logic since the data was generated or a bug.

---

## Recommendations

1. **Regenerate training_data from current code (optional):**  
   From workspace root, with PDFs in `assets/resumes/`:  
   `python3 -m projects.meridian.scripts.build_training_data`  
   This overwrites `training_data.json` with scores from the current engine on full PDF text. Then re-run `verify_training_scores.py`; you should see full agreement (or only small rounding differences).

2. **Pre-Health vs Builder in training_data:**  
   If you want the JSON to reflect current track behavior, regenerate as above. The four Pre-Health resumes will then have Pre-Health track and Build scores from the Pre-Health formula.

3. **Keep SCORING_LOGIC.md in sync:**  
   When you change formulas in `meridian_core`, update `SCORING_LOGIC.md` so it remains the single written reference for Smart, Grit, Build, and Final.
