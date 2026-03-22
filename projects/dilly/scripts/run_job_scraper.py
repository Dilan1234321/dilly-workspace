#!/usr/bin/env python3
"""
Run the Meridian job scraper. Ethical/legal sources only.

Run from WORKSPACE ROOT (the folder that contains projects/):

  cd /Users/dilankochhar/.openclaw/workspace   # or your workspace path
  python3 -m venv .venv-meridian               # first time only
  source .venv-meridian/bin/activate
  pip install requests
  python3 projects/meridian/scripts/run_job_scraper.py --limit 5

  USAJOBS_API_KEY=xxx USAJOBS_USER_AGENT=your@email.com python3 ...  # For federal jobs
"""

import argparse
import sys
from pathlib import Path

# Add workspace root for imports (workspace/projects/meridian/scripts -> workspace)
_SCRIPT_DIR = Path(__file__).resolve().parent
_WORKSPACE = _SCRIPT_DIR.parent.parent.parent
if str(_WORKSPACE) not in sys.path:
    sys.path.insert(0, str(_WORKSPACE))

from projects.dilly.scripts.job_scraper.scraper import run_job_scraper


def main():
    parser = argparse.ArgumentParser(description="Scrape jobs from ethical/legal sources")
    parser.add_argument("--dry-run", action="store_true", help="List sources only, do not fetch")
    parser.add_argument("--greenhouse-only", action="store_true", help="Skip USAJobs")
    parser.add_argument("--limit", type=int, help="Limit Greenhouse boards to scrape (for testing)")
    parser.add_argument("--db", type=str, help="SQLite DB path (default: projects/meridian/meridian_jobs.db)")
    args = parser.parse_args()

    db_path = Path(args.db) if args.db else _SCRIPT_DIR.parent / "meridian_jobs.db"
    run_job_scraper(
        db_path=db_path,
        dry_run=args.dry_run,
        greenhouse_only=args.greenhouse_only,
        limit_boards=args.limit,
    )


if __name__ == "__main__":
    main()
