# Meridian: What It Does for Students (Non-Job-Placement)

Everything below is about making the student **better, more self-aware, and more prepared** — not about connecting them to employers or sending applications.

---

## 1. Resume Scoring and Assessment

The core engine. Students upload a resume and get scored on three dimensions (0-100 each):

- **Smart** — Academic rigor: GPA, major multiplier, honors, research, minors
- **Grit** — Real-world output: quantifiable impact, leadership density, work experience count
- **Build** — Track-specific: what they've actually built (projects, clinical hours, publications, portfolios, etc.)
- **Composite score** — Weighted blend (default: 30% Smart, 45% Grit, 25% Build; varies by track)
- **Track assignment** — Auto-detected from major + resume text into one of 11 tracks (Pre-Health, Pre-Law, Tech, Science, Business, Finance, Consulting, Communications, Education, Arts, Humanities)
- **Evidence trail** — Every score is backed by cited resume evidence
- **Red flags / anomaly detection** — Score-based contradictions surfaced (e.g., high GPA + low Build)
- **Meridian's Take** — Strength-first narrative summary + one main change suggestion
- **Strongest signal** — "Your strongest signal to recruiters right now is [Dimension] — [evidence]"
- **Assessment findings** — Per-dimension detailed findings
- **Audit history** — Every past audit stored and accessible
- **Explain-delta** — "Why did my scores change?" between audits

---

## 2. ATS Readiness and Resume Fixes

Not about applying to jobs — about making the resume **structurally sound** for any ATS system:

- **ATS score** — 0-100 readiness rating
- **What ATS Sees** — Extracted fields (name, email, phone, education, experience, skills) so students see their resume through a machine's eyes
- **13-point formatting checklist** — File type, section headers, date format, contact info, etc.
- **Issue detection** — ATS-critical issues with "Fix it for me" buttons
- **Bullet rewrites** — Rule-based + LLM rewrites (weak verbs, filler removal, quantification placeholders)
- **Keyword analysis** — Per-keyword placement, density score
- **Vendor simulation** — How the resume parses in Workday, Greenhouse, iCIMS, Lever
- **Section reorder suggestions** — Per-vendor optimal ordering
- **Auto-run** — ATS scan triggers after every audit

---

## 3. Live Resume Editor

Students edit their resume inside Meridian and see the impact in real time:

- **Inline editing** — Company, role, date, location, bullets
- **Bullet score preview** — Per-bullet rating (Strong / Good / Needs work / Weak)
- **Auto-save** — After 2s idle
- **Re-audit from edits** — Run a new audit on the edited text without re-uploading

---

## 4. Meridian Voice (AI Career Coach)

A Gemini-style floating AI overlay that knows the student's scores, resume, findings, and goals:

- **Resume-native context** — Uses scores, findings, audit history, career goals in every response
- **Onboarding** — 4-5 questions: what they're preparing for, career goal, target focus, biggest concern, preferred tone
- **Tools:**
  - Gap scan — what's missing from the resume
  - Ready check — "Am I ready for [company/role]?"
  - Bullet rewrite — strengthen weak bullets
  - Interview prep — prep from evidence
  - Deadline tracking — awareness of upcoming deadlines
  - Action items — what to do next
- **Data capture** — Extracts skills, experiences, and projects from conversation into beyond-resume and experience-expansion data (things not on the resume)
- **Resume deep-dive** — "Help Meridian know you better" with experience-specific questions
- **Voice memory** — Persistent across sessions, conversation continuity
- **Tone selection** — 5 options: Encouraging, Direct, Casual, Professional, Coach
- **Emotional support** — Context-aware responses for rejection, nerves, celebration, imposter syndrome
- **Quick interactions** — Chips: "Going well," "Stuck," "Need help with resume." Slash commands: `/ready [company]`, `/mock [JD]`
- **"Remember this"** — Students can tell Voice to remember notes
- **Screen-aware** — Knows which page the student is on and adapts help
- **Speech input** — Mic input via Web Speech API
- **Proactive nudges** — Deadline, score, seasonal, app funnel nudges (user-configurable)

---

## 5. Practice and Interview Prep

All self-improvement, no employer interaction:

- **Mock interview** — 5 behavioral questions in STAR format, turn-by-turn, with scoring
- **Bullet practice** — Describe an experience, get stronger quantified bullets back
- **60-second pitch** — Practice "tell me about yourself"
- **Common questions** — Why this company? Biggest weakness? Conflict resolution?
- **Interview prep from evidence** — Prep based on what's actually in the resume and scores

---

## 6. Insights and Progress Tracking

- **Score trajectory** — Line chart of scores over time
- **Progress to next tier** — How close to the next peer percentile bracket
- **Last vs. this audit** — Side-by-side comparison
- **Peer percentiles** — "Top X% in [track]" when cohort data exists
- **Vs. your peers** — Cohort stats (average, p25, p75) + "How to get ahead"
- **Meridian Noticed** — Cards when improved 3 audits, consistent calendar use, first Top 25%
- **Track playbook** — Track-specific advice and bullets on what matters for their path
- **Quick tips** — Resume FAQs
- **"How much can I improve?"** — Score trajectory projection if completing top recommendations

