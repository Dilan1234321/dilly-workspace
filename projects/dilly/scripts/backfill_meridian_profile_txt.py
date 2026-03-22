#!/usr/bin/env python3
"""
Backfill dilly_profile_txt for all users with profiles.

Regenerates memory/dilly_profile_txt/{email}.txt for each user, including the new
[VOICE_CAPTURED] section (beyond_resume, experience_expansion). Run after adding
Voice-captured data to the profile txt builder.

Run from the workspace root:

  python3 projects/meridian/scripts/backfill_dilly_profile_txt.py
  python3 projects/meridian/scripts/backfill_dilly_profile_txt.py --dry-run
  python3 projects/meridian/scripts/backfill_dilly_profile_txt.py --limit 10
"""

import argparse
import json
import os
import sys

_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

_PROFILES_DIR = os.path.join(_ROOT, "memory", "dilly_profiles")
_PROFILE_FILENAME = "profile.json"


def _iter_emails():
    """Yield email for each profile that has an email field."""
    if not os.path.isdir(_PROFILES_DIR):
        return
    for uid in sorted(os.listdir(_PROFILES_DIR)):
        path = os.path.join(_PROFILES_DIR, uid, _PROFILE_FILENAME)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                prof = json.load(f)
        except Exception:
            continue
        email = (prof.get("email") or "").strip().lower()
        if not email:
            continue
        yield email


def main():
    parser = argparse.ArgumentParser(description="Backfill dilly_profile_txt for all users.")
    parser.add_argument("--dry-run", action="store_true", help="Do not write; only report who would be updated.")
    parser.add_argument("--limit", type=int, default=0, help="Max number of users to process (0 = no limit).")
    args = parser.parse_args()

    from projects.dilly.api.dilly_profile_txt import write_dilly_profile_txt

    total = 0
    written = 0
    failed = 0

    for email in _iter_emails():
        total += 1
        if args.limit and written + failed >= args.limit:
            break

        if args.dry_run:
            print(f"[dry-run] would write: {email}")
            written += 1
            continue

        try:
            out = write_dilly_profile_txt(email)
            if out:
                written += 1
                print(f"Written: {email}")
            else:
                failed += 1
                print(f"Failed (no output): {email}", file=sys.stderr)
        except Exception as e:
            failed += 1
            print(f"Failed: {email} — {e}", file=sys.stderr)

    print()
    print(f"Done. Total: {total}, written: {written}, failed: {failed}.")


if __name__ == "__main__":
    main()
