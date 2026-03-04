import pandas as pd
import random
import json
import os

def generate_beta_cohort(count=100):
    majors = ['Data Science', 'Computer Science', 'Finance', 'Marketing', 'Mathematics', 'Economics']
    colleges = ['University of Tampa', 'University of South Florida', 'Florida State University', 'University of Florida']
    visa_statuses = ['US Citizen', 'F-1 (International)', 'Permanent Resident']
    
    # Impact markers to simulate grit
    project_types = [
        "Built a mobile app for local business",
        "Founded a student organization",
        "Completed 300+ hours of community service",
        "Managed a $5k budget for campus event",
        "Developed a ML model for stock prediction",
        "Single-handedly overhauled the club website",
        "Traveled to volunteer in South America",
        "Launched an e-commerce side hustle",
        "Interned at a local accounting firm",
        "Led a team of 5 in a hackathon"
    ]
    
    skills_pool = ['Python', 'SQL', 'React', 'Excel', 'Tableau', 'JavaScript', 'AWS', 'R', 'Machine Learning']

    database = {"candidates": []}

    for i in range(count):
        name = f"Student_{1000 + i}"
        major = random.choice(majors)
        college = random.choice(colleges)
        grad_year = random.choice([2025, 2026, 2027, 2028])
        visa = random.choice(visa_statuses)
        
        # Simulate Grit Metrics
        # Randomly assign 1-4 projects
        num_projects = random.randint(1, 4)
        history = random.sample(project_types, num_projects)
        resume_text = f"Candidate {name} from {college}. Major in {major}. " + " ".join(history)
        
        # Calculate a realistic Grit Score based on our current Human Grit logic
        # Founder/Operator words
        grit_score = 0
        if "Founded" in resume_text: grit_score += 25
        if "Single-handedly" in resume_text: grit_score += 20
        if "Traveled" in resume_text: grit_score += 15
        if "Managed" in resume_text: grit_score += 10
        if "Developed" in resume_text: grit_score += 10
        
        # Add some randomness and tech scaling
        grit_score += random.randint(5, 30)
        grit_score = min(100, grit_score)

        database["candidates"].append({
            "metadata": {
                "candidate": name,
                "grad_year": str(grad_year),
                "college": college,
                "major": major,
                "minor": "General",
                "visa_status": visa
            },
            "metrics": {
                "impact_metrics_found": random.randint(0, 5),
                "tech_stack_breadth": random.randint(2, 7),
                "leadership_roles": 1 if "Founded" in resume_text or "Led" in resume_text else 0,
                "grit_score": grit_score
            },
            "last_audit": "2026-02-28 01:45:00"
        })
    
    # Save to dummy database
    db_path = "projects/meridian/beta_cohort_db.json"
    with open(db_path, 'w') as f:
        json.dump(database, f, indent=4)
    
    print(f"Generated {count} high-fidelity dummy students in {db_path}")
    return db_path

if __name__ == "__main__":
    generate_beta_cohort()
