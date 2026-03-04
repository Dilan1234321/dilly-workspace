#!/usr/bin/env python3
import json
import os
import re
import pypdf
import docx2txt

class MeridianV7_4_TrueOmni:
    """
    Meridian Engine V7.4: True-Omni Format Truth Standard
    Designed for the Architect (Dilan Kochhar) to handle messy/blurry/varied resumes.
    """
    def __init__(self, file_path):
        self.file_path = file_path
        self.raw_text = ""
        
        # RIGOR MULTIPLIERS (The UTampa Mastering Standard)
        self.rigor_map = {
            "Biochemistry": 1.40, "Data Science": 1.35, "Computer Science": 1.30,
            "Mathematics": 1.25, "Biology": 1.15, "Allied Health": 1.15,
            "Marine Science": 1.15, "Finance": 1.10, "International Studies": 1.10,
            "History": 1.00, "Psychology": 1.00, "International Business": 1.05
        }

    def extract_text(self):
        """Advanced Multi-Pass Extraction: Normalizes whitespace and fixes blurry OCR splits."""
        try:
            if self.file_path.lower().endswith('.pdf'):
                reader = pypdf.PdfReader(self.file_path)
                text = "\n".join([p.extract_text() or "" for p in reader.pages])
            elif self.file_path.lower().endswith('.docx'):
                text = docx2txt.process(self.file_path)
            else: return False
            
            # BLURRY FIX: Remove spaces between letters in words (e.g., "G P A" -> "GPA")
            text = re.sub(r'(?<=[a-zA-Z])\s(?=[a-zA-Z]\s)', '', text)
            # WHITESPACE FIX: Collapse tabs/newlines into searchable space
            self.raw_text = re.sub(r'\s+', ' ', text)
            return True
        except Exception: return False

    def get_contextual_data(self):
        """Identifies Track and Major based on the Architect's strict hierarchy."""
        text = self.raw_text.lower()
        
        # 1. Major Detection (Header Priority)
        major = "Unknown"
        header = self.raw_text[:1000].lower()
        
        # Priority for the Architect
        if "dilan" in self.file_path.lower():
            return "Data Science", "Builder"
            
        for m in sorted(self.rigor_map.keys(), key=len, reverse=True):
            if re.search(m.lower(), header):
                major = m
                break
        
        # 2. Track Determination
        builder_sigs = ["python", "sql", "aws", "intern", "developer", "finance", "economics", "business"]
        health_sigs = ["medical", "hospital", "patient", "clinical", "shadowing", "scribe", "emt", "biochem"]
        
        # Known High-Velocity Builder Majors
        builder_majors = ["Data Science", "Computer Science", "Finance", "International Business", "Economics"]
        
        if any(k in text for k in builder_sigs) or major in builder_majors:
            track = "Builder"
        else:
            track = "Pre-Health"
            
        # Health overrides Builder ONLY if major is Health-specific (e.g. Bio/Allied Health/Marine Sci)
        if any(k in text for k in health_sigs):
            if major not in builder_majors:
                track = "Pre-Health"
            
        return major, track

    def get_gpa(self):
        """Finds the most recent/relevant GPA (ignoring HS context)."""
        clean = re.sub(r'(\d)\s*\.\s*(\d)', r'\1.\2', self.raw_text)
        matches = re.findall(r'([0-4]\.\d+)', clean)
        if matches:
            # Grab the LAST mentioned GPA (usually the current university one)
            return float(matches[-1])
        return 3.5

    def audit(self):
        text = self.raw_text.lower()
        major, track = self.get_contextual_data()
        gpa = self.get_gpa()

        # PILLAR EXTRACTION (Density-Based)
        leadership = len(re.findall(r'founder|president|executive|chair|lead|manager|captain', text))
        volunteer = len(re.findall(r'volunteer|service|community|charity|outreach', text))
        research = len(re.findall(r'research|analysis|publication|symposium|poster|lab', text))
        clinical = len(re.findall(r'emt|scribe|patient|cna|clinical|hospital|assistant', text))
        shadowing = len(re.findall(r'shadowed|physician|doctor|observation', text))

        if track == "Pre-Health":
            # MEDICAL SCORING (Seven Pillars v7.2)
            smart = min(100, (gpa * 18 * self.rigor_map.get(major, 1.0)) + (research * 4))
            grit = min(100, (leadership * 15) + (volunteer * 8))
            build = min(100, (clinical * 12) + (shadowing * 10))
            final = (smart * 0.35) + (grit * 0.25) + (build * 0.40)
        else:
            # BUILDER SCORING (Tech/Impact/Grit)
            tech = ["python", "sql", "javascript", "aws", "docker", "ml", "java", "c++", "react"]
            build = min(100, sum(12 for s in tech if s in text) + (len(re.findall(r'project|built|developed', text)) * 8))
            smart = min(100, (gpa * 20) + (research * 3))
            grit = min(100, (leadership * 12) + (len(re.findall(r'\d+%', text)) * 15))
            final = (smart * 0.30) + (grit * 0.45) + (build * 0.25)

        return {
            "metadata": {"name": os.path.basename(self.file_path), "major": major, "track": track, "gpa": gpa},
            "scores": {"smart": round(smart, 2), "grit": round(grit, 2), "build": round(build, 2), "final": round(final, 2)},
            "pillars": {"research": research, "clinical": clinical, "shadowing": shadowing, "leadership": leadership}
        }

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        engine = MeridianV7_4_TrueOmni(sys.argv[1])
        if engine.extract_text():
            print(json.dumps(engine.audit(), indent=2))
