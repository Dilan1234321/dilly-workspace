# Dilly - Complete Product Specification

## What Dilly Is

Dilly is a career acceleration platform that learns who you are and helps you get hired. It is NOT a resume editor. It is NOT another AI resume scanner. Dilly builds a deep profile of every user through conversations, resume parsing, and user input, then uses that profile to provide personalized career guidance, job matching, resume generation, and interview preparation.

The core philosophy: **Dilly knows you.** Not your resume. You. Your experiences, skills, goals, fears, strengths, and gaps. Everything you tell Dilly becomes part of your Dilly Profile, and everything Dilly does for you is based on that profile.

---

## How It Works

### The Dilly Profile

The Dilly Profile is the foundation of everything. It is a structured collection of facts about the user stored in the `profile_facts` PostgreSQL table. Facts have:

- **Category**: achievement, goal, target_company, skill_unlisted, project_detail, motivation, personality, soft_skill, hobby, strength, weakness, challenge, area_for_improvement, fear, company_culture_pref, life_context
- **Label**: short identifier (e.g., "Python experience")
- **Value**: the detail (e.g., "Built a data pipeline processing 10M records daily")
- **Source**: how it was captured (voice, resume, manual)
- **Confidence**: high, medium, low

The profile grows in three ways:

1. **Resume Upload (Onboarding)**: When a user first joins, they can upload a resume. Dilly parses it and extracts facts into the profile. The resume is just a seed, not the source of truth.

2. **Conversations with Dilly AI**: Every time the user talks to Dilly, a background extraction process (`_run_profile_extraction_background`) analyzes the conversation and automatically adds new facts to the profile. The user never has to "save" anything.

3. **Manual Edits**: Users can add, edit, and delete facts directly on the My Dilly page.

### No Scores

Dilly does not score users. There are no Smart/Grit/Build numbers. No overall score. No cohort scores. Instead, Dilly provides:

- **Fit Narratives**: When a user taps a job, Dilly reads their profile and the job description and writes a personal narrative: what they have that the job wants, what's missing, and what to do. This is powered by Claude Haiku, costs ~$0.001-0.002 per narrative, and is cached per user+job pair.

- **"What We Think" Page**: A personal letter from Dilly to the user based on their full profile. Connects dots across their experiences, identifies patterns, and gives concrete next moves. Powered by Claude Sonnet.

- **Fit Color Indicators**: Green (strong fit), amber (close), red (significant gaps) shown as dots on job cards.

### Cohorts

Cohorts are job categories, not user identities. There are 22 official cohorts (e.g., "Software Engineering & CS", "Finance & Accounting", "Healthcare & Clinical"). Jobs are tagged with 1-3 cohorts. Users don't "belong to" a cohort. They filter the job feed by categories they're interested in.

### ATS Awareness

Every job on Dilly has a confirmed ATS (Applicant Tracking System). Currently:
- Greenhouse: ~9,200 jobs
- SmartRecruiters: ~320 jobs
- Lever: ~220 jobs
- Ashby: ~70 jobs
- USAJobs: 8 jobs
- NSF REU: 15 jobs

When Dilly generates a tailored resume, it formats it specifically for that job's ATS system. The formatting rules differ per ATS (Greenhouse is flexible, Workday is strict, Taleo needs plain text).

---

## The App

### Career Center (Home Tab)

The first thing users see. Dilly face greets them with a personalized message based on their profile and recent activity. Below: recent jobs, quick tools (Generate, Tracker, What We Think, Interview, Calendar).

### Jobs Tab

