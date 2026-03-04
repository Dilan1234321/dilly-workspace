import pypdf
import os
import pandas as pd

def extract_text(pdf_path):
    try:
        reader = pypdf.PdfReader(pdf_path)
        return "\n".join([p.extract_text() for p in reader.pages if p.extract_text()])
    except:
        return ""

def create_utampa_dataset():
    resumes_dir = "/Users/dilankochhar/Desktop/resumes/"
    data = []
    
    for file in os.listdir(resumes_dir):
        if file.endswith(".pdf"):
            text = extract_text(os.path.join(resumes_dir, file))
            if "university of tampa" in text.lower() or "utampa" in text.lower():
                data.append({"Resume_str": text, "Source": file})
                print(f"Added UTampa candidate: {file}")

    if data:
        df = pd.DataFrame(data)
        df.to_csv("/Users/dilankochhar/.openclaw/workspace/assets/utampa_baseline.csv", index=False)
        print(f"\nCreated UTampa dataset with {len(data)} profiles.")
    else:
        print("No UTampa resumes found.")

if __name__ == "__main__":
    create_utampa_dataset()
