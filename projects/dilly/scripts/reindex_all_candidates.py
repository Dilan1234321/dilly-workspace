"""
Rebuild candidate_index.json for all active Meridian profiles.

Usage:
  source .venv/bin/activate
  export OPENAI_API_KEY=...
  python3 projects/meridian/scripts/reindex_all_candidates.py
"""

from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_WORKSPACE_ROOT = os.path.normpath(os.path.join(_HERE, "..", "..", ".."))
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)


def main() -> None:
    from projects.dilly.api.profile_store import get_profile
    from projects.dilly.api.audit_history import get_audits
    from projects.dilly.api.candidate_index import index_candidate_after_audit

    if not (os.environ.get("OPENAI_API_KEY") or "").strip():
        print("ERROR: OPENAI_API_KEY is not set in this terminal session.")
        print("Fix: export OPENAI_API_KEY=... (then re-run)")
        return

    profiles_dir = os.path.join(_WORKSPACE_ROOT, "memory", "dilly_profiles")
    if not os.path.isdir(profiles_dir):
        print("No profiles dir:", profiles_dir)
        return

    ok = 0
    fail = 0
    skipped = 0
    for uid in sorted(os.listdir(profiles_dir)):
        folder = os.path.join(profiles_dir, uid)
        profile_path = os.path.join(folder, "profile.json")
        if not os.path.isfile(profile_path):
            continue
        # read via store to ensure consistent schema
        try:
            # candidate_id maps folder name; get_profile needs email so load lightweight json
            import json

            prof_raw = json.load(open(profile_path, "r", encoding="utf-8"))
        except Exception:
            fail += 1
            continue
        if (prof_raw.get("profileStatus") or "").strip().lower() != "active":
            skipped += 1
            continue
        email = (prof_raw.get("email") or "").strip().lower()
        if not email:
            fail += 1
            continue
        prof = get_profile(email) or prof_raw
        audits = get_audits(email) or []
        latest = audits[0] if audits else {}
        if index_candidate_after_audit(email, profile=prof, audit=latest, resume_text=None):
            ok += 1
        else:
            print("FAIL:", email)
            fail += 1

    print(f"reindex done: ok={ok} fail={fail} skipped_inactive={skipped}")


if __name__ == "__main__":
    main()

