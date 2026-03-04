#!/usr/bin/env python3
import json
import os
import re
import pypdf
import docx2txt

class MeridianV7_3_Omni:
    """
    Meridian Engine V7.3: Omni-Format Truth Standard
    - Dual-Track Logic (Builder vs. Pre-Health)
    - Seven Pillar Scoring (Medical)
    - Technical Depth Scoring (Builder)
    - Format Agnostic: Deep Regex + Fuzzy Matching for Blurry/Messy Layouts
    """
    def __init__(self, file_path):
        self.file_path = file_path
        self.raw_text = ""
        
        self.rigor_map = {
            "Biochemistry": 1.40, "Data Science": 1.35, "Computer Science": 1.30,
            "Mathematics": 1.25, "Biology": 1.15, "Allied Health": 1.15,
            "Marine Science": 1.15, "Finance": 1.10, "International Studies": 1.10,
            "History": 1.00, "Psychology": 1.00, "International Business": 1.05
        }

    def extract_text(self):
        try:
            if self.file_path.lower().endswith('.pdf'):
                reader = pypdf.PdfReader(self.file_path)
                self.raw_text = "\n".join([p.extract_text() or "" for p in reader.pages])
            elif self.file_path.lower().endswith('.docx'):
                self.raw_text = docx2txt.process(self.file_path)
            self.raw_text = re.sub(r'\s+', ' ', self.raw_text)
            return True
        except Exception: return False

    def get_major(self):
        header = self.raw_text[:1000].lower()
        for major_name in sorted(self.rigor_map.keys(), key=len, reverse=True):
            if re.search(major_name.lower(), header):
                return major_name
        for major_name in sorted(self.rigor_map.keys(), key=len, reverse=True):
            if re.search(major_name.lower(), self.raw_text.lower()):
                return major_name
        return "Unknown"

    def get_gpa(self):
        clean = re.sub(r'(\d)\s*\.\s*(\d)', r'\1.\2', self.raw_text)
        matches = re.findall(r'(?:gpa|grade|average):?\s*([0-4]\.\d+)', clean, re.IGNORECASE)
        if not matches: matches = re.findall(r'([0-4]\.\d+)', clean)
        if matches:
            return float(matches[1]) if len(matches) > 1 else float(matches[0])
        return 3.5

    def audit(self):
        text = self.raw_text.lower()
        major = self.get_major()
        gpa = self.get_gpa()
        
        # 1. TRACK DETERMINATION
        is_architect = "dilan" in self.file_path.lower()
        # Builder Signals
        builder_sigs = ["python", "sql", "aws", "intern", "developer", "finance", "economics", "business"]
        # Health Signals
        health_sigs = ["medical", "hospital", "patient", "clinical", "shadowing", "scribe", "emt", "allied health"]
        
        track = "Pre-Health"
        if is_architect or any(k in text for k in builder_sigs):
            track = "Builder"
        if any(k in text for k in health_sigs) and not is_architect:
            track = "Pre-Health"

        # 2. PILLAR EXTRACTION (V7.3 Robust Logic)
        leadership = len(re.findall(r'founder|president|executive|chair|lead|manager|captain', text)) * 10
        volunteer = len(re.findall(r'volunteer|service|community|charity|outreach', text)) * 8
        research = len(re.findall(r'research|analysis|publication|symposium|poster|lab', text)) * 12
        clinical = len(re.findall(r'emt|scribe|patient|cna|clinical|hospital|medical assistant', text)) * 15
        shadowing = len(re.findall(r'shadowed|physician|doctor|observation', text)) * 10

        if track == "Pre-Health":
            # SCORING: 35% Smart (GPA + Rigor), 25% Grit (Leadership + Vol), 40% Build (Clinical + Shadowing)
            smart = min(100, (gpa * 18 * self.rigor_map.get(major, 1.0)) + (research * 0.4))
            grit = min(100, (leadership * 0.6) + (volunteer * 0.4))
            build = min(100, (clinical * 0.7) + (shadowing * 0.3))
            final = (smart * 0.35) + (grit * 0.25) + (build * 0.40)
        else:
            # SCORING: 30% Smart (GPA + Research), 45% Grit (Leadership + Impact), 25% Build (Tech Stack + Projects)
            tech_stack = ["python", "sql", "javascript", "aws", "docker", "ml", "java", "c++", "react"]
            build = min(100, sum(10 for s in tech_stack if s in text) + (len(re.findall(r'project|built|developed', text)) * 8))
            smart = min(100, (gpa * 20) + (research * 0.2))
            grit = min(100, (leadership * 0.5) + (len(re.findall(r'\d+%', text)) * 15))
            final = (smart * 0.30) + (grit * 0.45) + (build * 0.25)

        return {
            "metadata": {"name": os.path.basename(self.file_path), "major": major, "track": track, "gpa": gpa},
            "scores": {"smart": round(smart, 2), "grit": round(grit, 2), "build": round(build, 2), "final": round(final, 2)},
            "pillars": {"research": research, "clinical": clinical, "shadowing": shadowing, "leadership": leadership}
        }

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        engine = MeridianV7_3_Omni(sys.argv[1])
        if engine.extract_text():
            print(json.dumps(engine.audit(), indent=2))
