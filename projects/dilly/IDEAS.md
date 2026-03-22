# Meridian — Ideas & Implemented Features

**Process:** From now on, every feature we add to the app is listed here. When you implement something new, add it under *Implemented* (with a short note). Ideas we might do later go under *Ideas / On hold*.

**Edit rule:** Only **add** to this file. Never change, reword, or remove anything that is already in it.

**Feature evaluation (before implementing or proposing anything new):** Ask yourself:
1. **What’s the point?** (Why does this exist?)
2. **How would this benefit someone?** (Concrete benefit.)
3. **How would someone use it?** (Real usage, not hypothetical.)
4. **How will this make the app more valuable?** (Impact on retention, sharing, or perceived value.)

If the idea answers all four well and shows promise, say how. If it doesn’t, say why it’s not a good idea and skip or deprioritize it.

---

## Implemented

### Career Center — home paywall removed (March 2026)
- **Removed** the full-screen “Your career center is ready” subscribe / Stripe / beta-code UI from **`dashboard/src/app/page.tsx`**. Signed-in users go straight into the main shell. **`/auth/me`** hydration sets **`subscribed: true`** for every logged-in user so existing `user?.subscribed` gates stay open. **`?subscription=success`** still refetches and strips the query. Backend checkout / beta endpoints are unchanged.

### Student app — separate Next.js project (March 2026)
- **`projects/dilly/student`:** New Next.js 14 (App Router, TS, Tailwind), **`npm run dev` → port 3001**. Internal dashboard stays at **`projects/dilly/dashboard`** on **3000**; do not change dashboard for student work. **`env.local.example`** → copy to `.env.local`, **`NEXT_PUBLIC_API_URL=http://localhost:8000`** (match API port). **CORS:** `api/main.py` default list already includes `localhost:3001` / `127.0.0.1:3001`; comment documents 3000 vs 3001. If `CORS_ORIGINS` is set in prod, add student domain additively.

### Leaderboard — default opt-in (March 2026)
- **New signups:** `profile_store.ensure_profile_exists` sets **`leaderboard_opt_in: true`**. **Pool logic:** `is_leaderboard_participating()` — missing/`null`/`true` = on the board; only **`leaderboard_opt_in === false`** opts out (PATCH `/profile`). **Backfill:** `projects/dilly/scripts/backfill_leaderboard_opt_in.py` for existing `memory/dilly_profiles/*/profile.json`. **Ranking row per user:** newest audit whose cohort matches the board (`_newest_audit_for_leaderboard_track` + `get_track_category` / `_leaderboard_cohort_key`), not only `audits[0]`, so a latest run in another track does not drop you from your board. **`peer_count`** is computed after the opt-out inject. Client cache key **`dilly_leaderboard_cache_v3`**.

### Leaderboard — all cohorts by final score (March 2026)
- **API:** `GET /leaderboard-dashboard/cross-cohort` (`require_auth`) returns `{ cohorts: [{ track, peers, your_score, your_rank }] }` per canonical board — same pool as the main leaderboard (`build_cross_cohort_payload` in `leaderboard_page.py`; `_COHORT_BOARDS` synced with `COHORT_BOARD_TRACKS` in `trackDefinitions.ts`). **UI:** `/leaderboard` segmented control **My track** vs **All cohorts**; `CrossCohortSection` lists score + rank line per board, highlights profile track; session cache **`dilly_cross_cohort_cache_v1`**.

### Leaderboard — cross-cohort reliability (March 2026)
- **Single-scan pools:** `_all_cohort_pools_raw()` in `leaderboard_page.py` builds all board pools in one `dilly_profiles` pass (avoids 11× repeat scans / gateway timeouts). **Path alias:** `GET /leaderboard/page/cross-cohort` (before dynamic `/leaderboard/page/{track}`) mirrors cross-cohort JSON for strict proxies. **Client:** `/leaderboard` tries `/leaderboard-dashboard/cross-cohort` then the alias on **404**; **90s** `AbortError` user copy if the request stalls.

### Leaderboard — All cohorts = global top 100 (March 2026)
- **Replaces** the per-board summary: **`build_global_leaderboard_payload`** in `leaderboard_page.py` — one row per opted-in user, score = newest audit matching **profile cohort** (or detected track if no profile track); sort by `final_score`; **UI list capped at top 100**; **`cohort_track`** on each row/podium slot. **API:** `GET /leaderboard-dashboard/global` + **`GET /leaderboard/page/global`**. **Client:** same shell as track board (`LeaderboardHeader`, `PodiumRow`, `RankingsList`, `MoveUpCard`, `WeeklyFeed`); **`dilly_global_leaderboard_cache_v1`**; `parseLeaderboardEntry` / `parsePodiumSlot` preserve **`cohort_track`**.

### App launch — loading + splash (March 2026)
- **Once per tab session** (`sessionStorage` `dilly_splash_shown`): `AppLaunchSequence` in `Providers` — `LoadingScreen` (timed transitions) + `SplashScreen` (gradient, `DillyAvatar` / `DillyFaceEngine`, staggered copy). **API:** `GET /profile/splash-state` (`splash_state.py`) returns dynamic `SplashState` (+ optional `voice_prompt`). **Voice:** primary CTA sets `PENDING_VOICE_KEY` + overlay when `voice_prompt` present; `/voice?context=deadline_fix|…` fallbacks in `voice/page.tsx`. **Timing:** `lib/launch/splashConfig.ts`. **Tokens:** `launch-tokens.css` scoped `.dilly-launch-scope`. **Fonts:** Playfair + Inter (incl. 800) in root `layout.tsx`.

### Bottom nav — Career Center tab icon (March 2026)
- **Label:** "Career Center" (unchanged). **Icon:** `CareerCenterTabIcon` — graduation-cap SVG using `currentColor` (replaces `/career-center-icon.png`) on home shell + ATS layout + `/score`, `/leaderboard`, `/audit/[id]`, certifications, career-playbook. Export: `components/career-center/CareerCenterTabIcon.tsx`.

### Jobs — Get Hired **Jobs** sub-tab + `/jobs` redirect (March 2026)
- **In-app:** **`JobsPanel`** on **Get Hired** next to **Applications** (sticky sub-tabs). **Legacy `/jobs`** client-redirects to **`/?tab=resources&view=jobs`** (preserves **`&type=`**). Full-bleed dark UI (`components/jobs/jobsTokens.ts`, Inter). **Bottom nav:** four tabs — no separate Jobs pill. **API:** `GET /jobs/page` (`projects/dilly/api/jobs_page.py` + `routers/jobs.py`) — readiness order; free tier **2** full rows + stubs + `locked_count`. **UI:** `components/jobs/*`, `app/jobs/page.tsx` (redirect only). Apply flows, Voice handoffs, unlock, empty states unchanged in behavior.

### My Score page — minibar + bottom nav (March 2026)
- **`/score`:** When **`user.subscribed`**, **`BottomNav`** uses **`dockTop={<CareerCenterMinibar docked active="score" embedded={…} />}`** (same stacked dock as career center home): Score / New audit → `/?tab=upload` / Calendar → `/?tab=calendar`. Bottom padding **`pb-40`** to match home sections. Non-subscribers: bottom tabs only (unchanged).

### My Score page — `/score` (March 2026)
- **Standalone** My Score experience: hero number (animated), gap vs target-company bar, Smart/Grit/Build tiles, insight + Voice/Jobs CTAs, audit history bars, peer preview. **API:** `GET /profile/score-page` (`projects/dilly/api/score_page.py`). **UI:** `app/score/page.tsx`, `components/score/*`. **Voice handoff:** `DILLY_SCORE_GAP_VOICE_PROMPT_KEY` + `/voice?context=score_gap&…`. **Nav:** ScoreCard score → `/score`, minibar Score → `/score`, `/?tab=score` → `/score`; Hiring Score home redirects via `ScoreHomeRedirect`. **Leaderboard:** `app/leaderboard/page.tsx`, `components/leaderboard/*`, **GET `/leaderboard/page/{track}`**; bottom nav **Rank**, score peer preview, Insights “Your rank” CTA, `/score` pill **Rank**. Docs: `WHATS_IN_THE_APP.md`.

### Premium onboarding — 8-screen journey (March 2026)
- **Routes:** `/onboarding/welcome` → `verify` → `profile` → `you-are-in` → `anticipation` → `upload` → `scanning` → `results`; index `/onboarding` redirects to welcome. Full-bleed layout (`app/onboarding/layout.tsx`), design tokens in `onboarding-tokens.css`, Playfair + Inter. **State:** `lib/onboarding/state.ts` + `OnboardingProvider` (root `Providers.tsx`) — reducer, `sessionStorage` persist (no `File` in JSON), `first_name` from `full_name`, track from `inferTrackFromMajor.ts` (UTampa majors). **UI:** `ProgressBar` (6 segments), `MicroWin`, `TrackRevealCard`, `BenchmarkChart`, `DillyOrbScanner` (canvas face + ripples), `ScanStepList`, `ScoreRevealCard`, `DillyTease`, `NotificationPrePrompt` (7-day dismiss), `OnboardingPageTransition` (framer slide). APIs: `POST /auth/send-verification-code`, `POST /auth/verify-code`, `PATCH /profile`, `POST /audit/v2`. Results: stash audit via `auditStorageKey`, PATCH `onboarding_complete: true`, `router.push("/")`.

### Dilly Voice — visual families + recap + tone mirror + micro-celebrations (March 2026)
- **Inline visuals:** `[[application_card]]`…`[[/application_card]]` (Company/Role/Status/Deadline), `[[next_moves]]` (up to 3 actions), `[[story_timeline]]` (labeled beats), marker `[[peer_context_visual]]` (peer Top % tiles). Parsed in `voiceMessageVisuals.ts`; components `VoiceApplicationCardVisual`, `VoiceNextMovesVisual`, `VoiceStoryTimelineVisual`, `VoicePeerContextVisual`; dedup kinds in `VoiceChatVisualDedup.tsx`; `VoiceAssistantRichReply` + `voiceVisualTypes` (`scoresAuthoritative` when no audit so radar is not shown from placeholder zeros). **API:** `voice_helpers.py` `_VOICE_INLINE_VISUALS_BLOCK`, `format_voice_user_content` — `applications_preview`, `peer_percentiles`, `_infer_tone_mirror_mode` (execution vs supportive hints). **Context:** `buildVoiceContext` + GET `/applications` batch with habits (and `centerRefreshKey`); `voiceScoresForChat` includes `applications_preview`, `peer_percentiles`, `cohort_track`.
- **Career Center — session recap card:** `voiceSessionRecap.ts` builds recap from last user lines when leaving Voice; `VoiceSessionRecapCard` on Center; `persistVoiceSessionRecap` / `readVoiceSessionRecap` / `clearVoiceSessionRecap`.
- **Micro-celebrations:** `dillyMicroCelebrations.ts` — one-time toasts for 7-day streak, first audit, first application (`page.tsx` effects with init refs).

### Career Center — deadline card label (March 2026)
- Eyebrow on the soonest-upcoming-deadline card: **Application deadline** → **Deadline reminder**.

### Voice / score copy — heal empty [smart|grit|build] tags (March 2026)
- **Problem:** Model sometimes emitted `Your [build][/build] score…` (empty wrappers) → visible blank / double space in Voice and Career Center presence strip. **Fix:** `voiceDimensionMarkup.ts` — `normalizeVoiceDimensionMarkup` lowercases `[Build]`→`[build]` so `VoiceFormattedText` parses; `healEmptyVoiceDimensionTags` fills empty pairs with `[dim]Dim score of N[/dim]` using authoritative triple; special case `Your [dim][/dim] score` → `Your [dim]Dim score of N[/dim]` (no duplicated “score”). Wired in `VoiceAssistantRichReply`, `VoiceFormattedText` (normalize), `DillyCardStrip`+`ScoreCard` (strip + voice markup). Vitest: `voiceDimensionMarkup.test.ts`. **Prompt:** `voice_helpers.py` forbids empty dimension tags.

### Career Center — Application deadline card under score quick actions (March 2026)
- **Application deadline** countdown card moved from mid-page to **directly under** the three-tile row (ATS Scan · Jobs · Recruiter view) below the score card / empty state, before Gap / Cover / Interview / Achievements. Same markup and sprint styling as before.

### Career Center — removed “Do these 3 next” card (March 2026)
- **Removed** the checklist card (“Do these N next”, Fix with Dilly per item, View full recommendations) from the **Career Center** home in `page.tsx`. **This week** (deadline ≤14d, milestone, loading audit) unchanged. `getTopThreeActions` / `toNaturalSuggestion` remain used elsewhere (feed, Get Hired, proactive nudge). Docs: `WHATS_IN_THE_APP.md`, `voice_app_features.json`.

### App profile header — name · cohort one line (March 2026)
- **`AppProfileHeader`:** Merged name + second-line subtitle into one `h1`: **Name · track · school** (cohort/detail in smaller `t3` text). Removed `truncate` so the title wraps when horizontal space is tight (back button, long names). Uses `text-balance` and `[overflow-wrap:anywhere]`.

### Dilly Voice — typos vs inappropriate filter (March 2026)
- **Problem:** Messy mobile text (e.g. do.i / tinerview) triggered **Let's keep this professional.** **Fix:** `_INAPPROPRIATE_FILTER_VOICE_INSTRUCTIONS` now limits refusal to clear boundary violations; explicitly excludes typos, glued punctuation, non-native English, etc., and requires charitable intent inference. `format_voice_user_content` appends a decoding hint when `_message_looks_typo_prone` (dot-in-token or common career misspellings). `_classify_emotional_context` treats common interview misspellings like anxiety cues.

### Dilly Voice — profile-grounded “what’s coming up” (March 2026)
- **Problem:** Model answered calendar / pipeline questions with generic pep talk instead of user data. **Fix:** Dashboard `buildVoiceContext` adds `pipeline_context` from `habits` + `proactiveNudges` (habits upcoming deadlines, pipeline_counts, apps week/month, silent follow-ups, funnel, urgent nudge). GET `/habits` returns `pipeline_counts` { applied, interviewing, offers } and up to 12 `upcoming_deadlines`. `voice_helpers.format_voice_user_content` formats **Profile calendar (upcoming)** from profile deadlines (sorted, days-until) and pipeline lines; system prompt **Answer from their profile** requires listing context facts or stating none exist.

