#!/usr/bin/env bash
# Run Meridian API for recruiter view (and full app). Use from workspace root.
# Creates a venv and installs deps if needed (avoids Homebrew "externally-managed-environment").

set -e
WORKSPACE_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$WORKSPACE_ROOT"
REQUIREMENTS="$WORKSPACE_ROOT/projects/meridian/api/requirements.txt"
VENV_DIR="$WORKSPACE_ROOT/.venv"

if [[ -n "$VIRTUAL_ENV" ]]; then
  echo "Using existing venv: $VIRTUAL_ENV"
else
  if [[ ! -d "$VENV_DIR" ]]; then
    echo "Creating virtual environment at .venv ..."
    python3 -m venv "$VENV_DIR"
  fi
  echo "Activating .venv"
  source "$VENV_DIR/bin/activate"
fi

if ! python -c "import uvicorn" 2>/dev/null; then
  echo "Installing API dependencies (one-time) ..."
  pip install -r "$REQUIREMENTS"
fi

export PYTHONPATH="$WORKSPACE_ROOT"
export RECRUITER_API_KEY="${RECRUITER_API_KEY:-recruiter-dev-key}"

echo "RECRUITER_API_KEY=$RECRUITER_API_KEY (use this key in the recruiter UI at /recruiter)"
echo "Starting API on http://0.0.0.0:8000"
exec python -m uvicorn projects.dilly.api.main:app --reload --host 0.0.0.0 --port 8000
