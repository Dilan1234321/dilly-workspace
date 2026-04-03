#!/usr/bin/env python3
"""
One-time migration: push all file-based profiles from memory/dilly_profiles/
into the PostgreSQL users table (profile_json JSONB column).

Run from workspace root:
    cd /Users/dilankochhar/.openclaw/workspace
    python3 projects/dilly/api/migrate_profiles_to_pg.py
"""
import json, os, sys

# Add workspace root to path
_HERE = os.path.dirname(os.path.abspath(__file__))
_WS = os.path.normpath(os.path.join(_HERE, "..", "..", ".."))
sys.path.insert(0, _WS)

from projects.dilly.api.profile_store import save_profile

_PROFILES_DIR = os.path.join(_WS, "memory", "dilly_profiles")

def migrate():
    if not os.path.isdir(_PROFILES_DIR):
        print(f"No profiles dir at {_PROFILES_DIR}")
        return

    folders = [
        d for d in os.listdir(_PROFILES_DIR)
        if os.path.isdir(os.path.join(_PROFILES_DIR, d))
    ]
    print(f"Found {len(folders)} profile folders.")

    ok = 0
    failed = 0
    for uid in folders:
        path = os.path.join(_PROFILES_DIR, uid, "profile.json")
        if not os.path.isfile(path):
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            email = data.get("email", "").strip().lower()
            if not email:
                print(f"  SKIP {uid} — no email")
                continue
            save_profile(email, data)
            print(f"  OK  {email}")
            ok += 1
        except Exception as e:
            print(f"  ERR {uid}: {e}")
            failed += 1

    print(f"\nDone. {ok} migrated, {failed} failed.")

if __name__ == "__main__":
    migrate()