### Dilly Voice — first-time vs returning empty-state greeting (March 2026)
- **Once per account:** Long intro (“Hey! I’m Dilly, your career coach…”) on Voice tab + overlay empty chat when `intro_seen_v1` is unset and no saved chat has messages (existing users migrated on load). **After that:** `Hey {firstName}, what’s on your mind?` or `Hey! What’s on your mind?` if no name. Completed when user leaves Voice / closes overlay or sends any message. `getDillyVoiceEmptyGreeting`, `hasCompletedDillyVoiceIntro`, `markDillyVoiceIntroSeen` in `dillyUtils.ts`; `VoiceOverlay` `emptyChatGreeting`.

### Dilly Voice — “real talk” on absurd or off-profile claims (March 2026)
- **`voice_helpers.build_voice_system_prompt`** — When the user says something clearly unserious, trolling, or wildly inconsistent with their profile (major, track, pre-professional path, career_goal, stated goals), Dilly names the mismatch kindly, reality-checks (e.g. “I mean, are you serious about this?”), then either pivots to real help or explores a genuine nuance. Respectful: no slurs; no moralizing about legal work—focus on fit with *their* stated story.

### Dilly Voice — inappropriate-content boundary (March 2026)
- **`voice_helpers._INAPPROPRIATE_FILTER_VOICE_INSTRUCTIONS`** — Injected into default Voice, resume deep-dive, and onboarding system prompts. Harassment, graphic sexual content, hate/slurs, threats → short reply **“Let’s keep this professional.”** (+ optional one line back to career topics). **Profanity for venting** about job search is explicitly allowed and coached normally.

### Dilly Voice — Dilly never leads with profanity (March 2026)
- **`voice_helpers._VOICE_OUTPUT_PROFANITY_GUIDELINES`** — Same three prompts. Dilly does not curse unless the user already used similar language in the thread; may use a **light** occasional mirror for rapport. No piling on, no edgy performance. Clean user language → clean Dilly. **`DILLY_PRESENCE_VOICE_ADDENDUM`** (dashboard) includes a one-line reminder.

### Dilly Voice — “saved to calendar” confirmation card (March 2026)
- **Problem:** When Dilly confirms adding a meeting, Zoom, or deadline to the user’s calendar, plain text is easy to miss or looks cut off on mobile. **Fix:** New inline visual **`VoiceCalendarSavedVisual`** (emerald card + calendar check icon, title “Saved to your calendar”, optional detail line). Markers: **`[[calendar_saved_visual]]`** or **`[[calendar_saved]]`…`[[/calendar_saved]]`** (one-line label). **`assistantMessageSuggestsCalendarSavedVisual`** injects the block when the model confirms a save but omits the marker (paired with **`extractCalendarSavedSummaryLine`**). Documented in **`voice_helpers.py`** `_VOICE_INLINE_VISUALS_BLOCK`. Dedup kind **`calendar_saved`** in `VoiceChatVisualDedup.tsx`.

### Dilly Voice — inline visual dedup + interview strip gating (March 2026)
- **Dedup:** Score radar, interview agenda strip, deadline timeline, and top-recs blocks do not repeat in a newer assistant turn while an older instance of the same family is still visible inside the chat scroll area; after the earlier one scrolls out of view, the next one may render. Implemented with `VoiceVisualDedupProvider`, `VoiceDedupScrollRoot`, `IntersectionObserver` + `VoiceDedupVisualHost` in `VoiceChatVisualDedup.tsx`; Voice overlay (`VoiceOverlay.tsx`) and full-page Voice tab (`page.tsx`) bind the scroll root and pass `messageListIndex` into `VoiceAssistantRichReply`.
- **Interview prep strip:** `assistantMessageSuggestsInterviewAgendaStrip` in `voiceMessageVisuals.ts` requires explicit interview-prep language before injecting the Research/Stories/Practice/Review strip; generic improvement or score-focused replies no longer match on coaching phrases alone (dropped the broad “walk through your answers/stories” trigger).

### ATS navigation (March 2026)
- **Instant shell** — `/ats` layout no longer full-screens on audit fetch; Suspense fallback matches `/career` (`null`). `ATSProvider` hydrates user + cached audit from `localStorage` in `useLayoutEffect` before paint; `auditLoading` starts `false` and only flips during network refresh. Auth still validates via `/auth/me` in the background.
- **Enter motion** — `ATSStagger` + `template-pop-in` on ATS layout (header, tabs, banners) and every ATS subpage so content eases in like resume-edit / career.

### Career Center — remove Am I Ready? + Companies shortcuts (March 2026)
- **Center tab** no longer shows **Am I Ready?** or **Companies** tiles. Career tools row is Gap Analysis, Cover Letter, Interview Prep (evidence-based `POST /interview-prep`, nested `<details>` UI) + Achievements in a 2×2 grid. Deadline / “one thing” / sprint blocks no longer include Am I Ready? buttons or copy. **`/ready-check/new`**, **`/companies`**, and Insights **Am I Ready?** remain available outside that strip.

### No “first audit” nag (March 2026)
- **Removed** full-screen “Run your first resume audit” modal, sticky banner, spacer, and **auto-switch** to Hiring/upload when audit history is empty. **Neutral** empty states on Career Center, Insights, full report placeholder, and Hiring score tab (no “Run resume audit” CTAs in those blocks). **Voice** first-visit greeting is generic (no “run an audit first”). **`getProactiveNudge`** returns `null` when there is no audit (no “run a resume audit” line). **Certifications** empty state: **Back** instead of primary “Run audit”. **Jobs**, **resume edit**, **companies**, **ATS** messaging softened; **AuditHistoryCard** label “First audit” → **Earliest** (chronological only).

### Audit restore after login (March 2026)
- **No infinite “Loading your previous audit…”** — Career Center hydrates scores from GET `/audit/history` immediately, then loads full audit from GET `/audit/history/{id}` with timeouts; stale cached audit is replaced when the server’s latest id differs. ATS tab uses the same pattern.

### Profile cohort + pre-professional (March 2026)
- **Cohort follows pre-professional choice** — Selecting a pre-professional path (Pre-Med, Pre-Law, etc.) sets the visible cohort to **Pre-Health** or **Pre-Law** (`getEffectiveCohortLabel` in `trackDefinitions.ts`). Header, Vs Your Peers (`/peer-cohort-stats`), playbooks, share card, and profile details use this; `/profile/details` also shows **Pre-professional path** when the stored track is a UT pre-prof option.

### Personalized career playbook page (March 2026)
- **Route `/career-playbook`** — Get Hired **View full playbook** → standalone page (not full audit report). Loads GET `/profile` + latest GET `/audit/history/{id}`; POST **`/audit/career-playbook`** first, fallback POST **`/career-playbook`** on 404 (alias; shared `_career_playbook_core` in `audit.py`). Body: audit slice (structured_text ≤7.5k, findings, evidence, recommendations, take), profile fields, `playbook_baseline` + `track_tips` + `effective_track` from `trackDefinitions.ts`. LLM JSON + fallback when no LLM. UI: Cinzel header, human **404** copy (not raw JSON). **Talk to Dilly** → **`DILLY_PLAYBOOK_VOICE_PROMPT_KEY`** + overlay. Deep link `/?tab=resources&view=playbook`. Types: `CareerPlaybookPayload` in `types/dilly.ts`.

### Get Hired — job search playbook (March 2026)
- **Phased checklist** — Replaced flat “grocery list” items with **Job search playbook**: three phases (Lock your story, Run your pipeline, Turn silence into momentum), each with a short strategic blurb and **12** checkbox rows that pair a **title** with a one-line **hint** (“done means…”). Overall **% + bar**, per-phase completion, gold accent checkboxes, **Ask Dilly what to do next** (Voice prompt), **Reset playbook progress** (clears `meridian_job_checklist_*` via `localStorage`). Same persistence key shape `Record<id, boolean>` with new ids. `page.tsx` (Get Hired tab).

### Certifications page — curated Build path (March 2026)
- **Route `/certifications`** — Full-screen curated certifications: hero, Dilly commentary, impact bar, top pick banner, expandable cards with Build pts and before/after estimate, per-cert bullets, external link, **Make it land** → Voice with `cert_landing` / `cert_id` in context (`VOICE_FROM_CERT_HANDOFF_KEY`, `/voice?context=cert&id=`). Tries GET `/certifications?uid=`; else latest audit + hub + `estimateBuildDeltaForCert`; localStorage cache for commentary/bullets per audit id. Wired from Get Hired tab, `/?tab=resources&view=certifications` redirect, Memory + Ready Check `open_certifications`. Files: `app/certifications/page.tsx`, `components/certifications/*`, `lib/certificationsPageData.ts`, `types/certifications.ts`.

### New resume audit screen (March 2026)
- **Spec-aligned upload + history** — Hiring tab new-audit (`?tab=upload`) uses `NewAuditExperience`: Career Center tokens (Inter, `--s2`/`--bg`/etc.), dashed drop zone only, paste row with or-divider, `AuditHistoryCard` list from `/audit/history` (delta, Top % track, dimensions, view report, share link). Header: 32px circle menu / Dilly wordmark / more (→ settings). Bottom nav: 390px-wide spec (active `var(--s2)`, Voice = indigo bubble on `var(--idim)`, home indicator pill). Components: `AuditUploadZone`, `AuditHistoryCard`, `AuditScreenHeader`, `mapAuditHistory`. `/audit` redirects to `/?tab=upload` so one state tree.

### New audit — audit history above upload (March 2026)
- **Previous audits first** — On `NewAuditExperience`, the **Previous audits** block is **above** upload/paste so users see past runs without scrolling; heading shows **(N)** when there are audits; long lists scroll inside a **max-height** region; **Updating…** when history is refetching but rows are already shown.

### Meridian Voice Search — 30-Second Candidate Discovery (March 2026)
- **Conversational search** — Recruiter search page has Meridian Voice FAB. Describe what you need in plain English (e.g. "Find me 5 PM candidates who have shipped production code"); get ranked candidates with evidence in ~30 seconds instead of 30 minutes of manual filtering. API: POST /recruiter/voice/search (query, optional role_description, conversation_history). Intent parsing (LLM) extracts role_description, filters, limit; runs recruiter_search; batch evidence summarization per candidate. Multi-turn refinement: "Narrow to CS majors" uses conversation_history to refine prior search.
- **Candidate cards in chat** — Voice search results render as inline cards: name, match %, Smart/Grit/Build, 1–2 sentence evidence summary, link to profile. Quick actions: "Find me top 5 for this role", "Narrow to CS majors", "Who has the strongest Build score?"

### Recruiter Profile Enhancements (March 2026)
- **Meridian Compare** — "Meridian Compare" button in recruiter search results. When pressed, all candidate cards/rows are highlighted; recruiter selects 2 candidates. Side-by-side compare modal shows Match %, Smart/Grit/Build, fit level, and links to profiles. Smooth flow: compare mode → select 2 → Compare → view.
- **Ask AI** — Consultant-style chat at bottom of candidate profile. Recruiters ask natural-language questions; AI analyzes Smart/Grit/Build evidence, profile, JD fit. Evidence-based (no hallucination). Quick actions: "How do they handle technical ambiguity?", "Biggest risk for this JD?", "3 interview questions from Build gaps." API: POST /recruiter/candidates/:id/ask (streaming SSE).
- **JD gap analysis** — On candidate profile: "Strong on X; weak on Y" summary derived from jd_evidence_map (green/red). Helps recruiters decide who to interview and what to ask.
- **Similar candidates** — "Others like this" section on profile: candidates similar by embedding + scores. Helps recruiters find alternatives when top candidate is unavailable.
- **Export to ATS** — "Export to ATS" button on profile: downloads shortlisted candidates (bookmarks + collections) as CSV (name, email, profile link, fit summary). Reduces copy-paste.
- **Recruiter notes** — Private notes on candidates ("Great culture fit, follow up in 2 weeks"). Persists across sessions; shared across recruiters on same team (same API key). API: GET/PUT /recruiter/candidates/:id/notes.

### Recruiter Bookmarks & Collections (March 2026)
- **Bookmarks** — Recruiters can bookmark candidates (☆/★) from grid, table, and profile. General bookmarks list in right sidebar.
- **Collections** — Create named collections, add candidates via "+" button. Add-to-collection modal: pick existing collection or create new and add. Remove from collection via × in sidebar.
- **Right sidebar** — Bookmarks and collections in rightmost column of recruiter view. Candidate names link to profiles. Create collection inline.

### Integrations + Portability (March 2026)
- **Export** — "Download everything" in Settings > Integrations. GET /profile/export returns JSON with profile, audits, applications, deadlines, resume text, dilly_profile_txt. Usable export so users feel in control.
- **Import** — Paste resume text to bootstrap profile. POST /audit/from-text; "Or paste your resume" in Hiring upload flow; Settings "Import from paste" links to ?tab=upload&paste=1.
- **Calendar** — Add deadlines to Google/Apple Calendar. Settings "Add deadlines to calendar" and Calendar tab "Export" button download .ics file.
- **What we sync vs store** — Integrations section explains: data lives in Meridian; export gives a copy; calendar export is one-way; import adds to profile.

### Habit Loops + Rituals (March 2026)
- **Weekly review** — On configurable review day (default Sunday), Career Center shows a card: "What did you apply to? What's coming up? What should you follow up on?" Tap opens Meridian Voice with a guided weekly-plan prompt. Uses applications_this_week, upcoming_deadlines, silent_apps from GET /habits.
- **Daily micro-actions** — "One thing today" (same 7 actions as before): check scores, improve bullet, ATS scan, ask Meridian, browse jobs, upload resume, add deadline. Date-seeded; check-in via POST /streak/checkin.
- **Streaks** — "X day streak" with check-in. Applications this month shown in streak card. Milestones: first application, first interview, first offer, 10 applications. Badges in streak card.
- **Rituals** — Guided flows: "Sunday career planning" (on review day), "Post-interview debrief" (when user has interviews/offers). Tappable cards open Voice with contextual prompts.
- **Settings** — Habits section: Rituals on/off toggle, Weekly review day (Mon–Sun). Profile ritual_preferences; backend merges on PATCH.
- **Backend** — GET /habits returns streak, daily_action, applications_this_month/week, silent_apps, upcoming_deadlines, is_review_day, milestones, ritual_suggestions. Fetched when Career Center or Voice active.

### Meridian Profile (March 2026)
- **Full profile** — Desktop-first view of everything the student does in Meridian. Student view at /profile; public shareable at /p/[slug]/full. Recruiter button "View full Meridian profile →" on candidate page. Entry: Explore tab "My Meridian Profile" card.
- **Privacy toggles** — Settings > Trust & Privacy: master "Full profile visible to recruiters" + per-section (Scores, Activity, Applications, Experience). Profile meridian_profile_visible_to_recruiters, meridian_profile_privacy. API: GET /profile/meridian, GET /profile/public/{slug}/meridian.

