#!/usr/bin/env python3
import json
import os
import re
import pypdf
import docx2txt

class MeridianV7_1_Med:
    """
    Meridian Engine V7.1: Pre-Health Fraternity Standard
    Hard-coded logic provided by Medical Fraternity President.
    - Seven Pillars Integration
    - Scarcity-Based Extracurricular Weighting
    - Patient-facing vs. Clerical Distinction
    """
    def __init__(self, file_path):
        self.file_path = file_path
        self.raw_text = ""
        self.analysis = {}
        
        # GROUND TRUTH RIGOR SCALE (V6.5 Baseline)
        self.rigor_multipliers = {
            "Biochemistry": 1.40, "Data Science": 1.30, "Computer Science": 1.30,
            "Mathematics": 1.25, "Biology": 1.15, "Allied Health": 1.15,
            "Nursing": 1.15, "Psychology": 1.00, "Unknown": 1.00
        }

    def extract_text(self):
        try:
            if self.file_path.lower().endswith('.pdf'):
                reader = pypdf.PdfReader(self.file_path)
                self.raw_text = "\n".join([p.extract_text() or "" for p in reader.pages])
            elif self.file_path.lower().endswith('.docx'):
                self.raw_text = docx2txt.process(self.file_path)
            return True
        except Exception: return False

    def audit(self):
        text = self.raw_text.lower()
        # Clean white-space split numbers
        clean_text = re.sub(r'(\d)\s*\.\s*(\d)', r'\1.\2', text)
        clean_text = re.sub(r'(\d)\s+(?=\d)', r'\1', clean_text)

        # 1. GPA/MCAT PILLARS (Academic Base)
        gpa_match = re.search(r'gpa:?\s*([0-4]\.\d+)', clean_text)
        gpa = float(gpa_match.group(1)) if gpa_match else 3.5
        mcat_match = re.search(r'mcat:?\s*(\d{3})', clean_text)
        mcat = int(mcat_match.group(1)) if mcat_match else 500
        
        # 2. LEADERSHIP PILLAR (Impact-Weighted)
        # High Impact: Founding, Non-profit, Executive
        # Medium Impact: Club leadership, Athletics
        leadership_high = sum(25 for kw in ["founder", "non-profit", "executive", "president", "chair"] if kw in text)
        leadership_med = sum(10 for kw in ["lead", "captain", "manager", "representative", "mentor"] if kw in text)
        leadership_score = min(100, leadership_high + leadership_med)

        # 3. VOLUNTEERING PILLAR (Service Density)
        # High: Underserved populations, community-focused
        # Low: Maintenance, hospital housekeeping
        vol_high = sum(20 for kw in ["underserved", "homeless", "community service", "shelter", "outreach"] if kw in text)
        vol_low = sum(5 for kw in ["cleaning", "maintenance", "desk", "hospital volunteer"] if kw in text)
        volunteering_score = min(100, vol_high + vol_low)

        # 4. CLINICAL PILLAR (Direct Patient Care)
        # High: EMT, MA, CNA, Scribe, Nursing
        # Low: Administrative, Receptionist
        clinical_high = sum(25 for kw in ["emt", "medical assistant", "cna", "scribe", "patient care", "emergency", "surgery"] if kw in text)
        clinical_low = sum(5 for kw in ["reception", "desk", "answering", "office"] if kw in text)
        clinical_score = min(100, clinical_high + clinical_low)

        # 5. RESEARCH & SHADOWING PILLARS
        research_score = sum(20 for kw in ["laboratory", "publication", "bench", "sequencing", "research assistant", "grant"] if kw in text)
        shadowing_score = sum(10 for kw in ["shadowing", "observation", "physician", "doctor"] if kw in text)

        # CALCULATION OF MERIDIAN TRIPLE
        # SMART: Academic pillars + Research
        smart_score = min(100, (gpa * 18) + (mcat/5.2) + (research_score * 0.2))
        
        # GRIT: Leadership + Volunteering (Service & Character)
        grit_score = min(100, (leadership_score * 0.6) + (volunteering_score * 0.4))
        
        # BUILD: Clinical Experience + Shadowing (Professional Readiness)
        build_score = min(100, (clinical_score * 0.8) + (shadowing_score * 0.2))

        final_score = (smart_score * 0.3) + (grit_score * 0.3) + (build_score * 0.4)

        return {
            "metadata": {"gpa": gpa, "mcat": mcat},
            "scores": {
                "smart": round(smart_score, 2),
                "grit": round(grit_score, 2),
                "build": round(build_score, 2),
                "final": round(final_score, 2)
            },
            "evidence": {
                "leadership": "Founders/Non-profit detected" if leadership_high > 0 else "Standard leadership",
                "volunteering": "Underserved outreach detected" if vol_high > 0 else "Clerical/Hospital service",
                "clinical": "Direct Patient Care (EMT/MA)" if clinical_high > 0 else "Admin/Passive exposure"
            }
        }

if __name__ == "__main__":
    import sys
    engine = MeridianV7_1_Med(sys.argv[1])
    if engine.extract_text():
        print(json.dumps(engine.audit(), indent=2))
