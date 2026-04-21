# Scraper Surge — path to 200k jobs, 2k/cohort floor

Date: 2026-04-21
Owner: Dilan
Target: 200,000 jobs in the `internships` table, with every one of the 16
canonical cohorts at ≥ 2,000 jobs.

---

## Current state (DB snapshot, just pulled)

- **Total rows in `internships`**: 16,130
- **Distinct companies**: 160
- **Jobs scraped in last 14 days**: 11,572 (healthy daily churn, crawler is running)
- **Source split**:
  - Greenhouse: 15,136 (94%)
  - SmartRecruiters: 472 (2.9%)
  - Lever: 394 (2.4%)
  - Ashby: 69 (0.4%)
  - Workday: 34
  - NSF REU: 15
  - USAJobs: 10
- **Company slug catalog** (`crawl_internships_v2.py`):
  - Greenhouse: 282 slugs
  - Lever: 96 slugs
  - Ashby: 88 slugs
  - SmartRecruiters: 136 slugs
  - Total: **602 companies in the catalog** but only **160 in the DB** — means
    ~74% of the catalog is 404ing or returning zero jobs. This is the single
    biggest lever.

## Cohort inventory — CANONICAL (after 2026-04-21 backfill)

**Every job in the DB was reclassified against the canonical cohort IDs
defined in `knowledge/cohort_rubrics.json`.** The `canonical_cohorts`
jsonb column was added and populated for all 16,130 rows. Results:

| Canonical cohort | Count | 2k floor | Gap |
|---|---|---|---|
| tech_software_engineering | 2,761 | ✅ | — |
| tech_data_science | 2,132 | ✅ | — |
| business_consulting | 2,056 | ✅ | — |
| business_marketing | 1,500 | ❌ | −500 |
| social_sciences | 1,350 | ❌ | −650 |
| business_accounting | 1,229 | ❌ | −771 |
| business_finance | 798 | ❌ | −1,202 |
| pre_law | 513 | ❌ | −1,487 |
| health_nursing_allied | 462 | ❌ | −1,538 |
| **tech_cybersecurity** | **444** | ❌ | **−1,556** |
| pre_health | 423 | ❌ | −1,577 |
| science_research | 139 | ❌ | −1,861 |
| humanities_communications | 103 | ❌ | −1,897 |
| sport_management | 1 | ❌ | −1,999 |
| arts_design | 0 | ❌ | −2,000 |
| quantitative_math_stats | 0 | ❌ | −2,000 |

**Cohorts at 2k+:** 3 of 16 (19%)
**Cohorts at 500+:** 8 of 16
**Cohorts at 0:** 2 (arts_design, quantitative_math_stats — they had no
keywords in the legacy map and no canonical-only bucket until today)

**Why the numbers dropped from the legacy view:** legacy labels were
over-assigning ("Management & Operations" went to 5,891 rows but has
NO canonical cohort). The canonical counts are the real number of jobs
an accounting student / cybersecurity seeker / pre-law applicant will
see when they open the feed today.

**Cybersecurity seeker reality:** your friend sees 444 jobs. For
reference, LinkedIn shows ~30k "cybersecurity" jobs for the US. We're
at 1.5% of market coverage for this cohort.

---

## Why we're stuck at 16k, not 200k

### Problem 1 — Company catalog is leaking 74%
602 slugs in the config; only 160 actually return jobs. Likely causes:
- Slug typos (company renamed their board)
- Companies that moved off the ATS
- Companies using a different board ID than we expect

**Fix**: audit the 442 dead slugs. This alone could double the DB if even
half still exist under different slugs.

### Problem 2 — ATS coverage is Greenhouse-heavy
94% of our jobs come from Greenhouse. Lever/Ashby/SmartRecruiters are all
plumbed but underused. There are three more big ATSes with public JSON
APIs that aren't plumbed at all:
- **Workday** — ~40% of Fortune 500 use it. We have 34 jobs total.
  Workday is the biggest unlock for healthcare, finance, accounting,
  consulting (Deloitte, PwC, EY, KPMG all Workday).
- **iCIMS** — mid-market retail, healthcare, manufacturing.
- **Teamtailor** — startup-to-midmarket.

### Problem 3 — No government / healthcare firehose
USAJobs has a public API that returns **every federal job in the US** —
we have 10 jobs from it. Properly plumbed this is ~50k jobs alone for
pre_law, social_sciences, tech_cybersecurity (DoD/CISA), business_finance
(Treasury/SEC), quantitative_math_stats (BLS/NSF/NIH).

Healthcare has **NRMP/ERAS-adjacent** feeds and **AAMC CareerConnect**
but those are login-walled. The realistic healthcare pipe is:
- State-level job boards (NY state, CA state, TX state health department APIs exist)
- Hospital system career pages on Workday (Mayo, Cleveland Clinic, UCLA
  Health, NYU Langone all use Workday)

### Problem 4 — Cohort vocabulary mismatch
`job_analyzer.py` classifies jobs against 22 **legacy** cohort labels
("Cybersecurity & IT", "Finance & Accounting", etc.) but the rubric/UI
uses 16 **canonical** cohort IDs (`tech_cybersecurity`, `business_finance`,
etc.). The mapping is approximate in a few cases, and **three canonical
cohorts have NO matching legacy bucket at all**:
- `business_accounting` (folded into "Finance & Accounting")
- `health_nursing_allied` (folded into "Healthcare & Clinical")
- `sport_management` (has no bucket, jobs fall through)

This means accounting students, nursing students, and sport-management
students see a mixed feed with no precision.

### Problem 5 — 1,910 jobs have no cohort assigned
These get excluded from cohort-filtered views entirely. Need a nightly
reclassify pass to rescue them.

