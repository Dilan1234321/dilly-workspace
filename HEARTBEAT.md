# HEARTBEAT.md

- Monitor `/Users/dilankochhar/.openclaw/workspace/assets/resumes/` for new PDF files.
- If a new file is detected, trigger `projects/dilly/api/main.py` (via the `/audit` endpoint logic) to generate a "Draft Report" in `projects/dilly/reports/`.
- Log the event in `memory/heartbeat-state.json`.

# CTO REMINDER
- Ensure the FastAPI server is running in the background for dashboard connectivity.
- Verify `track_specific_weights` for all upcoming beta cohort audits.
