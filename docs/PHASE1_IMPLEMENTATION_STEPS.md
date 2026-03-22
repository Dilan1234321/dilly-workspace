# Phase 1 Implementation Steps

Concrete checklist to ship the three Phase 1 features from [PHASE1_BULLETPROOF_GAP_ANALYSIS.md](./PHASE1_BULLETPROOF_GAP_ANALYSIS.md). Do **1 → 2 → 3**; within each feature, follow the step numbers. Each feature is shippable on its own once its steps are done.

---

## 1. Evidence trail (UI)

**Goal:** Click a radar dimension → see the evidence that generated that score.

| Step | Task |
|------|------|
| **1.1** | In the dashboard (`projects/meridian/dashboard/src/app/page.tsx`), add state for "selected dimension": `null \| "smart" \| "grit" \| "build"`. |
| **1.2** | Make radar sections clickable: use Recharts `onClick` on `Radar`, or add three buttons/pills above the chart (Smart \| Grit \| Build) and set selected dimension on click. |
| **1.3** | When a dimension is selected, show that dimension's evidence in a focused panel (e.g. "Why Grit: 95" with `audit.evidence.grit`). If none selected, show "Click a dimension to see evidence" or keep the current Evidence block. |
| **1.4** | (Optional) Visually highlight the selected dimension on the radar (e.g. different opacity or stroke for the selected axis). |
| **1.5** | (Optional, backend) Add `evidence_build` to `AuditorResult` in `dilly_core/auditor.py`; in `llm_auditor._to_auditor_result` pass through parsed `evidence_build`; in API use it for `evidence.build` instead of "Track: X. See audit findings." |

---

## 2. Anomaly detection (red flags)

**Goal:** Flag contradictions (e.g. 4.0 GPA + Build 0 → "High-Risk / Low-Velocity").

| Step | Task |
|------|------|
| **2.1** | Define rules (with advisor): e.g. `(gpa >= 3.8 or smart >= 90) and build <= 10` → "High-Risk / Low-Velocity: strong academics, minimal track-specific proof." Keep rules in one place (e.g. `dilly_core/anomaly.py` or a block in `auditor.py`). |
| **2.2** | Implement `get_red_flags(gpa: float \| None, scores: dict, track: str) -> List[str]` returning human-readable flag strings. |
| **2.3** | Add `red_flags: List[str]` to `AuditResponseV2` in `projects/meridian/api/schemas.py`. |
| **2.4** | In `/audit/v2` in `api/main.py`: call `get_red_flags(parsed.gpa, scores, result.track)` and set `red_flags` on the response. |
| **2.5** | In the dashboard: if `audit.red_flags?.length > 0`, render a "Red flags" or "Anomalies" section (amber/red card listing the strings). |

---

## 3. Peer benchmarking (percentiles vs cohort)

**Goal:** Show "Top 5% Grit for Pre-Health candidates" (or similar) using `training_data.json` as the cohort.

| Step | Task |
|------|------|
| **3.1** | Add a cohort loader: load `training_data.json` (or env path) and expose a list of scored examples (one per resume). Cache in memory at API startup or on first request. |
| **3.2** | Implement percentile-by-track: given `(track, smart, grit, build)`, filter cohort by `track`, then for each dimension compute percentile (e.g. % of cohort with score ≤ candidate's). Helper: `compute_percentiles(track, smart, grit, build, cohort) -> { smart, grit, build }` (0–100). |
| **3.3** | (Optional) Build human copy from percentiles: e.g. "Top 5% Grit for Pre-Health candidates." |
| **3.4** | Add to `AuditResponseV2`: `percentiles: Dict[str, float]` and optionally `benchmark_copy: Dict[str, str]`. |
| **3.5** | In `/audit/v2`: after computing scores, call the percentile helper with `result.track` and scores; attach `percentiles` (and optional copy) to the response. |
| **3.6** | In the dashboard: show percentiles or benchmark copy next to each dimension (e.g. under the radar or in a "vs cohort" section). |

---

## Order and dependencies

- **Build order:** 1 → 2 → 3 (Evidence trail first, then Anomaly, then Peer benchmarking).
- No dependency between 1 and 2. Feature 3 uses the same API response shape; add fields in 3.4 and 3.5 without breaking 1 or 2.
