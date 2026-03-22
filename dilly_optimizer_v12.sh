#!/bin/bash
# Meridian Autonomous Optimizer v12.1
# Lead Auditor: Atlas
# Schedule: Every 10 minutes

cd /Users/dilankochhar/.openclaw/workspace

while true; do
    echo "[$(date)] Starting Meridian Optimization Cycle (MTS v12.1)..."
    python3 peer_score_engine_v3.py
    echo "[$(date)] Optimization Cycle Complete. Sleeping for 10 minutes."
    sleep 600
done
