import json
import os
import sys
from projects.dilly.dilly_v7_4 import DillyV7_4_TrueOmni

def generate_draft_reports(new_files):
    for filename in new_files:
        path = os.path.join("assets/resumes", filename)
        if os.path.exists(path):
            print(f"Processing: {filename}...")
            engine = DillyV7_4_TrueOmni(path)
            if engine.extract_text():
                audit = engine.audit()
                safe_name = filename.replace(" ", "_").replace(".pdf", "")
                report_name = f"dilly_report_{safe_name}.json"
                report_path = os.path.join("projects/dilly/reports", report_name)
                with open(report_path, "w") as f:
                    json.dump(audit, f, indent=4)
                print(f"Generated Draft Report: {report_path}")

if __name__ == "__main__":
    files = sys.argv[1:]
    generate_draft_reports(files)
