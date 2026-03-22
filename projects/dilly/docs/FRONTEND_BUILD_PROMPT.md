# Meridian — Perfect Frontend Build Prompt

**Use this prompt with an AI that builds frontends.** Copy the entire contents below the line. The prompt is long by design so the AI understands every page, feature, and design decision.

---

## PROMPT START

You are building the frontend for **Meridian**, a career readiness app for college students. Your job is to create a polished, addictive experience that hooks users immediately and makes them feel like they've found their secret weapon for getting hired.

### What Meridian Is (Core Concept)

Meridian is the **last check before students apply**. Recruiters spend 6 seconds on a resume. Students get one shot. Meridian scores their resume the way a senior hiring manager would—on **Smart** (acuity, clarity, fit), **Grit** (drive, leadership, resilience), and **Build** (proof: experience, projects, impact)—and tells them exactly what to fix before they hit submit.

**Positioning:** "The career center in your pocket." Not a resume checker—a quality gate. Students run the gauntlet with Meridian before they apply, so they don't blow their one shot.

**Target audience:** College students (undergrads) applying to internships, full-time jobs, or grad school. .edu-only sign-up. School-specific branding (e.g., "Meridian for Spartans" for University of Tampa).

**Promise:** We don't sell your data to recruiters. Your resume, your scores, your plan—all in one place.

---

### The Three Score Dimensions (Smart, Grit, Build)

Every resume is scored 0–100 on three dimensions. These mean different things per track (Pre-Health, Tech, Pre-Law, etc.):

- **Smart** — Academic rigor, clarity, fit for the field. For Tech: technical coursework, certifications. For Pre-Health: BCPM readiness, research. For Finance: quant rigor, Excel, modeling.
- **Grit** — Drive, leadership, resilience. Quantifiable impact, ownership, sustained effort. What admissions committees and recruiters value.
- **Build** — Proof. Experience, projects, dates, scope. Evidence that backs up Smart and Grit.

**Peer percentiles:** "Top 15% Grit in Tech" — students see how they compare to their cohort. This is highly motivating.

**Track-specific:** 11 tracks (Pre-Health, Pre-Law, Tech, Science, Business, Finance, Consulting, Communications, Education, Arts, Humanities). Each has tailored definitions and playbooks.

---

### Complete Feature Set (What the App Does)

**Onboarding (pre–main app):**
1. Welcome — .edu email, "Get my verification code"
2. Verify — 6-digit code entry
3. School theme — "Meridian for [School]" (e.g., Spartans)
4. Name, Major, Pre-professional? (Yes/No)
5. Track (if pre-professional) — Pre-Med, Pre-Law, Tech, etc.
6. Goals — Multi-select (internship, grad school, full-time, etc.)
7. "What is Meridian" — Tailored bullets for their track
8. Resume upload — Drop zone (PDF/DOCX), "Continue to payment" or "I'll upload later"
9. Payment — $9.99/mo; first audit free, then subscribe for unlimited

**Main app (after subscribed) — 5 tabs in bottom nav:**

**1. Center (Career Center)** — Command center, home base
- Welcome + "Everything you need is here"
- Primary goal — Editable field at top
- Urgent deadline banner — If they have a deadline soon: "X days until [deadline]" + "How can I help?" (opens Meridian Voice)
- Profile — Photo, name, school. Pencil opens Edit Portfolio
- Your numbers — Last audit: Smart, Grit, Build, Overall. "Top X% in [track]" when available
- Meridian Voice CTA — "Your resume is your story. Meridian Voice knows it." + button: avatar + "How can I help?"
- Do these 3 next — Prioritized actions from audit. "Run your first audit" if none; "View report" / "New audit" if they have one
- Your track playbook — Bullets from their track (e.g., Tech: "Ship a project", "Add stack depth")
- Jobs for you — Top 5 preview; "View all" → Jobs page
- Quick links — View Report, New Audit, Jobs, Calendar, Insights

