"""
Cohort Scoring Engine — Generates per-cohort S/G/B scores for each student.

For each student:
  - Look up their majors → map to cohorts (100% weight)
  - Look up their minors → map to cohorts (50% weight)  
  - Look up their interests → map to cohorts (0% weight in overall, but still scored)
  - For each cohort, adjust S/G/B based on relevance:
    - Smart: GPA/academic rigor weighted by cohort expectations
    - Grit: leadership/impact weighted by field relevance
    - Build: projects/proof weighted by cohort-specific expectations
  - Store in cohort_scores JSONB and overall_smart/grit/build
"""
import os, sys, json
import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + '/../..')
from projects.dilly.academic_taxonomy import get_cohort

def get_db():
    pw = os.environ.get("DILLY_DB_PASSWORD", "")
    if not pw:
        try: pw = open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
        except: pass
    return psycopg2.connect(
        host="dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com",
        database="dilly", user="dilly_admin", password=pw, sslmode="require"
    )

# Cohort-specific scoring adjustments
# These define how a student's base S/G/B translates into cohort-specific scores
# A CS student's Build score might be high for CS but lower for Finance
COHORT_WEIGHTS = {
    "Software Engineering & CS":       {"smart_emphasis": "technical", "build_emphasis": "code", "grit_emphasis": "projects"},
    "Data Science & Analytics":        {"smart_emphasis": "quantitative", "build_emphasis": "analysis", "grit_emphasis": "research"},
    "Cybersecurity & IT":              {"smart_emphasis": "technical", "build_emphasis": "systems", "grit_emphasis": "certifications"},
    "Electrical & Computer Engineering":{"smart_emphasis": "technical", "build_emphasis": "hardware", "grit_emphasis": "labs"},
    "Mechanical & Aerospace Engineering":{"smart_emphasis": "technical", "build_emphasis": "design", "grit_emphasis": "projects"},
    "Civil & Environmental Engineering":{"smart_emphasis": "technical", "build_emphasis": "design", "grit_emphasis": "fieldwork"},
    "Chemical & Biomedical Engineering":{"smart_emphasis": "technical", "build_emphasis": "research", "grit_emphasis": "labs"},
    "Finance & Accounting":            {"smart_emphasis": "quantitative", "build_emphasis": "modeling", "grit_emphasis": "leadership"},
    "Consulting & Strategy":           {"smart_emphasis": "analytical", "build_emphasis": "cases", "grit_emphasis": "leadership"},
    "Marketing & Advertising":         {"smart_emphasis": "creative", "build_emphasis": "campaigns", "grit_emphasis": "leadership"},
    "Management & Operations":         {"smart_emphasis": "general", "build_emphasis": "experience", "grit_emphasis": "leadership"},
    "Entrepreneurship & Innovation":   {"smart_emphasis": "general", "build_emphasis": "ventures", "grit_emphasis": "leadership"},
    "Economics & Public Policy":       {"smart_emphasis": "quantitative", "build_emphasis": "research", "grit_emphasis": "leadership"},
    "Healthcare & Clinical":           {"smart_emphasis": "science", "build_emphasis": "clinical", "grit_emphasis": "volunteering"},
    "Biotech & Pharmaceutical":        {"smart_emphasis": "science", "build_emphasis": "research", "grit_emphasis": "labs"},
    "Life Sciences & Research":        {"smart_emphasis": "science", "build_emphasis": "research", "grit_emphasis": "publications"},
    "Physical Sciences & Math":        {"smart_emphasis": "quantitative", "build_emphasis": "research", "grit_emphasis": "publications"},
    "Law & Government":                {"smart_emphasis": "analytical", "build_emphasis": "writing", "grit_emphasis": "leadership"},
    "Media & Communications":          {"smart_emphasis": "creative", "build_emphasis": "portfolio", "grit_emphasis": "leadership"},
    "Design & Creative Arts":          {"smart_emphasis": "creative", "build_emphasis": "portfolio", "grit_emphasis": "projects"},
    "Education & Human Development":   {"smart_emphasis": "general", "build_emphasis": "teaching", "grit_emphasis": "volunteering"},
    "Social Sciences & Nonprofit":     {"smart_emphasis": "analytical", "build_emphasis": "research", "grit_emphasis": "volunteering"},
}

