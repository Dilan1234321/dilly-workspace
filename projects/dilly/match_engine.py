"""
Dilly Match Engine v2 — Multi-Cohort Scoring
=============================================
Matches students to internships using cohort-specific S/G/B scores.

Rules:
- Student must have ALL of an internship's cohorts (as major, minor, or interest) to see it
- Readiness scored per-cohort, shown side by side
- Worst cohort determines the card badge
- Overall Dilly Score is NEVER used in matching
"""
import os, sys, json, uuid
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
import psycopg2, psycopg2.extras
from projects.dilly.academic_taxonomy import get_cohort, get_cohort_fields, COHORTS

def get_db():
    pw = os.environ.get("DILLY_DB_PASSWORD", "") or open(os.path.expanduser("~/.dilly_db_pass")).read().strip()
    return psycopg2.connect(host=os.environ.get("DILLY_DB_HOST", "dilly-db.cgty4eee285w.us-east-1.rds.amazonaws.com"),
        database="dilly", user="dilly_admin", password=pw, sslmode="require")

# ── Cohort key normalization ──────────────────────────────────

def normalize_cohort_key(cohort_name):
    """Convert 'Software Engineering & CS' to 'software_engineering_cs' for JSON keys."""
    return cohort_name.lower().replace(" & ", "_").replace(" ", "_").replace("-", "_")

def denormalize_cohort_key(key):
    """Reverse lookup from key to full cohort name."""
    for name in COHORTS:
        if normalize_cohort_key(name) == key:
            return name
    return key

# ── Build student cohort map ──────────────────────────────────

def get_student_cohorts(student):
    """Return dict of {cohort_name: {"level": major/minor/interest, "smart": X, "grit": X, "build": X}}"""
    cohort_scores = student.get("cohort_scores") or {}
    if isinstance(cohort_scores, str):
        cohort_scores = json.loads(cohort_scores)

    # If new cohort_scores system is populated, use it
    if cohort_scores:
        result = {}
        for key, data in cohort_scores.items():
            full_name = denormalize_cohort_key(key)
            result[full_name] = data
        return result

    # Fallback: build from old single-score system + academic taxonomy
    result = {}
    majors = student.get("majors") or []
    if isinstance(majors, str):
        majors = json.loads(majors)
    minors = student.get("minors") or []
    if isinstance(minors, str):
        minors = json.loads(minors)
    interests = student.get("interests") or []
    if isinstance(interests, str):
        interests = json.loads(interests)

    smart = float(student.get("smart_score") or 50)
    grit = float(student.get("grit_score") or 50)
    build = float(student.get("build_score") or 30)

    # Major cohorts (full scores)
    track = student.get("track") or student.get("cohort") or None
    if student.get("major"):
        cohort = get_cohort(student["major"], track)
        if cohort not in result:
            result[cohort] = {"level": "major", "smart": smart, "grit": grit, "build": build}
    for m in majors:
        cohort = get_cohort(m, track)
        if cohort not in result:
            result[cohort] = {"level": "major", "smart": smart, "grit": grit, "build": build}

    # Minor cohorts (reduced expectations — use 80% of scores as proxy)
    for m in minors:
        if m and len(m) > 1:  # Filter out bad data like ["N","A"]
            cohort = get_cohort(m)
            if cohort not in result:
                result[cohort] = {"level": "minor", "smart": smart * 0.85, "grit": grit * 0.85, "build": build * 0.7}

    # Interest cohorts (exploratory)
    for i in interests:
        cohort = get_cohort(i)
        if cohort not in result:
            result[cohort] = {"level": "interest", "smart": smart * 0.7, "grit": grit * 0.7, "build": build * 0.5}

    return result

# ── Readiness per cohort ──────────────────────────────────────

def compute_cohort_readiness(student_scores, required):
    """Compare student's S/G/B against one cohort's requirements.
    Returns (readiness, smart_gap, grit_gap, build_gap, weakest)
    """
    s_gap = student_scores["smart"] - required["smart"]
    g_gap = student_scores["grit"] - required["grit"]
    b_gap = student_scores["build"] - required["build"]

    gaps = {"smart": s_gap, "grit": g_gap, "build": b_gap}
    weakest = min(gaps, key=gaps.get)
    worst = min(s_gap, g_gap, b_gap)

    if worst >= 0:
        readiness = "ready"
    elif worst >= -10:
        readiness = "almost"
    else:
        readiness = "gap"

    return (readiness, int(s_gap), int(g_gap), int(b_gap), weakest)

