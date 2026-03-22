# Dilly: Everything It Does — A Complete Essay

**A comprehensive account of every feature, product, and capability in the Meridian/Dilly ecosystem.**

---

## I. Introduction: What Is Dilly?

**Dilly** (product name) and **Meridian** (brand name) together form a career-acceleration platform built for college students. The vision: a **"Credit Score for Talent"** — an evidence-based, .edu-verified signal that tells recruiters and students alike where a candidate stands. Dilly is the AI chatbot you talk to; Meridian is the career center, the scoring engine, and the brand. The app is a mobile-first dashboard that puts a full career center in your pocket, open 24/7.

The platform serves three main audiences:

1. **Students** — Resume audits, AI coaching, job matching, ATS optimization, and recruiter visibility.
2. **Recruiters** — Semantic search, JD-fit analysis, candidate discovery, and verified talent pipelines.
3. **Universities** — Analytics, tracking, and institutional insights (Dilly University).

Everything below is organized by product area. Nothing is omitted.

---

## II. Core Philosophy & Standards

### Meridian Truth Standard (MTS)

Every score, recommendation, and piece of advice is grounded in **evidence from the resume**. No invented facts. No hallucination. If it's not on the page, it doesn't count. The Meridian Hiring Manager persona — a top-level hiring manager, job consultant, and career advisor in one — delivers feedback that sounds like a paid session: direct, constructive, and actionable.

### Prestige-Neutral Scoring

Meridian does not weigh Ivy League or high-prestige institutions higher. Focus is on behavioral grit, technical veracity, and impact metrics. A University of Tampa student with strong Grit can compete with anyone.

### .edu-Only Trust

Only .edu email addresses can sign up. Verification codes (no passwords). Applicants from Meridian are 100% verified college students — no fakes, no bots. Recruiters see "[Meridian Verified]" in the inbox when students apply through the platform.

---

## III. The Student-Facing App (Dilly Dashboard)

The main app lives at `projects/dilly/dashboard` — a Next.js mobile-first application. Five bottom-nav tabs: **Career Center** | **Practice** | **Voice** | **Get Hired** | **Explore**.

---

### A. Onboarding (Pre–Main App)

1. **Welcome** — .edu email entry, "Get my verification code," intrigue-style copy.
2. **Verify** — 6-digit code sent via Resend (or dev_code when `MERIDIAN_DEV=1`).
3. **School theme** — UTampa sunset, silhouettes, palm trees, minarets; "Meridian for Spartans."
4. **Value hero** — "Your career, one place" — three value bullets, no form. CTA: Add your resume.
5. **Resume upload** — Drop zone (PDF/DOCX). "See my scores" runs audit; "I'll upload later" skips to step 6.
6. **Results + goals** — If audit done: scores preview, "We pulled [name], [major] from your resume." Goals chips. If no resume: minimal form (name, major, goals).
7. **Payment** — $9.99/mo copy; "What you get next" (re-audit, Am I Ready?, ATS by company); proof line ("Students like you have landed PA interviews…"); dev-unlock when `MERIDIAN_DEV=1`; Stripe placeholder.

Profile saved via PATCH `/profile`. Loaded on main app via GET `/profile`.

---

### B. Career Center (Center Tab)

The command center. Compact hero with single-row scores (Smart, Grit, Build) tappable to Report; smaller Voice CTA ("Ask Meridian" + input + chips). Compact row: ATS, Jobs, Recruiter. Collapsible "More from your career center."

**Features:**

