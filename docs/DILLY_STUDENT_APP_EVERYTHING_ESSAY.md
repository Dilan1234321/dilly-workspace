# Dilly Student App: Everything in Its Current State — A Complete Essay

**A comprehensive account of every feature, screen, and capability in the student-facing Dilly app. No Dilly Recruiter or Dilly University — only what students see and use.**

---

## I. Introduction

The Dilly student app is a mobile-first Next.js dashboard that puts a full career center in a student's pocket. Five bottom-nav tabs: **Career Center** | **Practice** | **Voice** | **Get Hired** | **Explore**. Everything below exists in the app today.

---

## II. Onboarding (Pre–Main App)

| # | Screen | What It Does |
|---|--------|--------------|
| 1 | **Welcome** | .edu email entry, "Get my verification code," intrigue-style copy. |
| 2 | **Verify** | 6-digit code sent via Resend (or dev_code when MERIDIAN_DEV=1). 6-digit entry, success → next. |
| 3 | **School theme** | UTampa sunset, silhouettes, palm trees, minarets. "Meridian for Spartans." |
| 4 | **Value hero** | "Your career, one place" — 3 value bullets, no form. CTA: Add your resume. "20x" moment: "Before: hours per application. With Meridian: tailored in minutes." |
| 5 | **Resume upload** | Drop zone (PDF/DOCX). "See my scores" runs audit; "I'll upload later" skips to step 6. |
| 6 | **Results + goals** | If audit done: scores preview, "We pulled [name], [major] from your resume. Saved to your Meridian profile." Goals chips. If no resume: minimal form (name, major, goals). |
| 12 | **Payment** | $9.99/mo copy; "What you get next" (re-audit, Am I Ready?, ATS by company); proof line ("Students like you have landed PA interviews…"); dev-unlock when MERIDIAN_DEV=1; Stripe placeholder. |

Profile saved via PATCH `/profile`. Loaded on main app via GET `/profile`.

---

## III. Shell & Navigation

- **Bottom nav:** Career Center | Practice | Voice | Get Hired | Explore
- **Quick links** (sticky above nav when on Center, Hiring, Calendar, or Practice): Report | New audit | Jobs | Calendar | Insights | Stickers
- **Compact profile on Center:** Photo + name + school. Pencil opens Edit Portfolio.

---

## IV. Career Center (Center Tab)

### Hero & Layout

- **Compact hero** — Single-row scores (Smart, Grit, Build) tappable → Report
- **Voice CTA** — "Ask Meridian" + input + chips
- **Compact row** — ATS, Jobs, Recruiter (link to student's shareable profile)
- **Collapsible More** — "More from your career center"
- **Welcome** — "Everything you need is here."

### Primary Goal

- Fillable field at top. Users set or edit career_goal or first goal from goals array. Save button persists.

### Target Firms

- Optional target firms for Meridian Voice and Gap Scan to tailor advice.

### Edit Portfolio

- Pencil icon opens full edit panel: profile photo (add/change/remove, zoom & crop via react-easy-crop), name, major(s), minor(s), pre-professional track. Save persists all fields.

### School Line

- "Meridian for [shortName]" when school is set (e.g. UT).

### Your Numbers

- Last audit scores (Smart, Grit, Build, final) + "Top X% in [track]" when peer_percentiles exist.
- **Your strongest signal** — One sentence: "Your strongest signal to recruiters right now is [Dimension]—[evidence]."
- Data from audit ?? savedAuditForCenter (hydrated from localStorage).

### You Made Progress

- When both audit and lastAudit exist (same session): last vs this run + "See why your scores changed" → Hiring tab.

### Do These 3 Next / One Thing to Do

- No audit → "Run your first resume check" + Resume Review CTA.
- Has audit → Top recommendations or single nudge.
- When deadline ≤14 days: "Your [label] deadline is in X days — run Am I Ready? or refresh your audit" + Am I Ready? CTA.

### Your Track Playbook

- When we have track (from last audit or profile): playbook headline + bullets from `getPlaybookForTrack(track)`.

### Habit Loops + Rituals

- **Weekly review** — On configurable review day (default Sunday): "What did you apply to? What's coming up? What should you follow up on?" Tap opens Voice with guided prompt. Uses applications_this_week, upcoming_deadlines, silent_apps from GET /habits.
- **Rituals** — Tappable cards: Sunday planning, Post-interview debrief. Open Voice with contextual prompts.
- **Streak + daily action** — X day streak, check-in, "One thing today" (7 actions: check scores, improve bullet, ATS scan, ask Meridian, browse jobs, upload resume, add deadline). Date-seeded; check-in via POST /streak/checkin.
- **Apps this month** & **milestones** — 1st app, interview, offer, 10 apps) in streak card.
- **Settings > Habits:** Rituals on/off, Weekly review day (Mon–Sun).

