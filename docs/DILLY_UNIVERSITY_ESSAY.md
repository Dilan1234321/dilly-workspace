# Dilly University: A Complete Essay

**The university-facing analytics and institutional platform for Meridian.**

---

## I. What Is Dilly University?

**Dilly University** is the planned platform for universities to track students, analyze trends, and view institutional career-readiness data through an advanced analytics lens. It builds on Meridian's existing student data and school-domain model. Where Meridian gives *students* a career center in their pocket, Dilly University gives *career centers and administrators* a command center for their campus.

The product does not yet exist. It is a vision, documented in ideas and deep dives. But the data Meridian already collects — audits, scores, applications, outcomes, engagement, streaks, achievements — is the foundation. Dilly University would surface that data to the people who can act on it: career advisors, department chairs, provosts, and accreditation committees.

---

## II. The Problem It Solves

Career centers operate largely in the dark.

- **Who's engaged?** Hard to know without manual surveys or spotty LMS data.
- **Who's struggling?** Students who need help often don't ask until it's too late.
- **Do our workshops work?** No clear way to tie a resume clinic to score improvement.
- **How do we compare to peer schools?** No benchmark.
- **What do we report to accreditation?** Scattered spreadsheets, one-off reports.

Meridian students generate rich, structured data: Smart/Grit/Build scores, audit timestamps, application counts, interview/offer outcomes, ATS readiness, engagement (streaks, check-ins), and achievements. Today that data lives in student profiles. Dilly University would aggregate it, anonymize where needed, and put it in the hands of the people who can intervene, celebrate, and report.

---

## III. Analytics & Tracking

### First Audit Velocity

**What it is:** Time from signup to first resume audit.

**Why it matters:** Long delay means friction — upload anxiety, trust issues, confusion. Fast first audit means stronger activation. If Pre-Health students take 12 days on average vs 4 for Tech, the career center might send a Pre-Health–specific onboarding email or workshop invite.

**How it works:** Track `created_at` (signup) and `first_audit_at` (first successful audit). Metrics: median/mean days to first audit, % who audit within 7/14/30 days. Segment by major, track, or signup source.

---

### Score Distribution Over Time

**What it is:** Smart/Grit/Build distributions by cohort and time period.

**How it works:** Aggregate by school, track, and period (week/month/term). Histograms or box plots: p25, median, p75 per dimension. Overlay multiple periods to see shifts.

**Use case:** "Tech Grit moved up 8 pts this term — the ATS workshop may have helped." Or: "Pre-Health Build is flat; we need more clinical-hour programming."

---

### At-Risk List

**What it is:** Students who are underperforming and/or disengaged.

**Definition options:**
- Low scores (e.g. final < 50) + no audit in 60+ days
- No applications + low engagement
- Score drop > 10 pts vs last audit

**Output:** List with optional filters (major, track, risk level). Export for outreach. FERPA-safe: only students who opted in to career center visibility, or anonymized until outreach is needed.

**Use case:** "Here are 47 students who need a nudge. Export for our 'Resume Refresh' campaign."

---

### Needs a Nudge

**What it is:** Students who haven't used Meridian in a while.

**Definition:** No audit in 90+ days (or 60/120, configurable).

**Output:** List of emails (or anonymized IDs) for outreach.

**Use case:** "Send a reminder: 'Your resume is 4 months old — run a quick audit before recruiting season.'"

---

### Workshop Targeting

**What it is:** "Who should we invite to this workshop?"

**How it works:** Filters: track, major, score range (e.g. Build < 60), ATS score < 70, no applications. Output: list of students who match. Optional: "Send invite" or "Add to campaign."

**Use case:** "Tech students with Build < 60" → ATS workshop. "Pre-Health with low clinical hours" → shadowing clinic or clinical-hours info session.

---

### Peer Comparison Nudges

**What it is:** Compare your school's cohort to another school (e.g. USF, FSU) and get suggested actions.

**Example:** "Your Tech cohort's Grit is 12 pts below USF's. Consider: leadership workshops, resume clinics, or more emphasis on quantified impact."

**How it works:** Anonymized benchmarks by school (avg Grit by track, etc.). LLM generates "consider doing X" suggestions from common gaps. Schools opt in to sharing; only aggregate stats are shown.

**Use case:** "Your Pre-Health cohort is 8 pts below FSU — focus on clinical hours and research evidence."

---

### Milestone Alerts

**What it is:** Notifications when students hit milestones.

**Milestones:** First audit, first application, first interview, first offer, Top 25% in a dimension.

**How it works:** Track `first_application_at`, `first_interview_at`, `got_offer_at` in profile. Career center dashboard: "12 students hit first interview this week." Optional: email digest or Slack/Teams.

