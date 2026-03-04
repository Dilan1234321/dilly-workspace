import pypdf
import os

resumes_dir = "/Users/dilankochhar/Desktop/resumes/"
files = [f for f in os.listdir(resumes_dir) if f.endswith(".pdf")]

print(f"Analyzing {len(files)} PDF resumes...")

for file in files:
    path = os.path.join(resumes_dir, file)
    try:
        reader = pypdf.PdfReader(path)
        text = "\n".join([p.extract_text() for p in reader.pages if p.extract_text()])
        
        print(f"\n--- {file} ---")
        ut_found = "university of tampa" in text.lower() or "utampa" in text.lower()
        print(f"UTampa Affiliation: {'YES' if ut_found else 'NO'}")
        
        # Look for key sections
        sections = ["experience", "projects", "skills", "education", "leadership"]
        found_sections = [s for s in sections if s in text.lower()]
        print(f"Sections detected: {', '.join(found_sections)}")
        
        # Grit signals (non-exhaustive)
        grit_keywords = ["founded", "started", "developed", "built", "managed", "led", "impacted", "raised"]
        grit_matches = [k for k in grit_keywords if k in text.lower()]
        print(f"Grit signals: {len(grit_matches)}")

    except Exception as e:
        print(f"Error reading {file}: {e}")
