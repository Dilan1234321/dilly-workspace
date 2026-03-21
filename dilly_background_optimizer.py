import os
import subprocess
import time
import datetime

WORKSPACE = "/Users/dilankochhar/.openclaw/workspace"
PYTHON_BIN = os.path.join(WORKSPACE, "dilly_venv/bin/python")
RETRAIN_SCRIPT = os.path.join(WORKSPACE, "projects/dilly/retrain_brains.py")
LOG_FILE = os.path.join(WORKSPACE, "projects/dilly/autonomous_run.log")

def run_optimization():
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, "a") as log:
        log.write(f"\n{timestamp} - Starting autonomous background optimization...\n")
        try:
            result = subprocess.run([PYTHON_BIN, RETRAIN_SCRIPT], capture_output=True, text=True)
            log.write(result.stdout)
            if result.stderr:
                log.write(f"ERROR: {result.stderr}\n")
            log.write(f"{timestamp} - SUCCESS: Dilly brains retrained.\n")
        except Exception as e:
            log.write(f"{timestamp} - CRITICAL ERROR: {str(e)}\n")

if __name__ == "__main__":
    while True:
        run_optimization()
        # Sleep for 10 minutes (600 seconds)
        time.sleep(600)
