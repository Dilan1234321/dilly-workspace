import os
import re
import pypdf
import docx2txt
import pandas as pd
import numpy as np

def extract_text(path):
    if path.endswith(".pdf"):
        try:
            reader = pypdf.PdfReader(path)
            return "\n".join([p.extract_text() for p in reader.pages if p.extract_text()])
        except: return ""
    elif path.endswith(".docx"):
        try: return docx2txt.process(path)
        except: return ""
    return ""

def get_signals(text):
    text_low = text.lower()
    
    # --- SMART SIGNAL (Academic Performance) ---
    # Extract GPA
    gpa_match = re.search(r'(\d\.\d+)\s*GPA', text, re.I)
    if not gpa_match: gpa_match = re.search(r'GPA[:\s\-]+(\d\.\d+)', text, re.I)
    gpa = float(gpa_match.group(1)) if gpa_match else 0.0
    # Honors/Tutor/Research
    academic_honors = sum(1 for h in ['honors', 'dean\'s list', 'tutor', 'scholar', 'research assistant', 'honor society'] if h in text_low)
    smart_raw = (gpa * 10) + (academic_honors * 5)

    # --- GRIT SIGNAL (Leadership & Real-World Output) ---
    leadership = sum(1 for r in ['founder', 'vp', 'lead', 'manager', 'director', 'president', 'chair', 'captain', 'representative', 'caregiver', 'volunteer'] if r in text_low)
    impact = len(re.findall(r'\d+%', text)) + len(re.findall(r'\$\d+', text)) + len(re.findall(r'\b\d{2,}\b', text)) # Counts significant numbers
    grit_raw = (leadership * 15) + (impact * 2)

    # --- BUILD SIGNAL (Technical Stack & Projects) ---
    tech_keywords = ['python', 'sql', 'aws', 'javascript', 'api', 'docker', 'ml', 'html', 'css', 'excel', 'tableau', 'siem', 'cryptography', 'penetration', 'git']
    tech_count = sum(1 for t in tech_keywords if t in text_low)
    projects = sum(1 for p in ['project', 'engineered', 'architected', 'developed', 'built', 'launched'] if p in text_low)
    build_raw = (tech_count * 15) + (projects * 10)
    
    return {
        "smart_raw": smart_raw,
        "grit_raw": grit_raw,
        "build_raw": build_raw,
        "gpa": gpa
    }

resumes_dir = "/Users/dilankochhar/Desktop/resumes/"
candidates = []

for file in os.listdir(resumes_dir):
    if file.endswith((".pdf", ".docx")):
        text = extract_text(os.path.join(resumes_dir, file))
        signals = get_signals(text)
        # Simple name extraction
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        signals["name"] = lines[0] if lines else file
        candidates.append(signals)

df = pd.DataFrame(candidates)

# Peer-Relative Normalization (0-100)
for col in ["smart_raw", "grit_raw", "build_raw"]:
    max_val = df[col].max()
    if max_val > 0:
        df[f"{col}_score"] = (df[col] / max_val) * 100
    else:
        df[f"{col}_score"] = 0

# Final Dilly Score: Weighted Average
# We weight Grit and Build more heavily than Smart for "high-velocity" alignment
df["Dilly_Score"] = (df["smart_raw_score"] * 0.2) + (df["grit_raw_score"] * 0.4) + (df["build_raw_score"] * 0.4)

df = df.sort_values(by="Dilly_Score", ascending=False)

print(f"{'NAME':<20} | {'GPA':<5} | {'SMART':<7} | {'GRIT':<7} | {'BUILD':<7} | {'FINAL SCORE'}")
print("-" * 80)
for _, row in df.iterrows():
    print(f"{row['name'][:20]:<20} | {row['gpa']:<5.2f} | {row['smart_raw_score']:<7.1f} | {row['grit_raw_score']:<7.1f} | {row['build_raw_score']:<7.1f} | {row['Dilly_Score']:.2f}")