---

## 7. Calendar and Deadlines

Personal deadline management (not tied to job applications):

- **Month-view calendar** — Visual deadline tracker
- **Add/edit/delete deadlines** — Custom deadlines with sub-deadlines
- **Export to calendar** — .ics for Google/Apple Calendar
- **Deadline urgency in Voice** — Voice awareness of approaching deadlines
- **Deadline badge** — Pulsing dot on Voice tab when a deadline is within 7 days

---

## 8. Achievements and Gamification

- **15 achievements** — first_audit, top25_smart/grit/build, triple_threat, century_club, seven_day_streak, night_owl, one_pager, cohort_champion, and more
- **Achievement collection page** — Sticker grid at /achievements
- **Profile photo frames** — Rings for Top 5/10/25%
- **Profile themes** — 5 visual themes (Professional, Bold, Minimal, Warm, High Contrast)
- **Custom tagline** — For share cards
- **Before and after** — First vs. latest audit comparison
- **Sound effects** — Audit done, badge unlock, celebration
- **Confetti** — On audit submit
- **Easter eggs** — Century Club, Triple Threat, One-pager, Avatar tap 7x, Night owl

---

## 9. Shareable Profile and Share Tools

For the student's own use and self-marketing — not recruiter portal:

- **Six-second profile** — /p/[slug] — name, tagline, photo, one-line hook, Smart/Grit/Build, key findings
- **Full Meridian profile** — /p/[slug]/full — detailed shareable view with per-section privacy controls
- **Preview as recruiter** — See what others see
- **Share cards** — Badge and Snapshot SVGs with custom tagline + 3 chosen achievements
- **Download badge** — Visual badge image
- **Download snapshot** — Audit summary image
- **Download PDF** — Full report export
- **Copy summary / Copy share link** — Quick sharing
- **Share to LinkedIn** — One-click
- **"Add to resume"** — Copyable profile URL line

---

## 10. Career Hub (Second Brain)

Personal career journal, not tied to employer interactions:

- **Timeline** — Audits, beyond-resume entries, deadlines, decision log events
- **Search** — Full-text search of career history
- **Connections** — People and companies tracked
- **Progress** — Score trends and funnel view
- **Decision log** — "Why I turned down X," "What I learned from that rejection"

---

## 11. Habit Loops and Daily Actions

- **Weekly review** — Configurable day
- **Rituals** — Sunday planning, post-interview debrief
- **Streak tracking** — Daily action streak
- **"One thing today"** — 7 rotating daily actions
- **Apps this month** — Monthly goal tracking
- **Milestones** — Achievement-based milestones

---

## 12. Certifications Hub

- **Curated free certifications by track** — Track-specific recommendations for free certs that strengthen the student's profile

---

## 13. Templates Hub

For self-improvement and preparation (not sending to employers directly):

- **Cover letter template** — Personalized from profile
- **Thank-you template** — Post-interview
- **Follow-up template** — Professional follow-up
- **LinkedIn message template** — Networking
- **Resume tailoring template** — How to tailor for a role
- **Interview prep template** — Structured prep
- **All editable** — User edits before using

---

## 14. Transcript Upload

- **PDF upload** — Optional academic transcript
- **GPA extraction** — Pulls GPA, BCPM (for Pre-Health), courses, honors
- **Enriches Smart score** — More accurate scoring with transcript data

---

## 15. Onboarding Experience

- **School-themed** — UTampa branding (sunset silhouettes, "Meridian for Spartans")
- **Resume upload flow** — Upload or skip, immediate audit with score preview
- **Profile bootstrap** — Auto-extracts name, major from resume
- **Goals selection** — Career goal chips
- **Value proposition** — "Your career, one place" with benefit bullets

---

## 16. Parent and Family Features

- **Share with parent** — Parent email + milestone opt-in + invite link
- **Share report to parent** — Email summary to parent
- **Milestone notifications** — Parent gets notified on first audit, etc.
- **Gift Meridian** — Parent buys subscription for student
- **Family plan** — Parent pays for multiple students

---

## 17. Data Ownership and Privacy

- **Export all data** — Download profile, audits, resume, career brain, deadlines
- **"Save what I tell Meridian" toggle** — Control Voice data persistence
- **Delete account** — Full account deletion
- **Per-section privacy** — Toggle visibility for Scores, Activity, Applications, Experience on public profile
- **"Your data is yours. We never sell it."**
- **No AI training on user data**

---

## What's Excluded (Job Placement / Company Outreach)

For clarity, here's what this layout intentionally leaves out:

- Jobs For You / job recommendations and matching
- Apply Through Meridian
- Application tracker (Kanban board)
- Company pages and company research
- Door eligibility
- Recruiter portal and recruiter search
- Apply-through-Meridian emails
- Company-specific outreach tools
- Recruiter outreach emails
