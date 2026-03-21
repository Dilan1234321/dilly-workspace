import time
import subprocess
import os

BASE_DIR = "/Users/dilankochhar/.openclaw/workspace"
SCRIPT_PATH = os.path.join(BASE_DIR, "projects/dilly/retrain_brains.py")
LOG_PATH = os.path.join(BASE_DIR, "projects/dilly/dilly_cron.log")

def run_retrain():
    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')
    with open(LOG_PATH, 'a') as log_file:
        log_file.write(f"[{timestamp}] Starting autonomous retrain...\n")
        try:
            result = subprocess.run(["python3", SCRIPT_PATH], capture_output=True, text=True, check=True)
            log_file.write(result.stdout)
            log_file.write(f"[{timestamp}] Retrain successful.\n")
        except subprocess.CalledProcessError as e:
            log_file.write(f"[{timestamp}] Error: {e.stderr}\n")

if __name__ == "__main__":
    while True:
        run_retrain()
        # Sleep for 10 minutes (600 seconds)
        time.sleep(600)
