# Retention — what's done and what's next

Shipped in build 248 (April 2026):

## Client-side (visible in-app today)
- **Situation-first onboarding** with 17 paths and per-card promises (wow screen)
- **"Dilly sees" card** on Career Center when profile is thin (≤12 facts) — lists concrete things Dilly has learned, invites one more
- **Life-event card** on Career Center — graduation countdown, performance review season, path-specific "this week" nudges
- **Weekly brief card** on Career Center — personalized headline + 3 tappable bullets with deep links (Jobs / AI Chat / My Dilly)
- **Profile growth meter** on My Dilly — "Dilly knows X things" progress bar, hidden once user hits 80+ facts
- **AI Arena delta tracking** — history of last 12 shield scores persisted on profile; response includes `previous_score`, `score_delta`, and `history` so mobile can show "Your score changed"
- **Pre-loaded fit narratives** — top 3 jobs already have narratives cached when the Jobs tab opens
- **Resume-aware AI first message** — Dilly references a specific fact from the user's resume in the opening line

## Server-side
- `GET /brief/weekly` — per-user, per-ISO-week cached personalized brief. Derives from profile + jobs DB, no LLM cost. Ready to power push notifications when that ships.
- AI Arena history storage on profile (`ai_arena_cache.history`)

---

## What still needs infrastructure work (NEXT)

### 1. Push notification delivery — the daily nudge engine
**Why it's not shipped:** delivery requires three things:
1. Expo Push Notifications credentials configured in `app.json` + Expo account
2. A cron job on Railway that runs nightly and queries users eligible for a notification
3. A persistent store of each user's push token (the `push_token` field exists on profile but isn't actively used by a scheduler)

**The scheduler logic should:**
- Run daily at ~8am user local time (or a sensible UTC time batched by timezone buckets)
- For each user, query `/brief/weekly` OR a new `/brief/daily` that generates a single-bullet push-worthy nudge
- Send only if:
  - User opted in (notification prefs)
  - Has high-value signal today (new jobs in their field, profile reaches a threshold, deadline in 2 days, etc.)
  - Hasn't been pushed in the last 24h
- Deliver via Expo push with `deep_link` payload so tapping opens the right screen
- Record delivery timestamp so next-day checks don't re-fire

**Mobile deep-link handling:**
- `app/_layout.tsx` should register a `Notifications.addNotificationResponseReceivedListener`
- On tap, parse `deep_link` from the notification data and `router.push(...)` to the right screen
- Pass query params where relevant (e.g. `dilly://jobs?weekly=1` → Jobs tab with "this week" filter active)

**Jobs-from-notification handler:**
When the user taps "3 new jobs this week", Jobs tab should:
- Accept a `?weekly=1` query param (already plumbed via weekly brief's `deep_link`)
- Filter the feed to jobs created in the last 7 days, sorted by rank
- Show a header chip: "This week's matches" with an X to clear

### 2. Social proof stats (anonymized cohort comparison)
**Why not shipped:** requires aggregate computation on the user set. Endpoint would be something like `/stats/cohort` that returns:
- % of users in the same cohort/path who've started interview prep
- Average fact-count for users who landed a job
- Most-added skill this month in this cohort

Needs a nightly aggregation job + a new `/stats` router. Not a huge build, just infra discipline.

### 3. Career journal view on My Dilly
**Why not shipped:** the data exists — every conversation with Dilly adds facts, and we have timestamps on each fact. A "Dilly in April" view would be:
- Scroll through months
- Each month shows: facts added, top themes, snapshot of profile shape at that time

This is ~1 day of UI work on top of existing data.

---

## The retention thesis this build locks in

These 6 shipped features work together as a system:
1. **Arrival:** wow screen + "Dilly sees" + resume-aware first message → user sees "this is built for me" in the first 60 seconds
2. **First week:** pre-loaded narratives + life-event card + profile growth meter → every tab has a reason to engage
3. **Coming back:** weekly brief card + AI Arena delta → there's always something new on the Career Center when they open it
4. **Long term:** growth meter pulls them toward 80+ facts; AI Arena history lets them watch their score change over months

The missing pieces above are all about pushing users back INTO the app when they're not already in it. That's what the daily/weekly push notifications do. The infrastructure is all set up for when we're ready to turn it on — the brief endpoint is cached and cheap, deep links are specified, the mobile UI already handles the targets.
