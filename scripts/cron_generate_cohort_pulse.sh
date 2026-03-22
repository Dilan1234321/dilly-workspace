#!/usr/bin/env bash
# Trigger weekly cohort pulse generation.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$WORKSPACE_ROOT"

if [[ -f "$WORKSPACE_ROOT/.env" ]]; then
  set -a
  source "$WORKSPACE_ROOT/.env"
  set +a
fi

BASE_URL="${MERIDIAN_API_URL:-http://localhost:8000}"
SECRET="${CRON_SECRET:-}"
if [[ -z "$SECRET" ]]; then
  echo "CRON_SECRET not set. Set it in .env or cron environment." >&2
  exit 1
fi

URL="${BASE_URL%/}/internal/cohort-pulse/generate?token=${SECRET}"
RESPONSE="$(curl -s -w "\n%{http_code}" -X POST "$URL")"
HTTP_CODE="$(echo "$RESPONSE" | tail -n1)"
BODY="$(echo "$RESPONSE" | sed '$d')"

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "Cohort pulse generation failed: HTTP $HTTP_CODE — $BODY" >&2
  exit 1
fi

echo "Cohort pulse generation OK: $BODY"

