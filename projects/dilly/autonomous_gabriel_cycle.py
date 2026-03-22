#!/usr/bin/env python3
import os
import sys
import json
import datetime
import subprocess

# Paths
BASE_DIR = "/Users/dilankochhar/.openclaw/workspace"
PROJECT_DIR = os.path.join(BASE_DIR, "projects/meridian")
AUDITOR_SCRIPT = os.path.join(PROJECT_DIR, "meridian_resume_auditor.py")
OPTIMIZER_SCRIPT = os.path.join(PROJECT_DIR, "optimize_resume.py")
GABRIEL_RESUME = "/Users/dilankochhar/Desktop/All else/Gabriel mfugale resume.pdf"
DATABASE_PATH = os.path.join(PROJECT_DIR, "meridian_database.json")
LOG_FILE = os.path.join(PROJECT_DIR, "autonomous_run.log")

def log(message):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a") as f:
        f.write(f"[{timestamp}] {message}\n")
    print(message)

def run_autonomous_cycle():
    log("--- Starting Autonomous Meridian Cycle: Gabriel ---")
    
    # 1. Audit Gabriel's Resume
    log(f"Auditing resume: {GABRIEL_RESUME}")
    try:
        result = subprocess.check_output([sys.executable, AUDITOR_SCRIPT, GABRIEL_RESUME], stderr=subprocess.STDOUT).decode()
        # Find the start of the JSON block
        json_start = result.find('{')
        json_end = result.rfind('}') + 1
        if json_start == -1 or json_end == 0:
            raise ValueError("No JSON found in auditor output")
        
        audit_data = json.loads(result[json_start:json_end])
        log(f"Audit Complete. Initial Grit Score: {audit_data['metrics']['grit_score']}")
    except Exception as e:
        log(f"Audit Failed: {str(e)}")
        return

    # 2. Update Database with Gabriel's Data
    try:
        with open(DATABASE_PATH, 'r') as f:
            db = json.load(f)
        
        # Check if Gabriel is already in there, if not add him
        exists = False
        for i, c in enumerate(db['candidates']):
            if "Gabriel" in c['metadata']['candidate']:
                db['candidates'][i] = audit_data
                exists = True
                break
        
        if not exists:
            db['candidates'].append(audit_data)
            
        with open(DATABASE_PATH, 'w') as f:
            json.dump(db, f, indent=4)
        log("Database updated with Gabriel's profile.")
    except Exception as e:
        log(f"DB Update Failed: {str(e)}")

    # 3. Generate Truth-Based Optimization Blueprint
    log("Generating truth-based optimization blueprint...")
    # For now, we use the optimizer script which is MTS compliant
    try:
        subprocess.run([sys.executable, OPTIMIZER_SCRIPT], check=True)
        log("Optimization Blueprint generated.")
    except Exception as e:
        log(f"Optimization Failed: {str(e)}")

    log("--- Cycle Complete ---")

if __name__ == "__main__":
    run_autonomous_cycle()
