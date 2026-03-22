# Meridian — Detailed App Description for AI App Builders

Use this as a single, detailed prompt when building or rebuilding the Meridian frontend with an AI app builder (e.g. v0, Bolt, Cursor Composer, or similar). Copy the sections below into the builder’s context or prompt field.

---

## 1. Product in One Sentence

**Meridian** is a mobile-first web app that acts as a “career center in your pocket” for college students: they verify with a .edu email, upload their resume for an AI audit (Smart / Grit / Build scores and hiring-manager-style feedback), get ATS readiness analysis, job recommendations, a shareable recruiter profile, and an in-app AI coach (Meridian Voice) that knows their resume and gives concrete next steps.

---

## 2. Target Users

- **Primary:** College students (undergrad and grad) who want to improve their resume, understand how they compare to peers, pass ATS systems, and get interviews.
- **Secondary:** Career centers (B2B) and parents (gift/family plans). The core experience is B2C student.

---

## 3. Core Value Propositions

1. **Resume scored like a senior hiring manager** — One upload → three dimensions (Smart, Grit, Build) + “Meridian’s take,” evidence cited from the resume, and peer percentiles (“Top X% in your track”).
2. **ATS readiness in one place** — One ATS score (0–100), “What ATS sees” (extracted fields), formatting checklist, issues, “Fix it” rewrites, keyword density and placement, and per-vendor simulation (Workday, Greenhouse, iCIMS, Lever).
3. **One link for recruiters** — Shareable “six-second profile” (name, photo, tagline, scores, proof, career goal) that updates when they edit profile or run a new audit.
4. **AI coach that knows their resume** — Meridian Voice: chat that has audit + resume context, can run tools (gap scan, “Am I Ready?,” bullet rewrites, interview prep), and gives concrete, evidence-based next steps.
5. **Jobs and apply flow** — Meridian-verified jobs run through their resume; match % and “why you’re a fit”; optional “Apply on Meridian” so recruiters see [Meridian Verified] in the inbox.

---

## 4. Platform and Tech Constraints

- **Platform:** Responsive web app, **mobile-first** (primary viewport ~375px). No native iOS/Android app in scope for this prompt; PWA-friendly (manifest, optional install).
- **Stack (reference):** React (Next.js), TypeScript, Tailwind-style utility CSS, design tokens (e.g. `--meridian-primary`, `--ut-surface-raised`). Dark-mode-first UI (dark backgrounds, light text) except for the share card (light card for screenshots).
- **Auth:** Email-based; .edu verification (send code → verify). Session token; no social login required in this spec.
- **Data:** Assume REST-style APIs for profile, audit, ATS, jobs, voice chat; the builder does not need to implement backend, only consume endpoints.

---

## 5. High-Level Information Architecture

- **Pre-app:** Onboarding (welcome, verify .edu, school theme, name, major, pre-professional track, goals, “What is Meridian,” resume upload ask, payment / paywall).
- **Main app (after subscribed):** Single shell with **bottom navigation** (5 tabs):
  - **Career Center** (home)
  - **Review** (resume audit / report)
  - **Insights** (progress, milestones, playbook, tips, history)
  - **Calendar** (deadlines)
  - **Voice** (Meridian Voice chat)
- **Standalone pages (linked, not in nav):** Jobs (`/jobs`), ATS Readiness (`/ats`), Achievements (`/achievements`), Settings, Public profile (`/p/[slug]`).

---

## 6. Main App Shell

- **Bottom nav:** 5 items — Career Center, Review, Insights, Calendar, Voice. Voice tab can show user avatar when set. Active tab clearly indicated.
- **No global top bar required;** each tab can have its own header (e.g. “Career Center”, “Review”, “Insights”) and back/close where needed.
- **Max width:** Content often capped (e.g. `max-w-[375px]` or similar) for readability on phone; centering with side margins.
- **Loading:** Skeleton or spinner for auth, profile, audit, ATS, jobs; avoid blank screens.

---

## 7. Career Center Tab (Home)

**Purpose:** “Everything you need is here” — one screen to see standing, next action, and shortcuts.

