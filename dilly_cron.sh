#!/bin/bash
# Meridian Evolution Cron - MTS v3.10
# Runs every 10 minutes to refine the model based on specialized school research.
# Task: Research medical, law, and specialized school resume values and apply to model.

LOGFILE="/Users/dilankochhar/.openclaw/workspace/meridian_cron.log"
WORKSPACE="/Users/dilankochhar/.openclaw/workspace"

echo "[$(date)] Starting Meridian Evolution Cycle..." >> $LOGFILE
cd $WORKSPACE

# Execute the updated scoring engine
/usr/bin/python3 peer_score_engine_v3.py >> $LOGFILE 2>&1

echo "[$(date)] Evolution Cycle Complete." >> $LOGFILE
