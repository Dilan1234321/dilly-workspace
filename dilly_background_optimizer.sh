#!/bin/bash
# Autonomous Dilly Model Retraining Job
# Schedule: Every 10 minutes

BASE_DIR="/Users/dilankochhar/.openclaw/workspace"
LOG_FILE="$BASE_DIR/projects/dilly/autonomous_run.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting Dilly retraining cycle..." >> "$LOG_FILE"

# Run the retraining script
cd "$BASE_DIR"
/usr/bin/python3 projects/dilly/retrain_brains.py >> "$LOG_FILE" 2>&1

echo "[$TIMESTAMP] Dilly retraining cycle complete." >> "$LOG_FILE"