- **Primary goal** — Editable line at top (e.g. “Land a summer analyst role at Goldman”). Save persists to profile.
- **Compact profile** — Photo, name, school line (“Meridian for [School]”). Tapping edit opens **Edit Portfolio** (photo, name, major(s), minor(s), pre-professional track).
- **Your numbers** — Last audit: Smart, Grit, Build, final score; “Top X% in [track]” when peer percentiles exist. **Your strongest signal** — one sentence: “Your strongest signal to recruiters right now is [Dimension]—[evidence].”
- **You made progress** — When user has run a second audit in session: last vs this run + “See why your scores changed” → Review tab.
- **Do these 3 next / One thing to do** — If no audit: “Run your first resume check” + CTA to Review. If audit: top 3 recommendations or single nudge. If upcoming deadline (e.g. ≤14 days): “Your [label] deadline is in X days — run Am I Ready? or refresh your audit” + CTA.
- **Your track playbook** — Headline + short bullets for their detected track (e.g. Pre-Health, Tech, Finance).
- **ATS Readiness** — Compact card: score (0–100), status (Ready / Needs work / At risk), “Run ATS scan” or “See full ATS” → `/ats`.
- **Jobs for you** — Top N job cards (title, company, match %); “View all” → `/jobs`.
- **Your recruiter profile** — Shareable link to `/p/[slug]`, “View my profile,” “See what recruiters see” (preview with banner). Copy link for resume footer.
- **Quick links (grid or list):** Full report, New audit, Jobs, Calendar, Insights, Achievements (sticker sheet).
- **Meridian Voice CTA** — Prominent “Open Meridian Voice” or “Ask Meridian” so Voice is discoverable from home.
- **Optional:** Target firms (for Voice and gap scan), outcome capture (“Did you get an interview or offer?”), “Meridian noticed” small card when conditions met (e.g. first Top 25%), referral/invite.

---

## 8. Review Tab (Resume Audit & Report)

**Purpose:** Run audit, see scores and feedback, share result, dig into findings.

- **No audit yet:** Upload zone (PDF/DOCX), “Run your first audit” or “Run audit.” On success: progress, then redirect to report view.
- **Has audit:**
  - **Hero:** Candidate name, “Prepared for [name],” Track · Major line, **Meridian score** (e.g. 0–100).
  - **Meridian’s take** — One block: strength-first summary (“Here’s what’s working… The one change that would matter most…”). Treat as a distinct card (e.g. left border accent, clear typography).
  - **Your strongest signal** — One sentence (Dimension + evidence).
  - **Share / export:** Shareable card (screenshot-friendly), Download Snapshot (share-card-as-SVG), Share to LinkedIn (badge + caption + open LinkedIn), Copy summary, Copy Top %, Download PDF, Copy share link. No separate “Share your result” section in full report if you want a lean report; keep share actions in one place.
  - **Assessment findings** — List of findings (e.g. Smart/Grit/Build: finding text). Optional: “Cited from your resume” quote per finding.
  - **Consistency / Red flags** — Short sections if API provides them.
  - **Strategic recommendations** — Line edits (suggested line + copy) and action items.
  - **Peer percentiles** — “Top X%” per dimension when available; “Your cohort” definitions for Smart, Grit, Build.
- **FAB or sticky CTA:** “New audit” to run another audit.
- **Sub-views (optional):** “Full report” vs “Insights” vs “Upload” controlled by simple state or query; Insights can be a separate tab or a sub-view of Review.

---

## 9. Insights Tab

**Purpose:** Progress, milestones, playbook, and tools in one place.

- **Score trajectory** — If “potential” scores exist (e.g. after top 3 recommendations), show “Your potential” with dimension scores and “View recommendations” CTA.
- **Progress to next tier** — Per dimension: “X pts to [Strong/Elite]” with progress bar.
- **Before & after** — First audit vs latest (Smart, Grit, Build) with deltas.
- **Meridian’s take** — Same strength-first block as in Review (if you want it here too).
- **Your strongest signal** — Same one-sentence block.
- **Your rank** — “Top X%” for best dimension; “Gap to next level” for dimensions below top 25% with short copy + optional Voice CTA.
- **Milestones** — e.g. “Grit up 5 points since last audit,” “You’re in the top 10% for Build.”
- **Progress (previous vs now)** — Side-by-side previous vs current scores + “See full breakdown” → Report.
- **Quick tips** — Accordion or expandable FAQs (GPA, dates, what recruiters scan).
- **Progress over time** — Line chart: overall and/or Smart, Grit, Build over audits.
- **Momentum** — e.g. “X audits this month” + “Score up since last run” when applicable.
- **Audit history** — List of past audits (date, score, track); tap → load that report.
- **Target firms** — Optional field “E.g. Goldman Sachs, Google” for Voice and gap scan.
- **Design:** Dark-mode cards; one card per concept; left border or small accent for hierarchy; consistent typography (e.g. small caps labels, then body). No light card backgrounds; this app is dark mode.

---

## 10. Calendar Tab

**Purpose:** Deadlines and sprint focus.

- **Calendar view** — Month or week with markers for deadlines.
- **Deadline list** — Label, date, countdown (e.g. “X days left”). Optional: add deadline (label + date).
- **Urgent banner** — When a deadline is soon (e.g. ≤3 or ≤7 days): “X days left until [label]” + CTA to “Prep with Voice” or “Run Am I Ready?”.

---

## 11. Voice Tab (Meridian Voice)

**Purpose:** AI coach that has resume and audit context; can run tools and give concrete next steps.

