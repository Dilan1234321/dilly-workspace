# Feature automations — keeping Meridian running

Automations that **run Meridian’s product features** (data freshness, cleanup, recruiter search, jobs, etc.), not dev checks. Configured via [crons.json](../../crons.json) (workspace root) and optional HTTP calls to the API.

---

## What already runs

| What | Schedule | How | Purpose |
|------|----------|-----|--------|
| **Background optimizer** | Every 10 min | `meridian_background_optimizer.sh` → `retrain_brains.py` | Model retraining (if you use it). |
| **Company criteria scraper** | Weekly (Sun 03:00) | `meridian_scraper.sh` → `company_criteria_scraper.py` | Refreshes “what companies look for” data for Am I Ready / company advice. |
| **Report PDF cleanup** | On API startup | `main.py` `_reports_cleanup()` | Deletes report PDFs older than 7 days in `memory/meridian_reports/`. |
| **Draft profile cleanup** | Manual or cron | `GET /cron/cleanup-draft-profiles?token=CRON_SECRET` | Deletes draft profiles older than 3 days. No schedule by default. |

---

## Recommended feature automations

### 1. Draft profile cleanup on a schedule

**Why:** Draft profiles (never completed sign-up) accumulate; cleaning them keeps storage and any “draft” lists sane.

**How:** Call the API from cron so cleanup runs even when the API never restarts.

- **Script:** [scripts/cron_cleanup_profiles.sh](../../../scripts/cron_cleanup_profiles.sh) (workspace root). Needs `CRON_SECRET` and `MERIDIAN_API_URL` (default `http://localhost:8000`) in env.
- **Schedule:** Daily (e.g. 04:00). Add to [crons.json](../../../crons.json) or your system crontab.

**Production:** Set `MERIDIAN_API_URL` to your deployed API (e.g. `https://api.meridian.example.com`) and `CRON_SECRET` in the cron environment (or `.env` sourced before the script).

---

### 2. Job scraper (Jobs feature)

**Why:** The Jobs feature uses scraped listings (e.g. Greenhouse, USAJobs). Running the scraper regularly keeps recommendations fresh.

**How:** Run from workspace root with your venv:

```bash
.venv/bin/python projects/meridian/scripts/run_job_scraper.py
```

- **Schedule:** Daily or every 12 hours. Optional: add a `meridian_job_scraper.sh` that sources `.env`, runs the above, and log to `projects/meridian/job_scraper_cron.log`; then add that script to [crons.json](../../../crons.json).
- **Secrets:** For USAJobs set `USAJOBS_API_KEY` and `USAJOBS_USER_AGENT` in env (see [run_job_scraper.py](../scripts/run_job_scraper.py)).

---

### 3. Recruiter candidate index backfill

**Why:** Recruiter search uses an index built from profile + audit data. New audits update the index for that user; a backfill reindexes everyone (e.g. after embedding or schema changes).

**How:**

```bash
.venv/bin/python projects/meridian/scripts/backfill_candidate_index.py
```

- **Schedule:** Nightly or weekly, or after deploy when index logic changes. Uses `OPENAI_API_KEY` for embeddings.
- **Options:** `--dry-run`, `--limit N`, `--force` (reindex even if index exists). See script docstring.

---

### 4. Report PDF cleanup on a schedule (optional)

**Why:** Today report PDFs are deleted only on API startup. If the API runs for weeks without restart, expired PDFs stay until restart.

**How:** Either:

- Restart the API periodically (e.g. daily deploy or process restart), or
- Add a cron endpoint (e.g. `GET /cron/cleanup-expired-reports?token=CRON_SECRET`) that runs the same cleanup logic and call it daily. Not implemented yet; [main.py](../../api/main.py) only runs `_reports_cleanup()` on startup.

---

### 5. Profile .txt backfill (Voice / profile text)

**Why:** Voice and some features use a generated `.txt` per profile. If the format or pipeline changes, existing profiles need regenerating.

**How:**

```bash
.venv/bin/python projects/meridian/scripts/backfill_dilly_profile_txt.py
```

- **Schedule:** One-off after schema/format changes, or optional weekly. Use `--dry-run` or `--limit N` to test.

---

## Summary

| Automation | Purpose | Suggested schedule |
|------------|--------|---------------------|
| Draft profile cleanup | Remove old draft profiles | Daily (via script + cron) |
| Job scraper | Fresh jobs for Jobs feature | Daily or 2× daily |
| Candidate index backfill | Fresh recruiter search index | Nightly or weekly |
| Report cleanup | Remove expired share PDFs | On API restart or future cron endpoint |
| Company criteria scraper | Already in crons | Weekly (current) |
| Background optimizer | Already in crons | Every 10 min (current) |

Set `CRON_SECRET` and (for remote API) `MERIDIAN_API_URL` wherever you run the cleanup script or call cron endpoints.