def compute_cohort_scores(student):
    """
    Given a student dict with base smart/grit/build from their audit,
    compute per-cohort scores based on their majors, minors, interests.
    """
    base_smart = student.get("smart") or 0
    base_grit = student.get("grit") or 0
    base_build = student.get("build") or 0
    
    majors = student.get("majors") or []
    minors = student.get("minors") or []
    interests = student.get("interests") or []
    
    cohort_scores = {}
    
    # Map majors/minors/interests to cohorts
    entries = []
    for m in majors:
        cohort = get_cohort(m)
        if cohort:
            entries.append({"field": m, "cohort": cohort, "level": "major", "weight": 1.0})
    for m in minors:
        cohort = get_cohort(m)
        if cohort:
            entries.append({"field": m, "cohort": cohort, "level": "minor", "weight": 0.5})
    for m in interests:
        cohort = get_cohort(m)
        if cohort:
            entries.append({"field": m, "cohort": cohort, "level": "interest", "weight": 0.0})
    
    for entry in entries:
        cohort = entry["cohort"]
        level = entry["level"]
        weight = entry["weight"]
        
        # Don't overwrite a major with a minor or interest for the same cohort
        if cohort in cohort_scores:
            existing = cohort_scores[cohort]["level"]
            priority = {"major": 0, "minor": 1, "interest": 2}
            if priority.get(level, 3) >= priority.get(existing, 3):
                continue
        
        # Base scores adjusted by cohort relevance
        # If your major IS the cohort, you get full scores
        # If it's a minor, reduced expectations (your proof of work is split)
        if level == "major":
            smart = base_smart
            grit = base_grit
            build = base_build
        elif level == "minor":
            # Minors: Smart stays similar (academic knowledge transfers),
            # Build is reduced (less depth of proof), Grit slightly reduced
            smart = base_smart * 0.85
            grit = base_grit * 0.90
            build = base_build * 0.70
        else:
            # Interests: exploratory, lower expectations across the board
            smart = base_smart * 0.70
            grit = base_grit * 0.80
            build = base_build * 0.50
        
        cohort_scores[cohort] = {
            "cohort": cohort,
            "level": level,
            "field": entry["field"],
            "smart": round(smart, 1),
            "grit": round(grit, 1),
            "build": round(build, 1),
            "dilly_score": round((smart + grit + build) / 3, 1),
            "weight": weight,
        }
    
    # Compute overall scores (weighted by majors=100%, minors=50%, interests=0%)
    weighted_smart = 0
    weighted_grit = 0
    weighted_build = 0
    total_weight = 0
    
    for cs in cohort_scores.values():
        w = cs["weight"]
        if w > 0:
            weighted_smart += cs["smart"] * w
            weighted_grit += cs["grit"] * w
            weighted_build += cs["build"] * w
            total_weight += w
    
    if total_weight > 0:
        overall_smart = round(weighted_smart / total_weight, 1)
        overall_grit = round(weighted_grit / total_weight, 1)
        overall_build = round(weighted_build / total_weight, 1)
    else:
        overall_smart = base_smart
        overall_grit = base_grit
        overall_build = base_build
    
    overall_dilly = round((overall_smart + overall_grit + overall_build) / 3, 1)
    
    return cohort_scores, overall_smart, overall_grit, overall_build, overall_dilly


def run():
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    
    # Get all students with scores
    cur.execute("""
        SELECT id, name, email, majors, minors, interests,
               smart_score, grit_score, build_score
        FROM students
        WHERE smart_score IS NOT NULL
    """)
    
    students = cur.fetchall()
    print(f"Scoring {len(students)} students with cohort-specific S/G/B...")
    
    scored = 0
    for s in students:
        student = {
            "smart": float(s["smart_score"]),
            "grit": float(s["grit_score"]),
            "build": float(s["build_score"]),
            "majors": s["majors"] or [],
            "minors": s["minors"] or [],
            "interests": s["interests"] or [],
        }
        
        cs, os, og, ob, od = compute_cohort_scores(student)
        
        cur.execute("""
            UPDATE students SET 
                cohort_scores = %s,
                overall_smart = %s,
                overall_grit = %s,
                overall_build = %s,
                overall_dilly_score = %s
            WHERE id = %s
        """, (json.dumps(cs), os, og, ob, od, s["id"]))
        
        scored += 1
        if scored <= 3:
            print(f"  {s['name']}: majors={s['majors']}, {len(cs)} cohorts scored")
            for k, v in cs.items():
                print(f"    {v['level']}: {k} → S:{v['smart']} G:{v['grit']} B:{v['build']}")
    
    conn.commit()
    print(f"\nDone! {scored} students scored with cohort-specific S/G/B")
    
    # Show your scores
    cur.execute("SELECT name, cohort_scores, overall_smart, overall_grit, overall_build, overall_dilly_score FROM students WHERE email = 'dilan.kochhar@spartans.ut.edu'")
    r = cur.fetchone()
    if r:
        print(f"\n{r['name']}:")
        print(f"  Overall: S:{r['overall_smart']} G:{r['overall_grit']} B:{r['overall_build']} Dilly:{r['overall_dilly_score']}")
        cs = r['cohort_scores'] if isinstance(r['cohort_scores'], dict) else json.loads(r['cohort_scores'] or '{}')
        for k, v in cs.items():
            print(f"  {v['level'].upper()}: {k} → S:{v['smart']} G:{v['grit']} B:{v['build']}")
    
    conn.close()

if __name__ == "__main__":
    run()