**2. Resume Review (Hiring tab)** — Upload, audit, results
- **No audit:** Upload zone (PDF/DOCX), "Tailor this audit for" dropdown (Internship, Full-time, Grad School, Exploring). Run audit button. Progress bar during audit.
- **Has audit:** 
  - Report cover — "Career Readiness Assessment", candidate name, track, major, final score
  - Radar chart — Smart/Grit/Build; click dimension to see breakdown
  - Progress block — "Last time vs this time" + "See why your scores changed"
  - Share your result — Download Badge, Share to LinkedIn, Copy summary, Copy Top %, Download PDF, Copy share link
  - Assessment findings — Cited evidence from resume, recommendations
  - Red flags — Recruiter turn-offs
  - Strategic recommendations — Line edits with "Current line" vs "Suggested line" + Copy button
  - ATS Readiness section — 0–100 ATS score, 5 tabs: Overview, What ATS Sees, Checklist, Issues, Keywords. "Fix with Meridian Voice" on failed items. Fix It tab with bullet rewrites.

**3. Voice tab** — AI career coach
- Chat UI — Message list, prompt box (rounded, auto-resize), send button
- User avatar next to their messages; Meridian "M" for AI
- Context-aware — Knows resume, scores, track, goals. Can help with interview prep, gap analysis, cover letter lines, prep for deadlines
- "How can I help?" — Every Meridian button shows avatar + this label
- Tools from Voice: Gap Scan, Interview Prep, Cover Letter Lines (open as bottom sheets)

**4. Insights tab** — Progress and tools
- Score trajectory — "If you complete top 3 recommendations: Smart X, Grit Y, Build Z"
- Progress to Next Tier — Bars showing distance to Top 25%
- Meridian's take — One-line hook from audit
- Milestone nudges — "Grit up 5 points since last audit"
- Progress over time — Line chart (Smart, Grit, Build)
- Audit history — List of past audits
- Career tools — Cards: Am I Ready? (job-fit check), ATS keyword check, Interview Prep, Gap Analysis, Cover Letter Lines, Calendar

**5. Calendar tab** — Deadlines and prep
- Month view — Deadlines on dates
- Add deadline — Label + date
- Upcoming list — "X days until [deadline]" + "How can I help?" (opens Voice with prep prompt)
- Day detail — When date selected: list of deadlines, add sub-deadline, delete

**Jobs page (standalone, not in nav)** — `/jobs`
- Header — Back to app, Jobs | Bookmarks toggle
- Location setup — On first visit: add cities or Domestic/International. "Change locations" to edit
- Job cards — Title, company, match %, "why" bullets. Tap for full detail
- Job detail — Apply, Why am I a fit?, Ask Meridian about this role, Bookmark
- Bookmarks — General + custom collections. Save jobs to collections
- Bottom CTA — "Which of these jobs should I apply to first?" → avatar + "How can I help?"

**Profile page (Edit Portfolio)** — Modal or full screen
- Photo — Add/change/remove
- Name, Major(s), Minor(s)
- Pre-professional track
- Goals
- Profile background color, tagline, bio
- Job locations (for Jobs filtering)

**Public profile page** — `/p/[slug]`
- Shareable Six-Second Profile — Photo, name, tagline, scores (Smart/Grit/Build), key findings, career goal
- Download PDF, Download Image
- For recruiters or sharing with mentors

---

### Page-by-Page Layout Specification

**Onboarding flow (full-screen, one step per screen):**
- Dark background, school theme accent (e.g., UT red for Tampa)
- Centered content, max-width for readability
- Clear primary CTA per step
- Silhouettes or subtle imagery (campus vibe)
- Progress indicator (optional dots or steps)

**Main app shell:**
- Sticky header — Centered logo "Meridian × [School]"
- Bottom nav — 5 tabs: Center, Review, Voice, Insights, Calendar. Voice tab shows user avatar when set. Badges for new deadlines or fresh audit
- Content area — Scrollable, padding, max-width for readability on desktop

**Center tab layout:**
- Vertical stack of cards/sections
- Urgent banner at top if deadline < 14 days
- Profile row: photo + name + edit
- Score cards in grid (3 columns: Smart, Grit, Build)
- CTA cards with clear hierarchy
- Meridian Voice CTA prominent — avatar + "How can I help?"

**Resume Review layout:**
- Upload: Large drop zone, dashed border, file picker
- Results: Two-column on desktop (report left, sidebar right); single column on mobile
- Radar chart prominent
- Sections collapsible or in tabs where dense

