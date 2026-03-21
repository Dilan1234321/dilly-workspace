import os
import json
import subprocess

RESUME_DIR = "assets/resumes"
V7_2_ENGINE = "projects/dilly/dilly_v7_2.py"
OUTPUT_DB = "projects/dilly/dilly_database.json"

def run_v7_2_batch():
    results = {"candidates": []}
    
    # Supported formats
    extensions = (".pdf", ".docx", ".pdf.pdf")
    
    for filename in os.listdir(RESUME_DIR):
        if filename.lower().endswith(extensions):
            filepath = os.path.join(RESUME_DIR, filename)
            print(f"Auditing: {filename}...")
            
            try:
                venv_python = "projects/dilly/venv/bin/python3"
                env = os.environ.copy()
                env["PYTHONPATH"] = "."
                
                process = subprocess.run([venv_python, V7_2_ENGINE, filepath], 
                                       capture_output=True, text=True, env=env)
                
                if process.returncode == 0 and process.stdout.strip():
                    audit_result = json.loads(process.stdout)
                    results["candidates"].append(audit_result)
                else:
                    print(f"Error auditing {filename}: {process.stderr}")
            except Exception as e:
                print(f"Batch Error on {filename}: {e}")

    with open(OUTPUT_DB, "w") as f:
        json.dump(results, f, indent=4)
    print(f"Batch Complete. Database restored with {len(results['candidates'])} real records.")

if __name__ == "__main__":
    run_v7_2_batch()