- **Primary goal** — Fillable field at top. Users set or edit career_goal or first goal from goals array.
- **Target firms** — Optional target firms for Meridian Voice and Gap Scan.
- **Edit Portfolio** — Pencil icon: profile photo (add/change/remove, zoom & crop), name, major(s), minor(s), pre-professional track.
- **School line** — "Meridian for [shortName]" when school is set (e.g. UT).
- **Your numbers** — Last audit scores (Smart, Grit, Build, final) + "Top X% in [track]" when peer_percentiles exist.
- **Your strongest signal** — One sentence: "Your strongest signal to recruiters right now is [Dimension]—[evidence]."
- **You made progress** — When both audit and lastAudit exist, shows last vs this run + "See why your scores changed."
- **Do these 3 next / One thing to do** — No audit → "Run your first resume check." Has audit → top recommendations or single nudge. When deadline ≤14 days: "Your [label] deadline is in X days — run Am I Ready? or refresh your audit."
- **Your track playbook** — Playbook headline + bullets from `getPlaybookForTrack(track)`.
- **Habit Loops + Rituals** — Weekly review (configurable day, default Sunday): "What did you apply to? What's coming up? What should you follow up on?" Tap opens Voice with guided prompt. Rituals: Sunday planning, Post-interview debrief. Streak + daily action (X day streak, check-in, "One thing today"). Apps this month, milestones (1st app, interview, offer, 10 apps). GET /habits. Settings > Habits: Rituals on/off, Weekly review day.
- **ATS Readiness** — Full ATS analysis: 0–100 score, readiness status, tabs (Overview, What ATS Sees, Checklist, Issues, Fix It, Keywords, Vendors). Auto-runs after audit.
- **Jobs for you** — Top 5 preview; "View all" links to `/jobs`.
- **Quick links** — Report, New audit, Jobs, Calendar, Insights, Stickers (sticky above nav).

---

### C. Practice Tab

Five practice modes, each opens Meridian Voice with a contextual prompt:

1. **Mock interview** — Paste JD or pick role; Meridian asks behavioral questions.
2. **Bullet practice** — Describe an experience; get stronger quantified bullets.
3. **60-second pitch** — Practice "tell me about yourself"; feedback on evidence.
4. **Common questions** — Why this company? Biggest weakness? Conflict?
5. **Interview prep** — Prep for a specific company or role.

Structured mock interview mode at `/mock-interview`: 5 behavioral questions, STAR format, turn-by-turn, per-answer scoring (1–5 with strengths and improvements), session summary.

---

### D. Meridian Voice (Dilly) Tab

**Dilly** is the in-app AI chatbot. Gemini-style overlay: when user taps Voice in bottom nav, a floating pill appears at the bottom (like Google Gemini on Samsung). Pill expands to show chat + input; "Open full chat" goes to full Voice tab.

**Features:**

