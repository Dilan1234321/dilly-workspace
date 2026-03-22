# Dilly University — Ideas and Deep Dives

**Purpose:** Platform for universities to track students, analyze trends, and view institutional data through an advanced analytics lens. Builds on Meridian's existing student data and school-domain model.

**Last updated:** March 2025

---

## Ideas (Prioritized by User Interest)

### Analytics & Tracking

- **First audit velocity** — Time from signup to first audit
- **Score distribution over time** — Smart/Grit/Build by cohort and period
- **At-risk list** — Low scores + low engagement; actionable outreach list
- **Needs a nudge** — Haven't used Meridian in 90+ days
- **Workshop targeting** — "Tech students with Build < 60" → invite list
- **Peer comparison nudges** — "Your Tech cohort is 12 pts lower than USF's — maybe do X"
- **Milestone alerts** — First interview, first offer; celebrate and report
- **Accreditation export** — One-click PDF/Excel for reporting
- **Placement rate** — % with interviews/offers
- **Year-over-year report** — Compare this year vs last
- **Custom date ranges** — Pick any date range for reports
- **Narrative summaries** — AI-generated "here's what the data says"
- **Anomaly detection** — Flag unusual drops or spikes

### Engagement & Gamification

- **Campus leaderboard** — Opt-in, anonymized top scorers
- **Department competition** — Participation and scores by major/department
- **Streak leaderboard** — Most consistent users (daily check-in)
- **Achievement unlock rates** — % of students who hit each achievement

### Integrations

- **Canvas/LMS** — Embed Meridian in courses; track by class
- **Slack/Teams** — Weekly digest for career center staff

### Unique Metrics

- **0–100 score per cohort** — Single "Meridian readiness" index
- **Recruiter interest** — Views/shortlists per school
- **Company fit heatmap** — Where students target vs where they're ready
- **ATS readiness by cohort** — % ATS-ready per track

### Monetization

- **Per-seat** — Charge per career center staff user
- **Add-ons** — Batch audit, SIS integration, custom reports, API
- **White-label** — School's branding, custom domain

---

## Deep Dives

### First Audit Velocity

**What it is:** Time from signup to first resume audit.

**Why it matters:** Long delay = friction (upload, trust, confusion). Fast first audit = stronger activation.

**How it works:**
- Track `created_at` (signup) and `first_audit_at` (first successful audit).
- Metrics: median/mean days to first audit, % who audit within 7/14/30 days.
- Segment by major, track, or signup source.

**Use:** "Pre-Health students take 12 days on average vs 4 for Tech — consider a Pre-Health onboarding email."

---

### Score Distribution Over Time

**What it is:** Smart/Grit/Build distributions by cohort and time period.

**How it works:**
- Store audit timestamps; aggregate by school, track, and period (week/month/term).
- Show histograms or box plots: p25, median, p75 per dimension.
- Overlay multiple periods to see shifts.

**Use:** "Tech Grit moved up 8 pts this term — the ATS workshop may have helped."

---

### At-Risk List

**What it is:** Students who are underperforming and/or disengaged.

**Definition options:**
- Low scores (e.g. final < 50) + no audit in 60+ days
- No applications + low engagement
- Score drop > 10 pts vs last audit

**Output:** List with optional filters (major, track, risk level). Export for outreach.

**Consent:** FERPA-safe — only students who opted in to career center visibility, or anonymized until outreach is needed.

---

### Needs a Nudge

**What it is:** Students who haven't used Meridian in a while.

**Definition:** No audit in 90+ days (or 60/120, configurable).

**Output:** List of emails (or anonymized IDs) for outreach.

**Use:** "Send a reminder: 'Your resume is 4 months old — run a quick audit before recruiting season.'"

---

### Workshop Targeting

**What it is:** "Who should we invite to this workshop?"

**How it works:**
- Filters: track, major, score range (e.g. Build < 60), ATS score < 70, no applications.
- Output: list of students who match criteria.
- Optional: "Send invite" or "Add to campaign."

**Use:** "Tech students with Build < 60" → ATS workshop; "Pre-Health with low clinical hours" → shadowing clinic.

---

### Peer Comparison Nudges (with USF comparison)

**What it is:** Compare your school's cohort to another school (e.g. USF) and suggest actions.

**Example:** "Your Tech cohort's Grit is 12 pts below USF's. Consider: leadership workshops, resume clinics, or more emphasis on quantified impact."

