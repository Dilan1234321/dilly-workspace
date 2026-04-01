# The Daily Dilly — Personalized Career Digest

## Context

Dilly lacks a content distribution channel like Intern Insider's newsletter (66k subscribers). "The Daily Dilly" fills this gap — a personalized career digest delivered via email AND in-app, configurable as daily or weekly. Unlike a generic job board newsletter, each edition is personalized using Dilly's scoring engine, job matching, and profile data.

## What Each Edition Contains

1. **Top 5 matched jobs/internships** — reusing `job_matching.get_recommended_jobs()` with match %, why bullets, and readiness tier
2. **Score movement** — delta since last edition from `audit_history`
3. **Cohort insights** — percentile, gap to top 25%, what peers are doing (from `cohort_pulse_store`)
4. **Application updates** — status changes (applied → interviewing, etc.)
5. **Upcoming deadlines** — next 14 days from `memory_surface_store` + `career_brain`
6. **Career tip** — rotating curated tips
7. **Dilly's Take** — LLM-generated personalized summary paragraph

## New Files (7)

### 1. `api/daily_dilly_store.py`
JSON file store following `cohort_pulse_store.py` pattern.
- Storage: `memory/daily_dilly.json` with `fcntl` file locking
- Dedup key: `(uid, edition_date)` — idempotent re-runs
- Functions: `upsert_edition()`, `get_latest_edition()`, `list_edition_history()`, `mark_edition_opened()`, `mark_edition_email_sent()`, `get_last_edition_date()`

### 2. `api/jobs/generate_daily_dilly.py`
Content generation job following `jobs/generate_weekly_pulses.py` pattern.
- Entry: `generate_daily_dilly() -> dict` (stats)
- For each active subscribed user:
  - Check `daily_dilly_prefs` cadence (skip weekly users except Mondays)
  - Skip if edition already generated today
  - Assemble sections by calling existing modules (job_matching, audit_history, cohort_pulse_store, career_brain, memory_surface_store)
  - Generate "Dilly's Take" via LLM (Claude Sonnet, <200 chars, with fallback template)
  - Persist edition via store
  - Send email via Resend
  - Optionally fire push notification

### 3. `api/daily_dilly_email.py`
HTML email template builder following `verification_email.py` pattern.
- School-themed (accent colors from school lookup)
- Sections: greeting, score card, top jobs table, app updates, deadlines, Dilly's Take, career tip
- CTA button → `/digest` deep link
- Footer: one-click unsubscribe via HMAC token (no extra DB table)

### 4. `api/routers/internal_daily_dilly.py`
Cron endpoint following `routers/internal_cohort_pulse.py` pattern.
- `POST /internal/daily-dilly/generate?token=CRON_SECRET`
- `GET /internal/daily-dilly/unsubscribe?token=...&uid=...` (HMAC-verified, returns simple HTML page)

### 5. `api/routers/daily_dilly.py`
User-facing API following `routers/cohort_pulse.py` pattern.
- `GET /daily-dilly/latest` — current edition for authenticated user
- `GET /daily-dilly/history?limit=7` — past editions
- `PATCH /daily-dilly/{edition_id}/opened` — track opens
- `PATCH /daily-dilly/preferences` — update cadence, enabled, sections

### 6. `dashboard/src/app/digest/page.tsx`
In-app digest view.
- Fetches latest edition on mount, fires opened tracking
- Card-based layout: score hero, job cards, app timeline, deadline badges, Dilly's Take, tip
- Preferences toggle (cadence, sections)
- "Past digests" link to history

### 7. `dashboard/src/app/digest/history/page.tsx`
Past editions list with date headers.

## Modified Files (3)

### `api/main.py`
- Import and register `daily_dilly` and `internal_daily_dilly` routers
- Add `daily_dilly` to `openapi_tags`

### `api/notification_triggers.py`
- Add `daily_dilly_ready` trigger (low priority, 20h cooldown)

### `api/notification_deeplink.py`
- Add `/digest` deep link for `daily_dilly_ready` trigger

## User Preferences

Stored in existing `profile_json` JSONB (no migration needed):
```json
{
  "daily_dilly_prefs": {
    "enabled": true,
    "cadence": "daily",
    "sections": ["jobs", "scores", "cohort", "applications", "deadlines", "tips"]
  }
}
```

## Cron Schedule

Add to cron config:
```
POST /internal/daily-dilly/generate?token=CRON_SECRET
Schedule: 0 14 * * 1-5  (9 AM ET weekdays)
```

Single cron handles both daily and weekly users — the job checks each user's cadence.

## Implementation Order

1. `daily_dilly_store.py` — data foundation
2. `daily_dilly_email.py` — email template
3. `jobs/generate_daily_dilly.py` — core generation logic
4. `routers/internal_daily_dilly.py` — cron endpoint
5. `routers/daily_dilly.py` — user-facing API
6. `main.py` modifications — register routers
7. `notification_triggers.py` + `notification_deeplink.py` — push integration
8. `dashboard/src/app/digest/page.tsx` — in-app view
9. `dashboard/src/app/digest/history/page.tsx` — history page
10. Cron schedule configuration

## Key Reused Modules

| Module | What we reuse |
|--------|---------------|
| `job_matching.py` | `get_recommended_jobs()` for top 5 matches |
| `cohort_pulse_store.py` | `get_current_user_pulse()` for cohort insights |
| `audit_history_pg.py` | `get_audits()` for score deltas |
| `career_brain.py` | `build_timeline()` for deadlines |
| `memory_surface_store.py` | Deadline-type memory items |
| `email_sender.py` | `resend.Emails.send()` for delivery |
| `dilly_core.llm_client` | `get_chat_completion()` for Dilly's Take |
| `send_push_notification.py` | FCM/APNS for digest-ready notification |

## Verification

1. Run `generate_daily_dilly()` manually for a test user — confirm edition persists to store
2. Verify email renders correctly by sending to a test address
3. Hit `GET /daily-dilly/latest` — confirm API returns the generated edition
4. Hit `PATCH /daily-dilly/preferences` — confirm cadence toggle persists
5. Re-run generation — confirm idempotency (no duplicate edition)
6. Load `/digest` in dashboard — confirm renders and fires opened tracking
7. Test unsubscribe link — confirm sets `enabled: false` in profile