**Use case:** "3 students got offers this week — celebrate and share in our newsletter."

---

### Accreditation Export

**What it is:** One-click PDF/Excel for accreditation and reporting.

**Contents:** Participation, score distributions, placement rates, trends, demographics (if allowed).

**How it works:** Pre-built report template: cover, participation, scores, outcomes, methodology. Export: PDF for narrative, Excel for raw data.

**Use case:** "Career readiness report for SACS review."

---

### Placement Rate

**What it is:** % of students with interviews or offers.

**How it works:** Use `got_interview_at`, `got_offer_at` in profile. Denominator: active users or students with ≥1 audit. Optional: by track, major, year.

**Use case:** "42% of Meridian users had 1+ interview this year."

**Caveat:** Depends on students reporting outcomes; the app already has optional outcome prompts.

---

### Year-Over-Year Report

**What it is:** Compare this year to last year.

**Metrics:** Participation, avg scores, placement rates, engagement.

**How it works:** Define "year" (academic, fiscal, calendar). Compare Year N vs Year N-1. Show delta and % change.

**Use case:** "Participation up 34%; avg Grit up 6 pts."

---

### Custom Date Ranges

**What it is:** User picks any date range for reports.

**How it works:** Date picker: start and end. All dashboards filter by that range. Presets: "This term," "Last 30 days," "FY24."

**Use case:** "Show me Fall 2025 only."

---

### Narrative Summaries

**What it is:** AI-generated summaries of what the data shows.

**Example:** "This term, Tech Grit rose 6 pts; Pre-Health Build is flat. Consider more clinical-hour workshops. Finance participation is down 12% — consider a targeted campaign."

**How it works:** LLM receives aggregated metrics + context. Output: 2–3 short paragraphs with trends and suggested actions.

**Use case:** "Copy this into the provost report."

---

### Anomaly Detection

**What it is:** Flag unusual changes in metrics.

**Examples:** Tech Smart drops 15 pts in one term. Pre-Health participation suddenly doubles. One department's scores diverge from others.

**How it works:** Track baseline (avg, std). Flag when metrics move beyond a threshold (e.g. 2σ). Alert: "Finance cohort Smart dropped 15 pts — investigate."

**Use case:** "Something changed; investigate before it becomes a trend."

---

## IV. Engagement & Gamification

### Campus Leaderboard

**What it is:** Opt-in leaderboard of top students by score.

**How it works:** Students opt in. Rank by final score or dimension (e.g. Grit). Show rank and score (e.g. "#12 of 89 in Tech").

**Use case:** "Top 10% Grit in Pre-Health at UTampa." Drives engagement and gives high performers recognition.

---

### Department Competition

**What it is:** Compare departments or majors.

**Metrics:** Participation rate, avg score, improvement, engagement.

**How it works:** Map majors to departments. Show department vs department (e.g. "Business has highest participation; Science has highest avg Grit").

**Use case:** "Which departments are most engaged?" Friendly competition can boost adoption.

---

### Streak Leaderboard

**What it is:** Rank by daily check-in streak.

**How it works:** Use `profile.streak` (current_streak, longest_streak). Leaderboard: top N by longest streak. Optional: "This week's top streakers."

**Use case:** "Most consistent users." Rewards habit, not just one-time performance.

---

### Achievement Unlock Rates

**What it is:** % of students who unlock each achievement.

**How it works:** Track `profile.achievements` (first_audit, first_application, top25_grit, etc.). Report: "67% have first_audit; 23% have first_application; 8% have top25_grit."

**Use case:** "Where are students getting stuck?" Funnel analysis for intervention.

---

## V. Integrations

### Canvas / LMS

**What it is:** Embed Meridian in courses (e.g. "Career readiness" module).

**How it works:** LTI integration. Instructor assigns "Run audit" or "Complete career module." Sync completion back to LMS.

**Use case:** "Career readiness as a graded assignment." Brings Meridian into the curriculum.

---

### Slack / Teams

**What it is:** Career center gets digest in Slack or Teams.

**How it works:** Webhook or bot. Scheduled: "Weekly: 12 new audits, 3 first interviews, 2 at-risk." Optional: alerts for anomalies or milestones.

**Use case:** "Daily or weekly digest without opening the dashboard." Fits existing workflow.

---

## VI. Unique Metrics

### 0–100 Score Per Cohort

**What it is:** Single "Meridian readiness" index per cohort.

**How it works:** Weight Smart, Grit, Build, ATS, engagement. Output: "Tech cohort: 72; Pre-Health: 68; Business: 71."

**Use case:** "One number to track and compare." Simplicity for leadership.

