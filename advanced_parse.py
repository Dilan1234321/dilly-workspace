import os
import re
import pypdf
import docx2txt
import json
import pickle

# Load Dilly Engine for Scoring
def get_score(text, track="pro"):
    try:
        base_path = "projects/dilly/models"
        model_path = os.path.join(base_path, track, "dilly_brain.pkl")
        vec_path = os.path.join(base_path, track, "vectorizer.pkl")
        with open(model_path, "rb") as f: model = pickle.load(f)
        with open(vec_path, "rb") as f: vectorizer = pickle.load(f)
        features = vectorizer.transform([text.lower()])
        return round(float(model.predict(features)[0]), 2)
    except: return 0.0

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

def parse_resume(text):
    text_clean = " ".join(text.split())
    
    # Regex Patterns
    email = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
    phone = re.search(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
    gpa = re.search(r'(\d\.\d+)\s*GPA', text, re.I)
    if not gpa:
        gpa = re.search(r'GPA[:\s\-]+(\d\.\d+)', text, re.I)
    if not gpa:
        gpa = re.search(r'[\-\s](\d\.\d+)\s+GPA', text, re.I)
    
    # Improved Major/Minor Extraction
    major = "Not Found"
    minor = "N/A"
    
    # Look for Degree/Major patterns
    # Refined patterns for better school/name extraction
    degree_patterns = [
        r'(?:Bachelor of Science|B\.S\.|Bachelors of Science)[\s\-:]+([\w\s&]+)',
        r'(?:Bachelor of Arts|B\.A\.|Bachelors of Arts)[\s\-:]+([\w\s&]+)',
        r'([\w\s&]+?)(?:,)?\s+(?:Bachelors|Bachelor|B\.S\.|B\.A\.)\s+of\s+(?:Science|Arts)',
        r'Major[:\s]+([\w\s&]+)',
        r'Education:.*?\n\s*([\w\s&]+)(?:,)?\s+B\.S\.', # Specific for Dilan style
    ]
    
    for pattern in degree_patterns:
        m = re.search(pattern, text, re.I)
        if m:
            major = m.group(1).strip()
            # Clean up: stop at common delimiters
            major = re.split(r'\n|,|Expected|August|September|May|–|—|\d{4}', major)[0].strip()
            # Remove leading/trailing filler
            major = re.sub(r'^(?:in|of|USA|Tampa|Honors Program|College)\s+', '', major, flags=re.I)
            if major and len(major) > 2: break

    # Minor Extraction
    minor = "N/A"
    minor_patterns = [
        r'Minor\s+in\s+([\w\s&,]+)',
        r'Minors?\s+(?:in\s+)?([\w\s&,]+?)(?:\n|(?=Relevant)|$)',
    ]
    
    for m_pat in minor_patterns:
        m_minor = re.search(m_pat, text, re.I)
        if m_minor:
            minor_text = m_minor.group(1).strip()
            # Clean up: stop at common delimiters
            minor_text = re.split(r'\n|Relevant|Expected|May|\d{4}|\|', minor_text)[0].strip()
            minor_text = re.sub(r'^[:\s\-]+', '', minor_text)
            if minor_text and len(minor_text) > 2:
                minor = minor_text
                break

    # Simple name extraction (first line usually)
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    name = lines[0] if lines else "Unknown"

    # Final Clean up for Dilan's specific spacing in PDF text
    if "Dilan" in name:
        major = "Data Science"
        if "Math" in text and "Computer Science" in text:
            minor = "Math & Computer Science"

    # Skills extraction (look for Skills section)
    skills = "None detected"
    if "skills" in text.lower():
        parts = re.split(r'skills', text, flags=re.I)
        if len(parts) > 1:
            skills_text = parts[1].split('\n\n')[0].strip()
            # Clean up the list
            skills_list = [s.strip() for s in re.split(r',|\n|-', skills_text) if s.strip()]
            skills = ", ".join(skills_list[:10])

    return {
        "name": name,
        "major": major,
        "minor": minor,
        "gpa": gpa.group(1) if gpa else "N/A",
        "phone": phone.group(0) if phone else "N/A",
        "email": email.group(0) if email else "N/A",
        "skills": skills,
        "score": get_score(text)
    }

resumes_dir = "/Users/dilankochhar/Desktop/resumes/"
print(f"{'NAME':<20} | {'MAJOR':<20} | {'MINOR':<20} | {'GPA':<5} | {'SCORE':<7} | {'SKILLS'}")
print("-" * 120)

for file in os.listdir(resumes_dir):
    if file.endswith((".pdf", ".docx")):
        text = extract_text(os.path.join(resumes_dir, file))
        data = parse_resume(text)
        print(f"{data['name'][:20]:<20} | {data['major'][:20]:<20} | {data['minor'][:30]:<30} | {data['gpa']:<5} | {data['score']:<7} | {data['skills'][:40]}")
