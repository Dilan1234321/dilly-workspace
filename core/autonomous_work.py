import os
import sys
import datetime
import subprocess

# Set up absolute base path
BASE_PATH = "/Users/dilankochhar/.openclaw/workspace"
sys.path.append(BASE_PATH)
sys.path.append(os.path.join(BASE_PATH, "projects/meridian"))

from projects.meridian.meridian_engine import MeridianAI
from projects.meridian.meridian_resume_auditor import MeridianResumeAuditor
from projects.meridian.database_manager import MeridianDatabase
import pypdf

LOG_FILE = os.path.join(BASE_PATH, "core/memory/2026-02-27.md")

def log_progress(msg):
    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(f"\n- [{timestamp}] {msg}")

def run_audits_on_new_resumes():
    log_progress("Scanning for new resumes in assets/resumes...")
    db = MeridianDatabase()
    resume_folder = os.path.join(BASE_PATH, "assets/resumes")
    
    for file in os.listdir(resume_folder):
        if file.endswith(".pdf"):
            log_progress(f"Auditing {file}...")
            auditor = MeridianResumeAuditor(os.path.join(resume_folder, file))
            if auditor.extract_text():
                analysis = auditor.analyze_content()
                # Use filename as candidate name if unknown
                if analysis['metadata'].get('candidate') == "Unknown":
                    analysis['metadata']['candidate'] = file.replace(".pdf", "")
                
                db.save_candidate(analysis)
                log_progress(f"Stored {file} in database.")

def find_and_train():
    log_progress("Searching for new resume data sources...")
    assets_dir = os.path.join(BASE_PATH, "assets")
    new_data_found = False
    for file in os.listdir(assets_dir):
        if file.endswith(".csv") and file != "Resume.csv":
            log_progress(f"Found new training data: {file}. Integrating...")
            try:
                from train_brain import MeridianBrainTrainer
                trainer = MeridianBrainTrainer(os.path.join(assets_dir, file), model_name="campus")
                trainer.train()
                log_progress(f"Model evolved with data from {file}.")
                new_data_found = True
            except Exception as e:
                log_progress(f"Training update failed: {e}")
    if not new_data_found:
        log_progress("No new local data.")

def update_desktop_note(msg):
    try:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
        update_dir = "/Users/dilankochhar/Desktop/Meridian_Updates"
        os.makedirs(update_dir, exist_ok=True)
        filename = f"auto_status_{timestamp}.md"
        with open(os.path.join(update_dir, filename), "w") as f:
            f.write(f"# Meridian Auto-Update\n\n{msg}")
        log_progress(f"Desktop update sync'd: {filename}")
    except Exception as e:
        log_progress(f"Desktop sync failed: {e}")

from projects.amazon_agent import AmazonTrendAgent

def run_amazon_sweep():
    log_progress("Starting Amazon Product Sweep...")
    agent = AmazonTrendAgent()
    agent.generate_live_report()
    log_progress("Amazon Trend Report updated.")

def main():
    log_progress("Starting Autonomous Build & Learn Cycle...")
    
    # 1. Process New Data & Resumes
    find_and_train()
    run_audits_on_new_resumes()
    
    # 2. Amazon Market Intelligence
    run_amazon_sweep()
    
    # 3. Performance Check
    try:
        # Benchmark Dilan's resume
        resume_path = os.path.join(BASE_PATH, "assets/resumes/resume.pdf")
        auditor = MeridianResumeAuditor(resume_path)
        if auditor.extract_text():
            analysis = auditor.analyze_content()
            score = analysis['metrics']['grit_score']
            log_progress(f"Dilan's Latest Grit Score: {score}")

            # 3. Push to Desktop
            update_msg = f"Cycle Complete.\n- New Data Checked\n- Database Updated\n- Dilan's Current Grit: {score}\n- Status: Autonomous Operation Active."
            update_desktop_note(update_msg)
    except Exception as e:
        log_progress(f"Benchmark failed: {e}")

    log_progress("Autonomous Cycle Complete.")

if __name__ == "__main__":
    main()
