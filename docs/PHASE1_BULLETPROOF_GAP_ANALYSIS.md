# Phase 1 "Bulletproof" Auditor — Gap Analysis

**Context:** Advisor-mandated roadmap: Evidence Trail, Anomaly Detection, Peer Benchmarking. This doc answers: *Where are we now, and how far from shipping each of the three?*

---

## 1. Evidence Trail — "Click radar section → show exact quotes that generated the score"

### Current state

| Layer | Status | Detail |
|-------|--------|--------|
| **Backend evidence** | ✅ Exists | `AuditorResult` has `evidence_smart`, `evidence_grit` (lists of strings). Rule-based scoring in `dilly_core/scoring.py` already returns `(score, evidence_list)` per dimension. LLM auditor returns narrative evidence for all three (smart, grit, build). |
| **API** | ✅ Returns it | `/audit/v2` builds `evidence: { smart, grit, build }` from `result.evidence_smart` / `evidence_grit` and returns in `AuditResponseV2`. Build is currently generic: `"Track: X. See audit findings."` — rule-based path has no structured build evidence; LLM has it in JSON but `AuditorResult` has no `evidence_build` field so it isn’t passed through. |
| **UI** | ⚠️ Partial | Evidence is shown in a separate **Evidence** block (smart / grit / build as key–value). **Not** tied to the radar: no click-on-dimension → show that dimension’s evidence. Radar has only a hover tooltip (score value). |

### Gaps to close

1. **UI: Tie evidence to radar**
   - Make radar sections **clickable** (or add a dimension selector: Smart / Grit / Build).
   - On click/select: show that dimension’s evidence in a focused panel (e.g. “Grit: 95 → Found: 3 years concurrent EMT + full-time student”).
   - Optional: highlight the selected dimension on the chart.

2. **Backend (optional): Richer evidence**
   - Add `evidence_build` to `AuditorResult` and populate from LLM in `llm_auditor._to_auditor_result`; use it in the API instead of the generic build line.
   - Rule-based build evidence: either add a small evidence list from track audit in `auditor.py` or keep “See audit findings” and rely on audit_findings for build.

3. **“Exact quotes”**
   - Today evidence is **formulaic** (rule-based) or **narrative** (LLM). Neither is “exact resume quotes” by default.
   - To get literal quotes: either (a) ask the LLM to include short quoted snippets in `evidence_smart` / `evidence_grit` / `evidence_build`, or (b) add a separate parser/LLM step that extracts supporting quotes per dimension and attach to evidence. Not required for “evidence trail” to work; it’s an enhancement.

### Distance

**Close.** Data exists end-to-end; UX gap is “click radar → show this dimension’s evidence.” Backend can stay as-is for v1; adding `evidence_build` and (optionally) quote-level evidence is a small follow-up.

---

## 2. Anomaly Detection — "Red flag" (e.g. 4.0 GPA + Build 0 → High-Risk/Low-Velocity)

### Current state

| Layer | Status | Detail |
|-------|--------|--------|
| **Inputs** | ✅ Available | `parse_resume()` returns `gpa` (float or None). `/audit/v2` has `gpa`, `scores.smart`, `scores.grit`, `scores.build` in the same request. So we have GPA and Build (and Smart) in one place. |
| **Logic** | ❌ None | No red-flag or anomaly logic anywhere in the codebase. |
| **Schema** | ❌ None | No `red_flags`, `anomalies`, or `risk_notes` in `AuditResponseV2`. |
| **UI** | ❌ None | No place to show flags. |

### Gaps to close

1. **Define rules** (product/advisor)
   - Example: `(gpa >= 3.8 or smart >= 90) and build <= 10` → “High-Risk / Low-Velocity: strong academics, minimal track-specific proof.”
   - Optional: more rules (e.g. grit 0 + smart high, or track mismatch). Keep rules in one place (e.g. `dilly_core/anomaly.py` or a small block in `auditor.py`).

2. **Backend**
   - Add a small function: `get_red_flags(gpa, scores, track) -> List[str]`.
   - Add `red_flags: List[str]` to `AuditResponseV2` and populate in `/audit/v2`.

