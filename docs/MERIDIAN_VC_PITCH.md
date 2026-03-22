# Meridian AI — Investor Pitch

**The Credit Score for Talent**

*Meridian scores resumes the way senior hiring managers read them — then coaches students to close the gap.*

---

## The Problem

**Career readiness is broken. Both sides lose.**

**For 20M+ US undergrads:**
- Career centers are 9-to-5, booked out for weeks, and give the same generic advice to everyone
- Students have zero signal on where they actually stand — they upload a resume into Handshake and hope
- Friends, ChatGPT, and Reddit give generic tips with no grounding in what recruiters actually look for
- Every application is a shot in the dark: "Am I wasting my time applying here?"

**For recruiters:**
- 6-8 seconds per resume. They're pattern-matching, not reading bullets
- 30% of applications on platforms like Handshake and LinkedIn are from unqualified or fake applicants
- No standard signal to separate a 3.5 GPA in Organic Chemistry from a 4.0 in General Studies
- No way to find "hidden gem" students at non-Ivy schools without reading thousands of resumes

**The gap isn't templates or job boards. The gap is truth.** No one tells students what the pattern looks like, and no one gives recruiters a signal they can trust.

---

## The Solution

**Meridian is a career-acceleration engine that scores your resume the way a senior hiring manager reads it — across three dimensions: Smart, Grit, and Build.**

Every score is tied to evidence. Every recommendation is a specific line edit, not generic advice. Every student is scored against the actual hiring frameworks of companies in their field.

**What makes it different:**

| Differentiator | What it means |
|---|---|
| **Track-specific scoring** | 11 career tracks (Pre-Health, Pre-Law, Tech, Finance, Consulting, Business, Science, Communications, Education, Arts, Humanities). A pre-med student is scored on clinical hours and BCPM; a finance student is scored against Big Four criteria; a tech student is scored against FAANG hiring guidelines. |
| **Rigor calibration** | A 3.5 in Biochemistry is harder than a 4.0 in General Studies. Meridian's major multiplier (research-backed, every UT catalog major mapped) adjusts for grading rigor so hard STEM is rewarded, not penalized. |
| **Evidence, not vibes** | Every score is tied to a direct quote from the resume (Meridian Truth Standard). "Your strongest signal to recruiters is Grit — you led a 6-person team that increased attendance by 40%." No hallucination, no invented facts. |
| **.edu only, 100% verified** | Students authenticate with their .edu email and a verification code. No passwords. No fakes. No bots. Every applicant from Meridian is a verified college student. |
| **AI career coach that actually knows you** | Meridian Voice knows your resume, your scores, your track, your goals, your deadlines, and your conversation history. It gives consultant-level advice — not generic chatbot answers. |

---

## What We've Built (This Is Not a Deck — This Is a Product)

Meridian is built, running, and auditing real student resumes. Here is what exists in production code today:

### Core Engine

- **AI-powered resume audit** — Upload a PDF or DOCX. Get Smart (academic rigor), Grit (leadership + quantifiable impact), and Build (track-specific proof) scores, 0-100. Composite final score weighted by track.
- **LLM auditor with few-shot learning** — 22+ gold-standard resumes teach the model what "elite" looks like per track. Every new audit is appended to the training set, so the engine gets smarter with every resume processed.
- **Ground Truth V6.5 scoring engine** — Rule-based + LLM hybrid. Major multipliers (0.86x to 1.40x, research-cited), minor bonus, BCPM for pre-health, international grit multiplier, track-specific Build rubrics.
- **Evidence and recommendations** — Per-dimension evidence quotes cited from the resume. Three recommendation types: line edits ("change this bullet to this"), action steps ("get 50 more shadowing hours"), and strategic advice. Consultant-level, not generic.
- **Red flag detection** — High GPA + zero Build = "High-Risk / Low-Velocity." Score anomalies and resume issues (over one page, missing dates, weak verbs, unquantified bullets) surfaced automatically.
- **Peer benchmarking** — "Top X% Smart for Pre-Health." Percentiles computed against same-track cohort. Vs Your Peers comparison with cohort averages and top quartile.

### Meridian Voice (AI Career Coach)

