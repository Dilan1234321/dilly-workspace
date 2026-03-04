# 🧠 Specialized Admissions Strategy: Meridian Model Enhancement
# Date: 2026-03-02

## 1. Medical School (MD/DO) Valuation Criteria
*   **Clinical Exposure:** Mandatory signal. Shadowing, EMT, scribing, or clinical volunteering.
*   **Service Orientation:** "Altruism score." Long-term commitment to underserved communities.
*   **Research Depth:** Publication-track or wet-lab experience. Valued more at research-heavy (T20) schools.
*   **Core Competencies (AAMC):** Resilience, capacity for improvement, cultural competence, and teamwork.

## 2. Law School (JD) Valuation Criteria
*   **Analytical Rigor:** Evidence of heavy writing, research, or complex logic (e.g., debate, philosophy, legal internships).
*   **Leadership & Advocacy:** Positions in student gov, non-profits, or community organizing.
*   **Academic Consistency:** High-prestige majors with rigorous course loads.
*   **Professionalism:** Attention to detail in formatting; "professional polish" is a soft requirement.

## 3. Meridian Model Implementation (Retraining Blueprint)
*   **New Attribute: "Admissions_Track"**
    *   `pre_med`: Weight high on *Clinical_Grit* and *Service_Density*.
    *   `pre_law`: Weight high on *Advocacy_Signal* and *Writing_Complexity*.
*   **Scoring Delta:** 
    *   Apply a `Difficulty_Baseline` multiplier for high-attrition pre-med courses.
    *   Apply a `Commitment_Density` bonus for 3+ years in a single organization (demonstrates endurance).

## 4. Retraining Action (Autonomous)
Retraining script `projects/meridian/retrain_brains.py` updated to include `track_specific_weights`.
Log: Retraining triggered. Cycle completion expected in 10 minutes.
