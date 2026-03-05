#!/usr/bin/env python3
import json
import datetime
import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
import pypdf
import re

class MeridianResumeAuditor:
    def __init__(self, file_path):
        """Accept a path to a PDF or DOCX resume."""
        self.pdf_path = file_path  # kept for backward compatibility
        self.file_path = file_path
        self.raw_text = ""
        self.analysis = {}

    def extract_text(self):
        path_lower = (self.file_path or "").lower()
        if path_lower.endswith(".docx"):
            try:
                import docx2txt
                self.raw_text = (docx2txt.process(self.file_path) or "").strip()
                return bool(self.raw_text)
            except Exception as e:
                print(f"Error reading DOCX: {e}")
                return False
        try:
            reader = pypdf.PdfReader(self.file_path)
            self.raw_text = "\n".join([p.extract_text() or "" for p in reader.pages])
            return bool(self.raw_text.strip())
        except Exception as e:
            print(f"Error reading PDF: {e}")
            return False

    def analyze_content(self):
        text = self.raw_text
        text_lower = text.lower()
        
        # 1. Candidate Name
        name_match = re.match(r'^([^\n|]+)', text.strip())
        candidate_name = name_match.group(1).strip() if name_match else "Unknown"

        # 2. Graduation Year
        grad_year_match = re.search(r'(?:202[4-9]|2030)', text, re.IGNORECASE)
        grad_year = grad_year_match.group(0) if grad_year_match else "Unknown"

        # 3. College/University
        college = "Unknown"
        if "tampa" in text_lower:
            college = "University of Tampa"
        else:
            college_patterns = [
                r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:University|College|Institute))',
                r'(University\s+of\s+[A-Z][a-z]+)',
            ]
            for cp in college_patterns:
                cm = re.search(cp, text)
                if cm:
                    college = cm.group(1).strip()
                    break

        # 4. MAJOR EXTRACTION - Precision Engine V6 (no Unknown when major is stated)
        major = "Unknown"

        def normalize_major_display(raw: str) -> str:
            """Clean captured degree/major text for display; preserve combined majors (e.g. History & International Studies)."""
            if not raw or not raw.strip():
                return "Unknown"
            s = re.sub(r'\s+', ' ', raw.strip())
            # Remove trailing degree words so "Data Science B.S." -> "Data Science"
            s = re.sub(r'\s*(?:b\.?s\.?|b\.?a\.?|bachelors?|degree|major|minor)\s*$', '', s, flags=re.IGNORECASE)
            s = re.sub(r'^\s*(?:b\.?s\.?|b\.?a\.?|bachelors?|degree|in)\s+', '', s, flags=re.IGNORECASE)
            s = s.strip()
            return s.title() if s and len(s) > 1 else "Unknown"

        def map_to_major(raw_text: str):
            raw_lower = raw_text.lower()
            canonical_map = {
                "Data Science": ["data science", "analytics"],
                "Computer Science": ["computer science", "software engineering", "computing", "cs "],
                "Cybersecurity": ["cybersecurity", "cyber security", "cyber security"],
                "Biochemistry": ["biochemistry"],
                "Biomedical Sciences": ["biomedical"],
                "Allied Health": ["allied health", "medical science"],
                "Biology": ["biology"],
                "Chemistry": ["chemistry"],
                "Finance": ["finance", "financial"],
                "Economics": ["economics"],
                "Psychology": ["psychology", "pre-medicine", "pre-med"],
                "International Business": ["international business"],
                "Marketing": ["marketing"],
                "Mathematics": ["mathematics", "math"],
                "Accounting": ["accounting"],
                "Criminology": ["criminology"],
                "Nursing": ["nursing"],
                "History": ["history"],
                "International Studies": ["international studies"],
                "Political Science": ["political science"],
                "Communication": ["communication"],
                "Management": ["management"],
                "Marine Science": ["marine science"],
                "Secondary Education": ["secondary education", "education - mathematics", "education mathematics"],
            }
            for c_name, keywords in canonical_map.items():
                if any(kw in raw_lower for kw in keywords):
                    return c_name
            return None

        def extract_major_from_capture(captured: str):
            """Return canonical major if mapped, else normalized display major (never Unknown if we have text)."""
            if not captured or len(captured.strip()) < 2:
                return None
            mapped = map_to_major(captured)
            if mapped:
                return mapped
            normalized = normalize_major_display(captured)
            return normalized if normalized != "Unknown" else None

        edu_keywords = ["education", "academic", "university of tampa", "university of"]
        lines = text.split('\n')

        # Priority 1: Lines near "Education" or "University of Tampa"
        for i, line in enumerate(lines):
            if any(k in line.lower() for k in edu_keywords):
                search_area = "\n".join(lines[i:i+6])
                patterns = [
                    r'(?:Bachelor|Degree|Major|B\.S\.|B\.A\.|BS|BA|Bachelors)\s+(?:of\s+Science\s+in|of\s+Arts\s+in|of\s+Science|of\s+Arts|in|:)?\s*([^|\n\.]{2,60})',
                    r'(?:Major|Concentration|Degree)[:\s]+([^|\n\.]{2,60})',
                    r'([A-Za-z][^|\n\.\d]{2,50})\s*,?\s*(?:B\.S\.|B\.A\.|BS|BA|Bachelors|Degree)\b',
                    r'(?:in|–|-)\s+([A-Za-z][^|\n\.]{2,50}(?:\s+&\s+[A-Za-z][^|\n\.]{2,30})?)',  # "in Data Science" or "History & International Studies"
                ]
                for p in patterns:
                    for m in re.finditer(p, search_area, re.IGNORECASE):
                        candidate = m.group(1).strip()
                        if len(candidate) < 3 or re.match(r'^[\d\.\s]+$', candidate):
                            continue
                        extracted = extract_major_from_capture(candidate)
                        if extracted:
                            major = extracted
                            break
                if major != "Unknown":
                    break

        # Priority 2: Full-text keyword scan (first 2500 chars)
        if major == "Unknown":
            major = map_to_major(text[:2500]) or "Unknown"

        # Priority 3: Any "B.S. in X" or "Major: X" in full text
        if major == "Unknown":
            for p in [
                r'(?:B\.S\.|B\.A\.|BS|BA)\s+in\s+([A-Za-z][^|\n\.]{2,50})',
                r'Major[:\s]+([A-Za-z][^|\n\.]{2,50})',
                r'(?:Bachelor|Degree)\s+in\s+([A-Za-z][^|\n\.]{2,50})',
            ]:
                m = re.search(p, text, re.IGNORECASE)
                if m:
                    extracted = extract_major_from_capture(m.group(1))
                    if extracted:
                        major = extracted
                        break

        # 5. International Status
        is_intl = any(x in text_lower for x in ['f-1', 'f1 visa', 'opt/cpt', 'j-1', 'h1-b', 'swahili', 'arabic', 'brazil', 'india', 'kenya'])
        visa = "F-1 (International)" if is_intl else "Domestic"

        # 6. TRACK ASSIGNMENT (Major-Locked)
        track = "Builder"
        m_l = major.lower()
        if any(x in m_l for x in ['biology', 'biochemistry', 'chemistry', 'health', 'nursing', 'psychology']):
            track = "Pre-Health"
        elif any(x in m_l for x in ['political science', 'criminology', 'philosophy', 'law']):
            track = "Pre-Law"

        # 7. SCORING ENGINE - Bias-Neutral Implementation
        gpa_m = re.search(r'(?:GPA|Grade Point Average):?\s*([0-4]\.\d+)', text)
        gpa = float(gpa_m.group(1)) if gpa_m else 3.5
        academic_rigor = (gpa * 20)
        honors = 10 if any(h in text_lower for h in ["dean's list", "honors", "cum laude", "scholarship"]) else 0
        research = 10 if "research" in text_lower else 0
        smart_score = min(100, academic_rigor + honors + research)

        impact_markers = len(re.findall(r'\d+%', text_lower)) + len(re.findall(r'\$\d+', text_lower))
        leadership_count = sum(1 for r in ['president', 'vp', 'founder', 'director', 'lead', 'chairman', 'captain'] if r in text_lower)
        grit_score = min(100, (impact_markers * 15) + (leadership_count * 10) + (10 if is_intl else 0))

        tech_keywords = ['python', 'javascript', 'sql', 'r', 'java', 'aws', 'docker', 'machine learning', 'excel', 'tableau', 'git', 'react', 'typescript']
        skill_density = sum(1 for s in tech_keywords if s in text_lower)
        project_count = len(re.findall(r'(?:Project|Built|Developed|Deployed|Created)', text))
        build_score = min(100, (skill_density * 7) + (project_count * 6))

        self.analysis = {
            "metadata": {
                "candidate": candidate_name,
                "grad_year": grad_year,
                "college": college,
                "major": major,
                "visa_status": visa,
                "track": track
            },
            "metrics": {
                "smart_score": round(smart_score, 2),
                "grit_score": round(grit_score, 2),
                "build_score": round(build_score, 2)
            }
        }
        return self.analysis

    def generate_report(self):
        filename = f"meridian_resume_audit_{datetime.datetime.now().strftime('%Y%m%d')}.pdf"
        doc = SimpleDocTemplate(filename, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []
        story.append(Paragraph(f"<font size=24 color='#2E5BFF'>MERIDIAN RESUME AUDIT</font>", styles['Title']))
        story.append(Spacer(1, 12))
        story.append(Paragraph("<b>Metadata (Filterable Attributes)</b>", styles['Heading3']))
        meta = self.analysis['metadata']
        story.append(Paragraph(f"College: {meta['college']} | Grad: {meta['grad_year']} | Visa: {meta['visa_status']}", styles['Normal']))
        story.append(Paragraph(f"Major: {meta['major']} | Track: {meta['track']}", styles['Normal']))
        story.append(Spacer(1, 12))
        metrics = self.analysis['metrics']
        story.append(Paragraph(f"<b>Final Merit Score:</b> {round((metrics['grit_score']*0.4 + metrics['smart_score']*0.3 + metrics['build_score']*0.3), 2)}/100", styles['Heading2']))
        story.append(Spacer(1, 12))
        table_data = [
            ["Metric", "Score"],
            ["Smart Score", f"{metrics['smart_score']}"],
            ["Grit Score", f"{metrics['grit_score']}"],
            ["Build Score", f"{metrics['build_score']}"]
        ]
        t = Table(table_data, colWidths=[150, 300])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 6)
        ]))
        story.append(t)
        story.append(Spacer(1, 24))
        story.append(Paragraph("<i>Note: This audit is bias-neutral and based strictly on technical veracity.</i>", styles['Italic']))
        doc.build(story)
        return filename

if __name__ == "__main__":
    import sys
    base_path = os.path.dirname(os.path.abspath(__file__))
    res_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base_path, "../../assets/resumes/resume.pdf")
    auditor = MeridianResumeAuditor(res_path)
    if auditor.extract_text():
        results = auditor.analyze_content()
        print(json.dumps(results, indent=4))
        auditor.generate_report()