# ── Location & work mode scoring ──────────────────────────────

def compute_location_score(student_cities, intern_city, intern_state, intern_work_mode):
    if intern_work_mode == "remote":
        return 0.9
    if not student_cities:
        return 0.5
    cities = student_cities if isinstance(student_cities, list) else json.loads(student_cities) if isinstance(student_cities, str) else []
    if not cities:
        return 0.5
    for pref in cities:
        pref_lower = pref.lower().strip()
        if intern_city and pref_lower in intern_city.lower():
            return 1.0
        if intern_state and pref_lower in intern_state.lower():
            return 0.7
    return 0.2

def compute_work_mode_score(student_pref, intern_mode):
    if not student_pref or student_pref == "any":
        return 0.7
    if not intern_mode or intern_mode == "unknown":
        return 0.5
    if student_pref == intern_mode:
        return 1.0
    return 0.4

# ── Main matching ─────────────────────────────────────────────

def compute_matches_for_student(conn, student):
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("""SELECT i.id, i.title, i.location_city, i.location_state,
        i.work_mode, i.is_paid, i.cohort_requirements, i.deadline, c.name as company_name
        FROM internships i JOIN companies c ON i.company_id = c.id
        WHERE i.status = 'active' AND i.is_internship = true
        AND i.cohort_requirements IS NOT NULL AND i.cohort_requirements != '[]'""")
    internships = cur.fetchall()

    student_cohorts = get_student_cohorts(student)
    student_cohort_names = set(student_cohorts.keys())

    matches = []
    skipped_no_cohort = 0

    for intern in internships:
        requirements = intern["cohort_requirements"]
        if isinstance(requirements, str):
            requirements = json.loads(requirements)
        if not requirements:
            continue

        # Check: student must have ALL cohorts the job requires
        job_cohort_names = set(r["cohort"] for r in requirements)
        if not job_cohort_names.issubset(student_cohort_names):
            skipped_no_cohort += 1
            continue

        # Compute per-cohort readiness
        cohort_readiness = []
        worst_readiness = "ready"
        readiness_order = {"ready": 0, "almost": 1, "gap": 2}

        for req in requirements:
            cohort_name = req["cohort"]
            student_scores = student_cohorts[cohort_name]
            readiness, s_gap, g_gap, b_gap, weakest = compute_cohort_readiness(
                student_scores, req)

            cohort_readiness.append({
                "cohort": cohort_name,
                "level": student_scores.get("level", "unknown"),
                "readiness": readiness,
                "smart_gap": s_gap, "grit_gap": g_gap, "build_gap": b_gap,
                "weakest": weakest,
                "student_smart": round(student_scores["smart"], 1),
                "student_grit": round(student_scores["grit"], 1),
                "student_build": round(student_scores["build"], 1),
                "required_smart": req["smart"],
                "required_grit": req["grit"],
                "required_build": req["build"],
            })

            if readiness_order.get(readiness, 2) > readiness_order.get(worst_readiness, 0):
                worst_readiness = readiness

        # Compute fit scores
        location_score = compute_location_score(student["preferred_cities"],
            intern["location_city"], intern["location_state"], intern["work_mode"])
        work_mode_score = compute_work_mode_score(student.get("work_mode_pref"), intern["work_mode"])
        comp_score = 0.9 if intern["is_paid"] is True else 0.3 if intern["is_paid"] is False else 0.5

        # Readiness score for ranking
        readiness_score = {"ready": 1.0, "almost": 0.65, "gap": 0.25}.get(worst_readiness, 0.5)

        # How well does student's level match? Major match > minor > interest
        level_scores = []
        for cr in cohort_readiness:
            level_score = {"major": 1.0, "minor": 0.7, "interest": 0.4}.get(cr["level"], 0.5)
            level_scores.append(level_score)
        avg_level_score = sum(level_scores) / len(level_scores) if level_scores else 0.5

        # Composite rank score
        rank_score = (
            readiness_score * 0.35 +
            avg_level_score * 0.20 +
            location_score * 0.15 +
            work_mode_score * 0.10 +
            comp_score * 0.05 +
            0.15 * 0.5  # placeholder for skills overlap
        )

        matches.append({
            "student_id": student["id"],
            "internship_id": intern["id"],
            "rank_score": round(rank_score, 4),
            "readiness": worst_readiness,
            "cohort_readiness": cohort_readiness,
            "location_score": round(location_score, 4),
            "work_mode_score": round(work_mode_score, 4),
            "compensation_score": round(comp_score, 4),
        })

    return matches, skipped_no_cohort