### ATS Readiness (Career Center)

- Full ATS analysis: 0–100 score, readiness status (Ready/Needs Work/At Risk).
- **Tabs:** Overview, What ATS Sees, Checklist, Issues, Fix It, Keywords, Vendors.
- Auto-runs after audit. Mobile-first: hero score block, header tagline, prominent "Scan my resume" CTA, wrap-friendly tab bar, design-token cards.
- **Fix with Meridian Voice** — Buttons throughout ATS open Voice with contextual prompts.

### Jobs for You

- Top 5 preview on Career Center; "View all" links to `/jobs`.

### Quick Links

- View Report | New Audit | Jobs | Calendar | Insights | Sticker Sheet (achievements).

---

## V. Practice Tab

**Practice hub** — Five practice modes, each opens Meridian Voice with a contextual prompt:

1. **Mock interview** — Paste JD or pick role; Meridian asks behavioral questions.
2. **Bullet practice** — Describe an experience; get stronger quantified bullets.
3. **60-second pitch** — Practice "tell me about yourself"; feedback on evidence.
4. **Common questions** — Why this company? Biggest weakness? Conflict?
5. **Interview prep** — Prep for a specific company or role.

**Structured mock interview** — `/mock-interview` route: 5 behavioral questions, STAR format, turn-by-turn. Per-answer scoring (1–5 with strengths and improvements). Session summary at end with top 2 improvements and per-question breakdown. Questions tailored to audit track and target role. POST /voice/mock-interview with LLM-powered structured JSON scoring.

---

## VI. Meridian Voice (Dilly) Tab

**Dilly** is the in-app AI chatbot.

### Gemini-Style Overlay

- When user taps Voice in bottom nav, floating pill appears at bottom (like Google Gemini on Samsung). Pill expands to show chat + input; "Open full chat" goes to full Voice tab. Overlay floats over whatever screen the user is on.

### Chat UI

- Message list, prompt box (ai-prompt-box style), rounded-3xl container, auto-resize textarea, send button, bullet rewriter toggle as left action. Enter to send.

### User Avatar

- Profile photo next to user messages; fallback to owl avatar when no photo. Avatar button in header/bottom bar to add or change (uses profile photo upload).

### Conversation Over Time

- Context includes conversation_topic (current chat title). Backend injects recent message history so replies stay on thread.

### Quick Interactions

- **Chips:** "Going well," "Stuck," "Need help with resume."
- **Help Meridian know you better** — Resume deep-dive: Voice asks experience-specific questions (skills, tools/libraries used, what they left off) for each role/project. Answers saved to `experience_expansion`. Button in Voice empty state and on Career Center resume card.
- **Slash commands:** `/ready [company]`, `/mock [JD]`. Hint shown next to chips.

### Voice Data Capture

- **General chat:** LLM extracts skills/experiences/projects not on resume → `beyond_resume`. Types: person, company, event, emotion, skill, experience, project.
- **Deep-dive:** Per-role details → `experience_expansion`.
- Both flow to: dilly_profile_txt [VOICE_CAPTURED], job_matching, llm_auditor. Re-index for recruiter search when Voice saves beyond_resume or experience_expansion.

### Voice Onboarding

