"""
Batch-audit resumes in assets/resumes and append each to training_data.json (LLM few-shot).
No cohort DB; Dilly uses only few-shot examples from prompts/training_data.json.
"""
import os
from projects.dilly.dilly_resume_auditor import DillyResumeAuditor
from dilly_core.resume_parser import parse_resume
from dilly_core.auditor import run_audit
from dilly_core.training_append import append_audit_to_training

RESUME_DIR = os.environ.get("RESUME_DIR", "assets/resumes")

def run_batch_audit():
    if not os.path.isdir(RESUME_DIR):
        print(f"Resume dir not found: {RESUME_DIR}")
        return
    processed = 0
    for filename in os.listdir(RESUME_DIR):
        if not (filename.lower().endswith(".pdf") or filename.lower().endswith(".docx")):
            continue
        filepath = os.path.join(RESUME_DIR, filename)
        if not os.path.isfile(filepath):
            continue
        print(f"Auditing: {filename}...")
        try:
            auditor = DillyResumeAuditor(filepath)
            if not auditor.extract_text():
                print(f"  Skip (no text): {filename}")
                continue
            text = auditor.raw_text
            parsed = parse_resume(text, filename=filename)
            result = run_audit(
                parsed.normalized_text or text,
                candidate_name=parsed.name,
                major=parsed.major,
                gpa=parsed.gpa,
                filename=filename,
            )
            append_audit_to_training(text, result, filename=filename)
            processed += 1
        except Exception as e:
            print(f"  Error: {e}")
    print(f"Batch complete. {processed} resumes audited and appended to training_data.json (few-shot).")

if __name__ == "__main__":
    run_batch_audit()