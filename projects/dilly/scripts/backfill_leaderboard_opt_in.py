#!/usr/bin/env python3
"""
Set leaderboard_opt_in=True on every profile.json under memory/dilly_profiles/.

Use after changing the product default so existing users are explicitly opted in.
New signups already get leaderboard_opt_in from ensure_profile_exists defaults.

Run from workspace root:

  python3 projects/dilly/scripts/backfill_leaderboard_opt_in.py
  python3 projects/dilly/scripts/backfill_leaderboard_opt_in.py --dry-run
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


def main():
    parser = argparse.ArgumentParser(description="Set leaderboard_opt_in=True for all Dilly profiles.")
    parser.add_argument("--dry-run", action="store_true", help="Print actions only; do not write.")
    args = parser.parse_args()

    from projects.dilly.api.profile_store import save_profile

    if not os.path.isdir(_PROFILES_DIR):
        print("No profiles directory:", _PROFILES_DIR)
        return 0

    updated = 0
    skipped = 0
    for uid in sorted(os.listdir(_PROFILES_DIR)):
        path = os.path.join(_PROFILES_DIR, uid, _PROFILE_FILENAME)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding="utf-8") as f:
                prof = json.load(f)
        except Exception:
            continue
        email = (prof.get("email") or "").strip().lower()
        if not email:
            skipped += 1
            continue
        if prof.get("leaderboard_opt_in") is True:
            skipped += 1
            continue
        if args.dry_run:
            print(f"[dry-run] would set leaderboard_opt_in: {email}")
            updated += 1
            continue
        try:
            save_profile(email, {"leaderboard_opt_in": True})
            updated += 1
            print(f"Updated: {email}")
        except Exception as e:
            print(f"Failed: {email} — {e}", file=sys.stderr)

    print(f"Done. updated={updated} skipped_already_true_or_no_email={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