- **Chat UI** — Message list (user + assistant). User avatar: profile photo or default (e.g. owl). Assistant: Meridian avatar (configurable from a set).
- **Input** — Single prompt box: “Ask Meridian…” with send button; optional bullet rewriter toggle. Support slash commands in hint text (e.g. `/ready [company]`, `/mock [JD]`).
- **Quick chips** — e.g. “Going well,” “Stuck,” “Need help with resume” to start a thread.
- **Tabs or list** — Multiple conversations; “+” for new chat; switch by tab or list item.
- **First message in new convo** — Assistant’s first reply must reference something specific from their resume or audit and give one concrete next step (no generic greeting).
- **Tools (backend-driven):** e.g. gap scan, “Am I Ready?” (company/role), bullet rewrite, interview prep. UI can show “Running…” and then inline result or summary.
- **Tone / memory (optional):** Settings for “Voice tone” (e.g. Encouraging, Direct, Casual, Professional, Coach) and “Remember this” notes; these can be surfaced in app state or Settings only.

---

## 12. Jobs Page (`/jobs`)

**Purpose:** Meridian-verified jobs, filtered and matched to resume; apply from app.

- **Location** — On first visit: “Where are you open to working?” — cities (autocomplete) or “Domestic (US)” / “International.” “Change locations” to edit.
- **List** — Job cards: title, company, match %. Tap → full-screen detail.
- **Detail** — Full description; “Why am I a fit?,” “Ask Meridian about this role,” Bookmark, **Apply on Meridian** (primary) and “Apply on company site” (secondary). Apply on Meridian: optional note, Send; success state.
- **Bookmarks & collections** — Toggle or tab: Jobs | Bookmarks. Bookmarks in “General” or custom collections; add/remove from collection.
- **Empty states** — No jobs, low matches, or “Add more to resume” when relevant.

---

## 13. ATS Readiness Page (`/ats`)

**Purpose:** One place for ATS score, what systems see, checklist, issues, rewrites, keywords, vendors.

- **Auth** — Require signed-in, subscribed user; else redirect or paywall.
- **No scan yet:** “Run ATS scan” (or “Run resume audit first” if no audit). After audit, scan can auto-run once.
- **Hero** — Large ATS score (0–100), readiness pill (Ready / Needs work / At risk), one-line summary.
- **Tabs (or single scroll):** Overview, What ATS sees, Checklist, Issues, Fix it, Keywords, Vendors.
  - **Overview:** Score over time (line chart if 2+ scans), sections detected, skills extracted.
  - **What ATS sees:** Extracted fields (name, email, phone, education, experience entries, skills).
  - **Checklist:** Format/structure checks (e.g. 13 items) with pass/fail; optional “Fix with Voice” per failed item.
  - **Issues:** ATS-critical issues; optional “Fix it for me” → Fix it tab.
  - **Fix it:** Per-bullet rewrites (original → rewritten with placeholders like `[by X%]`); copy per bullet or “Copy all.”
  - **Keywords:** Density score, placement map, optional JD match %; “Where to add keywords” with suggested bullet and before/after.
  - **Vendors:** Workday, Greenhouse, iCIMS, Lever: score per vendor, “what breaks,” “what works,” tips; company search “Type a company, we’ll tell you their ATS” and highlight that vendor.
- **Mobile-first:** Max width ~375px, touch-friendly targets (e.g. min 44px), truncation where needed. Tab bar can be hamburger + “Page name” or horizontal scroll.

---

## 14. Achievements (Sticker Sheet)

**Purpose:** Collect achievements; pick up to 3 for share cards.

- **Grid** — One slot per achievement type. **Dimension tiers (Smart/Grit/Build):** One slot per dimension (not four per dimension). Show the **best tier** the user has (e.g. Top 5% Smart); when they improve (e.g. to Top 1%), the same slot updates to the new tier. Locked = dashed circle + dimension label (“Smart,” “Grit,” “Build”).
- **Unlocked** — Sticker with color/border; tap to toggle “on share card.” Max 3 on share card.
- **Copy:** “X of Y earned. Tap unlocked achievements to add to share cards and your recruiter profile (up to 3).”
- **Hierarchy:** If user has “Top 1% Smart,” they also count as having Top 25%, 10%, and 5% Smart for “earned” count and for adding to share card; only one sticker per dimension is shown (the best).

---

## 15. Share Card and Snapshot

