import os
import json
import shutil
import uuid
import re
from projects.meridian.meridian_resume_auditor import MeridianResumeAuditor

# Mocking the engine components since we're running as a script
RESUME_DIR = "assets/resumes"
DB_PATH = "projects/meridian/beta_cohort_db.json"

def detect_track(text: str) -> str:
    text = text.lower()
    if any(x in text for x in ["medical", "clinic", "hospital", "biology", "chemistry", "nursing", "physician", "allied health", "biomedical", "biochemistry"]):
        return "Pre-Health"
    if any(x in text for x in ["law", "legal", "debate", "justice", "political science", "philosophy", "pre-law", "paralegal", "juris"]):
        return "Pre-Law"
    return "Builder"

def run_batch_audit():
    if not os.path.exists(DB_PATH):
        with open(DB_PATH, "w") as f:
            json.dump({"candidates": []}, f)
            
    with open(DB_PATH, "r") as f:
        db = json.load(f)

    processed_count = 0
    for filename in os.listdir(RESUME_DIR):
        if filename.endswith(".pdf"):
            filepath = os.path.join(RESUME_DIR, filename)
            print(f"Auditing: {filename}...")
            
            try:
                auditor = MeridianResumeAuditor(filepath)
                if auditor.extract_text():
                    auditor.analyze_content()
                    
                    candidate_data = {
                        "metadata": {
                            "candidate": auditor.analysis["metadata"]["candidate"],
                            "grad_year": auditor.analysis["metadata"]["grad_year"],
                            "college": auditor.analysis["metadata"]["college"],
                            "major": auditor.analysis["metadata"]["major"],
                            "track": detect_track(auditor.raw_text + " " + auditor.analysis["metadata"]["major"]),
                            "filename": filename
                        },
                        "metrics": auditor.analysis["metrics"],
                        "last_audit": "2026-03-03 13:15:00"
                    }
                    db["candidates"].append(candidate_data)
                    processed_count += 1
            except Exception as e:
                print(f"Error processing {filename}: {e}")

    with open(DB_PATH, "w") as f:
        json.dump(db, f, indent=4)
    
    print(f"Batch complete. {processed_count} real candidates added to database.")

if __name__ == "__main__":
    run_batch_audit()