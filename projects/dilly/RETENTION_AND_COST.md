# Dilly: Retention + Cost Plan

What shipped in build 250 and what's queued for 251+. For Dilan.

## Shipped in 250

### Cost cuts
- **Haiku everywhere, every tier.** Swapped `claude-sonnet-4-6` (and the stale `claude-sonnet-4-5-20250929`) across 16 files. `_chat_model` now Haiku for free AND paid.
- **Prompt caching at the wrapper.** `get_chat_completion()` auto-wraps any system prompt ≥ 4000 chars in an ephemeral cache block. Cascades cache savings across ~50 call sites without caller code changes.
- **Cohort scoring disabled.** Removed the Haiku call from:
  - audit.py "score_and_store_cohorts" background thread
  - profile.py auto-rescore path
  - `/profile/rescore-cohorts` endpoint now a no-op
  - `/cron/daily-pipeline` step 4 (rescore) skipped
- **Memory extraction gated on trivial messages.** Skips Haiku call when all user messages in a batch are short/greetings/acks. Saves ~30-40% of extraction calls.
- **Email verify UX.** 15s cooldown (was 30s) + "check spam" hint after 18s referencing `noreply@trydilly.com`.

### Jobs page — scoring signals removed
- **FitRing component deleted.** No more FIT/CLOSE/STRETCH labels anywhere.
- **Colored fit rail removed** from JobCard left edge.
- **Narrative colors neutralized** — green/amber/red replaced with brand violet.
- **Dilly's read is now one powerful sentence.** `_oneLineRead()` picks the sharpest sentence from `what_you_have`, never truncates on any device.
- **Always-shown Dilly bubble** — even before narrative loads, with stable placeholder.

### Jobs page — filters + search
- **H-1B sponsor filter** for international_grad path.
- **Fair-chance filter** for formerly_incarcerated and refugee paths.
- **Remote-only filter** universal; auto-enabled for rural_remote_only users on first load.
- **Powerful multi-token search** — tokenized AND match across title, company, location, work_mode, job_type, description.
- **Cities as a dedicated second filter row** with "+ Edit" affordance routing to profile.
- **City filter defaults to unselected** instead of auto-applying user's preferred cities.
- **Feed limit raised** to 100 client-side, 500 server cap.

### Jobs page — accuracy fix
- **Weekly brief count honest.** Previously reported tens of thousands via loose `cohort_requirements::text ILIKE`. Now uses same path-specific structural filters as the feed, capped at 500. No more "you have 4,200 new jobs" then Jobs tab shows 50.

### Chat
- **AI auto-calendar tool.** Dilly calls `add_calendar_event` without asking when user mentions a dated event. `_append_calendar_deadline()` writes to `profile.deadlines` (dedup, ISO date validation). Today's date injected into system prompt so relative phrases ("the 3rd", "Monday", "in 2 months") resolve correctly.

### Spacing / polish
- Scan pulse → search bar: extra 14pt bottom padding.
- Em dashes and en dashes scrubbed from user-facing strings across mobile.
- Situation screen: Dilly logo image replaces text badge.
- Back button added to email login.
- Sign-out/delete → `/onboarding/choose-situation` (not `/choose-path`).
- Career Center: "Welcome to your career center."
- My Dilly loading: animated DillyFace + rotating status lines, matches What We Think.
- Business card pearl variant: divider no longer cuts through photo.
- Business card accessibility: photos enlarged 44→56-64pt across variants, WCAG AA contrast.
- Instant collection create (no lingering popup).

### Classifier infrastructure (from earlier this session)
- `degree_required`, `h1b_sponsor`, `fair_chance` columns with Haiku classifier (`$0.0003/job` × 500/day = `$4.50/mo`).
- Migration + cron endpoint + daily pipeline integration.

## Cost state after 250

At 200 DAU (estimated):

| Item | Before | After 250 |
|---|---|---|
| Chat | $405 | ~$135 (Haiku + caching) |
| Cohort scoring | $90 | **$0** (disabled) |
| Memory extraction | $93 | ~$45 (gated) |
| Everything else | ~$160 | ~$120 (Haiku + caching) |
| **Total** | **~$950** | **~$300** |
| **Per user** | $4.75 | **$1.50** |

At 20% paid conversion (Dilly $9.99-$14.99, Pro $14.99-$19.99), margin per paid user: **~$7-17 net**. Free user cost: **$0.30-$0.40/mo**.

Net economics at 10k DAU, 20% paid: **~$19k/mo profit**.

## Queued for 251 (next deep session)

### AI Arena as universal painkiller
The existing Arena targets students/resume-holders. To make it a painkiller for anyone — including people who already have jobs — needs:
- **AI Threat Report per industry/role** — static content bank (JSON file), zero LLM per view. Pre-baked threat assessments for "Software Engineer", "Accountant", "Teacher", "Truck Driver", "Lawyer", "Marketing Manager", etc. Each entry: threat_level, most-at-risk-tasks, safest-tasks, what-to-learn, recent layoff data, 2-year forecast.
- **"What do you do?" flow for non-resume users** — anyone can get a threat score by describing their work in one field, no resume required.
- **Industry Layoff Feed** — scrollable feed of recent AI-driven layoffs in user's field (static content refreshed weekly, not per-user).
- **Cohort-wide threat scores** — "73% of accountants in your region at high AI risk." Derived from classifier + fact aggregation.
- **Scan without a resume** — use Dilly Profile facts as the input.

Content production: one-time ~$5 in Haiku cost to generate the threat report bank for 30-40 common roles, then free thereafter.

### pgvector embedding pipeline
Replaces `match_scores` precomputation with `ORDER BY embedding <=> user_embedding`. ~$5 one-time backfill + $1.50/mo ongoing, scales to 100k+ jobs cleanly. Unlocks "show me all jobs that match" instead of "50 jobs capped by rank_score".

### Dead code deletion (hard)
- `api/cohort_scorer.py`
- `api/generate_ready_check_verdict.py`
- `api/scripts/rescore_jobs.py`
- `api/ai.py` (root; not routers/ai.py)
- `recruiter.py` gpt-4o references
- `match_scores` table rows (drop or truncate)
- `students.smart_score/grit_score/build_score` columns

### Profile store consolidation
Merge `users.profile_json` and `profile_facts` into a single unified fact store. Removes a whole class of sync bugs between the two layers.

### Retention-specific wins I want to think through

1. **Push notification infrastructure.** Scheduler + Expo push credentials + scheduled tasks. Actual push delivery. Currently we compute notifications but don't deliver them reliably.

2. **Morning card rotation.** Different hero cards based on day of week + user path. Monday = weekly brief. Tuesday = AI threat check-in. Wednesday = profile gap nudge. Thursday = job digest. Friday = win-of-the-week prompt.

3. **"Dilly remembers" moments.** After 3 weeks, surface things the user said early on: "You told me 2 months ago you wanted to pivot to finance. How's that going?" Turns the fact surface into emotional continuity.

4. **Social proof without social network.** "N people on Dilly got hired this week." "N Dilly users in your cohort are interviewing." Stats from `applications` and `profile_facts` aggregated anonymously.

5. **Irreplaceable rituals.** Weekly AI Arena check (Sunday night). Monthly fit scan. Yearly career reset. Schedule-shaped, not app-shaped.

## Cost ceiling awareness

If anything new adds significant per-user LLM cost, kill it or find the static-content alternative. The big ceiling: we've built toward ~$1.50/user/mo AI cost at 200 DAU. Every new LLM-backed feature should justify itself against that budget.