3. **UI**
   - If `red_flags.length > 0`, show a “Red flags” or “Anomalies” section (e.g. amber/red card with the strings).

### Distance

**Short.** All inputs exist; no refactor. Add one small module + one response field + one UI block. Estimate: 1–2 days for a first version.

---

## 3. Peer Benchmarking — "Top 5% Grit for UTampa Pre-Med" vs 22-student Gold Standard

### Current state

| Layer | Status | Detail |
|-------|--------|--------|
| **Cohort DB** | ❌ Removed | Beta cohort / `beta_cohort_db.json` and `get_cohort_percentile` were removed. Comments: “Meridian uses only few-shot from prompts/training_data.json.” So there is **no** live cohort used for percentiles in the API. |
| **Gold-standard data** | ✅ Exists | `prompts/training_data.json` has **one example per resume (latest audit only; 28 unique resumes after dedup). Each** with `smart_score`, `grit_score`, `build_score`, `track`, `major`, `candidate_name`. Tracks: Pre-Health (19), Tech (29), Science (15), Business (15), etc. So we have a scored cohort; it’s just not used for benchmarking. |
| **API** | ❌ No percentile | `/audit/v2` does not compute or return percentiles. No `percentile_smart`, `percentile_grit`, `percentile_build`, or “Top X%” copy. |
| **UI** | ❌ None | No peer comparison or percentile display. |

### Gaps to close

1. **Cohort for benchmarking**
   - **Option A:** Use `training_data.json` as the benchmark cohort (one example per resume, latest audit). Load at startup or on first request; compute percentiles within `track` (and optionally within `major` or “Pre-Health UTampa”) so we don’t mix tracks.
   - **Option B:** Reintroduce a dedicated cohort file (e.g. `cohort_benchmark.json`) with pre-scored candidates; same percentile logic.
   - Prefer one source of truth so “22-student Gold Standard” and code stay aligned (e.g. filter to 22 if advisor wants that subset, or use all 82 and label as “UTampa cohort”).

2. **Percentile computation**
   - For a newly audited candidate with `(track, smart, grit, build)`:
     - Filter cohort by `track` (and optionally major/school).
     - For each dimension, compute percentile (e.g. % of cohort with score ≤ this candidate’s).
     - Return e.g. `percentile_smart`, `percentile_grit`, `percentile_build` (0–100) and/or human string: “Top 5% Grit for Pre-Health candidates.”

3. **Schema**
   - Add to `AuditResponseV2`: e.g. `percentiles: Dict[str, float]` and/or `benchmark_copy: Dict[str, str]` (“You are in the top 5% of Grit for UTampa Pre-Med candidates.”).

4. **UI**
   - Show percentile or benchmark copy next to each dimension (or in a “vs cohort” section).

### Distance

**Medium.** Data is there (one example per resume in training_data, 28 resumes); no current code path uses it for percentiles. Work: load cohort, implement percentile-by-track (and optional filters), add response fields and UI. Estimate: 2–4 days for a clean first version.

---

## Summary Table

| Feature | Backend | API | UI | Distance |
|---------|---------|-----|-----|----------|
| **1. Evidence trail** | Evidence exists; optional: `evidence_build` + quotes | Already returns evidence | Need click radar → show dimension evidence | **Close** |
| **2. Anomaly detection** | No logic | No field | No block | **Short** (add module + field + block) |
| **3. Peer benchmarking** | Cohort data in training_data; no percentile code | No percentile | No display | **Medium** (cohort + percentile + response + UI) |

---

## Suggested build order

1. **Evidence trail (UI)** — Smallest change, high impact: clickable radar (or selector) + “evidence for this dimension” panel. Gets you to “click section → see why” without backend changes.
2. **Anomaly detection** — Small, self-contained: one function, one response field, one UI card.
3. **Peer benchmarking** — Use `training_data.json` as cohort; add percentile-by-track and optional “Top X%” copy; then API + UI.

After that you can refine: `evidence_build` and exact quotes (Evidence), more anomaly rules, and cohort filtering (e.g. “22 Pre-Med only”) for benchmarking.
