import pickle
import pandas as pd
import numpy as np
import os
import pypdf

class DillyWorkshop:
    def __init__(self, resume_path="assets/resumes/resume.pdf"):
        self.resume_path = resume_path
        self.base_path = os.path.dirname(os.path.abspath(__file__))
        self.models_dir = os.path.join(self.base_path, "models/pro")
        
    def run_gap_analysis(self):
        # 1. Load the "Elite" Brain's vocabulary
        vec_path = os.path.join(self.models_dir, "vectorizer.pkl")
        with open(vec_path, "rb") as f:
            vectorizer = pickle.load(f)
        
        # 2. Extract keywords the Elite model values most
        # We look for high-IDF (rare/specialized) words in the training set
        feature_names = vectorizer.get_feature_names_out()
        
        # 3. Read Dilan's Resume
        reader = pypdf.PdfReader(self.resume_path)
        resume_text = "\n".join([p.extract_text() for p in reader.pages]).lower()
        
        # 4. Find the "Missing Elite" Keywords
        # These are high-value tech/impact words from the Pro model you DON'T have
        elite_targets = [
            'kubernetes', 'docker', 'microservices', 'scalability', 'aws', 
            'deployment', 'ci/cd', 'distributed', 'architecture', 'latency',
            'optimization', 'infrastructure', 'terraform', 'api design', 'throughput'
        ]
        
        missing = [word for word in elite_targets if word not in resume_text]
        found = [word for word in elite_targets if word in resume_text]
        
        return {
            "found_elite_markers": found,
            "missing_elite_markers": missing,
            "workshop_advice": self.generate_advice(missing)
        }

    def generate_advice(self, missing):
        advice = []
        if 'deployment' in missing or 'infrastructure' in missing:
            advice.append("Move from 'built a model' to 'deployed a model'. Use words like AWS, Cloud, or Infrastructure.")
        if 'scalability' in missing or 'distributed' in missing:
            advice.append("Emphasize how your projects handle LARGE data. Use 'distributed' or 'high-throughput'.")
        if 'ci/cd' in missing or 'docker' in missing:
            advice.append("Add 'DevOps' elements. Mention your containerization or automation pipeline.")
        return advice

if __name__ == "__main__":
    # Resolve paths relative to workspace
    ws_resume = "/Users/dilankochhar/.openclaw/workspace/assets/resumes/resume.pdf"
    workshop = DillyWorkshop(ws_resume)
    analysis = workshop.run_gap_analysis()
    
    print("\n--- DILLY RESUME WORKSHOP: GAP ANALYSIS ---")
    print(f"Elite Markers Found: {', '.join(analysis['found_elite_markers'])}")
    print(f"Missing Elite Markers: {', '.join(analysis['missing_elite_markers'])}")
    print("\nStrategic Advice:")
    for a in analysis['workshop_advice']:
        print(f"- {a}")
    print("-" * 46)