def run_matching(student_email=None):
    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    if student_email:
        cur.execute("SELECT * FROM students WHERE email = %s AND smart_score IS NOT NULL", (student_email,))
    else:
        cur.execute("SELECT * FROM students WHERE smart_score IS NOT NULL")
    students = cur.fetchall()
    print(f"Computing multi-cohort matches for {len(students)} students...\n")

    total_matches = 0
    total_skipped = 0

    for student in students:
        matches, skipped = compute_matches_for_student(conn, student)
        total_skipped += skipped

        # Delete old matches
        cur.execute("DELETE FROM match_scores WHERE student_id = %s", (student["id"],))

        # Insert new matches
        for m in matches:
            cur.execute("""INSERT INTO match_scores (id, student_id, internship_id, rank_score,
                readiness, cohort_readiness, location_score, work_mode_score, compensation_score)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (str(uuid.uuid4()), m["student_id"], m["internship_id"], m["rank_score"],
                 m["readiness"], json.dumps(m["cohort_readiness"]),
                 m["location_score"], m["work_mode_score"], m["compensation_score"]))
        conn.commit()

        # Get student cohorts for display
        student_cohorts = get_student_cohorts(student)
        cohort_display = []
        for name, data in student_cohorts.items():
            level = data.get("level", "?")
            icon = {"major": "🎓", "minor": "📘", "interest": "💡"}.get(level, "?")
            cohort_display.append(f"{icon} {name}")

        ready = sum(1 for m in matches if m["readiness"] == "ready")
        almost = sum(1 for m in matches if m["readiness"] == "almost")
        gap = sum(1 for m in matches if m["readiness"] == "gap")
        top5 = sorted(matches, key=lambda x: x["rank_score"], reverse=True)[:5]

        print(f"{student['name']} | {student['major']}")
        print(f"  Cohorts: {', '.join(cohort_display)}")
        print(f"  Visible: {len(matches)} jobs | {ready} ready, {almost} almost, {gap} gap | {skipped} hidden (missing cohort)")

        for m in top5:
            cur.execute("SELECT i.title, c.name FROM internships i JOIN companies c ON i.company_id=c.id WHERE i.id=%s", (m["internship_id"],))
            row = cur.fetchone()
            if row:
                badge = {"ready": "✅", "almost": "🟡", "gap": "🔴"}.get(m["readiness"], "⚪")
                cohort_detail = " | ".join(
                    f"{cr['cohort'][:15]}({cr['level'][:3]}): {cr['readiness']}"
                    for cr in m["cohort_readiness"]
                )
                print(f"    {badge} {row['title'][:45]} @ {row['name']} — {m['rank_score']:.0%}")
                print(f"       {cohort_detail}")
        print()
        total_matches += len(matches)

    cur.execute("SELECT COUNT(*) FROM match_scores")
    total_in_db = cur.fetchone()[0]
    print(f"{'='*60}")
    print(f"Multi-cohort matching complete!")
    print(f"  Students: {len(students)}")
    print(f"  Total matches: {total_in_db}")
    print(f"  Avg visible jobs per student: {total_matches // len(students) if students else 0}")
    print(f"  Total hidden (missing cohort): {total_skipped}")
    print(f"{'='*60}")
    conn.close()

if __name__ == "__main__":
    import sys
    run_matching(sys.argv[1] if len(sys.argv) > 1 else None)
