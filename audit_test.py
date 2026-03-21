import sys
import json
import os
from projects.dilly.dilly_v7_2 import DillyV7_2_Med

def run_test():
    if len(sys.argv) < 2:
        print("Usage: python3 audit_test.py <path_to_resume_pdf>")
        return

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} not found.")
        return

    engine = DillyV7_2_Med(file_path)
    if engine.extract_text():
        result = engine.audit()
        
        print("\n" + "="*40)
        print(f" DILLY MTS AUDIT: {result['metadata']['name']}")
        print("="*40)
        print(f"TRACK: {result['metadata']['track']}")
        print(f"FINAL SCORE: {result['scores']['final']}/100")
        print("-" * 20)
        print(f"SMART (Rigor): {result['scores']['smart']}")
        print(f"GRIT (Impact): {result['scores']['grit']}")
        print(f"BUILD (Clinical): {result['scores']['build']}")
        print("-" * 20)
        print("PILLAR EVIDENCE:")
        for pillar, status in result['pillar_evidence'].items():
            print(f"  - {pillar.capitalize()}: {status}")
        print("="*40 + "\n")
    else:
        print("Failed to extract text from resume.")

if __name__ == "__main__":
    run_test()