- **Share card (in-app)** — One card: “Meridian” branding, one metric (user chooses: Smart / Grit / Build / Final / ATS), one circle (score or “Top X%”), up to 3 achievement stickers. Light background (e.g. #ebe9e6) so screenshot looks good. “Download Snapshot” = same card as SVG. “Share to LinkedIn” = badge SVG + caption + open LinkedIn.
- **Public profile** — `/p/[slug]`: recruiter-facing “six-second” page: name, photo, tagline, one-line hook, Smart/Grit/Build, key findings, career goal. Optional: “See what recruiters see” preview mode with banner.

---

## 16. Onboarding (Pre–Main App)

**Sequence (adjust order if needed):**

1. Welcome + .edu email + “Get my verification code.”
2. Verify: send code, 6-digit entry, success → next.
3. School theme (e.g. “Meridian for Spartans”).
4. Name.
5. Major (single or multiple).
6. Pre-professional? Yes / No.
7. If yes: track (e.g. Pre-Med, Pre-Law) dropdown.
8. Goals: multi-select.
9. “What is Meridian”: short bullets + “Show me my career center.”
10. Bridge copy + Continue.
11. Resume: drop zone (PDF/DOCX) or “I’ll upload later.”
12. Payment: e.g. $9.99/mo, “What you get next,” proof line; dev-unlock option.

Profile (name, major, track, goals) saved via API; main app loads profile and last audit (from API or cache) so shell appears quickly.

---

## 17. Settings (Reference)

- Profile: name, major(s), minor(s), track, career goal, target firms.
- Photo: add/change/remove; optional zoom/crop before upload.
- Taglines: professional (recruiter), custom (share cards/snapshot).
- Profile theme: e.g. Professional, Bold, Minimal, Warm, High contrast.
- Voice: tone (Encouraging, Direct, Casual, Professional, Coach); “Remember this” notes; avatar picker.
- Sound effects: on/off.
- Invite a friend: copy referral link.
- Redeem gift / Family plan (if supported).
- Share with parent: parent email, milestone opt-in, invite link (if supported).
- Log out.

---

## 18. UI/UX Conventions

- **Dark mode default** — Backgrounds: dark (e.g. slate-900, `var(--ut-surface-raised)`). Text: light (slate-100, slate-200, slate-400). Cards: dark with subtle border; **no light card backgrounds** except the share card and any export/snapshot asset.
- **Accents** — Left border (4px) or colored label for emphasis (e.g. Meridian’s take, strongest signal, progress). Use theme primary for CTAs.
- **Touch targets** — Minimum ~44px height for buttons and tappable areas.
- **Copy** — No em dashes; use commas, periods, or “to.” Human deadlines: “X days left until [label].”
- **Loading** — Spinner or skeleton; avoid blank screens. Use one consistent loader component where possible.
- **Errors** — Toast or inline message; retry where appropriate (e.g. audit failed, ATS failed).

---

## 19. API Assumptions (for Builder)

The builder can assume these **concepts** exist; actual endpoints and payloads are backend-defined:

- **Auth:** Send verification code, verify code, session token.
- **Profile:** GET/PATCH (name, major, majors, minors, track, goals, photo, taglines, theme, voice_tone, voice_notes, achievements, share_card_achievements, first_audit_snapshot, deadlines, target_school/target_firms, parent_email, etc.).
- **Audit:** POST audit (upload PDF/DOCX) → scores, findings, recommendations, peer_percentiles, meridian_take, evidence.
- **Explain delta:** POST with previous + current audit → “Why your scores changed.”
- **Report PDF:** POST → signed URL; GET URL → download.
- **Voice:** POST chat (message + context) → reply; optional streaming; optional tool calls (gap_scan, ready_check, rewrite_bullet, interview_prep, etc.).
- **ATS:** POST analysis (or from-audit) → score, extracted fields, checklist, issues; POST keyword-density, POST vendor-sim, POST rewrite, POST keyword-inject; GET ats-score/history.
- **Jobs:** GET recommended (with location filter) → list; job detail; POST apply-through-meridian (job_id, note).
- **Peer cohort:** GET peer-cohort-stats?track=… → cohort_n, avg, p25, p75, how_to_get_ahead.
- **Public profile:** GET profile/public/[slug] and GET profile/public/[slug]/photo (no auth).

---

## 20. What to Emphasize in the Build

1. **Mobile-first, dark UI** — One column, clear hierarchy, no light card backgrounds except share card.
2. **Career Center as home** — One screen: goal, numbers, one thing to do, playbook, ATS, jobs, profile link, Voice CTA.
3. **One slot per dimension for achievements** — Smart, Grit, Build each have one sticker that shows best tier and updates when they improve.
4. **Meridian’s take and strongest signal** — Always visible after an audit; strength-first, evidence-based.
5. **ATS in one place** — Score, what ATS sees, checklist, issues, fix it, keywords, vendors; optional company lookup for “their ATS.”
6. **Voice that knows the resume** — First reply references resume/audit; tools (gap, ready check, rewrite, prep) available from chat.
7. **Share card = one metric + achievements** — Same card for in-app preview and “Download Snapshot”; public profile is separate (six-second recruiter page).

---

*End of prompt. Use this as the main context when prompting an AI app builder to generate or refactor the Meridian frontend.*
