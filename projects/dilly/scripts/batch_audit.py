#!/usr/bin/env python3
import os
import json
import sys

# Ensure workspace root is in path
WORKSPACE_ROOT = os.getcwd() # Use CWD since OpenClaw runs from workspace root
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

from projects.dilly.meridian_resume_auditor import MeridianResumeAuditor

RESUME_DIR = "assets/resumes"
REPORT_DIR = "projects/meridian/reports"
STATE_FILE = "memory/heartbeat-state.json"

def run_audit(file_path):
    print(f"Auditing: {file_path}")
    auditor = MeridianResumeAuditor(file_path)
    if not auditor.extract_text():
        print(f"Failed to extract text from {file_path}")
        return
    
    auditor.analyze_content()
    report_json = auditor.generate_json_report()
    
    # Save report
    filename = os.path.basename(file_path)
    report_path = os.path.join(REPORT_DIR, f"report_{filename}.json")
    os.makedirs(REPORT_DIR, exist_ok=True)
    with open(report_path, 'w') as f:
        json.dump(report_json, f, indent=2)
    print(f"Report saved to {report_path}")

def main():
    if not os.path.exists(STATE_FILE):
        print(f"State file {STATE_FILE} not found.")
        return

    with open(STATE_FILE, 'r') as f:
        state = json.load(f)
    
    known_files = set(state.get("files_at_last_check", []))
    current_files = [f for f in os.listdir(RESUME_DIR) if f.endswith(('.pdf', '.docx'))]
    
    new_files = [f for f in current_files if f not in known_files]
    
    if not new_files:
        print("No new files to audit.")
        return

    for filename in new_files:
        full_path = os.path.join(RESUME_DIR, filename)
        try:
            run_audit(full_path)
        except Exception as e:
            print(f"Error auditing {filename}: {e}")

if __name__ == "__main__":
    main()
