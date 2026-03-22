# Scoring Improvement Proposal — Powerful, Impressive, High-Impact

**Purpose:** Concrete changes to Smart, Grit, and Build scoring that are **powerful** (differentiate meaningfully), **impressive** (sound sophisticated when explained), and **high-impact** (students and recruiters notice). Every change is implementable with zero hallucination.

**Reference:** Current logic in `dilly_core/scoring.py`, `SCORING_LOGIC.md`.

---

## 1. Grit: Impact Magnitude (Highest Impact)

**Current:** Every `\d+%` or `$\d+` counts as 1. "Increased revenue 5%" = "Increased revenue 50%" = 15 pts.

**Problem:** Recruiters care about magnitude. A 50% improvement is a different signal than 5%.

**Proposed:** Weight impact by magnitude.

| Signal | Magnitude | Weight | Example |
|--------|-----------|--------|---------|
| % | 1–9% | 0.5× | "increased by 5%" |
| % | 10–24% | 1.0× | "increased by 15%" |
| % | 25–49% | 1.5× | "increased by 35%" |
| % | 50–99% | 2.0× | "increased by 75%" |
| % | 100%+ | 2.5× | "doubled", "tripled" |
| $ | Any | 1.0× | "$500" |

**Formula:** `impact_pts = sum(weight_per_marker) × 15` (cap per-marker at 2.5×).

**Extraction:** Parse `\d+%` and `$\d+` as now; extract numeric value. For "doubled", "tripled", "2x" → treat as 100%, 200%.

**Why it's impressive:** "We don't just count bullets. We weight impact by magnitude — a 50% improvement counts more than 5%. That's what recruiters actually care about."

---

## 2. Grit: Leadership Hierarchy

**Current:** 1 keyword = 1. "President" = "Member" = 12 pts.

**Problem:** "Member of 5 clubs" can beat "Founded 1 company."

**Proposed:** Leadership tier weights.

| Tier | Keywords | Weight | Pts per hit |
|------|----------|--------|-------------|
| Founder | founder, founder & | 2.0 | 24 |
| Executive | president, executive, director, chair, vp, vice president | 1.5 | 18 |
| Lead | lead, manager, captain | 1.0 | 12 |
| Representative | representative | 0.5 | 6 |

**Formula:** `lead_pts = sum(weight × 12)` per hit.

**Extraction:** Same regex; add tier lookup. `leadership_density` becomes `leadership_weighted_sum` (float).

**Why it's impressive:** "We tier leadership — Founder and President matter more than generic membership. We reward ownership, not just participation."

---

## 3. Grit: Tenure / Persistence

**Current:** Work entry count = month–year matches. "Jan 2024 – Dec 2024" = 1. "Jan 2022 – Jan 2025" = 1.

**Problem:** Duration doesn't matter. 6 months vs 2 years in a role is invisible.

**Proposed:** Add tenure density.

- **Extraction:** Parse date ranges (e.g. `Jan 2022 – Jan 2025` → 36 months). Sum total months across roles. If "Present" or "Current", use graduation date or today.
- **Formula:** `tenure_pts = min(20, total_months / 6)` × 2 (or similar). Cap at 20 pts.
- **Example:** 24 months total → 8 pts. 60 months → 20 pts (cap).

**Why it's impressive:** "We reward persistence — we look at how long you stuck with things. Tenure is a grit signal."

---

## 4. Grit: Diminishing Returns (Anti-Gaming)

**Current:** 10 impact bullets = 150 pts. Linear.

**Problem:** 10 weak bullets can beat 3 strong ones.

**Proposed:** Apply sqrt to impact count (or weighted sum): `impact_pts = sqrt(impact_weighted_sum) × 15`.