### Trust + Safety (March 2026)
- **Data ownership** — Settings > Trust & Privacy: "Your data is yours. We never sell it." Clear copy; Download your data (export); Delete account.
- **Transparency** — Voice system prompt: "When giving advice, briefly explain why when it matters." "When uncertain, say so." Meridian admits limits.
- **Privacy controls** — "Save what I tell Meridian" toggle in Trust & Privacy. When off: Voice chat works but nothing is persisted (voice_memory, beyond_resume, experience_expansion). Profile voice_save_to_profile; backend skips extraction when false.
- **Security** — Trust section: "Data encrypted in transit (HTTPS). We do not train AI on your data."
- **Human backup** — "Need human help? Contact your campus career center or support@meridian-careers.com."

### The "20x" Moments (March 2026)
- **Core idea** — Make the value feel like a 10–20x improvement. Underpromise, overdeliver.
- **Applications** — Before: hours per application. With Meridian: tailored resume + cover letter in minutes. Shown on Applications page when user has apps.
- **Interview prep** — Before: generic questions. With Meridian: personalized questions + story prompts from profile. Shown in Interview Prep card (Insights).
- **Mental load** — Before: spreadsheets and notes. With Meridian: one place for deadlines, applications, prep. Shown in Career Center More section.
- **Rejection recovery** — Before: stuck and demotivated. With Meridian: reframe + next steps + progress view. Shown on Applications page when user has rejections; links to Voice.
- **Onboarding** — Step 4 value hero: "Before: hours per application. With Meridian: tailored in minutes."
- **Lib** — `twentyXMoments.ts` with moment definitions; `formatTwentyXCompact()` for card copy.

### Streamline Career Center (March 2026)
- **Compact hero** — Single-row scores (Smart, Grit, Build) tappable → Report; smaller Voice CTA ("Ask Meridian" + input + chips). Compact row: ATS, Jobs, Recruiter. Collapsible "More from your career center." Quick links sticky above nav when on Center, Hiring, Calendar, or Practice.

### Emotional + Practical Support (March 2026)
- **Voice emotional support** — System prompt: when user shares rejection, imposter syndrome, celebration, anxiety, transitions, meet them with empathy first, then practical next steps. Warm but professional. Stay in supportive-coach territory.
- **Emotional context detection** — _classify_emotional_context(message) detects rejection, nerves, celebration, self-doubt, transition. Injects one-line hint so Meridian responds appropriately.
- **Proactive rejection context** — When user has rejected apps, proactive_lines include "They have rejections (X, Y). If they bring up rejection, offer reframe and next steps."
- **Starter chips** — "I got rejected — help me reframe", "I'm nervous about my interview", "I got an offer — what should I do next?" Rotating examples: "I got an offer from Goldman", "I'm switching from consulting to tech."

### Second Brain for Career (March 2026)
- **Career Hub UI** — The old searchable timeline hub is **not** mounted at **`/career`** anymore. **`/career`** redirects to **`/?tab=practice`** (legacy **`?tab=applications`** still forwards to Get Hired tracker). **Backend** for career-brain remains: GET /career-brain/timeline, search, connections, progress; POST /career-brain/decision-log — usable from Voice / future surfaces.
- **Application tracker** — **Get Hired** (`/?tab=resources`); **`/applications`** and **`/career?tab=applications`** redirect there.
- **Entry points** — Minibar **Practice** → `/?tab=practice`. Voice can still reference decision log / career history when context exists.

### Eliminate Repetitive Work (March 2026)
- **Templates hub** — `/templates` route: Cover letter (full), thank-you email, follow-up (silent 2+ weeks), LinkedIn (connection/message), resume tailoring, interview prep. All personalized from profile + JD. User edits before sending.
- **Backend** — POST /templates/cover-letter, /thank-you, /follow-up, /linkedin, /interview-prep, /resume-tailor. Uses dilly_profile_txt or profile+audit fallback. Output must feel personal, not generic.
- **Entry points** — Explore tab "Open Templates" button; Quick links bar "Templates" icon. Clear ROI: "Meridian wrote 5 cover letters for me this month."

### Practice and Explore tabs (March 2026)
- **Practice** — Home panel at **`/?tab=practice`** (minibar **Practice**, `/career` redirect); **not** a bottom-nav tab. Five practice modes: Mock interview, Bullet practice, 60-second pitch, Common questions, Interview prep. **Mock interview** opens Dilly AI with **in-chat mock interview mode** (structured cards, `POST /voice/mock-interview`, natural-language start + “End”). Other modes launch Voice with a contextual prompt. Optional full-page `/mock-interview` remains for target-role setup. Rehearsal space, not editing.
- **Explore tab** — Last in nav. Combines Explore + Connect: (1) Recruiter link — copy, view profile, see as recruiter; (2) Track explorer — 11 tracks, tap for Smart/Grit/Build definitions and playbook, "Ask Meridian about [track]"; (3) Outreach templates — link to /templates for cover letters, thank-yous, follow-ups, LinkedIn; (4) Campus career center — ask Meridian for questions to bring. Discovery and outreach in one place.

### Proactive, Not Reactive (March 2026)
- **Application funnel** — GET /applications/stats returns applied, responses, interviews, silent 2+ weeks. Proactive nudges: "12 applied, 4 responses, 2 interviews. 6 silent 2+ weeks—want follow-up templates?"
- **Relationship nudges** — People from beyond_resume (type=person) mentioned 2–6 weeks ago: "You met Sarah 3 weeks ago. Send a check-in?" Respects nudge_preferences.
- **Seasonal awareness** — Recruiting calendar (internship Jan–Apr, full-time Aug–Dec). When in season: "Recruiting season is active. Here's your sprint plan."
- **Score-based nudges** — When Grit/Smart/Build up 5+ pts vs previous audit: "Your Grit is up 8 pts. Here's what's working."
- **User control** — Settings > Voice > Proactive nudges: toggles for deadline, app funnel, relationship, seasonal, score nudges. Profile nudge_preferences.
- **Voice anti-nagging** — System prompt: "Never nag. One proactive nudge per session max. Don't repeat if dismissed. Respect their attention." Proactive context passed as proactive_lines; backend format_proactive_for_voice.

### Proactive, Not Reactive (March 2026)
- **Application funnel** — GET /applications/stats returns applied, responses, interviews, offers, rejected, silent_2_weeks. `proactive_nudges.py` computes funnel stats; Voice gets "X applied, Y responses. Z have been silent 2+ weeks — offer follow-up templates if they ask."
- **Relationship nudges** — People from beyond_resume (type=person) with captured_at 2–6 weeks ago → "They met Sarah 3+ weeks ago. Suggest a check-in — don't push."
- **Seasonal awareness** — Recruiting calendar (internship Jan–Apr, full-time Aug–Dec). When in season, inject "Recruiting season is active. One-line sprint nudge if it fits."
- **Score-based nudges** — When prev audit vs current shows 5+ pt gain on any dimension, inject "Score win: Grit up 8 pts. Acknowledge briefly if they ask about progress."
- **Deadline intelligence** — Soonest deadline within 7 days → "Urgent deadline: [Label] in X days. Offer prep help — one nudge only."
- **User control** — Settings > Voice > Proactive nudges: toggles for deadline, app funnel, relationship, seasonal, score nudges. Profile `nudge_preferences`; all default on.
- **Voice anti-nagging** — System prompt: "Never nag. One proactive nudge per session max. If user seems busy or dismisses, don't repeat. Respect their attention."
- **GET /voice/proactive-nudges** — Returns proactive_nudges + proactive_lines for Voice context. Frontend fetches when Voice active, includes in buildVoiceContext.

### Voice as primary interface (March 2026)
- **No auto “quick insight”** — Removed the effect that injected the first assistant bubble when a returning user opened Voice on an empty chat (deadline prep, score trajectory, top recommendation, `getProactiveNudge`). Users see the normal empty state + starter / follow-up chips only.
- **Tell Meridian anything** — Explicit messaging: "Tell me anything career-related—scores, interviews, rejections, who you met. I remember it all." Rotating examples (coffee with Sarah, rejected from McKinsey, stressed about interview, bombed behavioral). Main Voice tab and overlay updated.
- **Structured extraction** — `extract_beyond_resume_with_llm` now extracts person, company, event, emotion (plus skill, experience, project, other). System prompt and `_format_captured_memory` updated. Profile `beyond_resume` stores people, companies, dates, feelings.
- **Contextual recall** — `voiceStarterSuggestions` uses stored `person` and `company` from beyond_resume to surface prompts like "Prep for follow-up with Sarah" and "How do I follow up with McKinsey?"
- **Low-friction capture** — Voice as default via Web Speech API: mic button in overlay and main Voice tab. Tap to speak; transcript fills input. Text as fallback. `useSpeechRecognition` hook; `VoiceInputWithMic` component.

### Dilly Voice — inline visuals + build animations (March 2026)
- **Markers** — `[[scores_visual]]` (existing), plus `[[top_recs_visual]]`, `[[deadline_timeline_visual]]`, `[[interview_agenda_visual]]` / `:0–3`, and blocks `[[before_after]]`…`[[/before_after]]`, `[[chips]]`…`[[/chips]]`, `[[steps]]`…`[[/steps]]`. Parser: `dashboard/src/lib/voiceMessageVisuals.ts`; types: `voiceVisualTypes.ts`.
- **UI** — `dashboard/src/components/voice-visuals/*` (top recs, deadlines, interview strip, before/after, chips, steps); `VoiceAssistantRichReply` maps parsed segments to components + `VoiceFormattedText`; `VoiceInlineScoresVisual` adds optional **vs last audit** deltas and staged CSS animations (radar, bars, tiles).
- **Data bundle** — `voiceScoresForChat` (`DillyVoiceChatScoresBundle`) includes Smart/Grit/Build + final, `prevScores` when the displayed audit is the latest in history, top recommendations from the audit, and active profile deadlines for timeline/rec cards.
- **Motion** — `globals.css`: `.voice-viz-build-shell`, `.voice-viz-stagger-item`, radar poly, bar fill (`scaleX`).
- **Prompt** — `voice_helpers._VOICE_INLINE_VISUALS_BLOCK` documents markers and “one primary visual per reply” for the model.

### Gemini-style Voice overlay (March 2026)
- **Voice overlay** — When user taps **Dilly AI** in the bottom nav, a floating pill appears at the bottom (like Google Gemini on Samsung). That tap **opens the most recently updated saved thread** (`openVoiceResumeRecentChat` in `page.tsx`), not a brand-new chat. Pill expands to show chat + input; "Open full chat" goes to full Voice tab. Overlay floats over whatever screen the user is on. Quick access without leaving the current tab.
- **Suggestions over chat** — Starter / follow-up suggestion card uses higher z-index (`z-[103]`) and sits on top of the message list; chat stays `top-[72px]` so it is not pushed down when suggestions show. All-chats drawer `z-[106]` stays above suggestions.
- **Composer while AI thinks** — No spinner or typing dots in the text field row; send stays the normal icon (disabled when empty). Thinking feedback remains the transcript bubble typing dots above.

### Meridian Voice reimplementation and data-capture (March 2026)
- **Voice router reimplemented** — GET /voice/onboarding-state, POST /voice/chat, POST /voice/stream, POST /voice/rewrite-bullet, POST /voice/interview-prep, POST /voice/gap-scan, POST /voice/firm-deadlines, POST /voice/feedback. All endpoints implemented (no longer 501).
- **Voice as data-capturing layer** — System prompt instructs Meridian to actively ask for skills, experiences, and projects that aren't on the resume. When the user shares something substantive, the backend extracts it (LLM), appends to profile `beyond_resume` (type, text, captured_at), and returns `profile_updates` so the frontend merges into appProfile. Onboarding initial message asks for one thing not on the resume. Profile PATCH allows `beyond_resume`; used for ATS, matching, and future audits alongside `experience_expansion`.
- **Voice data flow** — `beyond_resume` and `experience_expansion` flow to: candidate_document (embedding for recruiter search), skill_tags (recruiter matching), llm_auditor (supplementary_context), job_matching (_voice_captured_text), dilly_profile_txt ([VOICE_CAPTURED] section). `write_dilly_profile_txt` runs after every Voice save. When Voice saves beyond_resume or experience_expansion, `index_candidate_after_audit` is called so recruiter search stays in sync.

### Recruiter semantic search (Phase 2 backend + UI) (March 2026)
- **Backfill script** — `projects/meridian/scripts/backfill_candidate_index.py`: index all students with at least one audit (assume consent). Options: `--dry-run`, `--force`, `--limit N`. Requires OPENAI_API_KEY.
- **POST /recruiter/search** — Recruiter API key (RECRUITER_API_KEY; X-Recruiter-API-Key or Bearer). Body: role_description, filters (major, school_id, cities, track, min_smart, min_grit, min_build), required_skills, sort, limit, offset. Returns candidates with match_score, semantic_score, skill_fit_score, meridian_fit_score. In-memory k-NN over profile folders.
- **POST /recruiter/jd-fit** — JD → Meridian-fit. Same auth. Body: job_description, job_title (optional). Returns smart_min, grit_min, build_min, min_final_score, track, signals, unavailable (dilly_core.jd_to_meridian_scores; aspirational uplift via JD_FIT_UPLIFT). Recruiter UI: "Get Meridian-fit" then "Use as filters" to pre-fill min bars and track for search.
- **GET /recruiter/candidates/:id** — Candidate detail by 16-char uid. Same auth.
- **POST /recruiter/feedback** — Recruiters submit feedback events (view, shortlist, pass, contact) per candidate. Stored in memory/recruiter_feedback.jsonl (append-only). Phase 1: log only. Phase 2: blend feedback_score (shortlists + contacts − passes, normalized 0–100) into recruiter search match_score.
- **Recruiter UI** — Dashboard routes `/recruiter` and `/recruiter/candidates/[id]`: API key entry (localStorage), search form (role + filters + sort), results list with “View profile”, candidate detail page (scores, meridian_take, email). JD-fit: optional job title, "Get Meridian-fit" button shows Smart/Grit/Build bars + track + signals; "Use as filters" fills min_smart, min_grit, min_build, track. Desktop-friendly; Meridian design tokens.
- **Matching uses Meridian profiles** — Candidate document (embedding + skill_tags) is built from full profile (identity: name, major, track, goals, career_goal, application_target, locations, minors), optional dilly_profile_txt content (“what they told Meridian”), resume, and audit. So if a student tells Meridian things not on their resume, it is on their profile and reflected in recruiter matching. Index updated after each audit and on PATCH /profile so profile-only changes are reflected.

