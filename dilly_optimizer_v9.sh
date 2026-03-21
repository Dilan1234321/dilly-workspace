#!/bin/bash
# Dilly V9.0 Autonomous Optimizer
# Runs the engine every 10 minutes to maintain leaderboard veracity.

WORKSPACE="/Users/dilankochhar/.openclaw/workspace"
cd $WORKSPACE

while true; do
    echo "[$(date)] Running Dilly V9.0 Audit..."
    /usr/bin/python3 peer_score_engine_v3.py >> dilly_cron.log 2>&1
    echo "[$(date)] Audit Complete. Sleeping 10m."
    sleep 600
done
