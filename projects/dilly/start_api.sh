#!/bin/bash
cd /Users/dilankochhar/.openclaw/workspace
source projects/dilly/api/.venv/bin/activate
uvicorn projects.dilly.api.main:app --host 0.0.0.0 --port 8000 --reload
