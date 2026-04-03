#!/usr/bin/env python3
"""
Push local profiles to production API via PATCH /profile.
Sends a verification code, reads it from dev_code response, then uploads.

Usage:
    cd /Users/dilankochhar/.openclaw/workspace
    DILLY_DEV=1 python3 projects/dilly/api/push_profiles_to_prod.py
"""
import json, os, sys, time
import urllib.request, urllib.parse

API_BASE = "https://api.trydilly.com"

_HERE = os.path.dirname(os.path.abspath(__file__))
_WS = os.path.normpath(os.path.join(_HERE, "..", "..", ".."))
_PROFILES_DIR = os.path.join(_WS, "memory", "dilly_profiles")

# Fields to skip — too large or not needed on prod
_SKIP = {"voice_memory", "resume_text", "conversation_outputs"}


def api(method, path, body=None, token=None):
    url = API_BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


def login(email):
    """Send code + verify via dev_code, return token."""
    print(f"  Sending code to {email}...")
    r = api("POST", "/auth/send-verification-code", {"email": email})
    dev_code = r.get("dev_code") or r.get("code")
    if not dev_code:
        print(f"  ERROR: no dev_code in response: {r}")
        return None
    print(f"  dev_code: {dev_code}")
    r2 = api("POST", "/auth/verify-code", {"email": email, "code": dev_code})
    token = r2.get("token")
    if not token:
        print(f"  ERROR: no token: {r2}")
    return token


def migrate_profile(uid_dir):
    path = os.path.join(_PROFILES_DIR, uid_dir, "profile.json")
    if not os.path.isfile(path):
        return
    with open(path) as f:
        data = json.load(f)

    email = data.get("email", "").strip().lower()
    if not email:
        return

    print(f"\n>>> {email}")

    token = login(email)
    if not token:
        return

    # Strip huge/irrelevant fields
    payload = {k: v for k, v in data.items() if k not in _SKIP}
    payload.pop("email", None)  # not needed in PATCH body

    r = api("PATCH", "/profile", payload, token=token)
    if r.get("ok") or r.get("email"):
        print(f"  PUSHED OK")
    else:
        print(f"  WARN response: {r}")


def main():
    if not os.path.isdir(_PROFILES_DIR):
        print("No local profiles dir found")
        sys.exit(1)

    folders = [
        d for d in os.listdir(_PROFILES_DIR)
        if os.path.isdir(os.path.join(_PROFILES_DIR, d))
    ]
    print(f"Found {len(folders)} profiles to push to {API_BASE}\n")
    print("NOTE: DILLY_DEV=1 must be set on Railway for dev_code to work.\n")

    for uid in folders:
        migrate_profile(uid)
        time.sleep(1)

    print("\nDone.")


if __name__ == "__main__":
    main()
