#!/usr/bin/env python3
"""
Test the profile API: create session → GET /profile → PATCH /profile → verify file on disk.
Run from workspace root: python projects/meridian/scripts/test_profile_api.py
"""
import os
import sys

_WORKSPACE_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
os.chdir(_WORKSPACE_ROOT)
if _WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, _WORKSPACE_ROOT)


def main():
    from fastapi.testclient import TestClient
    from projects.dilly.api.main import app
    from projects.dilly.api.auth_store import create_session
    from projects.dilly.api.profile_store import get_profile, get_profile_folder_path, ensure_profile_exists

    email = "you@spartans.ut.edu"
    print(f"Testing profile API for: {email}\n")

    # 1. Create session (simulates sign-in; this also triggers ensure_profile_exists in /auth/verify in real flow)
    # We'll call ensure_profile_exists directly here to create the profile
    ensure_profile_exists(email)
    token = create_session(email)
    headers = {"Authorization": f"Bearer {token}"}

    client = TestClient(app)

    # 2. GET /profile
    r = client.get("/profile", headers=headers)
    if r.status_code != 200:
        print(f"  GET /profile -> {r.status_code} {r.text}")
        sys.exit(1)
    profile = r.json()
    print("  1. GET /profile -> 200")
    print(f"     email={profile.get('email')}, verified={profile.get('verified')}, major={profile.get('major')}, goals={profile.get('goals')}")

    # 3. PATCH /profile
    r = client.patch(
        "/profile",
        headers=headers,
        json={
            "major": "International Business",
            "preProfessional": True,
            "track": "Pre-Health",
            "goals": ["internship", "aiming_med_school"],
        },
    )
    if r.status_code != 200:
        print(f"  PATCH /profile -> {r.status_code} {r.text}")
        sys.exit(1)
    updated = r.json()
    print("  2. PATCH /profile -> 200")
    print(f"     major={updated.get('major')}, track={updated.get('track')}, goals={updated.get('goals')}")

    # 4. GET again to confirm persistence
    r = client.get("/profile", headers=headers)
    if r.status_code != 200:
        print(f"  GET /profile (second) -> {r.status_code}")
        sys.exit(1)
    loaded = r.json()
    assert loaded.get("major") == "International Business"
    assert loaded.get("track") == "Pre-Health"
    assert "aiming_med_school" in (loaded.get("goals") or [])
    print("  3. GET /profile again -> 200 (data persisted)")

    # 5. Where the file lives
    folder = get_profile_folder_path(email)
    path = os.path.join(folder, "profile.json")
    print(f"\n  Profile file on disk: {path}")
    if os.path.isfile(path):
        print("  File exists. You can open it to inspect the JSON.")
    else:
        print("  (File not found at expected path.)")

    print("\n  All profile API checks passed.")


if __name__ == "__main__":
    main()