- **Full conversational AI** — GPT-4o powered, context-aware. Knows the student's resume, audit scores, goals, track, deadlines, conversation history, and voice-captured details.
- **Tool use** — Voice can run gap scans, ready checks, bullet rewrites, interview prep, and job recommendations from natural language. "Am I ready for Goldman?" triggers a real analysis.
- **Data capture** — Students tell Meridian things not on their resume (skills, people they've met, experiences). All captured, stored, and used in future audits and recruiter matching.
- **Voice onboarding** — 4-5 questions to understand the student's goals, targets, and preferences. Answers stored and used across the platform.
- **Emotional intelligence** — Detects rejection, imposter syndrome, nerves, celebration. Responds with empathy first, then practical next steps.
- **Resume deep-dive** — Role-by-role interview: "What tools did you use? What did you leave off?" Captures details that make the resume and recruiter matching richer.

### ATS Readiness Engine

This is the most comprehensive ATS analysis on the market. Not a simple "score" — a full simulation:

- **0-100 ATS readiness score** with tracking over time
- **Per-vendor simulation** — How Workday, Greenhouse, iCIMS, and Lever would each parse the same resume differently. Per-vendor scores, what breaks, what works, vendor-specific tips
- **Company-to-ATS lookup** — Student types "Amazon" and learns they use Workday. 100+ companies mapped with fuzzy matching
- **Keyword density and placement analysis** — Every keyword mapped to where it appears (summary, experience, skills), classified as contextual vs bare-list. JD match with must-have/nice-to-have breakdown
- **"Fix It For Me" bullet rewrites** — Automatic rewrites of every ATS-flagged bullet. Rule-based (instant, zero cost) + LLM-enhanced. 38+ weak verb replacements, filler removal, quantification placeholders
- **Contextual keyword injection** — For each missing/weak keyword, shows exactly which bullet to add it to and exactly how, with a before/after rewrite
- **Section reorder suggestions** per ATS vendor
- **Auto-runs after every audit** — No extra clicks

### Jobs and Recruiter Tools

- **Jobs for you** — Ethical scraping (Greenhouse API, USAJobs) of verified employers only. LLM-powered match scoring with personalized "why you're a fit" bullets. Location filtering, bookmarks, collections.
- **Apply through Meridian** — One tap: we send the application email with `[Meridian Verified]` in the subject line. Recruiter sees the signal before they click.
- **Company pages** — Dedicated pages per verified employer with score bars (their requirements vs your scores), what they look for, open roles, certs that help, recruiter advice.
- **Recruiter search API** — POST a job description, get ranked candidates with match scores. Semantic search over embeddings + skill tags built from full Meridian profiles. JD-to-Meridian-fit converter.
- **Recruiter UI** — Dashboard for recruiters to search candidates, view profiles, and compare against role requirements.

### Shareable Profile and Six-Second Scan

- **Six-second recruiter profile** — One link (`/p/slug`). Name, photo, scores, evidence, career goal. Auto-updates when they edit their profile or run a new audit. Students put it on their resume footer.
- **Full Meridian profile** — Desktop-first comprehensive view with privacy controls (per-section: scores, activity, applications, experience).
- **PDF reports** — Signed, shareable links (7-day expiry). Professional summary of scores, findings, evidence, recommendations.
- **Share cards** — Achievement stickers, Top X% badges, custom taglines. "Send this to your friends."

### Habit and Retention

- **Achievement system** — 15 achievements (First Audit, Top 25% dimensions, Triple Threat, Century Club, 7-Day Streak, etc.). Sticker-sheet collection page.
- **Streak + daily check-in** — Daily micro-actions, streak tracking, milestone badges (first application, first interview, first offer).
- **Application tracker** — Full pipeline: Saved / Applied / Interviewing / Offer / Rejected. Stats, notes, deadline tracking.
- **Calendar and deadlines** — Add deadlines, countdown on home screen, sprint plans, .ics export.
- **Weekly review rituals** — Guided Voice prompts on review day. Post-interview debrief. Sunday career planning.
- **Proactive nudges** — Application funnel alerts, relationship reminders, seasonal recruiting awareness, score-based wins, deadline intelligence. All user-controllable.

### Templates and Career Tools

- **Templates hub** — Cover letters, thank-you emails, follow-ups, LinkedIn messages, resume tailoring, interview prep. All personalized from the student's profile and target JD.
- **Career Hub** — Searchable career history timeline. Applications, audits, people met, decision log.
- **Am I Ready?** — One tap: "Ready / Not yet / Stretch" for any company or role, with concrete gaps.
- **Certifications hub** — Curated free certifications filtered by track.

### Auth, Payments, and Infrastructure

- **.edu verification** — Send code to .edu email, verify, logged in. No password. Dev-unlock for testing.
- **Stripe integration** — Checkout, webhook, subscription management. Gift Meridian (parent buys 6 or 12 months). Family plan (2-3 students, one billing). Live payments ready to flip on.
- **Parent features** — Gift Meridian, family plan, parent dashboard (opt-in by student), milestone notifications, shareable report to parent.
- **Data export** — Download everything as JSON. Calendar export. Resume paste import.
- **Trust and safety** — Data ownership copy, privacy controls, "Save what I tell Meridian" toggle, HTTPS, no AI training on user data, human backup.

### Marketing Website

- **Professional landing page** at meridian-careers.com — Hero, features, pricing, track pages, comparison table, FAQ, social proof, try-before-signup bullet demo
- **11 track-specific pages** — Each with distinct field personality, hiring criteria, common gaps, testimonials
- **For Parents page** — Trust copy, Gift Meridian, Family plan
- **For Recruiters page** — `[Meridian Verified]` explained, recruiter search pitch

---

## How It Works

```
Student signs up (.edu only)
        ↓
  Uploads resume (PDF/DOCX)
        ↓
  Meridian scores it:
  Smart (academic rigor) · Grit (leadership + impact) · Build (track-specific proof)
        ↓
  Evidence-based findings + specific line edits + action recommendations
        ↓
  ATS readiness scan (4 vendor simulations, keyword analysis, auto-rewrites)
        ↓
  Jobs matched to their profile · Company score bars · "Am I Ready?" checks
        ↓
  Meridian Voice: AI coach that knows everything — prep for interviews,
  rewrite bullets, build a sprint plan, capture experiences
        ↓
  Share: Six-second recruiter profile · PDF reports · Achievement badges
        ↓
  Recruiter sees [Meridian Verified] · Searches by Meridian scores · Trusts the signal
```

---

## Market

### TAM / SAM / SOM

| | Size | Description |
|---|---|---|
| **TAM** | **$12B+** | US career services, resume tools, job boards, career coaching for college students and early career (20M+ enrolled undergrads, growing) |
| **SAM** | **$2.4B** | College students who actively use career tools (est. 60% of 20M = 12M students x $200/yr avg spend across tools, coaching, test prep) |
| **SOM** | **$48M** | 400K students at target universities (starting with mid-market schools where career centers are weakest) x $120/yr ($9.99/mo) |

### Why college students pay

- An internship at a top firm pays $25-40/hour. If Meridian gives a 10% better chance of landing it, $9.99/month is paid for in the first hour of the first day on the job
- Students pay $16/month for Chegg to cheat. Meridian is $10/month to get hired
- Career coaching: $100-300/hour. Meridian is $10/month for unlimited, personalized, 24/7 access
- The alternative is "ask ChatGPT" and get generic advice with no grounding in what recruiters actually look for

---

## Business Model

### Revenue streams (near-term)

| Stream | Price | Status |
|---|---|---|
| **Student subscription** | $9.99/month | Primary. Stripe integrated. Launch pricing. |
| **Gift Meridian (parents)** | 6 or 12 months prepaid | Built. Parents buy for students. |
| **Family plan** | Monthly, 2-3 students | Built. One billing, separate accounts. |

### Revenue streams (post-traction)

| Stream | Description |
|---|---|
| **Recruiter API** | Pay-per-search or subscription for access to verified, scored candidate pool. Built and functional. |
| **Campus partnerships** | University career centers license Meridian for their students. Batch audit API already built. |
| **Premium tiers** | Deep-dive reports, advanced mock audits, 1:1 coaching marketplace (coaches use Meridian tools). |
| **Affiliate / partner referrals** | Test prep (MCAT, LSAT, GRE), certification providers, internship platforms. Track-specific, value-first. |

### Unit economics targets

| Metric | Target |
|---|---|
| **CAC** | <$15 (organic: campus ambassadors, word-of-mouth, .edu viral loops, referral program) |
| **LTV** | $120+ (12+ month retention with daily engagement and habit loops) |
| **LTV:CAC** | 8:1+ |
| **Gross margin** | 85%+ (LLM costs per audit ~$0.02-0.05; bulk of infra is commodity compute) |

---

## Competitive Landscape

| | Meridian | Handshake | LinkedIn | VMock / Quinncia | ChatGPT |
|---|---|---|---|---|---|
| **Resume scoring** | Smart / Grit / Build, track-specific, evidence-based, rigor-calibrated | No | No | Generic score, not track-specific | No scoring |
| **Who it scores like** | Senior hiring managers + company-specific frameworks (FAANG, Big Four, MBB) | N/A | N/A | Generic ATS rules | Generic |
| **Tracks** | 11 career-specific tracks with distinct rubrics | N/A | N/A | No | No |
| **ATS simulation** | 4 real vendor engines (Workday, Greenhouse, iCIMS, Lever) + keyword injection + auto-rewrites | No | No | Basic (4 vendors, less depth) | No |
| **AI career coach** | Full context (resume, scores, goals, track, deadlines, conversation history) | No | No | No | Generic, no student context |
| **Verified students** | .edu only, verified | .edu, but not verified | No | No | No |
| **Recruiter signal** | Scores + evidence + six-second profile + `[Meridian Verified]` applications | Job board only | Job board + network | Report only | None |
| **Line-level edits** | "Change this bullet to this" with diagnosis | No | No | Some | Sometimes |
| **Habit + retention** | Streaks, achievements, rituals, proactive nudges, application tracker, calendar | Job alerts | Feed | One-off | Session-based |
| **Price** | $9.99/mo | Free (employer-paid) | Free / $30/mo Premium | $20-50/report | $20/mo |

**Key insight:** Handshake and LinkedIn help you find jobs. They don't tell you if you're ready. VMock and Quinncia give a score with no coaching, no tracking, and no recruiter signal. ChatGPT gives generic advice with no grounding. **Meridian closes the entire loop: score, fix, prepare, apply, get hired.**

---

## Why Now

1. **LLMs just became good enough.** GPT-4o can reliably score resumes against complex rubrics, generate consultant-grade line edits, and carry multi-turn coaching conversations. This wasn't possible 18 months ago.

2. **Students are desperate for signal.** Post-COVID hiring is harder, application volumes are up 300%+, and AI-generated applications mean recruiters trust resumes even less. Students need a way to stand out.

3. **Recruiters are drowning.** Fake applications, AI-generated resumes, and mass-apply tools have made the recruiter's job harder. They want a trusted signal. `.edu verified + scored by Meridian` is that signal.

4. **Career centers are losing relevance.** Budgets are flat, staff is stretched, and students want instant, personalized, available-at-midnight help. Meridian is a career center that's open 24/7.

5. **The "Credit Score for Talent" doesn't exist yet.** Credit scores transformed lending. Meridian can transform hiring. One score, one profile, trusted by both sides. First mover advantage is massive — network effects kick in when recruiters start searching Meridian profiles.

---

## Traction and Proof

- **Product is built.** Not wireframes. Not a prototype. A full-stack application with 40+ API endpoints, an AI career coach, ATS simulation across 4 vendors, recruiter search, job matching, and a mobile-first dashboard.
- **Real student resumes audited.** 30+ real University of Tampa students across multiple tracks (Tech, Pre-Health, Finance, Business, etc.) with validated scoring and feedback.
- **Scoring engine validated** against real company hiring guidelines (~90% accuracy for Tech track rubrics; knowledge files with cited sources for all 11 tracks).
- **Student feedback:** "I didn't know that about my resume" — the moment students see their scores and evidence is the conversion moment.
- **Built by one person.** The entire platform — backend, frontend, AI engine, marketing site — built solo. Demonstrates deep technical ability and velocity.
- **Launch target:** April 2026 at the University of Tampa. Expansion to additional .edu campuses from there.

---

## Go-to-Market

### Phase 1: UTampa (Spring 2026)

- Launch at University of Tampa (4,000+ undergrads in target tracks)
- Campus ambassador program (student referrals, each referral = free month for both)
- Career center partnership (present Meridian to career services as a complement, not competitor)
- Greek life, pre-professional orgs, student government as distribution channels
- Target: 200+ paying subscribers in first semester

### Phase 2: Florida expansion (Fall 2026)

- 5-10 Florida universities (UCF, USF, UF, FSU, FIU, FAU, etc.)
- Same playbook: ambassadors + career center partnerships + org partnerships
- School config is a JSON file — adding a school takes minutes, not months
- Target: 2,000+ paying subscribers

### Phase 3: National (2027)

- Top 100 universities by career center engagement gap (schools where students need Meridian most)
- Recruiter-side launch: companies search the Meridian candidate pool
- Network effects: recruiters trust the signal → students want the score → more students → better scoring → more recruiters
- Target: 20,000+ paying subscribers, recruiter API revenue

---

## The Moat

1. **Data compounding.** Every audit makes the scoring engine smarter (few-shot learning, training data append). First mover builds the best training set.

2. **Track-specific knowledge.** 11 tracks with cited company-specific hiring guidelines, knowledge files, and rubrics. Not generic — built from Goldman, Google, McKinsey, FAANG, medical schools, law schools. This takes months to build and is hard to replicate.

3. **Two-sided network.** Students want the score → recruiters trust the signal → more students → better cohort data → better scoring → stronger recruiter signal. Classic network effect.

4. **Habit + switching cost.** Voice memory, application history, audit trajectory, achievements, career hub, decision log — all stored in Meridian. Leaving means losing your career history.

5. **.edu verification.** Competitors can't easily replicate the "100% verified college student" guarantee. This is the trust layer that makes the recruiter side work.

6. **Prestige-neutral scoring.** We don't boost Ivy League. We score what's on the resume. This is a philosophical and technical position that's hard for incumbents (who benefit from prestige bias) to adopt.

---

## Team

**Dilan Kochhar** — Founder & CEO
- Data Science major, minors in Mathematics and Computer Science, University of Tampa
- Built the entire Meridian platform (backend, frontend, AI engine, scoring, marketing site) solo
- Web development agency (utampaakpsi.com, Mu Epsilon Delta, Erickson Flooring)
- LeaseLogic: proptech predictive model (88% accuracy on lease conversion)
- Target: $1M net worth by senior year (2028)

**[CTO / Technical Co-founder]** — Hiring
- Looking for: ML/AI engineer or full-stack engineer with experience in NLP, scoring systems, or edtech
- Ideal: someone who's built ranking/recommendation systems at scale

**[Head of Growth]** — Hiring
- Looking for: campus-focused growth marketer, ideally someone who's scaled a student product
- Ideal: experience with ambassador programs, campus partnerships, or edtech GTM

---

## The Ask

**Raising: $500K - $1M pre-seed**

| Use of funds | Allocation |
|---|---|
| **Engineering** (hire 1-2 engineers, scale infra) | 40% |
| **Growth** (campus ambassadors, university partnerships, marketing) | 30% |
| **Operations** (Stripe live, Resend email, hosting, LLM API costs) | 15% |
| **Runway** (12-18 months to prove campus-level PMF) | 15% |

### Milestones for this round

| Milestone | Timeline |
|---|---|
| **Launch at UTampa** with live payments | April 2026 |
| **200+ paying subscribers** at UTampa | June 2026 |
| **Expand to 5 Florida schools** | September 2026 |
| **2,000+ paying subscribers** | December 2026 |
| **Recruiter API launch** (paid, 10+ employers) | Q1 2027 |
| **Series A ready** (20K+ subscribers, recruiter revenue, multi-state) | Mid 2027 |

---

## The Closing Line

Recruiters spend six seconds on a resume. In those six seconds, they're not reading — they're pattern-matching.

**Students have no way to know what that pattern looks like. Until now.**

Meridian is the Credit Score for Talent. Built. Running. Ready to scale.

*meridian-careers.com*

---

*This document reflects what is built as of March 2026. Every feature listed in "What We've Built" exists in production code. The Pitch-to-Reality Map (`docs/PITCH_TO_REALITY_MAP.md`) provides line-by-line verification.*
