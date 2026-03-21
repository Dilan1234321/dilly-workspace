#!/usr/bin/env bash
# Run Dilly API from workspace root (so dilly_core is importable).
# Requires: .venv with uvicorn + fastapi + pypdf etc. (see projects/dilly/api/requirements.txt)
cd "$(dirname "$0")"
if [[ ! -d .venv ]]; then
  echo "No .venv found. Create one and install deps:"
  echo "  python3.14 -m venv .venv && .venv/bin/pip install uvicorn fastapi pydantic pypdf python-multipart reportlab"
  exit 1
fi
# Load .env so DILLY_USE_LLM and OPENAI_API_KEY are set
if [[ -f .env ]]; then set -a; source .env; set +a; fi
exec .venv/bin/python -m uvicorn projects.dilly.api.main:app --host 0.0.0.0 --port 8000
