#!/bin/bash
# Autonomous Meridian Model Retraining Job
# Schedule: Every 10 minutes

BASE_DIR="/Users/dilankochhar/.openclaw/workspace"
LOG_FILE="$BASE_DIR/projects/meridian/autonomous_run.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting Meridian retraining cycle..." >> "$LOG_FILE"

# Run the retraining script
cd "$BASE_DIR"
/usr/bin/python3 projects/meridian/retrain_brains.py >> "$LOG_FILE" 2>&1

echo "[$TIMESTAMP] Meridian retraining cycle complete." >> "$LOG_FILE"