---

### Recruiter Interest

**What it is:** How often recruiters view or shortlist students from your school.

**How it works:** Use `recruiter_feedback.jsonl` (view, shortlist, pass, contact). Aggregate by school: "UTampa: 45 views, 12 shortlists this month."

**Use case:** "Employer demand for your students." A metric no other tool provides.

---

### Company Fit Heatmap

**What it is:** Where students target vs where they're ready.

**How it works:** X-axis: companies students target (Goldman, McKinsey, Google). Y-axis: readiness (Ready vs Stretch vs Not yet). Heatmap: "Many target Goldman; few are ready."

**Use case:** "Target workshops on gaps for top employers." Data-driven programming.

---

### ATS Readiness by Cohort

**What it is:** % of students with ATS score above a threshold.

**How it works:** Use `ats_scores.json` per profile. Aggregate: "Tech: 78% ATS-ready; Pre-Health: 62%."

**Use case:** "Tech is ATS-ready; Pre-Health needs formatting help." Directs resources.

---

## VII. Monetization

### Per-Seat

**What it is:** Charge per career center staff user.

**How it works:** Admin creates seats (e.g. 5 staff). Each staff has login; usage is tracked. Overage: add seats or upgrade.

**Use case:** "$X per seat per month." Predictable revenue.

---

### Add-Ons

**What it is:** Optional paid modules.

**Examples:** Batch audit (unlimited uploads), SIS integration, custom reports, API access, white-label.

**Use case:** "Base + add-ons" pricing. Schools pay for what they need.

---

### White-Label

**What it is:** Meridian branded as the university's product.

**How it works:** Custom domain (e.g. careers.utampa.edu). Logo, colors, copy. "Powered by Meridian" or fully white-label.

**Use case:** "Our career tool" vs "third-party app." Institutional ownership.

---

## VIII. Recommended First Build

From earlier discussion, the recommended first build is:

1. **Participation snapshot** — Total users, audits this month, top tracks. Simple dashboard. "How many students are using Meridian?"
2. **Score-by-track table** — Avg Smart/Grit/Build per track, exportable. "How is each cohort performing?"
3. **At-risk list** — Low engagement + low scores; export for outreach. "Who needs our help?"

Then add: narrative AI insights, workshop targeting.

This sequence delivers immediate value (visibility, actionability) before layering on complexity (narrative summaries, workshop campaigns).

---

## IX. Data Foundation

Dilly University does not require new data collection. Meridian already has:

- **Profiles** — `memory/dilly_profiles/{uid}/profile.json`, `candidate_index.json`
- **Audits** — `audits.json` per profile; `memory/meridian_audit_log.jsonl` (anonymized)
- **ATS scores** — `ats_scores.json` per profile
- **Applications** — Application tracker data
- **Outcomes** — `got_interview_at`, `got_offer_at` in profile
- **Engagement** — `profile.streak`, check-ins, `first_audit_at`
- **Achievements** — `profile.achievements`
- **Recruiter feedback** — `memory/recruiter_feedback.jsonl` (view, shortlist, pass, contact by school)

The work is aggregation, anonymization where required, FERPA-safe consent handling, and a dashboard UI. The data is there.

---

## X. Why It Matters

Career centers are under-resourced and under-measured. They run workshops, host fairs, and offer one-on-ones — but they rarely have data to prove impact or to target the right students. Accreditation asks for placement rates and career outcomes; answers are often manual and incomplete.

Dilly University turns Meridian's student-level data into institutional intelligence. It answers:

- **Who needs help?** At-risk list, needs a nudge.
- **What's working?** Score distribution over time, milestone alerts.
- **Where should we focus?** Workshop targeting, company fit heatmap, peer comparison.
- **What do we report?** Accreditation export, placement rate, year-over-year.
- **What's changing?** Anomaly detection, narrative summaries.

It also creates a new revenue stream: universities pay for seats, add-ons, and white-label. And it deepens the Meridian moat: the more schools use Dilly University, the more invested they are in the student product. It's a two-sided flywheel: students use Meridian → schools want the data → schools promote Meridian → more students use it.

---

## XI. Status

**Dilly University is not yet built.** It exists as a vision and a detailed spec in `docs/DILLY_UNIVERSITY_IDEAS.md`. The ideas are prioritized, deep-dived, and summarized in a table (data needs, effort, differentiator). The recommended first build is clear. The data foundation is in place.

When the time comes, the path is: participation snapshot → score-by-track table → at-risk list → narrative AI → workshop targeting. Then expand from there.

---

*Last updated: 2026-03-19. Based on docs/DILLY_UNIVERSITY_IDEAS.md (last updated March 2025).*
