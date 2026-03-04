import pandas as pd
import random
import os

def generate_campus_baseline(count=500):
    categories = ['Data Science', 'Computer Science', 'Business', 'Marketing', 'Mathematics']
    tech_stacks = [
        ['Python', 'SQL', 'Tableau'],
        ['Java', 'C++', 'HTML/CSS'],
        ['Excel', 'PowerPoint', 'R'],
        ['Social Media Analytics', 'Google Ads'],
        ['MATLAB', 'Python', 'LaTeX']
    ]
    clubs = ['Data Science Club', 'Math Club', 'Business Fraternity', 'Student Government', 'IEEE']
    
    data = []
    for i in range(count):
        cat = random.choice(categories)
        stack = random.choice(tech_stacks)
        club = random.choice(clubs)
        
        # Typical student profile: Good keywords, but lower "Professional" density
        resume_text = f"Student with a major in {cat}. Active member of {club}. "
        resume_text += f"Technical skills include {', '.join(stack)}. "
        resume_text += "Experience: Summer internship working on data entry and basic analysis. "
        resume_text += "Project: Built a calculator app and a basic website."
        
        data.append({
            "Category": cat,
            "Resume_str": resume_text
        })
        
    df = pd.DataFrame(data)
    os.makedirs("assets/datasets", exist_ok=True)
    df.to_csv("assets/datasets/campus_baseline_synthetic.csv", index=False)
    print(f"Generated {count} synthetic campus profiles for baseline.")

if __name__ == "__main__":
    generate_campus_baseline()
