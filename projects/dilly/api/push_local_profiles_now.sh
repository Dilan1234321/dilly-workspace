#!/bin/bash
# Push each local profile to production via the migration endpoint.
# Requires: Railway redeployed with the new profile_store.py + DILLY_DB_PASSWORD set.

API="https://api.trydilly.com"
TOKEN="23fc91d2a3686ca83d69d7adeee9cbd84f388b1fdf3a93878c120ff92044667f"
PROFILES_DIR="/Users/dilankochhar/.openclaw/workspace/memory/dilly_profiles"

for dir in "$PROFILES_DIR"/*/; do
  PROFILE="$dir/profile.json"
  if [ ! -f "$PROFILE" ]; then continue; fi

  EMAIL=$(python3 -c "import json; d=json.load(open('$PROFILE')); print(d.get('email',''))" 2>/dev/null)
  if [ -z "$EMAIL" ]; then continue; fi

  echo "Pushing $EMAIL..."
  STATUS=$(curl -s -o /tmp/mig_resp.json -w "%{http_code}" \
    -X POST "$API/cron/migrate-profile?token=$TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$PROFILE")
  echo "  HTTP $STATUS: $(cat /tmp/mig_resp.json)"
done

echo "Done."