### Parent features (Gift Meridian, Family plan, trust copy) (March 2026)
- **Trust copy for parents** — Marketing page `for-parents.html`: hero, .edu only / we don't sell data / resume stays private, Gift Meridian & Family plan CTAs, FAQ. Nav and footer "For parents" link sitewide.
- **Profile parent fields** — PATCH /profile: `parent_email`, `parent_milestone_opt_in`. Parent invite: POST /profile/parent-invite returns token and invite_link; GET /parent/summary?token= returns read-only student name, track, last_audit_at, last_scores, on_track.
- **Share report to parent** — POST /report/email-to-parent (body: audit, optional parent_email). Generates PDF, emails link to parent. Dashboard: "Email report to parent" button on report section.
- **Milestone notifications** — After /audit/v2, if profile has parent_email and parent_milestone_opt_in, send parent "first_audit" milestone email via Resend (parent_email.py + email_sender).
- **Gift Meridian** — gift_store.py: create_gift(recipient_email, months), redeem_gift(code, email). POST /auth/create-gift-checkout-session (body: recipient_email, months); Stripe payment mode; webhook creates gift. POST /auth/redeem-gift (body: code) for signed-in student.
- **Family plan** — family_store.py: create_family, add_student_to_family, add_student_by_token, get_family_by_add_token. POST /auth/create-family-checkout-session; webhook creates family with family_add_token. GET /family/add?token=; POST /family/add-student (family_add_token, student_email). Family students count as subscribed in _bearer_user.
- **Dashboard** — Settings: "Share with parent" (parent email, milestone opt-in, generate invite link); "Redeem a gift" (code + Redeem). /parent page: read-only summary when token in URL. Report section: "Email report to parent" button.
- **Env** — STRIPE_GIFT_6M_PRICE_ID, STRIPE_GIFT_12M_PRICE_ID, STRIPE_FAMILY_PRICE_ID (optional). See docs/PAYMENT_STRIPE.md.

### Resume deep-dive (Voice) (March 2026)
- **Help Meridian know you better** — Button in Meridian Voice (empty state) and on Career Center resume card. Starts a new chat; first message triggers `conversation_topic: resume_deep_dive`. Voice asks experience-specific questions (skills gained, tools/libraries/tech used, what they left off) for each role/project on the resume; works for all cohorts and majors. After each experience, Voice calls `save_experience_details`; backend appends to profile `experience_expansion` (role_label, organization, skills, tools_used, omitted). Stream/chat return `profile_updates`; frontend merges into appProfile. PATCH /profile allows `experience_expansion`; used for ATS, matching, and future audits.

### Meridian Voice rich text (March 2026)
- **Voice message formatting** — Assistant messages support bold (**text**), italic (*text*), underline (__text__), strikethrough (~~text~~), and colored tags ([blue], [gold], [white], [red], [smart], [grit], [build]). Color tags render bold + color. Use colors: blue=links/actions, gold=highlights/scores, white=emphasis, red=warnings; smart/grit/build match score dimension hues. VoiceFormattedText + VoiceAssistantRichReply in overlay and full Voice tab; system prompts instruct LLM to use sparingly.
- **Score replies in chat (March 2026)** — When the user asks about Smart/Grit/Build, the model emits `[[scores_visual]]` on its own line; the app strips it and renders `VoiceInlineScoresVisual` (mini radar + three score tiles + overall) using **live** audit numbers from `voiceScoresForChat`. Backend `_VOICE_SCORES_VIZ_INSTRUCTIONS` when context has scores; prompts use dimension tags so labels + numbers are never empty bullets.
- **Score reply reliability (March 2026)** — Backend: `_voice_authoritative_scores_lines` + `_safe_voice_score_int` (no None formatting bugs); explicit forbid empty “scores are , ,” prose; `Final score` in context blob. Client: `assistantMessageSuggestsScoreBreakdown` injects the same chart when the model omits `[[scores_visual]]` but clearly explains the three dimensions; overlay typewriter skips those messages.

