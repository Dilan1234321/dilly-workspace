#!/usr/bin/env bash
# Call API to delete draft profiles older than 3 days.
# Schedule: daily (e.g. 04:00). Add to crons.json or system crontab.
#
# Env (set in cron or .env):
#   CRON_SECRET   — required; must match API's CRON_SECRET
#   MERIDIAN_API_URL — optional; default http://localhost:8000
#
# From workspace root (so .env can be sourced):
#   source .env 2>/dev/null; ./scripts/cron_cleanup_profiles.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$WORKSPACE_ROOT"

# Load .env if present (for CRON_SECRET and MERIDIAN_API_URL)
if [[ -f "$WORKSPACE_ROOT/.env" ]]; then
  set -a
  source "$WORKSPACE_ROOT/.env"
  set +a
fi

BASE_URL="${MERIDIAN_API_URL:-http://localhost:8000}"
SECRET="${CRON_SECRET:-}"

if [[ -z "$SECRET" ]]; then
  echo "CRON_SECRET not set. Set it in .env or the cron environment." >&2
  exit 1
fi

URL="${BASE_URL%/}/cron/cleanup-draft-profiles?token=${SECRET}"
RESPONSE="$(curl -s -w "\n%{http_code}" "$URL")"
HTTP_CODE="$(echo "$RESPONSE" | tail -n1)"
BODY="$(echo "$RESPONSE" | sed '$d')"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Cleanup failed: HTTP $HTTP_CODE — $BODY" >&2
  exit 1
fi

echo "Draft profile cleanup OK: $BODY"
