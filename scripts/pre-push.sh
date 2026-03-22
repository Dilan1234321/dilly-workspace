#!/usr/bin/env bash
# Pre-push hook: run dev check. Attach to git manually:
#   ln -sf ../../scripts/pre-push.sh .git/hooks/pre-push
# Or use pre-commit: pre-commit install --hook-type pre-push

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
exec "$WORKSPACE_ROOT/scripts/dev_check.sh"