### Meridian Voice onboarding (March 2026)
- **Voice "get to know you" flow** — When a student first opens Meridian Voice, Meridian asks 4–5 short questions (what they're preparing for, main career goal, target companies/industries, biggest concern, how they like advice). Answers stored in profile (voice_onboarding_answers, application_target, career_goal, target_companies, voice_biggest_concern, voice_tone). Step 2 (target companies/industries) parses comma-separated input into `target_companies` list for job matching and profile txt. GET /voice/onboarding-state returns initial message; /voice/stream and /voice/chat handle onboarding steps and return profile_updates. Frontend: fetch initial message when Voice tab opens and onboarding not done, show as first message; apply profile_updates from stream/done so voice_onboarding_done and answers stay in sync. Feeds VOICE_UNDERSTAND_USER_ROADMAP.

### Meridian Voice smart roadmap (Phases 1–5) (March 2026)
- **App feature spec for Voice** — `api/voice_app_features.json`: single source of truth for every user-facing feature (name, tab, description, when to use). Aliases (stickers -> Achievement collection, resume check -> Resume Review, etc.). Update when features ship.
- **Voice app expert** — Backend loads spec and injects "APP FEATURES" block into Voice context. System prompt: "App expert" section so Voice answers "where do I...?" and "how do I...?" from the list. No invented features or locations.
- **Intent-aware hint** — _classify_voice_intent(message) heuristics (achievements, app_how_to, tools_run, jobs, deadlines, scores_resume, general_chat). Prepend one-line hint to user content so model prefers the right section.
- **Reliability (Phase 4)** — Tool discipline: when user asks for gap scan, ready check, bullet rewrite, interview prep, jobs, call the tool and synthesize result. Hard rule: only use information from context; do not invent feature names or screens.
- **Phase 3 (Coaching depth)** — voice_tone and voice_notes (Remember this) from profile in context; first_audit_snapshot vs latest scores for progress-aware messaging; open action_items in context; system prompt "Tone and memory" so Voice matches preferred style, references notes, mentions improvement, nudges on action items.
- **Phase 5** — score_trajectory (computeScoreTrajectory) sent in context so Voice can answer "what if I do my top recs?"; when target company/school is set, lookup_company_ats and inject "Target company X uses [Workday/Greenhouse/etc]" for company-aware ATS advice. See docs/MERIDIAN_VOICE_SMART_ROADMAP.md.
- **Voice multi-step synthesis (Ideas 3 & 5)** — After tool runs: if user asked for a plan/steps/timeline, provide that after summarizing; always give one concrete next step they can do this week. Synthesis prompt updated in streaming and non-streaming paths.
- **Voice-initiated actions (Idea 6)** — New tools: create_deadline (label, date), create_action_item (text). _execute_voice_tool can return dict with text + side_effects. Stream done event includes deadline_added and action_item_added; frontend PATCHes profile for new deadline and appends to voiceActionItems.
- **Compare two audits (Idea 7)** — last_audit (scores + meridian_take from auditHistory[1]) in buildVoiceContext; _build_voice_user_content injects "Previous vs latest audit" with deltas so Voice can compare progress.
- **Stronger model when it matters (Idea 8)** — _is_voice_deep_dive expanded: "give me a plan", "am i ready", "ready for", "what's my plan", "steps to", "timeline", etc. Use strong model for these.
- **Thumbs-down feedback (Idea 9)** — ThumbsDown button next to HeartFavorite on assistant messages; sendVoiceFeedback(i, "down"). Both up and down visible; API already supported rating.
- **Voice settings in Settings only (Idea 10)** — voice_always_end_with_ask (bool) and voice_max_recommendations (1–3) in profile; Settings UI under Voice section. Injected into context so Meridian obeys; users cannot change behavior by telling Meridian in chat.
- **Screen-aware help (Idea 2 doc)** — docs/VOICE_SCREEN_AWARE_HELP.md: how to implement current_screen (frontend sends last visited tab/section; backend injects one-line hint). No code yet.
- **More power-up ideas** — docs/MERIDIAN_VOICE_SMART_ROADMAP.md: list of further ideas (proactive nudge, explain-this-bullet from Hiring, quick actions, voice memory, confidence/hedging, etc.).

### Transcript upload (optional) (March 2026)
- **Transcript upload** — Optional PDF upload in Edit Portfolio (Profile). POST /profile/transcript; parser in dilly_core/transcript_parser.py extracts GPA, BCPM, courses, honors, major/minor. Stored in profile (transcript_gpa, transcript_courses, etc.) and on disk. Read-only courses and grades in UI; user cannot edit. Delete via DELETE /profile/transcript.
- **GPA advice** — When transcript is present, Meridian shows: “Your GPA is X. We recommend not putting GPA on your resume when it’s below 3.5” or “Definitely list it.” Threshold 3.5; displayed in Transcript section.
- **Audit uses transcript GPA** — When user has transcript_gpa in profile, /audit/v2 uses it as source of truth for scoring (overrides resume-derived GPA). See docs/TRANSCRIPT_UPLOAD_SPEC.md.

### Product bar: paywall, outcome capture, retention (March 2026)
- **Paywall value + proof** — Onboarding step 12 (payment): “What you get next” line (re-audit, Am I Ready?, ATS by company); proof line “Students like you have landed PA interviews and offers after using Meridian.”
- **Outcome capture** — Optional prompt on Career Center after 14+ days since first audit: “Did you get an interview or offer?” Yes (interview/offer) → “Can we use your outcome in stories?” Profile fields: got_interview_at, got_offer_at, outcome_story_consent, outcome_prompt_dismissed_at. PATCH /profile allows these; used for proof and % active users reporting interview/offer.
- **Deadline-aware one thing to do** — “One thing to do this week” card shows soonest upcoming deadline (≤14 days) with line “Your [label] deadline is in X days — run Am I Ready? or refresh your audit” + Am I Ready? CTA.
- **Referral copy** — Settings Invite a friend: “You both get a free month when they subscribe”; clearer subcopy that reward applies when they’re paying.

### Achievements, themes, voice, referral (March 2026)
- **Achievements system** — 15 achievements (first_audit, top25_smart/grit/build, triple_threat, century_club, first_application, first_interview, ten_applications, interview_ready, ats_ready, seven_day_streak, night_owl, one_pager, cohort_champion). Stored in profile.achievements. Unlock logic in lib/achievements.ts. AchievementSticker component (circles, shadow, tilt). Manual unlock for first_application, first_interview.
- **Achievement collection page** — `/achievements` with grid of sticker badges. Locked = grayed, unlocked = full color. Pick up to 3 for share cards. Linked from Settings.
- **Profile schema / API** — PATCH allows: achievements, custom_tagline, profile_theme, voice_tone, voice_notes, share_card_achievements (3 ids), first_audit_snapshot, first_application_at, first_interview_at, referral_code.
- **Profile themes** — 5 themes (Professional, Bold, Minimal, Warm, High contrast). lib/profileThemes.ts. Theme selector in Settings and Edit Portfolio.
- **Taglines** — Professional Tagline (profile_tagline) in Edit Portfolio for recruiters. Custom Tagline (custom_tagline) in Settings for share cards, snapshot, in-app.
- **Share cards** — generateBadgeSvg and generateSnapshotSvg accept customTagline and selectedAchievements (3 slots). User picks 3 achievements for share cards.
- **Before & after** — first_audit_snapshot stored on first audit. Insights shows "Before & after" card comparing first vs latest scores.
- **Meridian noticed** — Small card in Career Center when conditions met: improved 3 audits in a row, consistent calendar (3+ deadlines), first Top 25%. Track which shown to avoid repeat. lib/meridianNoticed.ts.
- **Job search checklist — per-step Ask Dilly (March 2026)** — Each checklist row: **`VoiceAvatar`** (`xs`) at the end of the step title (button + `aria-label`) → `openVoiceFromScreen("get_hired_job_checklist", prompt, "Job checklist")` with phase title, step title, hint, and checked state in the prompt. Bottom “what to do next” uses the same screen id. Backend: `voice_helpers.py` screen hint `get_hired_job_checklist`; `voice_app_features.json` feature row. **Stage-aware copy (March 2026):** `lib/jobSearchChecklist.ts` — `deriveJobSearchChecklistStage` from habits milestones / applied counts / proactive interview funnel / audit final_score → exploring | applying | interviewing; phase titles, blurbs, and per-row hints; same checkbox ids for localStorage.
- **Meridian noticed (party popper glyph, March 2026)** — Lead visual is **`/meridian-noticed-glyph.png`** (user-provided party popper) for all noticed variants; per-card emojis removed from `DillyNoticedCard`. Dismiss **×** on **48×48px** tap target, **~28px** glyph. `page.tsx`, `dillyNoticed.ts`.
- **Voice tone** — Settings/Voice: 5 options (Encouraging, Direct, Casual, Professional, Coach). Stored in profile.voice_tone.
- **Remember this** — Thought bubble button in Voice input. Opens "Notes for Meridian to remember". Stored in profile.voice_notes.
- **Voice greeting variations** — Rotate by context: first visit (no audit), after apply, after audit, urgent deadline, standard.
- **Invite a friend** — referral_code per user. Shareable link /?ref=code or /invite/[code]. Settings: "Invite a friend" with copy link. docs/REFERRAL_LOGIC.md for Stripe integration (give 1 free month, get 1 free month).
- **Six-second profile** — profile_tagline only (recruiter-facing). custom_tagline and achievements NOT on six-second profile.

### Jobs for you (March 2026)
- **Job scraper** — Ethical/legal sources only: Greenhouse Job Board API (public, no auth), USAJobs API (free key). `scripts/job_scraper/` and `run_job_scraper.py`. Respects robots.txt, rate limits. SQLite storage at `meridian_jobs.db`. **Premium:** Only scrapes companies in `knowledge/company_hiring_criteria.json` (Stripe, Figma for Greenhouse; USAJobs for federal).
- **Company hiring criteria** — `knowledge/company_hiring_criteria.json` + `api/company_criteria.py`. We only list jobs from companies we have verified, high-confidence hiring guidelines for. Apply those criteria in the LLM match prompt. If we can't confidently do this, we don't list that company's jobs. Meridian is premium.
- **Job matching** — Rule-based filtering + LLM for match % and personalized "why" bullets. Uses profile, resume, audit. **Applies company-specific hiring criteria** when scoring. `api/job_matching.py`. GET `/jobs/recommended` returns top 15 with match_pct and why_bullets.
- **Jobs in Career Center** — "Jobs for you" section with top 5 preview, "Show more" opens full panel with all jobs and "Load more". Jobs quick link in grid.
- **Meridian Voice jobs tool** — `get_recommended_jobs` tool: only when user asks, only high matches (80%+), explains why. No proactive job suggestions.
- **Jobs panel overhaul** — Panel keeps bottom nav visible (bottom: 80px). Compact list cards; tap opens full-screen detail panel with back button. Copy: "Meridian-verified jobs for you", "Run through your resume." Per-job actions: Why am I a fit?, Ask Meridian about this role, Bookmark. Collections: users create collections; bookmark adds to General bookmarks or a collection. Context-aware empty states: no jobs, low matches, add more to resume.
- **Jobs under Get Hired** — Primary UI is **Get Hired → Jobs** (`JobsPanel`); **`/jobs`** redirects to **`/?tab=resources&view=jobs`**. Links from Center, companies, and score use that deep link. Voice prompts from Jobs (Why fit?, Ask Meridian) still use sessionStorage handoff.
- **Job location filtering** — On first Jobs visit, user sets where they're open to working: add cities (type + select from list) or choose "Open to anywhere" → Domestic (US) or International. Profile fields: `job_locations` (string[]), `job_location_scope` ("specific" | "domestic" | "international"). Backend filters jobs to near school city + chosen cities; Remote always included. School config extended with `city`/`state` for UTampa (Tampa, FL). CityChipsInput component; JOB_CITIES_LIST for autocomplete.
- **Bookmarks & collections view** — Jobs page has Jobs | Bookmarks toggle in header. Bookmarks view shows General bookmarks + custom collections; each collection lists saved jobs with title, company, match %, Apply button, and remove-bookmark. Full job data stored in localStorage when bookmarking so bookmarks persist and display even when job is no longer in recommended list.
- **Company pages** — Dedicated pages per verified employer. List at `/companies` (all companies with verified criteria; link from Jobs page "Companies we know"). Detail at `/companies/[slug]`: score bar (required Smart/Grit/Build + your scores vs bar), what they look for (criteria), open roles (jobs at that company with match tier), certs that help (track-filtered from certifications hub), recruiter advice (from memory/company_recruiter_advice.json when recruiters give Meridian users tips). API: GET `/companies`, GET `/companies/{slug}` (auth) returns company, your_scores, jobs, recruiter_advice, certifications_track.
- **Inline bookmark on job cards** — BookmarkIconButton (red variant, framer-motion) on each job card in the Jobs list.
- **Confetti on audit submit** — Short confetti burst when user submits a new audit (fireConfettiSubmit in `components/ui/confetti.tsx`). Confetti component and ConfettiButton available for reuse.
- **Review hub as full page** — Review tab home is now a real hub: hero, at-a-glance (score, last audited date, one-line summary), dimension mini-bars (Smart/Grit/Build), top actions from audit, proactive nudge, then three high-power actions (Full report, Insights, Run new audit) with short descriptions. No-audit state: "What you get" bullets + Run your first audit CTA.
- **ATS Readiness page overhaul (March 2026)** — Full mobile-first redesign of `/ats`: hero score block (large score, readiness pill, one-line summary), header tagline "See what recruiters' systems actually parse", prominent "Scan my resume" CTA with school-theme gradient, loading/error states with clear copy. Post-scan: 4-column sub-stats (Checks, Fields, Critical, Sections), wrap-friendly tab bar, design-token cards (rounded-xl, var(--m-surface), var(--m-border)). Overview: score-over-time chart when 2+ scans, sections/skills cards. Checklist: "Format & structure checks" with voice CTA on failed items. Copy and hierarchy tuned for phone-first ATS experience.
- **LoaderOne (unified loading indicator)** — Animated 3-dot loader in `components/ui/loader-one.tsx`. Used everywhere Meridian shows loading: auth, jobs, ATS scan (Scanning, Analyzing keyword density, Generating rewrites, Simulating vendors, etc.), Voice typing dots, bullet rewriter, progress explainer, profile page, Suspense fallbacks. Theme-aware via `color` prop (theme.primary).
- **Meridian Voice loading (AIInputWithLoading pattern)** — Voice prompt uses useAutoResizeTextarea hook, spinner in send button when loading, status text below ("AI is thinking…" / "Ready to submit!"), input disabled during loading. Textarea component and useAutoResizeTextarea hook added.
- **Meridian Voice tabs** — Multiple chats in a tab bar (Radix Tabs). Each conversation is a tab; click to switch, "+" to add new chat. Double-click tab to rename, hover for delete. Replaces list view when user has conversations.
- **Meridian Voice notification banner** — Banner component (`components/ui/banner.tsx`) with variants (default, success, warning, info, premium, gradient). Replaces VoiceNotificationCard in MeridianVoiceNotificationContext. Shows when: new audit completes, new deadline added (calendar or Voice-detected), goal updated. Info variant, MessageCircle icon, closable, auto-hide 6s.
- **Animated state icons** — 12 morphing icons (Success, Menu, PlayPause, Lock, Copied, Notification, Heart, Download, Send, Toggle, Eye, Volume) in `components/ui/animated-state-icons.tsx`. CopiedIcon in DimensionBreakdown copy button; SendIcon in Meridian Voice send button. Demo at `/demo` (linked from Settings). Users can bookmark without opening the job; click opens collection modal (General, custom collections, or create new). Animated fill + particle burst on save.
- **App Store button** — Reusable “Download on the App Store” component in `components/ui/app-store-button.tsx`. Uses existing Button/buttonVariants and cn; optional `href` for link (e.g. App Store URL). Demo at `/app-store-demo`. Integration notes in `dashboard/docs/APP_STORE_BUTTON_INTEGRATION.md`.
- **Play Store button** — Reusable "GET IT ON Google Play" component in `components/ui/play-store-button.tsx`. Same pattern as App Store (optional `href`). Demo at `/app-store-demo` alongside App Store button.

### Career Center reorganization
- **Insights tab** — New tab for progress, milestones, playbook, quick tips, progress-over-time chart, momentum, audit history, target firms, career tools. Career Center slimmed to command-center essentials: goal, urgent deadline, compact profile, scores, one thing to do, your next move, deadlines summary, quick links.
- **Do these 3 next** — Prioritized actions from audit (red flags, line edits, actions). Spec in `docs/DO_THESE_3_NEXT_SPEC.md`. Client-side `getTopThreeActions` in meridianUtils.
- **Am I Ready? (job-fit check)** — Career tool in Insights: user enters company/role, POST `/ready-check` returns Ready/Not yet/Stretch + gaps. Interactive card with verdict and actionable gaps.
- **ATS keyword check** — Career tool in Insights: user pastes job description, POST `/ats-check` compares against audit context, returns missing keywords and suggestions. Uses LLM to infer gaps from findings + evidence.
- **ATS Readiness (full analysis)** — Comprehensive ATS analysis engine (`dilly_core/ats_analysis.py`). **Now in Career Center** (Center tab); moved from Insights so ATS scan lives with the main command center. 0–100 ATS score, readiness status (Ready/Needs Work/At Risk), 5-tab UI (Overview, What ATS Sees, Checklist, Issues, Keywords). Detects: multi-column layouts, tables, non-standard headers, contact placement, encoding issues, graphic skill ratings, date inconsistencies, missing sections (track-specific), weak action verbs, unquantified bullets. "What ATS Sees" shows exactly what an ATS extracts: name, email, phone, LinkedIn, location, university, degree, major, GPA, graduation, experience entries (company/role/dates/bullets), skills list. 13-point formatting checklist with auto-detection. JD-specific keyword gap analysis via `/ats-check`. ATS-critical issues also surface as red flags in the main audit. Endpoints: POST `/ats-analysis` (file upload), POST `/ats-analysis-from-audit` (text, no upload). Goes far beyond Quinncia's four-ATS simulation with transparency, JD-specific analysis, and actionable fixes.
- **ATS Keyword Density & Placement** — New module (`dilly_core/ats_keywords.py`) and endpoint (`POST /ats-keyword-density`). Extracts every meaningful keyword from the resume and maps exactly where it appears (summary, experience, skills, education, projects). Each keyword is classified as "contextual" (used in an experience bullet/sentence, weighted 2–3x by ATS) or "bare" (skills list only, weighted 0.4x). Per-keyword placement score (0–1.0) with verdict (strong/adequate/weak) and actionable tips. Multi-section bonus: keywords in both experience AND skills get a boost. When a JD is provided, matches against must-have vs nice-to-have requirements with per-keyword placement quality. Tech-term extraction covers 80+ tools/frameworks/languages via regex (no LLM needed). JD extraction uses negative lookaheads (Java≠JavaScript) and compound-term detection (machine learning, full-stack, CI/CD). Keywords tab revamped: density score card, keyword placement map with expandable detail, JD match section with match %, must-have/nice-to-have breakdown, missing/weak/strong categorization, and AI suggestions from `/ats-check`. Auto-fetched when ATS analysis runs.
- **Per-ATS Vendor Simulation** — New module (`dilly_core/ats_vendors.py`) and endpoint (`POST /ats-vendor-sim`). Simulates how four major ATS platforms (Workday, Greenhouse, iCIMS, Lever) would each parse and score the same resume differently. Each vendor has researched parsing profiles based on real behavior: Workday (proprietary strict parser, Fortune 500, zero tolerance for creative layouts, knockout screening question awareness), Greenhouse (API-based parser, 94% parse rate, scorecard-driven, skills tagging for pipeline filtering), iCIMS (Textkernel/Sovren NLP engine, strict on section headers, DOCX > PDF, stores profiles indefinitely, skills taxonomy classification), Lever (modern parser, most forgiving, good at context inference, culture-fit emphasis). 40+ signals extracted per resume. Per-vendor output includes: 0-100 score, pass/risky/fail verdict, what breaks (vendor-specific), what parses cleanly, vendor-specific tips with severity, and well-known companies using that ATS. Dashboard "Vendors" tab: company-to-ATS search bar ("Type a company, we'll tell you their ATS"), 2×2 score card grid with color-coded bars and "Your target" highlight, best/worst comparison, expandable detail per vendor with tips/breaks/works, and universal tips. Auto-fetched in parallel with keyword density when ATS scan runs. No LLM needed — pure rule-based from existing ATS analysis signals.
- **Company-to-ATS Lookup** — New module (`dilly_core/ats_company_lookup.py`) and endpoint (`GET /ats-company-lookup`). Database of 100+ companies mapped to their ATS vendor (Workday, Greenhouse, iCIMS, Lever). Fuzzy matching with alias support ("AWS" → Amazon → Workday, "FB" → Meta → Workday). Student types "Amazon" in the Vendors tab → auto-identifies Workday → highlights that vendor's score card with "Your target" badge → shows "Amazon uses Workday, your score is X." Integrated into `/ats-vendor-sim` via optional `target_company` parameter. Covers Fortune 500 (Workday), tech startups (Greenhouse), retail/healthcare/airlines (iCIMS), and modern tech companies (Lever).
- **"Fix It For Me" — ATS Bullet Rewrites** — New module (`dilly_core/ats_rewrites.py`) and endpoint (`POST /ats-rewrite`). Automatically rewrites ATS-flagged resume bullets with: (1) weak verb replacement with smart gerund resolution ("Responsible for managing..." → "Managed..."), 38+ weak phrases mapped to strong verbs; (2) filler phrase removal (14 patterns: "in order to" → "to", "on a daily basis" → "daily", etc.); (3) quantification placeholders placed at end of bullet ("[by X%]", "[add team size]"); (4) present→past tense consistency; (5) proper noun capitalization preservation (Python, JavaScript, AWS, etc.); (6) gerund-to-infinitive grammar fixes when filler removal creates "to [gerund]" patterns. Two modes: rule-based (instant, no API cost) and LLM-enhanced (uses gpt-4o-mini for semantic rewrites when available, falls back gracefully). "Fix It" tab in ATS Readiness section: original shown with strikethrough vs rewritten with highlighted `[placeholders]` in amber, per-bullet change tags, "AI-enhanced" badge for LLM rewrites, per-bullet copy and "Copy All" buttons. Issues tab shows inline "Fix it for me" buttons on issues that have matching rewrites, linking directly to the Fix It tab. Differentiator: Quinncia flags problems; Meridian fixes them.
- **Auto-run ATS scan** — ATS scan (analysis, keyword density, vendor simulation, rewrites) now fires automatically when an audit completes. No manual "Run ATS scan" button click needed — scores and insights appear instantly in the ATS Readiness section. Button remains for re-scanning or scanning older audits from history.
- **Contextual Keyword Injection** — New module (`dilly_core/ats_keyword_inject.py`) and endpoint (`POST /ats-keyword-inject`). Goes beyond "you're missing Python" to show *exactly which bullet* to add it to and *exactly how*. For each weak/missing/bare-only keyword: identifies the most semantically related experience bullet using affinity scoring (e.g., "python" → bullets mentioning "data", "automat", "pipeline"), generates a concrete rewrite with the keyword naturally injected (strategy-aware: tech tools get "using X", methodologies get "through X", soft skills get "demonstrating X"), and highlights the injected keyword in blue. Rule-based injection with LLM enhancement for low-confidence rewrites. Priority system: missing keywords (red, P1), bare-list-only keywords (amber, P2), weak placement (grey, P3). Before/after diff view with one-click copy. Auto-fires after keyword density analysis completes. Capped at 10 highest-impact suggestions.
- **Section reorder suggestions (per-vendor)** — New module (`dilly_core/ats_section_reorder.py`). Each ATS vendor has a preferred section order (Workday: contact → summary → experience → education → skills; Greenhouse/Lever: experience → projects → education → skills). When the resume's section order differs, the Vendors tab shows per-vendor "Section order for [Vendor]" with current vs suggested order. Displayed in expanded vendor detail. Integrated into `POST /ats-vendor-sim` response as `section_reorder` per vendor.
- **ATS score tracking over time** — Per-user `ats_scores.json` in profile folder. `POST /ats-score/record` called when ATS scan completes; `GET /ats-score/history` returns scores (ts, score, audit_id). Overview tab shows "ATS score over time" line chart when 2+ scans exist; single-scan shows "Your first scan: X" with prompt to run another audit for trend.
- **Fix with Meridian Voice (ATS)** — "Fix with Meridian Voice →" buttons throughout ATS: (1) Checklist tab — each failed item; (2) Issues tab — each ATS issue; (3) What ATS sees — extracted fields that are partial/missing; (4) Fix It tab — each rewrite for further refinement; (5) Keywords tab — when density score < 70% or when a keyword has weak/adequate placement. Each opens Meridian Voice, creates a new chat, and auto-sends a contextual prompt to help fix that specific issue.
- **ATS Readiness dedicated page** — Full ATS flow moved to `/ats`. Auth check (redirect if no token or not subscribed). Fetches latest audit via GET /audit/history then GET /audit/history/{id}. "Run ATS scan" runs analysis, keyword density, vendor sim, rewrites, keyword inject (same APIs as before). Tabs: Overview, What ATS Sees, Checklist, Issues, Fix It, Keywords, Vendors. Score history chart, JD match, company lookup. Career Center shows a compact ATS CTA card: when user has an audit, "Run ATS scan" links to /ats; when no audit, "Run a resume audit first" + Go to Hiring tab. No "Ask Meridian" on ATS page (user can open Voice from home). Mobile-optimized (max-w-[375px], min-h 44px targets, truncation).
- **Voice buttons start new chat with contextual prompt** — All buttons that redirect to Meridian Voice now clear the current conversation, start a fresh chat, and auto-send a prompt that matches the button's purpose.
- **Meridian Voice prompt box (ai-prompt-box style)** — Chat input field restyled to match ai-prompt-box: rounded-3xl container, dark bg (#1F2023), frosted shadow, auto-resize textarea, white send button when has content, bullet rewriter toggle as left action inside the box. Examples: "Fix weakest bullet" → "Rewrite my weakest bullet..."; "Prep with Voice" → "I have [deadline] coming up..."; "Ask Meridian Voice how to improve" → "How can I improve my resume based on my scores?"; Interview Prep, Gap Analysis, Cover Letter Lines, Score trajectory, Interview coach, Jobs page prompts. SessionStorage handoff from Jobs page also clears chat before sending.
- **Meridian Voice avatar** — User's profile photo shown as their avatar next to their messages in the chat. Fallback to first letter of name/email when no photo. Avatar button in Voice header and bottom bar opens photo picker to add/change avatar (uses existing profile photo upload). Same photo used across app (profile, Voice chat).
- **Default user avatar (owl)** — When user has no profile photo, owl avatar shown instead of first letter. Used in: Career Center profile header, profile edit placeholder, Meridian Voice chat bubbles. Images in `public/default-avatars/` (owl.png + user-alt-1/2/3).
- **Profile photo persists across refresh and sign-in** — Profile photo cached in localStorage (128×128 thumbnail, keyed by email). On load, shows cached version immediately, then fetches full-res from backend. Survives page refresh and sign-out/sign-in cycles.
- **Meridian Voice avatar in edit profile** — Voice avatar picker added to Edit your portfolio section. Users can change the Meridian AI avatar (shown in Voice chat) from the profile edit form alongside profile photo.
- **Meridian Voice baked in everywhere** — Voice avatar (profile photo) integrated across the app: header "Ask Meridian" button, Center tab (Prep with Voice, Fix weakest bullet, Meridian Voice CTA card), Hiring tab (Ask Meridian button in report header), Insights tool cards (Interview Prep, Gap Analysis, Cover Letter Lines), Calendar (Prep with Voice on urgent banner and deadline list), Jobs page (Why am I a fit?, Ask Meridian about this role, Ask Meridian Voice), bottom nav (Voice tab shows user avatar when set). VoiceAvatar (display-only) and VoiceAvatarButton (clickable) components; avatar persisted per user in localStorage.
- **Profile photo frames** — Profile photos show achievement frames when user hits Top 5%, Top 10%, or Top 25% in any dimension (from peer_percentiles). Ring color: amber (top5), emerald (top10), sky (top25). Badge label on md/lg sizes. ProfilePhotoWithFrame component; getProfileFrame() in lib/profileFrame.ts.
- **Mascot reactions (Voice chat)** — Meridian avatar in Voice chat reacts to progress: celebrating (any dim Top 25%), happy (scores improved), encouraging (close to Top 25%). CSS animations: bounce, pulse, celebrate. MascotAvatar component with getMascotMood().
- **Easter eggs** — Century Club (score 100), Triple threat (all dims Top 25%), One-pager perfection (1-page resume), Avatar tap 7x (tap mascot 7 times in Voice empty state), Night owl (first Voice visit at midnight). lib/easterEggs.ts; toast + optional confetti/sound.
- **Sound design** — Web Audio API tones for audit complete, message sent, badge unlock, celebration. lib/sounds.ts. Settings toggle "Sound effects" (meridian_sound_enabled in localStorage).

### Marketing website
- **Professional landing page** — `projects/meridian/website/`: hero, Smart/Grit/Build explainer, features, how it works, tracks, trust (.edu only, no data selling), pricing ($9.99/mo), CTAs. Static HTML (no build). Sells to college students.
- **Marketing site enhancements** — Stats bar (500+ audited, Top 10% Grit, etc.), school badge (Meridian for Spartans), testimonials, before/after snippet, launch pricing badge, urgency copy, comparison table (Meridian vs generic tools), FAQ, security badges, track quiz, radar preview, sample audit finding, video placeholder, student story, "Why we built this," sticky CTA on scroll, exit-intent popup, risk reversal (cancel anytime).
- **Track page overhaul** — All 11 track pages (Pre-Health, Pre-Law, Tech, Finance, Consulting, Business, Science, Communications, Education, Arts, Humanities) redesigned as "holy grail" pages: hero with track badge and "The only resume tool built for [track]," stats bar, "Why Meridian is the [track] secret weapon" (4 cards), "What we score for [track]" (Smart/Grit/Build), "Common gaps we fix" (3–4 critical gaps with fixes), schools/companies benchmarks, majors, track-specific testimonial, strong CTA.
- **Track page personality** — All 11 tracks redesigned with distinct field vibes: Arts (portfolio-first, DM Serif, warm accent); Tech (terminal-style, JetBrains Mono, cyan, FAANG grid); Pre-Health (clinical, checklist-first, teal); Pre-Law (formal, Cormorant Garamond, gold, schools-first); Finance (builder, green, firms-first); Consulting (corporate, blue, MBB grid); Business (purple, campaign metrics); Science (lab tiles, emerald, programs-first); Communications (orange, portfolio/reach); Education (teal, checklist, certification-first); Humanities (scholarly, Cormorant, amber). Tracks grid updated with per-track icons, taglines, and accent colors on hover.
- **App preview on homepage** — "More of what you get in the app" section: shareable Meridian card (brand, tagline, scores, track, footer), Top X% peer percentile block, "Cited from your resume" evidence block, Progress to Next Tier bars, sample recommendation with Copy affordance, red flags / assessment findings, Meridian's take in score demo, "Your next move" playbook snippet, bottom nav tab bar mockup. Radar and score demo unified to 72/65/58.
- **Marketing site power-up** — Domain: meridian-careers.com (and .org). Social proof: "Launching at UTampa · Expanding to more campuses soon" + partner logos. Try-before-signup: paste bullet, get instant improvement demo (pattern matching + copy). SEO: canonical, Open Graph, Twitter meta, schema.org SoftwareApplication + FAQPage. Lead capture: "Your school not on the list?" email waitlist. Shareable score card section with real copy (Smart 72, Grit 65, Build 58, Meridian take). Urgency: launch pricing badge, limited spots copy. Trust: "How we score" (4 cards), privacy section. Performance: no images yet; lazy loading ready. Analytics: data-cta attributes, analytics.js for gtag/plausible funnel tracking. PWA: manifest.json. Copy: sharper CTAs ("Run your first audit" vs "Get Started"). Comparison table: "Limited"/"No" instead of ✗.
- **More app in the website** — "See the app in action" section: Career Center mock (goal, profile, your numbers, Do these 3 next, quick links), full app shell with 5-tab nav (Center, Resume, Insights, Calendar, Voice), upload zone mock, dimension selector (click Smart/Grit/Build to switch cited evidence), share options (Download PDF, Copy summary, Copy Top %), progress block (last vs this + "See why your scores changed"), line edits with copy buttons, Insights tools preview (Am I Ready?, ATS keyword check). Features page expanded with Career Center mock, upload zone, and Insights tools.
- **Website sellability overhaul** — Hero: "Stop getting ghosted. Get interviews."; school badge "Built at UTampa · Trusted by UTampa Career Center"; "What happens next" under CTA (Verify .edu → Upload → Get scores); "Start free" on all CTAs. Stats: "4 PA program interviews after Meridian". Outcome lines after diff-section. Pricing: "First audit free", "7-day guarantee", career coach comparison ($200+/hr vs $9.99/mo). How It Works: visual flow (Verify → Upload → Scores → Fix), video placeholder with instructions. About: PA story elevated to top, "Built at UTampa with Career Center". FAQ: 3 new objection-handlers (little experience, internships/grad school, school not UTampa). OG image meta, favicon, launch pricing "through April 30", mobile polish for app-in-action grid.
- **Logo on website** — Dilly logo (dilly-logo.png) in navbar and footer across all pages: index, features, pricing, how-it-works, about, quiz, tracks, and all 11 track pages.
- **Website updated for new app features** — Index: product preview subline (ATS scan, jobs, Voice), stats bar (4 ATS vendors), pricing bullets (ATS Readiness, Jobs for you, shareable profile), Voice demo chip (Am I ready for Goldman?). Features: new cards for ATS Readiness, Jobs for you, Six-second profile, Achievements & share cards; Meridian Voice copy (gap scan, ready check, rewrites, interview prep, multi-tab, tone, Remember this); 5-tab nav mock; ATS + Jobs preview cards. Pricing: full feature list (Voice tools, ATS, Jobs, shareable profile, achievements); For recruiters nav link. Meta descriptions updated.

### Cohort-specific auditing
- **Cohort-specific prompt blocks** — Each track (Tech, Pre-Health, Pre-Law, Communications, Science, Business, Education, Arts, Humanities) has a dedicated block in the LLM system prompt defining what Smart, Grit, and Build mean for that cohort and how “top hiring managers and job consultants” in that field advise. No generic template; language and priorities are specialized per cohort.
- **Base instruction** — System prompt includes: “Smart, Grit, Build, and all advice MUST be unique to the candidate’s cohort.”

### Honors and missing fields
- **Honors: “Not honors”** — When no honors are detected, structured resume shows “Honors: Not honors” instead of “N/A” (in `dilly_core/structured_resume.py`).
- **Recommendations for missing date/location** — When an experience, education, or project entry is missing date and/or location (or other expected detail), the LLM must add an action recommendation that (1) tells the candidate to include the missing field(s) and (2) cites the specific line/section. Dashboard shows the cited line in a quoted block for action recs that have `current_line`.

### Turn advice into action (2)
- **Copy suggested line** — “Copy” button next to each line-edit suggested line; copies the suggested line to the clipboard.
- **Re-audit / version (Progress)** — Last audit is stored in `localStorage`. When the user runs a new audit, a “Progress” block shows “Last time: Smart X, Grit Y, Build Z” vs “This time: …”.

- **Progress explainer (why scores changed)** — When both last and current audit exist, the app calls `POST /audit/explain-delta` with both audit objects. The backend uses an LLM in the voice of a top-level job consultant (hundreds an hour, "consultant in their pocket") to explain why Smart, Grit, and Build changed. The explainer is shown under the Progress grid ("Why your scores changed"). If the LLM is unavailable, a short fallback explainer is returned from the API.
- **Multiple recommendations of each type** — The auditor prompt asks for multiple generic, multiple line_edit, and multiple action recommendations when applicable (e.g. 2–4 line_edits when multiple bullets deserve rewrites; 2–4 action recs when there are multiple next steps or multiple entries missing date/location). No padding: only add recs that are specific and warranted. Voice: "top-level consultant in their pocket." Parser cap increased from 8 to 15 so rich recommendation sets are not truncated.

### Trust and consistency (4)
- **Score stability (content-hash cache)** — Backend hashes the normalized resume text sent to the auditor. If the same content is audited again within 24 hours, the cached audit result is returned (no second LLM call). Cache is capped at 500 entries with pruning. Same resume in → same scores out.
- **Calibration note** — Under the radar chart: “Scores are based only on what’s on your resume (Meridian Truth Standard). We don’t invent facts.”

### Data and product moat (5)
- **Structured audit log** — Each successful audit appends one anonymized line to `memory/meridian_audit_log.jsonl` (track, smart, grit, build, final, ts, use_for_fewshot, optional cohort_id). No PII.
- **Few-shot export script** — `projects/meridian/scripts/export_fewshot_candidates.py` reads the audit log, filters by `--min-final` and/or `--use-for-fewshot`, outputs by track or raw entries for curating few-shot examples.
- **Campus / career-center batch** — `POST /audit/batch` accepts 1–100 PDF/DOCX files and optional `cohort_id`; runs audit on each; returns per-file results and a cohort report (totals, by-track counts and averages, overall averages).

### Friction and shareability (6)
- **Export report PDF** — `POST /report/pdf` with audit JSON generates a PDF (name, track, major, scores, findings, evidence, recommendations) and stores it for 7 days behind a signed link (see below). Dashboard “Download report (PDF)” requests the report, then fetches the signed URL to download the file.
- **Signed link for report (7 days)** — When a report is generated, the PDF is saved under `memory/meridian_reports/{token}.pdf` with an unguessable token. POST returns JSON: `{ "url": ".../report/pdf/TOKEN", "expires_in_days": 7 }`. `GET /report/pdf/{token}` serves the PDF if the file exists and is not older than 7 days; otherwise 404. Old files are removed on cleanup. Dashboard shows “Copy share link (7 days)” after generating a report.
- **One-line summary** — Dashboard shows a “One-line summary” (from optional `meridian_take` if present, else derived from scores and lowest dimension + recommendation). “Copy one-line summary” copies it to the clipboard.

### Peer benchmarking (vs cohort + tier-1 bar)
- **Peer percentiles with fallback** — Percentiles vs same-track cohort (training_data.json + meridian_audit_log.jsonl). When same-track has &lt; 3 peers, fall back to all-track cohort so “Top X%” still shows. API returns `peer_percentiles`, `peer_cohort_n`, `peer_fallback_all`.
- **Tier-1 benchmark copy** — API compares each dimension to track tier-1 bar from benchmarks.json; returns `benchmark_copy` (e.g. “Below bar (85)”, “At/above bar (80)”). Dashboard and PDF report show per-dimension bar status.

### Input and UX
- **No paste-as-text** — Only PDF and DOCX uploads are supported. There is no “paste plain text” resume option.
- **Action/generic recs with current_line** — Backend passes through `current_line` for action and generic recommendations when the LLM provides it. Dashboard displays the cited line in a quoted block for those recs.

### Parsing regression (Phase 1)
- **Regression set** — `projects/meridian/scripts/fixtures/parsing_regression_expected.json` holds expected name, email, major, GPA for 10 resumes. Update when parser output is intentionally changed.
- **Regression runner** — `projects/meridian/scripts/parsing_regression.py` runs the parser on each fixture, asserts parsed vs expected, exits 1 on any mismatch. Run from workspace root (with venv): `python projects/meridian/scripts/parsing_regression.py --sources assets/resumes`. Use in CI/pre-commit to gate parser changes.

### Score-based anomaly (Phase 1.2)
- **Anomaly detection** — `dilly_core/anomaly.py` exposes `get_red_flags(gpa, scores, track)` returning score-based red-flag dicts (e.g. high GPA/smart + build ≤ 10 → "High-Risk / Low-Velocity"; high smart + low grit → leadership gap; all scores very low → incomplete resume). API merges these with content red flags from `run_red_flags(parsed_text)`; dashboard and PDF report show the combined list in the existing Red flags section.

### Cohort + benchmark on dashboard
- **Your cohort** — Dashboard shows a “Your cohort” card with the detected track and short definitions of Smart, Grit, and Build for that cohort (from `dashboard/src/lib/trackDefinitions.ts`). Peer benchmarking (percentiles + tier-1 bar copy) appears below. Users see what we score for in their field and how they compare.

### Evidence traceability
- **Cited from your resume** — When a user clicks a dimension (Smart/Grit/Build), the evidence that drove that score is shown in a blockquote labeled “Cited from your resume” so it’s clear what we’re pointing to. Sets up for future backend-supplied exact quotes if the LLM or a pass adds them.

### Resume length (1-page) detection
- **Over-one-page red flag** — In `dilly_core/red_flags.py`, when parsed resume word count exceeds ~480 words we add a red flag: hiring managers and consultants often prefer one page for early-career roles; suggest trimming or tightening so the best evidence fits on one page.

### Pricing
- **Subscription: $9.99/month** — Target price point for college students (single-digit, “under $10”). Optional annual plan (e.g. 2 months free) for higher LTV when paywall is implemented.

### Auth and paywall enforcement
- **Server-side subscription check** — POST /audit/v2, POST /report/pdf, and POST /audit/explain-delta require Authorization: Bearer &lt;session_token&gt; and a subscribed user. 401 "Sign in to run audits." when no/invalid token; 403 "Subscribe to run audits. $9.99/month." when not subscribed. Dashboard sends token on audit and explain-delta; on 401 clears token and shows login.

### Product names (Meridian Hiring Manager, Meridian Voice, Meridian Career Center)
- **Meridian Hiring Manager** — The audit persona: top-level hiring manager + job consultant + career advisor in one. All resume feedback (red flags, recommendations, evidence, anomaly messages) uses this voice. See `dilly_core/MERIDIAN_HIRING_MANAGER.md`.
- **Meridian Voice** — The name of the in-app chatbot. To be built; users will talk to Meridian Voice for career advice and guidance.
- **Meridian Career Center** — A section of the app: a full career center on your phone. Dashboard that integrates Meridian Voice (the chatbot) so it feels like a powerful career center in your pocket. Tagline: *Meridian: A career center open 24/7.* Feature set and prioritization: `docs/MERIDIAN_CAREER_CENTER_FEATURES.md`. To be built.

### Goal banner & shareable badges (March 2026)
- **Goal banner on Career Center** — Banner at top of Career Center shows career_goal (free-text) or first goal from goals array. "Set a goal" form when neither is set. Done button clears career_goal.
- **Share to LinkedIn** — Next to Download Badge: downloads badge SVG, copies caption (Top % or one-line summary + " · Meridian Careers · meridian-careers.com") to clipboard, opens LinkedIn feed in new tab for manual paste.
- **Fully anonymous leaderboard** — Track leaderboard returns rank + score only (no names). UI shows #rank and score.
- **Cover letter lines (human tone)** — Generate-lines prompt rewritten: mix of direct and narrative, avoid "I am X and I bring Y." Root lines in evidence, evidence_quotes, recommendations. Pass more context (findings, line edits) for concrete project/role details.

### Edit Portfolio (March 2026)
- **Profile photo** — Add, replace, and remove profile photos. POST /profile/photo (multipart), GET /profile/photo, DELETE /profile/photo. Photo shown in Career Center header and in Edit Portfolio. **Zoom & crop** — Before upload, user can zoom in/out, drag to reposition, and crop to a circular area. Uses react-easy-crop.
- **Edit Portfolio** — Clicking the pencil icon opens a full "Edit your portfolio" panel: profile photo (add/change/remove), name, major(s) (multiple), minor(s) (multiple), pre-professional track. Save persists all fields.

### Meridian Voice per-user isolation (March 2026)
- **Voice chats scoped per user** — Voice conversations, action items, company target, and memory are stored in localStorage under user-specific keys (`meridian_voice_convos_${email}`, etc.). Each user sees only their own chats. On logout, voice state is cleared so the next user doesn't see the previous user's data.

### High-impact surprise (Phase 1) (March 2026)
- **Preview as recruiter** — "See what recruiters see" in Career Center opens `/p/[slug]?preview=1`; banner on public profile when `preview=1`: "This is what recruiters see when they click your link."
- **One superpower sentence** — After every audit, "Your strongest signal to recruiters right now is [Dimension]—[evidence]." Derived in API from scores + evidence; shown in Career Center and Hiring/Insights report. Fallback derivation in frontend for older audits.
- **First Voice message proves we read resume** — In a new Voice conversation, first reply must reference one specific thing from their resume or audit and give one concrete next step (system prompt + injected hint when history is empty).
- **Audit leads with a win** — LLM auditor meridian_take is strength-first: "Here's what's working: [win]. The one change that would matter most: [fix]." Never lead with what's wrong. See docs/HIGH_IMPACT_IMPLEMENTATION_PLAN.md and HIGH_IMPACT_SURPRISE_IDEAS.md.

### Six-second profile (March 2026)
- **Shareable profile page** — `/p/[slug]` shows a recruiter-facing "Six-second profile": name, tagline, photo, one-line hook, Smart/Grit/Build scores, key findings, career goal, optional bio. Designed so recruiters can absorb everything in 6 seconds. Shareable link; user adds to resume footer. **Auto-builds and updates** whenever profile or audit changes: backend merges profile + latest audit on each request (no cache); first audit backfills profile.name from candidate_name if missing; app copy explains "Updates automatically when you edit your profile or run a new audit."
- **Add to your resume** — Career Center section with copyable line "Full profile: [url]" and "View my profile" button. Users put the link at the bottom of their resume.
- **Profile customization** — Edit Portfolio: profile background color, custom tagline, short bio. Profile photo already supported.
- **PDF and image export** — Download PDF (browser print) and Download Image (html2canvas PNG) from the Six-second profile page.
- **Public profile API** — `GET /profile/public/[slug]` and `GET /profile/public/[slug]/photo` serve profile + latest audit data without auth. Profile slug derived from email hash.

### Quick tips and evidence traceability (March 2026)
- **Quick tips in Career Center** — Collapsible "Quick tips" section with curated resume FAQs (when to add GPA, format dates, what recruiters look at first, etc.). Scannable, expandable per tip. Users get answers without using Voice.
- **Evidence traceability enhancements** — Copy button on "Cited From Your Resume" blockquote in DimensionBreakdown. Cited snippets shown in Assessment findings list with copy button. Tooltip on finding text shows the cited snippet on hover.

### Meridian Voice upgrades (March 2026)
- **Tool use / inline actions** — Voice can run gap_scan, ready_check, rewrite_bullet, and interview_prep from natural language. User says "Run a gap scan" or "Am I ready for Goldman?" and gets the action + synthesized advice in one reply. Uses OpenAI function calling.
- **Richer resume context** — Voice receives the user's actual parsed resume text (up to ~4000 chars) in addition to audit findings and recommendations. Enables quoting specific bullets, comparing before/after, and citing exact lines.
- **Higher token limit + optional stronger model** — Default reply cap raised to 550 tokens; deep-dive questions ("explain", "why", "walk me through", etc.) use gpt-4o and 900 tokens for better reasoning.
- **Persistent voice memory** — Voice conversation summaries stored in profile (voice_memory) instead of localStorage only. Survives device changes; up to 7 items in context, 10 stored; PATCH /profile persists on each append.

### Knowledge files for Science, Communications, Education, Arts, Humanities (March 2026)
- **science.json** — NSF/NIH/Nature Careers/CRA/ACS sources. Dimensions: Research Signal, Sustained Effort, Evidence of Scientific Work. Common gaps: no lab experience, vague research bullets, no quantified impact.
- **communications.json** — PRSA/PRWeek/PRSSA/AEJMC sources. Dimensions: Writing and Media Acumen, Portfolio Impact, Content and Campaign Proof. Common gaps: no portfolio, no PR internship, no metrics.
- **education.json** — NEA/State DOE/EdSurge/TFA sources. Dimensions: Certifications and Prep, Teaching Experience, Student Impact Evidence. Common gaps: no student teaching, no tutoring, certification unclear.
- **arts.json** — AIGA/Creative Mornings/NASAD/One Club sources. Dimensions: Academic Rigor and Craft, Portfolio and Productions, Concrete Work Evidence. Common gaps: no portfolio link, projects lack context.
- **humanities.json** — MLA/AHA/Chronicle/Versatile PhD sources. Dimensions: Research and Writing Rigor, Quantifiable Impact, Evidence of Analysis. Common gaps: no publication/presentation, vague research bullets.
- Loader `_TRACK_FILE_MAP` updated so all 10 tracks have knowledge files. Gap scan and Voice now use sourced criteria for these tracks.

### Ethical company criteria scraper (March 2026)
- **Scraper script** — `scripts/company_criteria_scraper.py` scrapes public career pages (Google, Microsoft, Goldman, McKinsey, etc.) for "what we look for" content. Respects robots.txt, rate limits (2s per domain), User-Agent identification. Output: `knowledge/scraped_criteria.json` with source URLs.
- **DATA_SOURCES.md** — Documents sourcing policy: public only, legal, ethical, verifiable. Confidence levels (validated, JD-based, inferred, partner-validated).
- **Knowledge loader integration** — `load_scraped_criteria(company_name)` loads scraped sections for a company. Injected into gap scan and Voice context when target school/firm is provided.
- **Recognized tech employers (editable file)** — `knowledge/recognized_tech_employers.txt`: one name per line, lowercase; # for comments. Used by scoring for Build signal (Tech track). Loaded at runtime; falls back to built-in list if file not found. Edit without code changes.

### Certifications Hub, Vs Your Peers, Conversation over time, Quick interactions (March 2026)
- **Certifications Hub** — Insights tab: "Certifications hub" section with curated free certifications (lib/certificationsHub.ts). Filtered by track; top 12 shown with name, provider, description, link. Framed as Meridian giving students access; links open provider site.
- **Vs Your Peers (full track-based comparison)** — Backend: peer_benchmark.get_cohort_stats(track) returns cohort_n, use_fallback, avg/p25/p75 per dimension, how_to_get_ahead copy. GET /peer-cohort-stats?track=... for subscribed users. Insights: "Vs your peers" card with your scores vs cohort average and top quartile; "Ask Meridian how to get ahead" CTA.
- **Conversation over time** — Voice context includes conversation_topic (current chat title) when continuing an existing convo so the model continues the same thread. Backend already injects recent message history; frontend sends conversation_topic from active convo title.
- **Quick interactions** — One-tap reply chips above Voice input: "Going well", "Stuck", "Need help with resume". Slack-style slash commands: /ready Goldman → "Am I ready for Goldman?", /mock [JD] → mock audit prompt. Hint shown: "/ready Goldman · /mock [JD]".

### Live resume editing UI (March 2026)
- **Resume Editor** — Full in-app resume editor at `/resume-edit`. Parses `structured_text` from the latest audit into editable sections (Contact, Education, Experience entries, Projects, Skills, Honors, etc.). Each experience entry is a collapsible card with inline-editable fields (company, role, date, location) and a bullet editor (Enter adds new bullet, Backspace on empty removes, auto-resize textarea). Auto-saves to `memory/dilly_profiles/{uid}/resume_edited.json` after 2s idle via `POST /resume/save`. Re-audits from the saved text via `POST /resume/audit` (same LLM pipeline as `/audit/v2`) and redirects to Hiring tab with new scores. "Edit" quick link in the sticky bottom bar. "Edit resume" action card in the Review hub alongside "Run new audit". Mobile-first at 375px. Unsaved changes indicator (animated dot). Beautiful warm-gold design matching Meridian palette.
- **Backend** — `GET /resume/edited` (load saved sections), `POST /resume/save` (persist sections to user profile folder), `POST /resume/audit` (re-audit from saved text, subscription required). Router: `api/routers/resume.py`. CSS: `.m-resume-field`, `.m-resume-section-card`, `.m-resume-entry-card`, `.m-resume-add-btn` added to globals.css.

### Career Center UX (March 2026)
- **Meridian Voice CTA** — Replaced "Ask Meridian anything" input with a compelling CTA card: "Your resume is your story. Meridian Voice knows it, and can help you tell it better." Button: "Open Meridian Voice."
- **Mini calendar improvements** — Inline expansion when clicking a date (no overlay). Full deadline list appears below the calendar grid and pushes content down. Close button and "Open full calendar" link. Better text styling (line-clamp-2, no truncation).
- **Deadline banner language** — Human-sounding copy: "1 day left until your [label] deadline" (singular) or "X days left until your [label] deadline" (plural). No "1 days" or "X days until."
- **No em dashes** — App-wide: no em dashes (—) or en dashes (–). Replaced with commas, periods, hyphens, or "to" as appropriate.

---

## Launch status (March 7, 2026)

**Planned for April 11 launch (see docs/ROADMAP.md phases 4-6):**
- #10 Shareable badges — Phase 5
- #13 Gap analysis & 3-month roadmap — Phase 4
- #16 Goal setting & home-screen banner — Phase 4
- #17 "Am I Ready?" one-tap check — Phase 4
- #18 Application deadline countdown & sprint plan — Phase 6
- #19 Shareable Meridian Snapshot — Phase 5
- #20 Track leaderboard (opt-in) — Phase 5
- #21 Cover letter & outreach lines — Phase 4
- #23 Interview prep from evidence — Phase 4
- #36 Proactive nudges / milestones (partial) — Phase 6
- #39 Gamification: progress bars & celebrations — Phase 6

**Deferred to post-launch:**
- #1 Live resume editing UI, #3-6 Workshops/podcasts/training, #7 Mentors, #8 JobBook, #11 GPA inference, #12 Verified Talent, #14 Mock audits, #15 Seal of Truth, #22 "What if" scenarios, #24 Ask Meridian weekly, #25 First-application highlight, #26 Campus clubs, #27 Job alerts, #28 Daily Companion AI (full), #29 Vs Your Peers (full), #30 Resume reorganization, #31-35 Technical expansion, #37-38 Quick interactions, #40-43 Habit hooks.

---

## High priority later

Ideas to prioritize when bandwidth allows post-launch. See `docs/IDEAS_LAUNCH_ROADMAP.md` and `docs/VOICE_POWER_UP_IDEAS.md` for detail.

**From IDEAS_LAUNCH_ROADMAP (post-launch):**
- Live resume editing UI (#1)
- App-exclusive workshops (#3)
- Free certifications hub (#4)
- Podcasts section (#5)
- Exclusive training programs (#6)
- Mentors on the app (#7)
- JobBook (#8)
- Per-student links (career center → student report without login)
- Proof layer (Phase B) — cross-check resume vs GitHub/LinkedIn/certs
- Recruiter view — job description → Meridian-fit
- "Email me my report" — same PDF, delivery via email

**From VOICE_POWER_UP_IDEAS:**
- Score trajectory coaching (#8) — "If you complete top 3 recs, Grit could reach ~78"
- Proactive nudges (#9) — "One thing to do this week" pushed to user
- Scraped company criteria in Voice (#10) — inject company career-page content into Voice context

---

## Ideas / On hold

- **Applications + Dilly (conversational add & progress)** — User tells Dilly about a new application in Voice/chat; Meridian extracts company, role, status, dates, link, notes → confirms → `POST`/`PATCH` same `/applications` API as the form (dedupe by job_id or company+role). After that, Dilly and habits/proactive nudges track funnel state, suggest `next_action`, update status on user updates (“I got the offer”), and tie into weekly review + prep handoffs. Spec: `docs/APPLICATIONS_DILLY_SPEC.md`.
- **Per-student links** — Career center gets a list of one-time or short-lived links (e.g. `https://app.meridian.io/r/abc123`). Each link opens that student’s report without login. Requires storing report by token and a “view report” page. To be implemented later.
- **Cohort + benchmark on dashboard** — Show the detected cohort and short definitions of Smart/Grit/Build for that cohort; compare scores to tier-1 benchmarks (e.g. “Your Grit is below the Tech bar (85)”).
- **Evidence traceability** — In the UI, make the evidence sentence clickable or show a tooltip with the exact snippet from the resume that drove the finding.
- **Optional target (role/school)** — Single optional field “I’m applying to: Med school / FAANG / …” to nudge recommendations (e.g. more shadowing vs research for med).
- **Proof layer (Phase B)** — Cross-check resume claims with GitHub, LinkedIn, or certs (manifesto “we don’t suggest what they haven’t proven”).
- **Recruiter view** — Recruiter uploads a job description and gets “Meridian-fit” attributes; or anonymized Meridian scores for a candidate pool.
- **7-day stored PDF with different UX** — Current signed link stores the PDF and returns a URL; optional future: “Email me my report” that stores the PDF and sends the link by email.

- **Meridian Voice (chatbot)** — In-app chatbot named Meridian Voice for career advice and Q&A. See product names in Implemented.
- **Meridian Career Center** — App section: career center dashboard on your phone with Meridian Voice integrated. Full career-center experience in-app.

### Monetization ideas (prioritized — Dilan likes these)

- **Deep-dive reports** — One-off premium reports: e.g. "Goldman-style consulting report" (longer, narrative), "Med school readiness pack" (multi-school gap analysis), "ATS deep dive for [Company]." Higher price point; uses existing audit + track intelligence.
- **Affiliate / partner referrals** — Meridian surfaces "next step" offers: test prep (MCAT, LSAT, GRE), internship platforms, grad-school advisors, certifications. Students click through; we get rev share or CPA. Transparent, value-first ("recommended for your track").
- **Group workshops (live in-app)** — Paid live workshops: "Resume deep-dive for Pre-Health," "Tech interview prep," etc. Hosted in-app (or linked); Meridian is the methodology + tool. Recurring or per-event revenue.
- **1:1 coaching platform** — Coaches use Meridian (and optionally a coach dashboard) to prep students; students pay the coach; we take a platform fee or license fee from coaches. "Meridian-powered coaching."

### Parent-focused monetization (sell to parents)

**Why it works:** Parents pay for peace of mind, visibility into progress, and ROI on tuition. They want to help but don’t know how; Meridian does. Student stays in control; parent gets enough signal to stop nagging and feel confident.

- **Gift Meridian** — Parent buys a subscription (e.g. 6 or 12 months) and sends it to the student’s .edu email. Redemption link/code; student signs up and gets access. Positioning: “Give your student a career edge.”
- **Parent dashboard (opt-in by student)** — Student invites parent (e.g. by email). Parent gets read-only view: scores over time, last audit date, high-level “on track” vs “needs attention.” No full resume or raw content—only outcomes and trends. Reduces “have you updated your resume?” with real data.
- **Shareable report to parent** — One-tap “Email report to parent” from the existing shareable PDF. Parent receives the professional summary (scores, evidence, next steps) without logging in. Leverages existing report; no new product.
- **Milestone notifications (opt-in)** — “Your student reached Strong in Grit” or “First audit completed.” Parent gets an email only if student added them. Keeps them in the loop without hovering.
- **Family plan** — Parent pays for 2–3 students (e.g. multiple kids in college). One billing, separate accounts per student; optional parent summary per student.
- **“Is my student on track?” page** — Simple parent-facing summary: “Your student is in the top 20% for Build in Tech” or “3 recommendations completed this month.” No resume data; outcome metrics and engagement only.
- **Trust copy for parents** — Parent-facing landing or FAQ: “.edu only,” “we don’t sell your data,” “your student’s resume stays private.” Reassures parents before they pay.

### Meridian Apply Engine (March 2026)

- **Apply through Meridian** — Students apply to jobs on Meridian for roles that have an application email configured. We send the application (subject `[Meridian Verified] Name – Title at Company`, profile link, report PDF link, reply-to student). Recruiters see the signal before they click. Implemented: `api/apply_destinations.py` (job_id → application_email in `memory/meridian_apply_destinations.json`), GET `/jobs/recommended` enriched with `application_email`, POST `/apply-through-meridian`, Jobs UI "Apply on Meridian" button + modal (optional note, send, success). Recruiter page: `website/recruiters.html` ("When you see [Meridian Verified] in your inbox"); nav "For recruiters." See `docs/MERIDIAN_APPLY_ENGINE.md` for pipeline (career center / employer opt-in) and getting it known.

### New ideas (product roadmap)

- **High-impact surprise ideas** — Curated list of features that feel "genius" and surprise students (preview as recruiter, one superpower sentence, first Voice message that proves we read their resume, "you're in the green for [Company]," students-like-you got interviews, one thing before apply, audit leads with a win, share card worth posting, 6-second scan view, deadline + one company-specific action). Fast wins vs bigger bets; all build on existing resume, Voice, jobs, ATS, outcomes. See `docs/HIGH_IMPACT_SURPRISE_IDEAS.md`.

1. **Live resume editing UI** — In-app custom UI so users can edit their resume directly in Meridian (no round-trip to Word/PDF). Edit sections, bullets, and formatting; re-audit after changes.
2. **"What are you applying to?"** — Ask the user what they're applying to (e.g. full-time job vs internship, role type). Change auditing and recommendations based on that (e.g. internship vs full-time job seeker).
3. **App-exclusive workshops** — Workshops only available in the app (e.g. "How to get 500+ LinkedIn connections"). Increases perceived value and retention.
4. **Free certifications hub** — Dedicated section for students to access free certifications found online. Curated list of free certs; framed as Meridian giving them certifications (don't disclose that certs are otherwise free).
5. **Podcasts section** — Exclusive access to a podcast series (interviews with CEOs, professors, C-suite, student leaders). In-app listening plus notes and takeaways, filtered by major so users see relevant episodes.
6. **Exclusive training programs** — Meridian-only training programs (beyond workshops) to deepen engagement and perceived value.
7. **Mentors on the app** — Users can reach out to mentors who collaborate with Meridian. Mentor directory or matching; in-app contact or booking.
8. **JobBook** — Dedicated place for students to find internships (and jobs), filtered by major. Positioned as easier than Handshake and LinkedIn.
9. **Resume length (1-page) detection** — Detect if a resume is over 1 page and help the user get it to 1 page (suggestions, trimming, or in-editor guidance).
10. **Shareable badges** — Badges users can add to LinkedIn (e.g. "100 Grit – Meridian"). Increases shareability and social proof.
11. **GPA inference when missing** — When GPA is not on the resume, try to infer whether they're hiding a low GPA (e.g. ~2.0) vs omitting a solid one (e.g. 3.4). Use signals (honors, "top X%", Dean's List, or absence of academic highlights) to inform a gentle nudge or recommendation—without inventing a number.

### $20 bundle & career-acceleration (from product vision)

12. **Verified Talent badge & direct pipeline** — Top percentiles get a "Verified Talent" badge and optional push to partner firms (e.g. Raymond James); profile to hiring manager, bypass Handshake line. "Handshake Killer."
13. **Gap analysis & 3-month roadmap** — Compare to top N in field; personalized roadmap (e.g. "Missing 100 hours technical work; here are 3 UTampa clubs or local internships that fill that gap").
14. **Unlimited mock audits** — User uploads or pastes a job description; Meridian runs a mock audit as if that firm's AI is scoring the resume so they can tune language before applying.
15. **Meridian Seal of Truth / verified transcript** — GPA and rigor verified against official .edu transcript; recruiter-facing credibility ("verified by Meridian").
16. **Goal setting & home-screen banner** — User sets goals (e.g. "Land summer analyst at Goldman," "Get into Raymond James"). Banner at top of home screen until task is done; keeps target visible every open.
17. **"Am I Ready?" one-tap check** — For a company/role: Ready / Not yet / Stretch + 1–3 concrete gaps (e.g. "Add 20+ shadowing hours"). Reduces "am I wasting my time applying?" anxiety.
18. **Application deadline countdown + sprint plan** — User adds deadlines; countdown on home screen; near deadline, prioritized "2-week sprint" (to-dos) so they use time left effectively.
19. **Shareable Meridian Snapshot** — Link or one-pager PDF: radar + composite score + 2–3 evidence bullets (no full resume) for Handshake note, LinkedIn DM, career fair follow-up. Recruiter 6-second signal.
20. **Track leaderboard (opt-in)** — "Top 10% Grit in Pre-Health at UTampa"; optional rank (e.g. #12 of 89). Anonymous or pseudonymous; makes percentile real and competitive.
21. **Meridian-aware cover letter / outreach lines** — Generate opening lines or cover-letter hooks that cite their actual Smart/Grit/Build evidence; one-click from profile. Not generic.
22. **"What if" scenarios** — "What would my score be if I added 50 shadowing hours?" or "If I joined Finance Club as VP?" Estimated score change so they decide where to invest before committing.
23. **Interview prep from evidence** — Per-dimension prompts: "Recruiter asks: Tell me about leadership. Here's how to use your Meridian Grit evidence." Bullets or 30-second scripts from their resume.
24. **One "Ask Meridian" per week (coach mode)** — Subscribers get one prioritized Q per week (e.g. "Should I list high school job?" "How explain a gap?"). Answer grounded in their Meridian profile and track.
25. **First-application highlight or guarantee messaging** — Either "Applied with Meridian-optimized resume" or data-backed "Elite users see X% more first-round responses." Frames $20 as risk reduction.
26. **Campus clubs & contacts** — Show clubs on campus that match their major/track and who to contact (e.g. club president, advisor) so they can get involved without hunting. Ties to gap analysis.
27. **Job alerts** — Infer interests (goals, track, major); when partner employer posts a matching role, alert user and send to app (push + in-app). "Raymond James just posted—here it is."
28. **Daily Companion AI** — AI is super interactive: proactive check-ins, follow-ups, light nudges ("How's the Raymond James application?"). User feels tied to it and wants to talk every day; habit and attachment.
29. **"Vs Your Peers" track-based comparison** — Compare user to others in same track (finance vs finance, med vs med). Show what others are doing (scores, hours, roles) and how to get ahead / get that analyst job over others.
30. **Resume reorganization per job** — User pastes or selects a JD; Meridian uses parsed_resumes (structured content) to reorder and emphasize sections/bullets for that role. One canonical resume → many job-tailored versions; no manual rewrite per application. MTS: same facts.

### Expansion / technical (from product vision)

31. **Rigor Index API** — Other companies send GPA + major; Meridian returns Meridian-Adjusted GPA (1.40x logic).
32. **Interactive radar** — Recruiter (or user) clicks a dimension spike → e.g. timeline of clinical hours or projects that drove that score.
33. **Self-correction logic** — Second AI agent audits the first agent's scores to ensure Ground Truth (e.g. 1.40x) was applied correctly.
34. **RAG / vector embeddings** — Cluster candidates; "This student's Build profile looks like a Junior Dev at NVIDIA." Predictive or similarity signals.
35. **Predictive Success Score** — Track where gold-standard students end up in 2 years; train auditor on which Smart/Grit/Build combinations lead to best outcomes.

### Idea board: interactive AI & habit-forming

36. **Proactive outreach** — Morning/evening check-in, goal-based nudges, milestone callouts ("Grit up 8 points"), streak ("5 days in a row").
37. **Conversation over time** — Remember context, threaded topics (application at X, interview prep), light small talk so it feels like a person.
38. **Quick interactions** — One-tap replies ([Going well] [Stuck]), Slack-style shortcuts (/ready Goldman, /mock [JD]), micro-questions.
39. **Gamification** — Daily micro-goal, progress bars ("3 steps from Elite"), celebrations when they hit a target.
40. **Personalization** — Use name and goals; reference their resume ("Your Data Science Club presidency is your strongest Grit signal"); track-specific tone.
41. **Two-way dialogue** — Clarifying questions before advice; option menus ("I can (a) mock audit (b) cover opener (c) interview bullets"); confidence check.
42. **Rituals** — "Daily tip" or "Today's focus"; weekly recap; helpful reminders ("48 hours until deadline").
43. **Habit hooks** — Variable rewards (job alerts, "new role at [Company]"), "what's new when I open?" feed, progress/streaks, identity ("I'm a Meridian user"), loss aversion (real deadlines, "you'd be a fit"), frictionless next step, AI as "person" they don't want to let down.
