# Company Criteria Scraper

Ethical scraper for building Meridian's knowledge of what companies look for.

## What it does

- Fetches **public** career pages (no login required)
- Respects **robots.txt** (skips domains that disallow our bot)
- **Rate limits** (2 seconds between requests per domain)
- Extracts "what we look for" style sections
- Outputs structured JSON with source URLs for every criterion

## Usage

```bash
# From workspace root, with venv activated:
.venv/bin/python projects/meridian/scripts/company_criteria_scraper.py

# Dry run (check URLs only, no fetch):
.venv/bin/python projects/meridian/scripts/company_criteria_scraper.py --dry-run

# Limit to 2 URLs (for testing):
.venv/bin/python projects/meridian/scripts/company_criteria_scraper.py --limit 2

# Custom output path:
.venv/bin/python projects/meridian/scripts/company_criteria_scraper.py --output knowledge/scraped_criteria.json
```

## Output

Writes to `knowledge/scraped_criteria.json` by default. Each entry includes:

- `source_url` - Where the data came from
- `company` - Inferred company name
- `sections` - Extracted headings and content
- `scraped_at` - Timestamp

## Adding URLs

Edit `CAREER_PAGE_URLS` in the script. Only add:

- Public pages (no login)
- Career/students/internships pages
- Domains that allow scraping (check robots.txt)

We do **not** scrape: LinkedIn, Indeed, Glassdoor (ToS prohibit).

## Scheduled Run (Cron)

Meridian runs the scraper automatically via cron. From workspace root:

- **Script:** `meridian_scraper.sh` (uses `.venv`, logs to `projects/meridian/scraper_cron.log`)
- **Schedule:** Weekly, Sundays 3:00 AM (`0 3 * * 0`)
- **Config:** `crons.json` (workspace root)

To install the crontab entry:

```bash
crontab -e
# Add:
0 3 * * 0 /bin/bash /Users/dilankochhar/.openclaw/workspace/meridian_scraper.sh >> /Users/dilankochhar/.openclaw/workspace/projects/meridian/scraper_cron.log 2>&1
```

Or append to your existing crontab if you sync from `crons.json`.

## Policy

See `docs/DATA_SOURCES.md` for full sourcing policy.
