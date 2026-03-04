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
    text = text.lower()
    # Impact: numbers, percentages, dollar signs
    impact = len(re.findall(r'\d+%', text)) + len(re.findall(r'\$\d+', text)) + len(re.findall(r'\d{2,},?\d*', text))
    # Leadership: specific roles
    leadership = sum(1 for r in ['founder', 'vp', 'lead', 'manager', 'director', 'president', 'chair', 'secretary', 'captain', 'representative'] if r in text)
    # Tech: specific stack
    tech = sum(1 for t in ['python', 'sql', 'aws', 'javascript', 'api', 'docker', 'ml', 'html', 'css', 'excel', 'tableau'] if t in text)
    # Velocity: verbs
    velocity = sum(1 for v in ['launched', 'spearheaded', 'orchestrated', 'built', 'developed', 'engineered', 'impacted', 'raised', 'managed'] if v in text)
    
    return {
        "impact_raw": impact,
        "leadership_raw": leadership,
        "tech_raw": tech,
        "velocity_raw": velocity,
        "total_raw": impact + leadership + tech + velocity
    }

resumes_dir = "/Users/dilankochhar/Desktop/resumes/"
candidates = []

for file in os.listdir(resumes_dir):
    if file.endswith((".pdf", ".docx")):
        text = extract_text(os.path.join(resumes_dir, file))
        signals = get_signals(text)
        signals["name"] = file.split(".")[0]
        candidates.append(signals)

df = pd.DataFrame(candidates)

# Peer-Relative Scoring (Normalization)
# We score them from 0 to 100 based on where they sit compared to the BEST in the current group.
for col in ["impact_raw", "leadership_raw", "tech_raw", "velocity_raw", "total_raw"]:
    max_val = df[col].max()
    if max_val > 0:
        df[f"{col}_score"] = (df[col] / max_val) * 100
    else:
        df[f"{col}_score"] = 0

# Final Peer Score = Average of normalized signals
df["Meridian_Peer_Score"] = df[["impact_raw_score", "leadership_raw_score", "tech_raw_score", "velocity_raw_score"]].mean(axis=1)

# Sort by Peer Score
df = df.sort_values(by="Meridian_Peer_Score", ascending=False)

print(f"{'NAME':<20} | {'IMPACT':<7} | {'LEADERSHIP':<10} | {'TECH':<7} | {'VELOCITY':<8} | {'PEER SCORE'}")
print("-" * 80)
for _, row in df.iterrows():
    print(f"{row['name'][:20]:<20} | {row['impact_raw_score']:<7.1f} | {row['leadership_raw_score']:<10.1f} | {row['tech_raw_score']:<7.1f} | {row['velocity_raw_score']:<8.1f} | {row['Meridian_Peer_Score']:.2f}")

# Save the baseline
df.to_csv("assets/utampa_peer_baseline.csv", index=False)