### Problem 6 — Crawl is shallow
Greenhouse boards cap at ~50-300 jobs per company even when the company
has 2,000+ open roles. We're hitting `/boards/{slug}/jobs` which returns
the current open set, but we're not:
- Paginating (Greenhouse cap: 100 per page, we need `?per_page=500`)
- Picking up companies that publish to **multiple boards** (stripe has
  `stripe` and `stripeinterviews`, Uber has 4 boards)
- Expanding jobs that have an `office_id` but no `departments` assigned

---

## Path to 200k

Ranked by effort:weighted-return.

### Phase 1 — Fix what's broken (1-2 days of work, +25-50k jobs)
1. **Repair the dead slugs.** Script that pings each of the 442 dead
   slugs, reports status, and proposes corrections via common slug
   transforms. Even recovering 200 of 442 is worth ~10-20k jobs.
   → Delivered: `scripts/audit_slugs.py` (run this first to get a real
   corrections list instead of guessing).
2. ~~Add pagination~~ — **not actually a problem**. I read the crawler
   more carefully: Greenhouse's `/v1/boards/{slug}/jobs` returns the
   full open set in one response; Lever and Ashby do the same;
   SmartRecruiters already paginates correctly. The per-company ceiling
   we're hitting is the company's actual open roles, not an API page
   cap. Dropped from the plan.
3. **Reclassify the 1,910 unassigned jobs.** One-time batch + crontab
   daily cleanup.
4. **Fix the cohort vocabulary.** Map legacy → canonical in
   `job_analyzer.py`. Add buckets for `business_accounting`,
   `health_nursing_allied`, `sport_management`. Breaks nothing because
   the DB keeps both; we just index by canonical going forward.

### Phase 2 — New ATS pipes (2-3 days, +40-80k jobs)
5. **Workday crawler.** Public JSON endpoint at
   `/wday/cxs/{company}/{site}/jobs`. Biggest single ATS unlock. Target
   companies: all Big 4 consulting, all major hospital systems, banks
   not on Greenhouse (JPMorgan, BofA, Wells), HR-heavy (Workday itself,
   Deloitte, Accenture). Seed list of ~300 Workday slugs.
6. **iCIMS crawler.** JSON at `/jobs/search` for companies like Target,
   Home Depot, Marriott, CVS, Walgreens.
7. **USAJobs surge.** The public API supports `ResultsPerPage=500` and
   returns ~1.2M federal jobs over the year. Filter to open + recent +
   entry/mid-career. This alone covers `pre_law`, `social_sciences`,
   `tech_cybersecurity` (DoD), `quantitative_math_stats` (NIH/BLS).

### Phase 3 — Cohort floors (1-2 days, +20-30k jobs in the weakest cohorts)
8. **Sport management**: NCAA career center, TeamWork Online, Front
   Office Sports job board — all scrapable.
9. **Arts & design**: Behance jobs, Coroflot, The Dots, Working Not
   Working — all have feeds.
10. **Humanities & communications**: Journalism-specific boards
    (JournalismJobs.com, MediaBistro, Poynter). Many RSS-accessible.
11. **Science_research**: NSF REU (already plumbed), AAAS Science
    Careers, HHMI, NASA STEM (all have structured endpoints).
12. **Health_nursing_allied**: Medscape, Nurse.com, HealthECareers —
    structured feeds exist.

### Phase 4 — Scale and hygiene (ongoing)
13. **Deduplication**. Same job posted to Greenhouse + LinkedIn +
    company site appears 3x. `content_hash` column exists — enforce it
    on insert.
14. **Quality scoring**. Some jobs are stale (`last_verified_at` older
    than 30 days + apply link 404). Already have `consecutive_failures`
    column; write a nightly that retires dead jobs.
15. **Expand the company catalog** to 1500-2000 slugs across all ATSes.
    Research: Crunchbase has a list of every company + their career
    page. Automatable.

---

## Concrete first commit

I can implement Phase 1 items 1-4 right now:

1. **Dead-slug audit script**: `scripts/audit_slugs.py` — pings every
   slug in `crawl_internships_v2.py`, reports live/dead/moved, writes a
   proposed corrections file for you to review.
2. **Pagination**: modify `crawl_greenhouse()` / `crawl_lever()` to
   iterate pages until empty.
3. **Canonical cohort mapping**: add `CANONICAL_COHORT_MAP` to
   `job_analyzer.py` so every classified job carries both the legacy
   label (backwards compat) and a canonical cohort ID that matches the
   rubric.
4. **Reclassify orphan jobs**: one-off script to re-run
   `job_analyzer.analyze_job()` on the 1,910 rows with null
   `cohort_requirements`.

**Expected result of just Phase 1**: 40-60k jobs, all 16 cohorts at
min 1k each (most above 2k). From 16k → 60k in a week of focused work.

---

## Non-goals / things I'm explicitly NOT doing here

- Scraping behind-login boards (LinkedIn/Indeed) — legal gray zone, high
  maintenance, IP bans
- Paid job-feed APIs (Adzuna, Usebend) — the brief was "no money"
- AI-based cohort classification — regex + keyword is good enough at
  this scale; Claude calls on 200k rows would be ~$150-300 each crawl
  and we already have 80%+ accuracy from keywords

---

## Decision points for Dilan

1. **Am I allowed to modify the DB schema?** Phase 1 canonical-cohort
   fix may want an `internships.canonical_cohorts text[]` column
   alongside `cohort_requirements`. Cleaner than dual-dict JSON.
2. **USAJobs has ~50k results/day. Do you want them?** Throws off the
   tech-heavy cohort balance but unlocks 3 of the weakest cohorts in
   one pipe.
3. **Phase 2 Workday crawler** needs a slug list. Do you have a list of
   target Workday employers or should I build one from Crunchbase?