- **Chat UI** — Message list, prompt box (ai-prompt-box style), auto-resize textarea, send button, bullet rewriter toggle.
- **User avatar** — Profile photo next to user messages; fallback to owl avatar.
- **Conversation over time** — Context includes conversation_topic; backend injects recent message history.
- **Quick chips** — "Going well," "Stuck," "Need help with resume."
- **Help Meridian know you better** — Resume deep-dive: Voice asks experience-specific questions (skills, tools, what they left off) for each role/project; answers saved to `experience_expansion`.
- **Slash commands** — `/ready [company]`, `/mock [JD]`.
- **Voice data capture** — General chat: LLM extracts skills/experiences/projects not on resume → `beyond_resume`. Deep-dive: per-role details → `experience_expansion`. Both flow to dilly_profile_txt, candidate_document, job_matching, llm_auditor.
- **Tools** — gap_scan, ready_check, rewrite_bullet, interview_prep, get_recommended_jobs, create_deadline, create_action_item.
- **Voice onboarding** — First visit: 4–5 short questions (what they're preparing for, career goal, target companies, biggest concern, how they like advice). Stored in profile.
- **Voice tone** — 5 options: Encouraging, Direct, Casual, Professional, Coach.
- **Remember this** — Thought bubble: add notes for Meridian to remember. Stored in voice_notes.
- **Voice greeting variations** — First visit, after apply, after audit, urgent deadline, standard.
- **Emotional support** — Detects rejection, nerves, celebration, imposter syndrome; responds with empathy first, then practical next steps.
- **Proactive nudges** — One nudge per session max: deadline, app funnel, relationship, seasonal, score nudges. User toggles in Settings.
- **Screen-aware help** — current_screen sent in context so Meridian answers "where do I…?" for the exact screen.
- **Score trajectory** — "How much can I improve?" — computes gains from completing top recommendations.
- **Rich text** — Bold, italic, underline, strikethrough, colored tags ([blue], [gold], [white], [red]).
- **Mascot reactions** — Avatar reacts: celebrating (Top 25%), happy (improved), encouraging (close to Top 25%).
- **Web Speech API** — Mic button for voice input; transcript fills input.

---

### E. Get Hired (Resume Review / Hiring Tab)

**No audit:** Upload zone (PDF/DOCX), file picker, error state, "Try again."

**Has audit:**

- **Radar chart** — Smart/Grit/Build.
- **Progress block** — Last vs this + explain-delta (POST `/audit/explain-delta`).
- **Meridian's take** — Strength-first: what's working, then one change that would matter most.
- **Your strongest signal** — One sentence.
- **Share your result** — Shareable Meridian card, Download Badge, Share to LinkedIn, Download Snapshot, Copy summary, Copy Top %, Download PDF, Copy share link.
- **Assessment findings** — Consistency, red flags, cohort definitions, peer percentiles.
- **Strategic recommendations** — Line edits (with Copy), generic/action recs.
- **FAB** — "New audit" when on this tab.

Report share URL from POST `/report/pdf`.

---

### F. Explore Tab

**Connect:** Recruiter link (copy, view profile, see as recruiter); Outreach templates (LinkedIn, thank-you, follow-up) via Voice; Campus career center (ask Meridian for questions to bring).

**Explore:** Track explorer — 11 tracks in a grid; tap for Smart/Grit/Build definitions and playbook; "Ask Meridian about [track]" CTA.

**Profile photo frames** — Top 5/10/25% achievement rings (amber/emerald/sky).

**Achievement collection** — `/achievements` page. Magazine sticker-sheet design. 15 achievements (first audit, Top 25% dims, triple threat, century club, first application, first interview, etc.). Pick up to 3 for share cards.

**Profile themes** — 5 themes: Professional, Bold, Minimal, Warm, High contrast.

**Taglines** — Professional Tagline (Edit Portfolio) for recruiters. Custom Tagline (Settings) for share cards.

**Share cards** — Badge and Snapshot SVGs with custom tagline and 3 achievement stickers.

**Before & after** — Insights card comparing first audit vs latest.

**Meridian noticed** — Small card when conditions met (improved 3 audits, consistent calendar, first Top 25%). Dismissible.

**Outcome capture** — After 14+ days since first audit: "Did you get an interview or offer?" Yes → "Can we use your outcome in stories?" Stored: got_interview_at, got_offer_at, outcome_story_consent.

**Trust + Safety** — Settings > Trust & Privacy: Data ownership, Save what I tell Meridian toggle, Download your data, Security, Human backup. Meridian Profile privacy: master toggle + per-section (Scores, Activity, Applications, Experience).

**The "20x" Moments** — Contextual before/after copy (mental load, applications, rejection recovery, interview prep).

**Invite a friend** — Settings: copy referral link; "You both get a free month when they subscribe."

**Easter eggs** — Century Club (100), Triple threat (all Top 25%), One-pager, Avatar tap 7x, Night owl.

**Sound effects** — Audit done, message sent, badge unlock, celebration. Toggle in Settings.

---

### G. Insights Tab

- **Progress & milestones** — Score trajectory, Progress to Next Tier, Meridian's take, Top X% / Gap, Milestone nudges.
- **Vs your peers** — Full track-based comparison: cohort stats (avg, p25, p75 per dimension); your scores vs average and top quartile; "How to get ahead" + "Ask Meridian how to get ahead."
- **Certifications hub** — Curated free certifications filtered by track. Top 12 shown.
- **Career tools** — Am I Ready? (job-fit check), Interview Prep, Gap Analysis, Cover Letter Lines. ATS Readiness is in Career Center.

---

### H. Jobs for You

**Standalone page** at `/jobs`. Meridian-verified jobs run through your resume.

**Location filtering** — On first visit: add cities (autocomplete) or Domestic (US) / International. Jobs filtered to near school + chosen cities; Remote always shown.

**Job cards** — Compact; tap opens full-screen detail with Apply, Why am I a fit?, Ask Meridian, Bookmark.

**Apply on Meridian** — When job has application email: we send application with subject `[Meridian Verified] Name – Title at Company`; reply-to student; body includes profile link and report PDF link.

**Collections** — General bookmarks or custom collections. Full job data stored when bookmarking.

**Companies we know** — Link to `/companies`.

---

### I. Company Pages

**List:** `/companies` — All companies with verified hiring criteria.

**Detail:** `/companies/[slug]` — Score bar (required Smart, Grit, Build, overall + your scores vs bar); What they look for (voice-friendly bullets); Listen with Meridian Voice; Open roles (match tier, "to land this"); Certs that help; Recruiter advice.

**Public:** `/companies/[slug]/guidelines` — Shareable, no auth.

**Track scoring frameworks** — GET `/tracks/frameworks`, GET `/tracks/{track}/framework` — aggregate company guidelines by track.

---

### J. Your Recruiter Profile (Six-Second Profile)

**Shareable link** — `/p/[slug]`. One link, one scan: recruiters see scores, proof, story in 6 seconds. Updates automatically when you edit profile or run new audit.

**Actions** — Copy link, "View my profile," "See what recruiters see" (preview mode with banner).

---

### K. Meridian Profile (Full)

**Student view** — `/profile` — Identity, scores, applications summary, achievements, skills, share link.

**Public view** — `/p/[slug]/full` — Shareable with privacy applied.

**Privacy** — Settings > Trust & Privacy: master toggle + per-section toggles.

---

### L. ATS Readiness (Full Detail)

**Dedicated page** — `/ats`. 0–100 ATS score, readiness status.

**Tabs:** Overview, What ATS Sees, Checklist, Issues, Fix It, Keywords, Vendors.

**What ATS Sees** — Exactly what an ATS extracts: name, email, phone, LinkedIn, university, major, GPA, graduation, experience entries, skills.

**Keyword density** — Placement quality per keyword (contextual vs bare); JD match when pasted.

**Per-ATS vendor simulation** — Workday, Greenhouse, iCIMS, Lever. Per-vendor 0–100 score, pass/risky/fail, what breaks, what works. Company-to-ATS search: type company name → we identify their ATS.

**Fix It For Me** — Auto-rewrites ATS-flagged bullets. Original (strikethrough) → rewritten (highlighted). Rule-based + optional LLM. Placeholders for quantification.

**Contextual keyword injection** — "Where to Add Keywords": for each weak/missing keyword, which bullet to add it to and how, with before/after rewrite.

**Section reorder** — Per-vendor: current vs suggested section order.

**ATS score tracking** — Line chart when 2+ scans.

**Fix with Meridian Voice** — Buttons throughout ATS open Voice with contextual prompts.

---

### M. Application Tracker

**Route:** `/applications`. Kanban: Saved → Applied → Interviewing → Offer → Rejected.

**Features** — Stat summary, tap to filter, move status, notes, "Prep with Voice." Add modal: company, role, status, deadline, notes. Auto-populated when "Apply on Meridian" clicked.

---

### N. Career Hub (Second Brain)

**Route:** `/career`. Searchable career history. Timeline (applications, audits, beyond_resume, deadlines, decision_log). Search: "What did I say about McKinsey?" Connections: people and companies. Progress: score trends, funnel. Add decision/learning.

**Backend** — GET /career-brain/timeline, /career-brain/search, /career-brain/connections, /career-brain/progress. POST /career-brain/decision-log.

---

### O. Templates Hub

**Route:** `/templates`. Cover letter (full), thank-you email, follow-up (silent 2+ weeks), LinkedIn (connection/message), resume tailoring, interview prep. All personalized from profile + JD. User edits before sending.

**Backend** — POST /templates/cover-letter, /thank-you, /follow-up, /linkedin, /interview-prep, /resume-tailor.

---

### P. Live Resume Editor

**Route:** `/resume-edit`. Parses structured_text from latest audit into editable sections. Inline-editable fields, collapsible experience/project cards, bullet editor (Enter = new bullet, Backspace = remove). Auto-save to resume_edited.json. Re-audit from saved text via POST /resume/audit.

**Bullet score preview** — POST /resume/bullet-score: fast rule-based scorer (0–100, Strong/Good/Needs work/Weak).

---

### Q. Transcript Upload

**Optional** — PDF upload in Edit Portfolio. POST /profile/transcript. Parser extracts GPA, BCPM, courses, honors. Stored in profile. GPA advice: "Your GPA is X. We recommend not putting GPA on resume when below 3.5" or "Definitely list it." Audit uses transcript_gpa when present.

---

### R. Calendar

**Deadlines** — Add, edit, delete. Export to Google/Apple Calendar (.ics). One-way export.

---

### S. Settings

**Profile** — Name, major, minors, track, goals, photo, transcript.

**Habits** — Rituals on/off, Weekly review day.

**Voice** — Tone, Remember this, Proactive nudges toggles, voice_always_end_with_ask, voice_max_recommendations.

**Trust & Privacy** — Data ownership, Save what I tell Meridian, Download your data, Security, Human backup, Meridian Profile privacy toggles.

**Integrations** — Export (Download everything), Import (paste resume), Calendar export.

**Parent** — Share with parent (email, milestone opt-in, invite link), Redeem a gift.

**Invite a friend** — Referral link.

**Sound effects** — Toggle.

**Profile theme** — 5 themes.

---

## IV. The Scoring Engine (dilly_core)

**Canonical source:** `dilly_core/` — Ground Truth V6.5 & Vantage Alpha.

### Modules

- **resume_parser.py** — Layout-agnostic extraction: name, major, GPA, sections. `parse_resume(raw_text, filename?)` → ParsedResume.
- **scoring.py** — Rule-based: major multipliers, Smart/Grit/Build formulas, International multiplier, signal extraction.
- **tracks.py** — Vantage Alpha: Pre-Health, Pre-Law, Tech, Science, Business, Finance, Consulting, Communications, Education, Arts, Humanities. Track assignment from major + resume text.
- **auditor.py** — Rule-based pipeline: `run_audit(...)` → AuditorResult.
- **llm_auditor.py** — LLM-based pipeline: `run_audit_llm(...)` → same AuditorResult. Uses OpenAI-compatible API; MTS enforced.
- **red_flags.py** — Content and recruiter-turn-off checks (over-one-page, missing dates, etc.).
- **anomaly.py** — Score-based red flags (high GPA + low Build → "High-Risk / Low-Velocity").
- **evidence_quotes.py** — Extract evidence strings from resume for audit findings.
- **ats_analysis.py** — Full ATS parseability, extraction simulation, formatting checklist, section completeness.
- **ats_keywords.py** — Keyword density, placement quality, JD match.
- **ats_vendors.py** — Per-vendor (Workday, Greenhouse, iCIMS, Lever) simulation.
- **ats_company_lookup.py** — Company → ATS vendor (100+ companies, fuzzy matching).
- **ats_rewrites.py** — Bullet rewrites (weak verb replacement, filler removal, quantification placeholders).
- **ats_keyword_inject.py** — Contextual keyword injection (which bullet, how).
- **ats_section_reorder.py** — Per-vendor section order suggestions.
- **structured_resume.py** — Labeled sections, hybrid section→dimension mapping.
- **skill_tags.py** — Skill extraction for recruiter matching.
- **embedding.py** — Vector embeddings for semantic search.
- **candidate_document.py** — Build candidate doc for recruiter search (profile, resume, audit, beyond_resume, experience_expansion).
- **company_fit.py** — Company hiring criteria, readiness.
- **jd_to_meridian_scores.py** — JD → Meridian-fit (smart_min, grit_min, build_min).
- **jd_track_inference.py** — Infer track from job description.
- **transcript_parser.py** — Extract GPA, BCPM, courses from transcript PDF.

### Smart Score (0–100)

`(GPA × 15 × major_multiplier) + honors_pts + research_pts + minor_pts`. Pre-Health BCPM when present. Major multipliers: 0.86–1.40 (research-backed per University of Tampa catalog).

### Grit Score (0–100)

`(impact_weighted_sum × 15) + (leadership_weighted_sum × 12) + (work_entry_count × 5)`. International multiplier 1.10 when applicable.

### Build Score (0–100, track-specific)

Tech: tech stack + projects, outcome-tied. Pre-Health: clinical + research. Pre-Law: legal keywords. Humanities: tech_stack + projects. Each track has its own rubric.

### Final Score

Default: `0.30×Smart + 0.45×Grit + 0.25×Build`. Pre-Law: `0.45×Smart + 0.35×Grit + 0.20×Build`. Tech: FAANG average weights `0.36×Smart + 0.37×Grit + 0.27×Build`.

### Recommendations

**generic** — Short advice. **line_edit** — current_line → suggested_line (same facts, stronger). **action** — Concrete next steps + optional score_target. LLM-driven when MERIDIAN_USE_LLM=1; fallback to benchmark-based when off.

---

## V. Dilly Recruiter

**Purpose:** Recruiters discover and evaluate Meridian-verified candidates using the same Smart/Grit/Build framework.

### Recruiter UI (`/recruiter`)

- **API key entry** — Stored in localStorage. `X-Recruiter-API-Key` or `Authorization: Bearer <key>`.
- **Search screen** — Describe the role: optional job title, role description textarea. "Get Meridian-fit" calls jd-fit; shows Smart/Grit/Build bars + track + signals; "Use as filters" fills min_smart, min_grit, min_build, track.
- **Filters** — Major, track, school_id, cities, min Smart/Grit/Build, required skills, sort.
- **Results** — Match %, name, major, track, school, scores, "View profile" link.
- **Meridian Compare** — Select 2 candidates; side-by-side compare modal (Smart, Grit, Build, fit level, links).
- **Bookmarks & collections** — Bookmark candidates; create named collections; add/remove. Right sidebar.
- **Meridian Voice Search** — Floating Voice FAB. Describe in plain English ("Find me 5 PM candidates who have shipped production code"); get ranked candidates in ~30 seconds. Multi-turn refinement. Results as inline candidate cards.

### Candidate Detail (`/recruiter/candidates/[id]`)

- Name, major, track, school, Smart/Grit/Build/final, meridian_take, application_target, job_locations, email.
- **JD gap analysis** — "Strong on X; weak on Y" from jd_evidence_map.
- **Similar candidates** — "Others like this" by embedding + score similarity.
- **Export to ATS** — CSV download (name, email, profile link, fit summary).
- **Recruiter notes** — Private notes per candidate; persists across sessions.
- **Ask AI** — Consultant-style chat: "How do they handle technical ambiguity?" "Biggest risk for this JD?" "3 interview questions from Build gaps." Evidence-based.

### Recruiter API

- **POST /recruiter/search** — role_description, filters, required_skills, sort, limit, offset. Returns ranked candidates with match_score, semantic_score, skill_fit_score, meridian_fit_score.
- **POST /recruiter/jd-fit** — job_description, job_title → smart_min, grit_min, build_min, track, signals.
- **GET /recruiter/candidates/:id** — Candidate detail.
- **POST /recruiter/feedback** — view, shortlist, pass, contact events. Stored in recruiter_feedback.jsonl. Phase 2: feedback_score blended into match_score.
- **POST /recruiter/voice/search** — Conversational candidate discovery.
- **GET/PUT /recruiter/candidates/:id/notes** — Recruiter notes.
- **GET /recruiter/candidates/:id/similar** — Similar candidates.
- **GET /recruiter/export/shortlist** — CSV export.
- **GET/POST/DELETE /recruiter/bookmarks** — Bookmarks.
- **POST /recruiter/collections** — Create collection.
- **POST /recruiter/collections/add** — Add candidate.
- **POST /recruiter/collections/remove** — Remove candidate.
- **DELETE /recruiter/collections** — Delete collection.

### Matching Engine

Candidate document (embedding + skill_tags) built from full profile (goals, career_goal, track, locations, beyond_resume, experience_expansion), resume, and latest audit. Profile-only updates (PATCH /profile) trigger re-index.

---

## VI. Dilly University

**Purpose:** Platform for universities to track students, analyze trends, and view institutional data.

**Status:** Ideas and deep dives documented in `docs/DILLY_UNIVERSITY_IDEAS.md`. Not yet built.

### Analytics & Tracking (Planned)

- **First audit velocity** — Time from signup to first audit.
- **Score distribution over time** — Smart/Grit/Build by cohort and period.
- **At-risk list** — Low scores + low engagement; actionable outreach list.
- **Needs a nudge** — Haven't used Meridian in 90+ days.
- **Workshop targeting** — "Tech students with Build < 60" → invite list.
- **Peer comparison nudges** — "Your Tech cohort is 12 pts lower than USF's."
- **Milestone alerts** — First interview, first offer.
- **Accreditation export** — One-click PDF/Excel.
- **Placement rate** — % with interviews/offers.
- **Year-over-year report** — Compare this year vs last.
- **Custom date ranges** — Pick any date range.
- **Narrative summaries** — AI-generated "here's what the data says."
- **Anomaly detection** — Flag unusual drops or spikes.

### Engagement & Gamification (Planned)

- **Campus leaderboard** — Opt-in, anonymized.
- **Department competition** — Participation and scores by major/department.
- **Streak leaderboard** — Most consistent users.
- **Achievement unlock rates** — % who hit each achievement.

### Integrations (Planned)

- **Canvas/LMS** — Embed Meridian in courses; track by class.
- **Slack/Teams** — Weekly digest for career center staff.

### Unique Metrics (Planned)

- **0–100 score per cohort** — Single "Meridian readiness" index.
- **Recruiter interest** — Views/shortlists per school.
- **Company fit heatmap** — Where students target vs where they're ready.
- **ATS readiness by cohort** — % ATS-ready per track.

### Monetization (Planned)

- **Per-seat** — Charge per career center staff user.
- **Add-ons** — Batch audit, SIS integration, custom reports, API.
- **White-label** — School's branding, custom domain.

### Recommended First Build

1. Participation snapshot — Total users, audits this month, top tracks.
2. Score-by-track table — Avg Smart/Grit/Build per track, exportable.
3. At-risk list — Low engagement + low scores; export for outreach.

---

## VII. Parent & Family Features

### Gift Meridian

Parent buys subscription (6 or 12 months), sends to student's .edu. Redemption link/code. POST /auth/create-gift-checkout-session, POST /auth/redeem-gift.

### Family Plan

Parent pays for 2–3 students. One billing, separate accounts. POST /auth/create-family-checkout-session; GET /family/add?token=; POST /family/add-student.

### Parent Dashboard (Opt-In)

Student invites parent by email. Parent gets read-only view: scores over time, last audit date, "on track" vs "needs attention." GET /parent/summary?token=.

### Share Report to Parent

POST /report/email-to-parent. Generates PDF, emails link. "Email report to parent" button on report section.

### Milestone Notifications

After audit, if parent_email and parent_milestone_opt_in: send "first_audit" milestone email via Resend.

### Trust Copy for Parents

Marketing page `for-parents.html`: .edu only, we don't sell data, resume stays private, Gift Meridian & Family plan CTAs, FAQ.

---

## VIII. Backend API (Summary)

### Auth

- POST /auth/send-verification-code
- POST /auth/verify-code
- POST /auth/create-gift-checkout-session
- POST /auth/redeem-gift
- POST /auth/create-family-checkout-session
- Dev: MERIDIAN_DEV=1 returns dev_code.

### Profile

- GET /profile, PATCH /profile
- POST /profile/photo, GET /profile/photo, DELETE /profile/photo
- POST /profile/transcript, DELETE /profile/transcript
- POST /profile/parent-invite
- GET /profile/public/{slug}, GET /profile/public/{slug}/photo
- GET /profile/meridian, GET /profile/public/{slug}/meridian
- GET /profile/export

### Audit

- POST /audit/v2 — PDF/DOCX upload → scores, findings, recommendations, peer percentiles
- POST /audit/explain-delta — Why scores changed
- POST /audit/from-text — Audit from pasted text
- POST /audit/batch — 1–100 files, cohort report

### Voice

- GET /voice/onboarding-state
- POST /voice/chat, POST /voice/stream
- POST /voice/rewrite-bullet, POST /voice/interview-prep, POST /voice/gap-scan, POST /voice/firm-deadlines
- POST /voice/feedback
- GET /voice/proactive-nudges
- POST /voice/mock-interview

### Report

- POST /report/pdf → signed URL
- GET /report/pdf/{token}
- POST /report/email-to-parent

### Generate & Ready Check

- POST /generate-lines — Cover openers, outreach hooks
- POST /ready-check — Am I Ready? for company/role

### ATS

- POST /ats-analysis, POST /ats-analysis-from-audit
- POST /ats-check — JD vs audit
- POST /ats-keyword-density
- POST /ats-vendor-sim
- GET /ats-company-lookup
- POST /ats-rewrite
- POST /ats-keyword-inject
- POST /ats-score/record, GET /ats-score/history

### Jobs

- GET /jobs/recommended — Top 15 with match_pct, why_bullets, application_email
- POST /apply-through-meridian — job_id, optional note

### Companies

- GET /companies (no auth)
- GET /companies/{slug} (auth)
- GET /companies/{slug}/guidelines (no auth)

### Tracks

- GET /tracks/frameworks
- GET /tracks/{track}/framework

### Peer & Leaderboard

- GET /peer-cohort-stats?track=...
- GET /leaderboard/{track} — Anonymous rank + score

### Applications

- GET /applications, POST /applications
- PATCH /applications/{id}, DELETE /applications/{id}
- GET /applications/stats

### Career Brain

- GET /career-brain/timeline, /career-brain/search, /career-brain/connections, /career-brain/progress
- POST /career-brain/decision-log

### Templates

- POST /templates/cover-letter, /thank-you, /follow-up, /linkedin, /interview-prep, /resume-tailor

### Resume

- GET /resume/edited, POST /resume/save, POST /resume/audit
- POST /resume/bullet-score

### Habits & Streak

- GET /habits
- POST /streak/checkin

### Family

- GET /family/add?token=
- POST /family/add-student

---

## IX. Marketing Website

**Location:** `projects/meridian/website/` (or equivalent).

- **Landing page** — Hero, Smart/Grit/Build explainer, features, how it works, tracks, trust (.edu only, no data selling), pricing ($9.99/mo), CTAs.
- **Stats bar** — 500+ audited, Top 10% Grit, etc.
- **School badge** — Meridian for Spartans.
- **Testimonials, before/after, FAQ** — Trust and proof.
- **Track pages** — 11 track-specific "holy grail" pages with distinct vibes (Arts, Tech, Pre-Health, etc.).
- **App preview** — "More of what you get in the app" section.
- **For recruiters** — Recruiter-facing page; "When you see [Meridian Verified] in your inbox."
- **For parents** — Trust copy, Gift Meridian, Family plan.

---

## X. Data & Infrastructure

### Storage

- **Profiles** — `memory/dilly_profiles/{uid}/` — profile.json, audits.json, resume_edited.json, ats_scores.json, etc.
- **dilly_profile_txt** — `memory/dilly_profile_txt/{email}.txt` — Canonical text representation for Voice, recruiter search, job matching. Includes [VOICE_CAPTURED], [DECISION_LOG].
- **Candidate index** — For recruiter semantic search (embedding + skill_tags).
- **Jobs** — SQLite `meridian_jobs.db` (Greenhouse, USAJobs).
- **Company criteria** — `knowledge/company_hiring_criteria.json`, `knowledge/tech.json`, etc.

### Scripts

- **backfill_candidate_index.py** — Index all profiles with ≥1 audit for recruiter search.
- **job_scraper** — Ethical scraping (Greenhouse, USAJobs).
- **parsing_regression.py** — Gate parser changes.
- **tech_scoring_regression.py** — Gate Tech scoring changes.
- **export_fewshot_candidates.py** — Export for few-shot training.

---

## XI. Monetization

- **$9.99/month** — Student subscription. Unlimited audits, PDF reports, peer benchmarking, Voice, ATS, Jobs, shareable profile.
- **Gift Meridian** — 6 or 12 months.
- **Family plan** — 2–3 students.
- **Recruiter API** — API key; future paid tier.
- **Dilly University** — Per-seat, add-ons, white-label (planned).

---

## XII. What's Not (Yet) in the App

- **Stripe live** — Placeholder; needs production keys.
- **Resend production** — Verification codes to real .edu inboxes when RESEND_API_KEY set.
- **Audit history API** — No "list my audits" yet; last audit from localStorage.
- **Dilly University** — Ideas only; not built.
- **Verified Talent badge** — Product vision; not shipped.
- **Transcript verification (Meridian Seal of Truth)** — Product vision.
- **Unlimited mock audits** — Product vision (upload JD, run mock audit).
- **Job alerts** — Product vision.
- **Campus clubs & contacts** — Product vision.
- **Resume reorganization per job** — Product vision.

---

## XIII. Summary

Dilly/Meridian is a full-stack career-acceleration platform:

- **For students:** Resume audits (Smart/Grit/Build), AI coach (Dilly), ATS optimization, job matching, company pages, shareable profiles, application tracker, templates, career hub, practice modes, achievements, habits, streaks, parent sharing.
- **For recruiters:** Semantic search, JD-fit, candidate discovery, Voice search, bookmarks, collections, compare, notes, export, Ask AI.
- **For universities:** Dilly University (planned) — analytics, at-risk lists, workshop targeting, accreditation export, placement rates.

The scoring engine (dilly_core) is track-specific, evidence-based, and prestige-neutral. The Meridian Truth Standard ensures no hallucination. The product is built, running, and ready for launch — with Stripe and Resend production integration pending.

---

*Last updated: 2026-03-19. This document is the single comprehensive reference for everything Dilly does.*
