#!/bin/bash
# Company Criteria Scraper - Scheduled Run
# Scrapes public career pages for "what we look for" content.
# Schedule: Weekly (see crons.json)

BASE_DIR="/Users/dilankochhar/.openclaw/workspace"
LOG_FILE="$BASE_DIR/projects/meridian/scraper_cron.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting company criteria scrape..." >> "$LOG_FILE"

cd "$BASE_DIR"
"$BASE_DIR/.venv/bin/python" projects/meridian/scripts/company_criteria_scraper.py >> "$LOG_FILE" 2>&1

echo "[$TIMESTAMP] Company criteria scrape complete." >> "$LOG_FILE"
