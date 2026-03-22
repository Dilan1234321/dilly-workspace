#!/usr/bin/env bash
# Single "dev check" — lint + fast tests before pushing.
# Run from workspace root: ./scripts/dev_check.sh
# Or from anywhere: /path/to/workspace/scripts/dev_check.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$WORKSPACE_ROOT"

# Optional: warn if no venv (API tests need Python deps)
if [[ -z "$VIRTUAL_ENV" ]] && [[ ! -d "$WORKSPACE_ROOT/.venv" ]]; then
  echo "Note: no .venv found; API test may fail if deps are missing. Install: pip install -r projects/meridian/api/requirements.txt"
fi

echo "=== Dev check (workspace: $WORKSPACE_ROOT) ==="

# 1. Dashboard lint
echo ""
echo "--- Dashboard lint ---"
(cd "$WORKSPACE_ROOT/projects/meridian/dashboard" && npm run lint)

# 2. Dashboard tests (optional but fast)
echo ""
echo "--- Dashboard tests ---"
(cd "$WORKSPACE_ROOT/projects/meridian/dashboard" && npm run test)

# 3. API smoke test (TestClient, no server)
echo ""
echo "--- API smoke test ---"
PYTHON="${WORKSPACE_ROOT}/.venv/bin/python"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="python3"
fi
"$PYTHON" "$WORKSPACE_ROOT/projects/meridian/scripts/smoke_test_path.py"

echo ""
echo "=== Dev check passed ==="