- **Alternative:** Cap impact at 6–8 bullets; beyond that, add 0.5× per extra.
- **Example:** 4 impacts → 4 × 15 = 60. 10 impacts → sqrt(10) × 15 ≈ 47. (Stronger signals get more weight; weak ones don't inflate.)

**Trade-off:** Diminishing returns can feel punitive to students with many bullets. Consider: **magnitude-weighted** already differentiates; diminishing returns may be overkill. **Recommend:** Implement magnitude first; add diminishing returns only if gaming persists.

---

## 5. Smart: Honors Tiering

**Current:** 1 keyword = 10 pts. "Dean's List" = "Summa Cum Laude" = 10.

**Problem:** Summa and Dean's List are different signals.

**Proposed:** Honors tier weights.

| Tier | Keywords | Pts per hit |
|------|----------|-------------|
| Latin | summa, magna, cum laude | 15 |
| Dean's | dean's list, dean’s list | 8 |
| Scholarship | scholarship, honors (program) | 5 |

**Formula:** `honors_pts = sum(tier_pts)`; cap at 30.

**Extraction:** Same keywords; add tier lookup. `honors_count` → `honors_by_tier: {latin: int, deans: int, scholarship: int}` or `honors_weighted_sum`.

**Why it's impressive:** "Honors are tiered — Summa and Magna matter more than generic Dean's List. We reward academic distinction."

---

## 6. Smart: Research Depth

**Current:** 0 or 25. Binary.

**Problem:** "1 semester in a lab" = "2 years, 2 publications."

**Proposed:** Research depth tiers.

| Signal | Bonus |
|--------|-------|
| Has research (keyword) | +15 base |
| + Publication(s) | +5 |
| + 2+ years | +5 |
| + First-author | +5 |

**Formula:** `research_pts = 15 + publication_bonus + longevity_bonus + authorship_bonus`; cap at 25.

**Extraction:** 
- `publication` | `published` | `paper` | `journal` → +5
- `research_longevity_years >= 2` → +5
- `first author` | `first-authored` → +5

**Why it's impressive:** "We don't just check for research. We weight by publications, duration, and authorship."

---

## 7. Build (Tech): Outcome Quality Tiers

**Current:** Outcome-tied tech hit = 1. "Deployed to production" = "Improved by 5%."

**Proposed:** Outcome quality multiplier.

| Outcome Quality | Keywords | Multiplier |
|----------------|----------|------------|
| Production | deployed, production, shipped, live, launched | 1.5× |
| Strong metric | 50%+, $10k+, users, latency | 1.25× |
| Standard | any %, $, metric | 1.0× |

**Formula:** Per outcome-tied bullet, apply multiplier. Sum weighted hits.

**Extraction:** In `get_tech_outcome_tied_signals`, check bullet for production keywords. If present, count hit as 1.5×. If strong metric (50%+, 5+ digits $), 1.25×.

**Why it's impressive:** "We weight production outcomes — deployed apps and shipped features count more than toy projects."

---

## 8. Build (Tech): Recency Bonus

**Current:** No recency.

**Proposed:** +5–10 pts if most recent project/role is within last 2 years (from graduation or today).

**Extraction:** Parse `graduation` or `expected`; compare project dates. If latest project ≥ 2023 (or within 24 months of graduation), +5 pts.

**Why it's impressive:** "We weight recency — recent projects show your skills are current."

---

## 9. Cross-Cutting: Evidence Strength (Optional)

**Idea:** Each score could have a "confidence" component: how much evidence supported it?

- "Grit 85 (high confidence)" — 5+ impact bullets, 2+ leadership titles
- "Grit 85 (low confidence)" — 1 impact, 1 leadership

**Use:** Recruiters could filter by confidence. Students see "Add 2 more quantifiable bullets to improve confidence."

**Implementation:** Compute `evidence_count` per dimension; map to "high" / "medium" / "low". Display in UI.

---

## 10. Implementation Priority

| Priority | Change | Effort | Impact | Framing |
|----------|--------|--------|--------|---------|
| 1 | 1. Impact Magnitude | Medium | Very High | "We weight impact by magnitude" |
| 2 | 2. Leadership Hierarchy | Low | High | "We tier leadership" |
| 3 | 5. Honors Tiering | Low | Medium | "Honors are tiered" |
| 4 | 6. Research Depth | Medium | Medium (Pre-Health) | "Research depth" |
| 5 | 6. Tenure Persistence | Medium | Medium | "We reward persistence" |
| 6 | 7. Outcome Quality (Build) | Medium | Medium (Tech) | "Production outcomes" |
| 7 | 8. Recency (Build) | Low | Low | "Recent projects" |

---

## 11. Summary: One-Line Framing

**"Our scoring is built from validated predictors of early-career success: we weight impact by magnitude, tier leadership by ownership level, reward persistence and tenure, and require outcome-tied evidence for skills. Every point is explained. No black box. No school prestige bias."**

---

## 12. Research References (for credibility)

- **Impact magnitude:** Schmidt & Hunter meta-analyses; work-sample validity; structured assessment research.
- **Leadership hierarchy:** Common recruiter practice; "Founder" vs "Member" in hiring manager surveys.
- **GPA/major:** Already in MAJOR_MULTIPLIERS_RESEARCH.md.
- **Tenure:** Job tenure predictors of performance (e.g. Ng & Feldman, 2010).