**Voice tab layout:**
- Full-height chat
- Messages: user right, AI left (or alternating)
- Input at bottom: rounded container, send button
- Tools (Gap Scan, etc.) open as bottom sheet (max 55vh)

**Insights tab layout:**
- Sections stacked vertically
- Tool cards in 2-column grid
- Charts with clear labels

**Calendar layout:**
- Month grid (7 columns)
- Upcoming list above or beside
- Day detail as drawer/card when date selected

**Jobs page layout:**
- List of cards, tap to expand
- Full-screen detail panel with back
- Bookmark modal for collections

---

### Design System

**Colors:**
- Base: Dark grey background (#2a2a2a), raised surfaces (#3c3c3c, #454545)
- Text: Taupe/beige (#b3a79d, #c9bfb5), muted (#8a8279)
- Accent: Taupe gold (#c9a882) or school primary (e.g., UT red #C8102E)
- Borders: rgba(179,167,157,0.18)

**School theme override (e.g., UTampa):**
- Primary: #C8102E (red)
- Secondary: #FFCD00 (gold)
- Background: #0f172a (slate)

**Typography:**
- Font: Geist Sans (or system-ui)
- Mono: Geist Mono for labels
- Scale: Hero 2xl–4xl bold; titles xl–2xl bold; body sm–base; labels 10px uppercase tracking-widest

**Components:**
- Buttons: Primary (accent bg), outline (border), min 44px height, rounded-xl
- Cards: Dark surface, 1px border, rounded-xl or 2xl
- Inputs: Rounded, focus ring on accent

**Motion:**
- Subtle transitions (0.2s ease)
- Fade-up for page content
- Score-in for score reveals

---

### UX Principles (Make Users Hooked)

1. **Immediate value** — First screen after login should show something useful (scores, next action, or "Run your first audit"). No empty states without a clear CTA.

2. **Progress obsession** — "Top X% in your track" is addictive. Show it prominently. "Last time vs this time" creates momentum. Charts and trajectories create stickiness.

3. **One clear next step** — "Do these 3 next" or "One thing to do this week." Never overwhelm. Always one obvious action.

4. **Meridian Voice everywhere** — Avatar + "How can I help?" on every relevant surface. Voice is the differentiator; make it feel omnipresent and friendly.

5. **Copy-paste ready** — Every recommendation should have a Copy button. Students want to fix things fast; reduce friction.

6. **Shareability** — Download PDF, share link, copy summary, LinkedIn badge. Social proof and accountability.

7. **Mobile-first** — College students are on phones. 44px touch targets. Bottom nav. No horizontal scroll.

8. **School pride** — "Meridian for Spartans" (or their school). Feels exclusive, not generic.

9. **No jargon** — Smart, Grit, Build are explained in one line. Red flags are "Recruiter turn-offs." Keep it student-friendly.

10. **Delight in small moments** — Confetti on audit submit. Smooth transitions. Friendly error messages ("Sparty dropped his shield" not "500 Internal Server Error").

---

### Copy and Tone

- **Confident, not salesy** — "Your resume is your story. Meridian Voice knows it."
- **Action-oriented** — "Do these 3 next." "Run your first audit." "How can I help?"
- **Reassuring** — "We don't sell your data to recruiters."
- **Track-specific** — "For Tech: Smart = technical rigor, Grit = project velocity, Build = stack depth."
- **Urgent but supportive** — "You have 12 days. Prep your resume now." + "How can I help?"

---

### Technical Notes

- Next.js app (or equivalent SPA)
- API base: configurable (e.g., localhost:8000 for dev)
- Auth: Token in localStorage, .edu verification
- Profile, audit, voice chat, jobs — all from API
- Responsive: 375px up, tablet and desktop breakpoints

---

### Summary for the AI

Build a **polished, dark-themed career app** that makes college students feel like they've found their secret weapon. Every page should have a clear purpose. Meridian Voice (avatar + "How can I help?") should feel omnipresent. Scores and progress should be addictive. The app should feel like a premium product—not a student project. Use the design system, follow the page layouts, and prioritize mobile-first. Make users want to come back because they're making progress and Meridian is in their corner.

---

## PROMPT END
