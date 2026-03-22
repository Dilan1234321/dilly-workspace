# Launch: Env Vars & Runbook

**Purpose:** Single doc for production env and ops. Use when deploying or debugging at 2 a.m.

---

## Environment variables

### API (required)

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `OPENAI_API_KEY` | Yes (if LLM) | — | For auditor, normalizer, Voice |
| `MERIDIAN_USE_LLM` | No | `0` | `1` or `true` to use LLM audit |
| `MERIDIAN_LLM_MODEL` | No | `gpt-4o` | Use `gpt-4o-mini` for cheaper runs |
| `MERIDIAN_DEV` | No | unset | Set `0` or unset in production (disables dev-unlock) |

### API (optional)

| Variable | Notes |
|----------|-------|
| `RESEND_API_KEY` | Verification codes; without it, dev_code when `MERIDIAN_DEV=1` |
| `MERIDIAN_EMAIL_FROM` | From address for email (verify domain in Resend) |
| `RECRUITER_API_KEY` | For recruiter API access |
| `STRIPE_*` | Payment (see Stripe docs) |
| `CORS_ORIGINS` | Comma-separated allowed origins (defaults to `*`) |

### Dashboard

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_API_URL` | Yes | API base URL (no trailing slash). Set in Vercel/host env. |

---

## Runbook

### 1. Service URLs

- **Dashboard:** (set after deploy, e.g. `https://app.meridian-careers.com` or Vercel URL)
- **API:** (set after deploy, e.g. `https://api.meridian-careers.com` or Railway/Render URL)
- **Health:** `GET {API_URL}/health` → 200

### 2. Restart API

- **Railway:** Dashboard → project → Deployments → Redeploy
- **Render:** Dashboard → service → Manual Deploy
- **Fly.io:** `fly deploy` or `fly apps restart`
- **VPS:** `sudo systemctl restart meridian-api` (or your unit name)

### 3. Logs

- **Railway/Render/Fly:** Logs tab in dashboard; stream or download
- **VPS:** `journalctl -u meridian-api -f` or tail log file

### 4. Clear audit cache

Restart the API. Audit cache is in-memory (content hash, TTL 24h).

### 5. Turn off LLM if OpenAI is down

Set `MERIDIAN_USE_LLM=0` and restart. Rule-based audit will still run.

### 6. Common issues

| Symptom | Fix |
|---------|-----|
| Audit / Voice 504 | Check OpenAI; consider `MERIDIAN_USE_LLM=0` |
| Dashboard can't reach API | Check CORS and `NEXT_PUBLIC_API_URL` |
| Magic link / verify doesn't work | Confirm link points at production dashboard URL; token not expired |
| Verification codes not sent | Check `RESEND_API_KEY` and domain verification |

### 7. Contact

- Production issues: [your contact]

---

## Build & deploy

### Dashboard (Vercel)

1. Connect repo; set root to `projects/dilly/dashboard`
2. Add env: `NEXT_PUBLIC_API_URL` = your API base URL
3. Build: `npm run build` (or host default)
4. Deploy

### API

See `docs/STEPS_25_TO_28_DETAIL.md` for Railway/Render/Fly/VPS setup.

---

*Update when URLs and env change.*
