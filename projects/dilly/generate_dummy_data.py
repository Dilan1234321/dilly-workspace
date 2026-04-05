"""
Legacy dummy data generator. Beta cohort has been removed.
Dilly uses only LLM few-shot examples from projects/dilly/prompts/training_data.json.
To add examples: run batch_audit_real.py on resumes in assets/resumes, or use /audit/v2 (auto-appends to training_data).
"""
import random
import json

def generate_beta_cohort(count=100):
    """Return in-memory dummy candidate list only. Does not write to any cohort file."""
    majors = ['Data Science', 'Computer Science', 'Finance', 'Marketing', 'Mathematics', 'Economics']
    colleges = ['University of Tampa', 'University of South Florida', 'Florida State University', 'University of Florida']
    visa_statuses = ['US Citizen', 'F-1 (International)', 'Permanent Resident']
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
        "Led a team of 5 in a hackathon",
    ]
    database = {"candidates": []}
    for i in range(count):
        name = f"Student_{1000 + i}"
        major = random.choice(majors)
        college = random.choice(colleges)
        grad_year = random.choice([2025, 2026, 2027, 2028])
        visa = random.choice(visa_statuses)
        num_projects = random.randint(1, 4)
        history = random.sample(project_types, num_projects)
        resume_text = f"Candidate {name} from {college}. Major in {major}. " + " ".join(history)
        grit_score = 0
        if "Founded" in resume_text: grit_score += 25
        if "Single-handedly" in resume_text: grit_score += 20
        if "Traveled" in resume_text: grit_score += 15
        if "Managed" in resume_text: grit_score += 10
        if "Developed" in resume_text: grit_score += 10
        grit_score += random.randint(5, 30)
        grit_score = min(100, grit_score)
        database["candidates"].append({
            "metadata": {
                "candidate": name,
                "grad_year": str(grad_year),
                "college": college,
                "major": major,
                "minor": "General",
                "visa_status": visa,
            },
            "metrics": {
                "impact_metrics_found": random.randint(0, 5),
                "tech_stack_breadth": random.randint(2, 7),
                "leadership_roles": 1 if "Founded" in resume_text or "Led" in resume_text else 0,
                "grit_score": grit_score,
            },
            "last_audit": "2026-02-28 01:45:00",
        })
    return database

if __name__ == "__main__":
    generate_beta_cohort()
    print("Beta cohort removed. Dilly uses only few-shot examples from prompts/training_data.json.")
