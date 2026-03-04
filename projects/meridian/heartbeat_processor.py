import json
import os
import sys
from projects.meridian.meridian_v7_4 import MeridianV7_4_TrueOmni

def generate_draft_reports(new_files):
    for filename in new_files:
        path = os.path.join("assets/resumes", filename)
        if os.path.exists(path):
            print(f"Processing: {filename}...")
            engine = MeridianV7_4_TrueOmni(path)
            if engine.extract_text():
                audit = engine.audit()
                safe_name = filename.replace(" ", "_").replace(".pdf", "")
                report_name = f"meridian_report_{safe_name}.json"
                report_path = os.path.join("projects/meridian/reports", report_name)
                with open(report_path, "w") as f:
                    json.dump(audit, f, indent=4)
                print(f"Generated Draft Report: {report_path}")

if __name__ == "__main__":
    files = sys.argv[1:]
    generate_draft_reports(files)