- First visit: 4–5 short questions (what they're preparing for, career goal, target companies/industries, biggest concern, how they like advice). Stored in profile (voice_onboarding_answers, application_target, career_goal, target_companies, voice_biggest_concern, voice_tone). Target companies parsed into `target_companies` list.

### Voice Tools

- gap_scan, ready_check, rewrite_bullet, interview_prep, get_recommended_jobs, create_deadline, create_action_item.

### Voice Tone

- 5 options: Encouraging, Direct, Casual, Professional, Coach. Stored in profile.

### Remember This

- Thought bubble in Voice input. Add notes for Meridian to remember. Stored in voice_notes.

### Voice Greeting Variations

- First visit, after apply, after audit, urgent deadline, standard.

### Emotional Support

- Detects rejection, nerves, celebration, imposter syndrome, transitions. Responds with empathy first, then practical next steps. Starter chips: "I got rejected — help me reframe," "I'm nervous about my interview," "I got an offer — what should I do next?" Rotating examples.

### Proactive Nudges

- One nudge per session max: deadline, app funnel, relationship, seasonal, score nudges. User toggles in Settings > Voice > Proactive nudges. GET /voice/proactive-nudges. Anti-nagging: "Never nag. One proactive nudge per session max. Don't repeat if dismissed."

### Screen-Aware Help

- current_screen sent in context so Meridian answers "where do I…?" for the exact screen.

### Score Trajectory

- "How much can I improve?" — Computes gains from completing top recommendations.

### Rich Text

- Bold, italic, underline, strikethrough, colored tags ([blue], [gold], [white], [red]).

### Mascot Reactions

- Avatar reacts: celebrating (Top 25%), happy (improved), encouraging (close to Top 25%).

### Web Speech API

- Mic button for voice input; transcript fills input. useSpeechRecognition hook.

### Fallback

- Message when LLM unavailable.

---

## VII. Get Hired (Resume Review / Hiring Tab)

### No Audit

- Upload zone (PDF/DOCX), file picker, error state, "Try again." On success: run audit (POST /audit/v2), progress bar, optional cancel. **Or paste your resume** — POST /audit/from-text runs full audit and bootstraps profile.

### Has Audit

- **Radar chart** — Smart/Grit/Build. Dimension selector.
- **Progress block** — Last vs this + explain-delta (POST /audit/explain-delta). "See why your scores changed."
- **Meridian's take** — Strength-first: what's working, then one change that would matter most.
- **Your strongest signal** — One sentence.
- **Share your result** — Shareable Meridian card (screenshot-friendly) + Download Badge / Share to LinkedIn (downloads badge, copies caption, opens LinkedIn) / Download Snapshot / Share / Copy summary / Copy Top % / Download PDF / Copy share link.
- **Assessment findings** — Consistency, red flags, cohort definitions, peer percentiles.
- **Strategic recommendations** — Line edits (with Copy button), generic/action recs.
- **FAB** — "New audit" when on this tab.

### Tailor This Audit For

- "Tailor this audit for" selector; value sent with POST /audit/v2, used in LLM prompt. Defaults from profile or inferred from goals; last choice saved. application_target.

### Report

- POST /report/pdf → signed URL. GET /report/pdf/{token} for download. 7-day expiry.

### Red Flags

- Over-one-page red flag (red_flags.py). Resume length / 1-page nudge. Content and recruiter-turn-off checks.

### Cohort Definitions

- "Your cohort" block shows what Smart/Grit/Build mean for the detected track (getDefinitionsForTrack). Peer benchmarking with optional benchmark copy.

---

## VIII. Get Hired Tab — Certifications

**Route:** `/certifications`

- **Hero** — Build score + track. Dilly commentary strip. Impact summary ("up to +N Build pts").
- **Dilly's top pick** banner.
- **Expandable premium cert cards** — Shield colors, provider + price, Build pts / "Dilly's pick." Expanded: estimated Build before/after, three "why it matters" bullets, open provider link.
- **Make it land on your resume →** — Opens Voice with cert_landing context (cert_id, name, provider).
- **Data:** GET /certifications?uid=… or client-side build from latest audit + certificationsHub.ts + certificationBuildEstimate.ts. localStorage cache for Dilly copy.
- **Entry points:** Get Hired hub "Certifications" card, deep link `/?tab=resources&view=certifications` (redirects to /certifications), Memory / Ready Check action open_certifications.

---

## IX. Explore Tab

### Connect

- **Recruiter link** — Copy, view profile, see as recruiter (preview mode with banner).
- **Outreach templates** — LinkedIn, thank-you, follow-up via Voice. Link to /templates.
- **Campus career center** — Ask Meridian for questions to bring.

### Explore

- **Track explorer** — 11 tracks in a grid. Tap for Smart/Grit/Build definitions and playbook. "Ask Meridian about [track]" CTA.

### Profile Photo Frames

- Top 5/10/25% achievement rings on profile photo (Career Center, Edit Portfolio, Voice chat). Amber/emerald/sky ring + badge.

### Achievement Collection

- **Route:** `/achievements`. Magazine sticker-sheet design (cream paper, perforated cut lines, "Collect them all!"). 15 achievements: first_audit, Top 25% dims (smart/grit/build), triple threat, century club, first_application, first_interview, ten_applications, interview_ready, ats_ready, seven_day_streak, night_owl, one_pager, cohort_champion. Manual unlock for first_application, first_interview. Pick up to 3 for share cards. Linked from Career Center (Sticker Sheet card) and Settings.

### Profile Themes

- 5 themes: Professional, Bold, Minimal, Warm, High contrast. Selector in Settings and Edit Portfolio.

### Taglines

- **Professional Tagline** (Edit Portfolio) — For recruiters.
- **Custom Tagline** (Settings) — For share cards and snapshot.

### Share Cards

- Badge and Snapshot SVGs accept custom tagline and 3 achievement stickers. Career Center share card: "Send this to your friends" with Meridian (left) + Top x% circles (Smart/Grit/Build in cohort) on the right.

### Before & After

- Insights card comparing first audit scores vs latest.

### Meridian Noticed

- Small card when conditions met (improved 3 audits, consistent calendar, first Top 25%). Dismissible, tracked to avoid repeat.

### Outcome Capture

- After 14+ days since first audit: "Did you get an interview or offer?" Yes (interview/offer) → "Can we use your outcome in stories?" Stored: got_interview_at, got_offer_at, outcome_story_consent, outcome_prompt_dismissed_at.

### Trust + Safety

- Settings > Trust & Privacy: Data ownership ("Your data is yours. We never sell it."), Save what I tell Meridian toggle, Download your data, Security (HTTPS, no AI training on your data), Human backup (career center + support email). Voice transparency: explain why when giving advice; admit uncertainty. **Meridian Profile privacy** — Master toggle "Full profile visible to recruiters" + per-section toggles (Scores, Activity, Applications, Experience).

### The "20x" Moments

- Contextual before/after copy: mental load ("One place for deadlines, applications, prep"), applications ("hours per application → tailored in minutes"), rejection recovery, interview prep. lib/twentyXMoments.ts.

### Invite a Friend

- Settings: copy referral link. "You both get a free month when they subscribe." /invite/[code] redirects to /?ref=code. Reward logic in REFERRAL_LOGIC.md (Stripe integration pending).

### Easter Eggs

- Century Club (score 100), Triple threat (all Top 25%), One-pager, Avatar tap 7x, Night owl. Toast + confetti/sound.

### Sound Effects

- Audit done, message sent, badge unlock, celebration. Toggle in Settings.
- Web Audio API tones. lib/sounds.ts.

### My Meridian Profile

- Entry card: links to /profile (student view) or /p/[slug]/full (public shareable).

---

## X. Insights Tab

- **Progress & milestones** — Score trajectory, Progress to Next Tier, Meridian's take, Top X% / Gap, Milestone nudges, Progress (prev vs now).
- **Your playbook** — Track playbook.
- **Quick tips** — Collapsible FAQs (when to add GPA, format dates, what recruiters look at first, etc.).
- **Progress over time** — Line chart.
- **Momentum** — Audit history.
- **Target firms** — Optional target companies.
- **Vs your peers** — Full track-based comparison: cohort stats (avg, p25, p75 per dimension); your scores vs average and top quartile; "How to get ahead" + "Ask Meridian how to get ahead." GET /peer-cohort-stats.
- **Certifications hub** — Curated free certifications filtered by track. Top 12 shown. Name, provider, description, link. lib/certificationsHub.ts.
- **Career tools** — Am I Ready? (job-fit check for company/role), Interview Prep, Gap Analysis, Cover Letter Lines. ATS Readiness is in Career Center.

---

## XI. Jobs for You

**Route:** `/jobs` (standalone page, not in navbar)

- **Meridian-verified jobs** — Run through your resume. Job matching uses profile, resume, audit. GET /jobs/recommended returns top 15 with match_pct and why_bullets.
- **Location filtering** — On first visit: add cities (autocomplete) or Domestic (US) / International. Jobs filtered to near school + chosen cities; Remote always shown. "Change locations" to edit. Profile: job_locations, job_location_scope.
- **Job cards** — Compact; tap opens full-screen detail with Apply, Why am I a fit?, Ask Meridian, Bookmark.
- **Apply on Meridian** — When job has application_email in apply_destinations: primary CTA. Modal: optional note, Send application, success state. POST /apply-through-meridian. Subject: `[Meridian Verified] Name – Title at Company`. Reply-to student. Body includes profile link and report PDF link.
- **Bookmarks & collections** — Jobs | Bookmarks toggle. General bookmarks + custom collections. Full job data stored when bookmarking. Context-aware empty states.
- **Companies we know** — Link to `/companies`.

---

## XII. Company Pages

**List:** `/companies` — All companies with verified hiring criteria.

**Detail:** `/companies/[slug]` (e.g. `/companies/stripe`, `/companies/usajobs`)

- **Score bar** — Required Smart, Grit, Build, overall + your scores vs bar when you have an audit.
- **What they look for** — Hiring guidelines as voice-friendly bullets (scannable, Meridian Voice–readable) + source.
- **Listen with Meridian Voice** — Sends guidelines to Voice so the user can hear them read aloud.
- **Open roles** — Jobs/internships with match tier and "to land this."
- **Certs that help** — Track-filtered from certifications hub.
- **Recruiter advice** — From memory/company_recruiter_advice.json.

**Public:** `/companies/[slug]/guidelines` — Shareable, no auth.

**Track scoring frameworks** — GET /tracks/frameworks, GET /tracks/{track}/framework — aggregate company guidelines by track.

---

## XIII. Your Recruiter Profile (Six-Second Profile)

**Shareable link:** `/p/[slug]`

- One link, one scan: recruiters see scores, proof, story in 6 seconds.
- Updates automatically when you edit profile or run new audit.
- **Actions:** Copy link, "View my profile," "See what recruiters see" (opens /p/[slug]?preview=1 with banner: "This is what recruiters see when they click your link").
- Copy link to add to resume footer.
- **PDF and image export** — Download PDF (browser print), Download Image (html2canvas PNG).
- GET /profile/public/{slug}, GET /profile/public/{slug}/photo.

---

## XIV. Meridian Profile (Full)

**Student view:** `/profile` — Identity, scores, applications summary, achievements, skills, share link.

**Public view:** `/p/[slug]/full` — Shareable with privacy applied. Master toggle + per-section toggles (Scores, Activity, Applications, Experience). GET /profile/meridian, GET /profile/public/{slug}/meridian.

---

## XV. ATS Readiness (Full Detail)

**Dedicated page:** `/ats`

- **0–100 ATS score** — Readiness status (Ready/Needs Work/At Risk).
- **Tabs:** Overview, What ATS Sees, Checklist, Issues, Fix It, Keywords, Vendors.
- **What ATS Sees** — Exactly what an ATS extracts: name, email, phone, LinkedIn, university, major, GPA, graduation, experience entries, skills. 13-point formatting checklist.
- **Keyword density** — Placement quality per keyword (contextual vs bare); JD match when pasted. 80+ tech terms via regex. POST /ats-keyword-density.
- **Per-ATS vendor simulation** — Workday, Greenhouse, iCIMS, Lever. Per-vendor 0–100 score, pass/risky/fail, what breaks, what works. Company-to-ATS search: type company name → we identify their ATS. "Your target" badge. POST /ats-vendor-sim, GET /ats-company-lookup.
- **Fix It For Me** — Auto-rewrites ATS-flagged bullets. Original (strikethrough) → rewritten (highlighted). Weak verb replacement (38+ phrases), filler removal (14 patterns), quantification placeholders. Rule-based + LLM-enhanced. Per-bullet copy + "Copy All." POST /ats-rewrite.
- **Contextual keyword injection** — "Where to Add Keywords": for each weak/missing keyword, which bullet to add it to and how, with before/after rewrite. Injected keyword highlighted in blue. Priority: P1 (missing), P2 (bare-only), P3 (weak). POST /ats-keyword-inject.
- **Section reorder** — Per-vendor: current vs suggested section order when resume differs from vendor preference.
- **ATS score tracking** — Line chart when 2+ scans. POST /ats-score/record, GET /ats-score/history.
- **Auto-run** — ATS scan fires automatically when audit completes.
- **Fix with Meridian Voice** — Buttons throughout ATS open Voice with contextual prompts.

**Detects:** Multi-column layouts, tables, non-standard headers, contact placement, encoding issues, graphic skill ratings, date inconsistencies, missing sections, weak action verbs, unquantified bullets. ATS-critical issues also surface as red flags in main audit.

---

## XVI. Application Tracker

**Route:** `/applications`

- **Kanban:** Saved → Applied → Interviewing → Offer → Rejected.
- **Stat summary** — Counts by status. Tap to filter.
- **Cards** — Company initial, status pill, applied date, deadline urgency, match %. Expand: move status, notes, "Prep with Voice" (pre-loads Voice with company/role context), edit/delete.
- **Add modal** — Company, role, status, deadline, notes.
- **Auto-populated** — When "Apply on Meridian" clicked in Jobs page.
- **Backend:** GET/POST /applications, PATCH /applications/{id}, DELETE /applications/{id}. GET /applications/stats.

---

## XVII. Career Hub (Second Brain)

**Route:** `/career`

- **Timeline** — Applications, audits, beyond_resume, deadlines, decision_log.
- **Search** — "What did I say about McKinsey?" GET /career-brain/search?q=
- **Connections** — People and companies. GET /career-brain/connections.
- **Progress** — Score trends, funnel. GET /career-brain/progress.
- **Add decision/learning** — "Why I turned down X," "What I learned from that rejection." POST /career-brain/decision-log. Profile decision_log field. dilly_profile_txt includes [DECISION_LOG] for search.
- **Entry points:** Explore "Career Hub" card; Quick links "Career" icon. Voice knows Career Hub for "search my career" and "decision log."

---

## XVIII. Templates Hub

**Route:** `/templates`

- **Templates:** Cover letter (full), thank-you email, follow-up (silent 2+ weeks), LinkedIn (connection/message), resume tailoring, interview prep.
- **All personalized** from profile + JD. User edits before sending.
- **Backend:** POST /templates/cover-letter, /thank-you, /follow-up, /linkedin, /interview-prep, /resume-tailor. Uses dilly_profile_txt or profile+audit fallback. Output must feel personal, not generic.
- **Entry points:** Explore "Open Templates" button; Quick links "Templates" icon.

---

## XIX. Live Resume Editor

**Route:** `/resume-edit`

- Parses structured_text from latest audit into editable sections (Contact, Education, Experience entries, Projects, Skills, Honors, etc.).
- **Inline-editable fields** — Contact, Education, Experience entries, Projects, Skills.
- **Collapsible experience/project cards** — Company, role, date, location. Bullet editor.
- **Bullet editor** — Enter = new bullet, Backspace on empty = remove. Auto-resize textarea.
- **Auto-save** — to resume_edited.json after 2s idle. POST /resume/save.
- **Re-audit** — From saved text via POST /resume/audit. Redirects to Hiring tab with new scores.
- **Bullet score preview** — POST /resume/bullet-score: fast rule-based scorer (0–100, Strong/Good/Needs work/Weak). Colored dot after 900ms debounce. Inline hint for scores <80.
- **Entry:** "Edit" quick link; "Edit resume" action in Review hub.
- **Mobile-first** — 375px. Unsaved changes indicator (animated dot).

---

## XX. Transcript Upload

**Optional** — PDF upload in Edit Portfolio. POST /profile/transcript. Parser extracts GPA, BCPM, courses, honors. Stored in profile. GPA advice: "Your GPA is X. We recommend not putting GPA on resume when below 3.5" or "Definitely list it." Audit uses transcript_gpa when present. DELETE /profile/transcript to remove.

---

## XXI. Calendar

- **Deadlines** — Add, edit, delete.
- **Export** — Settings "Add deadlines to calendar" and Calendar tab "Export" download .ics for Google Calendar, Apple Calendar. One-way export; we don't read external calendars.

---

## XXII. Settings

**Profile** — Name, major, minors, track, goals, photo, transcript.

**Habits** — Rituals on/off, Weekly review day (Mon–Sun).

**Voice** — Tone (5 options), Remember this, Proactive nudges toggles, voice_always_end_with_ask, voice_max_recommendations.

**Trust & Privacy** — Data ownership, Save what I tell Meridian, Download your data, Security, Human backup, Meridian Profile privacy toggles.

**Integrations** — Export (Download everything), Import (paste resume), Calendar export. "What we sync vs store" copy.

**Parent** — Share with parent (email, milestone opt-in, invite link), Redeem a gift. POST /profile/parent-invite. GET /parent/summary?token=. POST /report/email-to-parent.

**Invite a friend** — Referral link.

**Sound effects** — Toggle.

**Profile theme** — 5 themes.

---

## XXIII. Parent & Family Features

- **Gift Meridian** — Redeem code. POST /auth/redeem-gift.
- **Share with parent** — Parent email, milestone opt-in, generate invite link.
- **Share report to parent** — "Email report to parent" button on report section. POST /report/email-to-parent.
- **Milestone notifications** — After audit, if parent_email and parent_milestone_opt_in: send "first_audit" milestone email via Resend.

---

## XXIV. Cohorts / Tracks

**11 tracks:** Pre-Health, Pre-Law, Tech, Science, Business, Finance, Consulting, Communications, Education, Arts, Humanities.

- **Pre-Health** — Intent (pre-med, MCAT, etc.) or health-capable major + signals.
- **Pre-Law** — Intent (pre-law, LSAT, mock trial, etc.) or pre-law major + signals.
- **Tech** — Major default (CS, Data Science, etc.).
- **Science** — Major default.
- **Business** — Major default.
- **Finance** — Major (Finance, Economics, Accounting) or intent.
- **Consulting** — Intent only.
- **Communications, Education, Arts, Humanities** — Major default. Humanities = fallback for unknown.

**Pre-professional → cohort label** — When user picks Pre-Med, Pre-PA, Pre-Law, etc. in profile, shown cohort and Vs Your Peers resolve to Pre-Health or Pre-Law via getEffectiveCohortLabel. /profile/details shows cohort + Pre-professional path when applicable.

Track definitions and playbooks: dashboard/src/lib/trackDefinitions.ts. Backend: dilly_core/tracks.py, auditor.py, llm_auditor.py.

---

## XXV. UI / Design

- **Shared components:** Button, Input, Card, Label. @/components/ui.
- **Design tokens:** globals.css — --ut-*, --meridian-primary, --meridian-secondary; shadcn-style vars (--primary, --background, --foreground, --border, --radius, etc.) mapped to Meridian/UTampa.
- **School theme:** schools.ts (getSchoolFromEmail, theme, tagline). UTampa only for now.
- **Onboarding layout:** OnboardingSilhouettes.tsx (sunset, silhouettes, palm trees, minarets).
- **Default avatars:** owl.png, user-alt-1/2/3. public/default-avatars/.
- **LoaderOne** — Animated 3-dot loader. Used everywhere for loading states.
- **Confetti** — On audit submit, badge unlock, celebration. confetti.tsx.

---

## XXVI. Backend / API (Student-Facing)

**Auth:** POST /auth/send-verification-code, POST /auth/verify-code. Session token in meridian_auth_token.

**Profile:** GET /profile, PATCH /profile. POST /profile/photo, GET /profile/photo, DELETE /profile/photo. POST /profile/transcript, DELETE /profile/transcript. POST /profile/parent-invite.

**Audit:** POST /audit/v2, POST /audit/from-text, POST /audit/explain-delta.

**Voice:** POST /voice/chat, GET /voice/onboarding-state, GET /voice/proactive-nudges, POST /voice/mock-interview.

**Report:** POST /report/pdf, GET /report/pdf/{token}, POST /report/email-to-parent.

**Public profile:** GET /profile/public/{slug}, GET /profile/public/{slug}/photo, GET /profile/meridian, GET /profile/public/{slug}/meridian.

**Generate lines:** POST /generate-lines — cover_openers, outreach_hooks.

**Ready check:** POST /ready-check — Am I Ready? for company/role.

**ATS:** POST /ats-analysis, POST /ats-analysis-from-audit, POST /ats-check, POST /ats-keyword-density, POST /ats-vendor-sim, GET /ats-company-lookup, POST /ats-rewrite, POST /ats-keyword-inject, POST /ats-score/record, GET /ats-score/history.

**Jobs:** GET /jobs/recommended. POST /apply-through-meridian.

**Companies:** GET /companies, GET /companies/{slug}, GET /companies/{slug}/guidelines.

**Tracks:** GET /tracks/frameworks, GET /tracks/{track}/framework.

**Peer & leaderboard:** GET /peer-cohort-stats, GET /leaderboard/{track}.

**Applications:** GET/POST /applications, PATCH /applications/{id}, DELETE /applications/{id}. GET /applications/stats.

**Career brain:** GET /career-brain/timeline, /career-brain/search, /career-brain/connections, /career-brain/progress. POST /career-brain/decision-log.

**Templates:** POST /templates/cover-letter, /thank-you, /follow-up, /linkedin, /interview-prep, /resume-tailor.

**Resume:** GET /resume/edited, POST /resume/save, POST /resume/audit, POST /resume/bullet-score.

**Habits & streak:** GET /habits, POST /streak/checkin.

**Export:** GET /profile/export.

**Payment:** Stripe placeholder; dev-unlock; webhook sets subscribed. Protected routes check subscription.

---

## XXVII. Integrations & Portability

- **Export** — "Download everything" fetches GET /profile/export (profile, audits, applications, deadlines, resume, dilly_profile_txt) as JSON.
- **Import** — Paste resume text in Hiring upload flow ("Or paste your resume"); POST /audit/from-text. Settings "Import from paste" deep-links to upload with paste mode.
- **Calendar** — .ics export for Google/Apple Calendar. One-way export.
- **What we sync vs store** — Integrations section explains: data lives in Meridian; export gives a copy; calendar export is one-way; import adds to profile.

---

## XXVIII. Summary

The Dilly student app includes: onboarding (7 steps), Career Center (goal, portfolio, numbers, playbook, habits, ATS, jobs preview), Practice (5 modes + structured mock interview), Voice (Dilly chatbot with full tool suite), Get Hired (Resume Review + Certifications), Explore (track explorer, achievements, share cards, trust), Insights (progress, vs peers, certifications hub, career tools), Jobs (location filtering, Apply on Meridian, bookmarks), Company pages, Six-second profile, Full Meridian profile, ATS Readiness (full analysis), Application tracker, Career Hub, Templates, Live Resume Editor, Transcript upload, Calendar, Settings, Parent features. Plus 11 tracks, design tokens, and the full student-facing API. All of the above is in the app today.

---

*Last updated: 2026-03-19. Excludes Dilly Recruiter and Dilly University.*
