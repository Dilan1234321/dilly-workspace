#!/usr/bin/env bash
# Start API + dashboard with one command. Run from workspace root: ./scripts/dev_up.sh
# API runs in background (uvicorn); dashboard runs in foreground (npm run dev).
# Stop: Ctrl+C stops the dashboard; then kill the uvicorn process if needed (e.g. pkill -f "uvicorn projects.dilly.api.main")

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$WORKSPACE_ROOT"

if [[ ! -d "$WORKSPACE_ROOT/.venv" ]]; then
  echo "No .venv found. Create one and install API deps:"
  echo "  python3 -m venv .venv && .venv/bin/pip install -r projects/meridian/api/requirements.txt"
  exit 1
fi

if [[ -f "$WORKSPACE_ROOT/.env" ]]; then
  set -a
  source "$WORKSPACE_ROOT/.env"
  set +a
fi

echo "Starting API (background) and dashboard (foreground)..."
echo "API: http://localhost:8000  Dashboard: http://localhost:3000"
echo ""

# Start uvicorn in background; leave it there when we later run dashboard in foreground
.venv/bin/python -m uvicorn projects.dilly.api.main:app --host 0.0.0.0 --port 8000 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

# Give API a moment to bind
sleep 2

# Dashboard in foreground (Ctrl+C will stop this and trap will kill API)
(cd "$WORKSPACE_ROOT/projects/meridian/dashboard" && npm run dev)