Shows jobs matched to the user's preferred cities and interests. Features:
- Search by title or company
- Filter by city (multi-select chips from their profile cities)
- Filter by type (All, Internships, Entry Level, Full Time, Part Time, Other)
- Company logos on each card
- Quick glance bullets (pre-computed key requirements)
- Fit narrative (loads when card is expanded, shows what you have/what's missing/what to do)
- Apply button (opens URL + tracks in application tracker)
- Tailor Resume button (generates ATS-optimized resume from profile)
- Ask Dilly button (opens AI with job context)

### AI Arena Tab

AI readiness command center. Dark navy background. Shows:
- Shield score ring (AI readiness, LLM-based, separate from job scoring)
- Three-act narrative: The Threat (vulnerable signals), Your Edge (resistant signals), Your Playbook (action plan)
- AI tools: Threat Scanner, Replace Me test, Career Sim, Skill Vault, Firewall, Disruption Index

### My Dilly Tab

Everything Dilly knows about the user:
- Cities they're available in
- Dilly Card (digital business card, 8 templates: Default, Clean, Dark, Statement, Navy, Sage, Coral, Midnight)
- Profile facts organized by category (strengths, weaknesses, skills, goals, etc.)
- Help Dilly Help You suggestions (always visible, rotating)
- Milestones
- My Resumes (generated resumes with share button)

### What We Think Page

Personal letter from Dilly. Loading shows Dilly face with "Taking a closer look at you..." Displays:
- Dilly face + personalized headline
- Letter paragraphs as visual cards (not a word dump)
- "Dots We Connected" (patterns across profile facts)
- "Your Next Moves" (numbered, tappable action cards)
- "Tell Dilly more" button

### Resume Generation

When user taps "Tailor" on a job:
1. Dilly checks if they're ready for this role (Haiku call)
2. If not ready: shows what's missing + Ask Dilly button, no resume generated
3. If gaps: generates resume but shows gap warnings
4. If ready: generates full ATS-optimized resume

The resume:
- Built entirely from the Dilly Profile (not a template)
- Formatted for the specific ATS the company uses
- Never invents experiences, skills, or metrics
- Shows ATS badge: "Formatted for Greenhouse. All keywords matched."
- Downloadable as PNG
- Editable inline

### Interview Practice

Company-specific mock interviews. User enters company, role, and JD. Dilly generates likely questions. User practices answering. At the end, Claude Sonnet provides:
- Overall verdict (Ready / Almost / Needs Work)
- Per-question feedback with model answers
- Action items for before the real interview

### Settings

4 sections: Account, Plan, Notifications, About. AI disclaimer. Sign out. Delete account.

---

## Pricing

Three tiers:

### Dilly Starter (Free)
- Dilly AI with daily token limit (Haiku model)
- Dilly Profile up to 20 facts
- Resume upload to seed profile
- Job feed (browse only)
- 1 business card template
- AI Arena shield score only
- 10 fit narratives per month
- Calendar full access

### Dilly ($9.99 students / $14.99 non-students via website, $14.99 / $19.99 in-app)
- Dilly AI generous daily limit (Sonnet model)
- Unlimited profile facts
- Full job feed with filters
- 7 business card templates
- Full AI Arena
- 250 fit narratives per month
- 20 tailored resumes per month
- 2 interview practice sessions per month
- Auto-track jobs from Apply

### Dilly Pro ($14.99 students / $19.99 non-students via website, $19.99 / $24.99 in-app)
- Unlimited Dilly AI (Opus model)
- Everything in Dilly, no limits
- Unlimited tailored resumes
- Unlimited interview practice
- AI Arena tools (Threat Scanner, Replace Me, Career Sim)
- Weekly AI career brief

### Student Detection
- .edu email + graduation_year >= current year = student pricing
- Non-.edu = non-student pricing
- No age check

### Gate Screen (DillyGate)
When free users hit a limit, Dilly face animates in with a personal message: "I can tell you exactly how you fit this role. That's on Dilly." Two buttons: "See plans" and "Not now." No pressure, no dark patterns.

---

## Onboarding

Two paths, unified entry screen with two email inputs (general on top, .edu below).

### General Path
1. Email + verification code
2. Profile: name, career fields, career target, mandatory photo
3. Optional resume upload ("Want to speed things up?")
4. Profile ready screen

### Student Path
1. .edu email + verification code
2. Profile: name, school, major, minor, class year, pre-prof track, career target, mandatory photo
3. Optional resume upload
4. Profile ready screen

Photo must be professional ("like one you'd put on LinkedIn").

---

## Technical Architecture

### Backend
- FastAPI (Python) on Railway
- PostgreSQL on AWS RDS
- Claude API (Anthropic) for all AI features
- Auto-deploy from GitHub pushes

### Mobile
- React Native / Expo
- Expo Router for navigation
- Built locally with xcodebuild, uploaded to TestFlight
- Bundle version tracked in Info.plist

### Key Endpoints
- `POST /ai/chat` - Dilly AI conversation
- `POST /jobs/fit-narrative` - fit narrative for a job
- `POST /insights/letter` - "What We Think" personal letter
- `POST /resume/generate` - ATS-aware resume generation
- `POST /interview/feedback` - interview practice feedback
- `POST /audit/profile-score` - profile-based scoring (for AI Arena)
- `GET /v2/internships/feed` - job feed with filters
- `GET /profile` - user profile with plan, is_student, facts
- `GET /memory` - Dilly Profile memory surface

### Job Pipeline
- Scrapes from Greenhouse, Lever, Ashby, SmartRecruiters (177 companies)
- Classifies each job: cohort tags + quick glance bullets (Claude)
- Stores ATS system per job
- US/Canada only
- Currently ~9,800 active jobs

### Profile Extraction
After every AI conversation, `_run_profile_extraction_background` runs in a background thread, extracts facts from what the user said, and stores them in `profile_facts`. This means the Dilly Profile grows automatically as users interact with the app.

---

## Design System

- Primary accent: Indigo (#2B3A8E)
- Success: Green (#34C759)
- Warning: Amber (#FF9F0A)
- Background: White (#FFFFFF)
- Cards: colors.s1 with colors.b1 border
- Text: colors.t1 (primary), colors.t2 (secondary), colors.t3 (tertiary)
- Animations: FadeInView with staggered delays, AnimatedPressable with scaleDown
- DillyFace: animated SVG face with spring physics (eyes + smile)
- No em dashes anywhere

---

## What Makes Dilly Different

1. **Profile-first, not resume-first.** Your resume is just the start. Dilly learns everything about you.
2. **Narrative, not numbers.** No scores. No percentages. Personal, honest feedback in plain language.
3. **ATS-aware resume generation.** Every resume is formatted for the specific ATS the company uses.
4. **Automatic profile growth.** Talk to Dilly, and your profile updates itself.
5. **The gate is respectful.** No scammy upsells. Dilly face, a personal message, and a choice.
6. **Every job has a verified ATS.** If we don't know the ATS, the job isn't on Dilly.
7. **Fit narratives, not keyword matching.** Claude reads your profile and the JD and tells you exactly what you have, what's missing, and what to do.
