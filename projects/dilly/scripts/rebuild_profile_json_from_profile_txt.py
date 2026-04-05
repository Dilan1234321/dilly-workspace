"""
Rebuild missing memory/dilly_profiles/<id>/profile.json files from memory/dilly_profile_txt/*.txt.

Safety:
- NEVER overwrites an existing profile.json
- Only writes when the folder exists and profile.json is missing
- Uses stable id = sha256(email)[:16] (same as projects/dilly/api/profile_store.py)

Usage:
  python3 projects/dilly/scripts/rebuild_profile_json_from_profile_txt.py
"""

from __future__ import annotations

import glob
import hashlib
import json
import os
import re
from typing import Any


HERE = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
PROFILES_DIR = os.path.join(WORKSPACE_ROOT, "memory", "dilly_profiles")
PROFILE_TXT_DIR = os.path.join(WORKSPACE_ROOT, "memory", "dilly_profile_txt")


def user_id(email: str) -> str:
    e = (email or "").strip().lower()
    if not e:
        return ""
    return hashlib.sha256(e.encode("utf-8")).hexdigest()[:16]


def _first_match(pattern: str, text: str) -> str:
    m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
    return (m.group(1).strip() if m else "").strip()


def parse_identity(txt: str) -> dict[str, Any]:
    name = _first_match(r"^\s*Name:\s*(.+)\s*$", txt)
    email = _first_match(r"^\s*Email:\s*(.+)\s*$", txt).lower()
    majors_line = _first_match(r"^\s*Majors:\s*(.+)\s*$", txt)
    cohort = _first_match(r"^\s*Cohort:\s*(.+)\s*$", txt)

    majors: list[str] = []
    if majors_line:
        majors = [m.strip() for m in re.split(r"[;,/]", majors_line) if m.strip()]

    # Fallback: parse [EDUCATION] Major(s)/Minor(s)
    edu_major = _first_match(r"^\s*Major\(s\):\s*(.+)\s*$", txt)
    edu_minor = _first_match(r"^\s*Minor\(s\):\s*(.+)\s*$", txt)
    minors: list[str] = []
    if edu_minor:
        # Skip N/A, NA, None, etc. — splitting "N/A" by "/" yields ["N","A"] which are not real minors
        edu_minor_upper = edu_minor.strip().upper()
        if edu_minor_upper not in ("N/A", "NA", "NONE", "—", "–", "-"):
            raw = [m.strip() for m in re.split(r"[;,/]", edu_minor) if m.strip()]
            # Filter out N/A fragments (e.g. from "N/A" split by /)
            _empty_minors = frozenset({"", "N", "A", "N/A", "NA", "NONE"})
            minors = [m for m in raw if m.upper() not in _empty_minors]
    if not majors and edu_major:
        majors = [m.strip() for m in re.split(r"[;,/]", edu_major) if m.strip()]

    major = majors[0] if majors else ""
    return {
        "email": email,
        "name": name,
        "major": major,
        "majors": majors,
        "minors": minors,
        "track": cohort,  # stored historically as track; recruiter detail maps to cohort
    }


def main() -> None:
    if not os.path.isdir(PROFILES_DIR):
        raise SystemExit(f"Missing PROFILES_DIR: {PROFILES_DIR}")
    if not os.path.isdir(PROFILE_TXT_DIR):
        raise SystemExit(f"Missing PROFILE_TXT_DIR: {PROFILE_TXT_DIR}")

    txt_files = sorted(glob.glob(os.path.join(PROFILE_TXT_DIR, "*.txt")))
    wrote = 0
    skipped_exists = 0
    skipped_no_folder = 0
    skipped_no_email = 0

    for path in txt_files:
        raw = open(path, "r", encoding="utf-8").read()
        ident = parse_identity(raw)
        email = (ident.get("email") or "").strip().lower()
        if not email:
            skipped_no_email += 1
            continue
        cid = user_id(email)
        folder = os.path.join(PROFILES_DIR, cid)
        if not os.path.isdir(folder):
            skipped_no_folder += 1
            continue
        profile_path = os.path.join(folder, "profile.json")
        if os.path.isfile(profile_path):
            skipped_exists += 1
            continue
        # Write minimal but correct-enough profile.json for recruiter pool membership
        payload = {
            "email": email,
            "name": (ident.get("name") or "").strip(),
            "major": (ident.get("major") or "").strip(),
            "majors": ident.get("majors") or [],
            "minors": ident.get("minors") or [],
            "track": (ident.get("track") or "").strip(),
        }
        with open(profile_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        wrote += 1

    print(
        json.dumps(
            {
                "txt_files": len(txt_files),
                "wrote_profile_json": wrote,
                "skipped_exists": skipped_exists,
                "skipped_no_folder": skipped_no_folder,
                "skipped_no_email": skipped_no_email,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