**How it works:**
- Anonymized benchmarks by school (e.g. avg Grit by track).
- LLM generates "consider doing X" suggestions from common gaps.
- Schools opt in to sharing; only aggregate stats are shown.

**Use:** "Your Pre-Health cohort is 8 pts below FSU — focus on clinical hours and research evidence."

---

### Milestone Alerts

**What it is:** Notifications when students hit milestones.

**Milestones:** First audit, first application, first interview, first offer, Top 25% in a dimension.

**How it works:**
- Track `first_application_at`, `first_interview_at`, `got_offer_at` in profile.
- Career center dashboard: "12 students hit first interview this week."
- Optional: email digest or Slack/Teams.

**Use:** "3 students got offers this week — celebrate and share."

---

### Accreditation Export

**What it is:** One-click PDF/Excel for accreditation and reporting.

**Contents:** Participation, score distributions, placement rates, trends, demographics (if allowed).

**How it works:**
- Pre-built report template: cover, participation, scores, outcomes, methodology.
- Export: PDF for narrative, Excel for raw data.

**Use:** "Career readiness report for SACS review."

---

### Placement Rate

**What it is:** % of students with interviews or offers.

**How it works:**
- Use `got_interview_at`, `got_offer_at` in profile.
- Denominator: active users or students with ≥1 audit.
- Optional: by track, major, year.

**Use:** "42% of Meridian users had 1+ interview this year."

**Caveat:** Depends on students reporting outcomes; optional prompts in the app.

---

### Year-Over-Year Report

**What it is:** Compare this year to last year.

**Metrics:** Participation, avg scores, placement rates, engagement.

**How it works:**
- Define "year" (academic, fiscal, calendar).
- Compare metrics for Year N vs Year N-1.
- Show delta and % change.

**Use:** "Participation up 34%; avg Grit up 6 pts."

---

### Custom Date Ranges

**What it is:** User picks any date range for reports.

**How it works:**
- Date picker: start and end.
- All dashboards filter by that range.
- Presets: "This term," "Last 30 days," "FY24."

**Use:** "Show me Fall 2025 only."

---

### Narrative Summaries

**What it is:** AI-generated summaries of what the data shows.

**Example:** "This term, Tech Grit rose 6 pts; Pre-Health Build is flat. Consider more clinical-hour workshops. Finance participation is down 12% — consider a targeted campaign."

**How it works:**
- LLM receives aggregated metrics + context.
- Output: 2–3 short paragraphs with trends and suggested actions.

**Use:** "Copy this into the provost report."

---

### Anomaly Detection

**What it is:** Flag unusual changes in metrics.

**Examples:**
- Tech Smart drops 15 pts in one term
- Pre-Health participation suddenly doubles
- One department's scores diverge from others

**How it works:**
- Track baseline (avg, std).
- Flag when metrics move beyond a threshold (e.g. 2σ).
- Alert: "Finance cohort Smart dropped 15 pts — investigate."

**Use:** "Something changed; investigate before it becomes a trend."

---

### Campus Leaderboard

**What it is:** Opt-in leaderboard of top students by score.

**How it works:**
- Students opt in.
- Rank by final score or dimension (e.g. Grit).
- Show rank and score (e.g. "#12 of 89 in Tech").

**Use:** "Top 10% Grit in Pre-Health at UTampa."

---

### Department Competition

**What it is:** Compare departments or majors.

**Metrics:** Participation rate, avg score, improvement, engagement.

**How it works:**
- Map majors to departments.
- Show department vs department (e.g. "Business has highest participation; Science has highest avg Grit").

**Use:** "Which departments are most engaged?"

---

### Streak Leaderboard

**What it is:** Rank by daily check-in streak.

**How it works:**
- Use `profile.streak` (current_streak, longest_streak).
- Leaderboard: top N by longest streak.
- Optional: "This week's top streakers."

**Use:** "Most consistent users."

---

### Achievement Unlock Rates

**What it is:** % of students who unlock each achievement.

**How it works:**
- Track `profile.achievements` (e.g. first_audit, first_application, top25_grit).
- Report: "67% have first_audit; 23% have first_application; 8% have top25_grit."

**Use:** "Where are students getting stuck?"

---

### Canvas / LMS Integration

**What it is:** Embed Meridian in courses (e.g. "Career readiness" module).

**How it works:**
- LTI integration.
- Instructor assigns "Run audit" or "Complete career module."
- Sync completion back to LMS.

**Use:** "Career readiness as a graded assignment."

---

### Slack / Teams

**What it is:** Career center gets digest in Slack or Teams.

**How it works:**
- Webhook or bot.
- Scheduled: "Weekly: 12 new audits, 3 first interviews, 2 at-risk."
- Optional: alerts for anomalies or milestones.

**Use:** "Daily or weekly digest without opening the dashboard."

---

### 0–100 Score Per Cohort

**What it is:** Single "Meridian readiness" score per cohort.

**How it works:**
- Weight Smart, Grit, Build, ATS, engagement.
- Output: "Tech cohort: 72; Pre-Health: 68; Business: 71."

**Use:** "One number to track and compare."

---

### Recruiter Interest

**What it is:** How often recruiters view or shortlist students from your school.

**How it works:**
- Use `recruiter_feedback.jsonl` (view, shortlist, pass, contact).
- Aggregate by school: "UTampa: 45 views, 12 shortlists this month."

**Use:** "Employer demand for your students."

---

### Company Fit Heatmap

**What it is:** Where students target vs where they're ready.

**How it works:**
- X-axis: companies students target (e.g. Goldman, McKinsey, Google).
- Y-axis: readiness (e.g. "Ready" vs "Stretch" vs "Not yet").
- Heatmap: "Many target Goldman; few are ready."

**Use:** "Target workshops on gaps for top employers."

---

### ATS Readiness by Cohort

**What it is:** % of students with ATS score above a threshold.

**How it works:**
- Use `ats_scores.json` per profile.
- Aggregate: "Tech: 78% ATS-ready; Pre-Health: 62%."

**Use:** "Tech is ATS-ready; Pre-Health needs formatting help."

---

### Per-Seat Monetization

**What it is:** Charge per career center user.

**How it works:**
- Admin creates seats (e.g. 5 staff).
- Each staff has login; usage is tracked.
- Overage: add seats or upgrade.

**Use:** "$X per seat per month."

---

### Add-Ons

**What it is:** Optional paid modules.

**Examples:**
- Batch audit (unlimited uploads)
- SIS integration
- Custom reports
- API access
- White-label

**Use:** "Base + add-ons" pricing.

---

### White-Label

**What it is:** Meridian branded as the university's product.

**How it works:**
- Custom domain (e.g. careers.utampa.edu)
- Logo, colors, copy
- "Powered by Meridian" or fully white-label

**Use:** "Our career tool" vs "third-party app."

---

## Summary Table

| Idea | Data needs | Effort | Differentiator |
|------|------------|--------|----------------|
| First audit velocity | signup + audit timestamps | Low | Activation |
| Score distribution over time | audit history | Medium | Trends |
| At-risk list | scores + engagement | Low | Actionable |
| Needs a nudge | last_audit_at | Low | Outreach |
| Workshop targeting | profile + audit | Medium | Targeting |
| Peer comparison (USF) | cross-school benchmarks | Medium | Competitive |
| Milestone alerts | outcome fields | Low | Celebration |
| Accreditation export | all metrics | Medium | Reporting |
| Placement rate | got_interview/offer | Low | Outcomes |
| Year-over-year | historical data | Low | Trends |
| Custom date ranges | all queries | Low | Flexibility |
| Narrative summaries | LLM + metrics | Medium | Storytelling |
| Anomaly detection | baselines + thresholds | Medium | Early warning |
| Campus leaderboard | opt-in + scores | Low | Engagement |
| Department competition | major → dept | Medium | Engagement |
| Streak leaderboard | streak data | Low | Engagement |
| Achievement unlock rates | achievements | Low | Funnel |
| Canvas/LMS | LTI | High | Integration |
| Slack/Teams | webhooks | Medium | Workflow |
| 0–100 cohort score | composite formula | Low | Simplicity |
| Recruiter interest | feedback log | Low | Unique |
| Company fit heatmap | targets + readiness | Medium | Targeting |
| ATS readiness by cohort | ats_scores | Low | ATS |
| Per-seat | auth + billing | Medium | Revenue |
| Add-ons | modular | Varies | Revenue |
| White-label | config + branding | High | Enterprise |

---

## Recommended First Build (from earlier discussion)

1. **Participation snapshot** — Total users, audits this month, top tracks
2. **Score-by-track table** — Avg Smart/Grit/Build per track, exportable
3. **At-risk list** — Low engagement + low scores; export for outreach

Then add: narrative AI insights, workshop targeting.
