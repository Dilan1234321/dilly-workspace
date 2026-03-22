# Steps 25–28 in detail

Concrete tasks for the last four roadmap items so you can deploy and launch.

---

## Step 25 — API deploy (Railway / Render / Fly / VPS) + env + CORS

**Goal:** The Meridian API runs on a public URL so the dashboard (and users) can call it.

### 25.1 Choose a host

Pick one and stick with it for launch:

| Option | Pros | Cons | Typical cost |
|--------|------|------|--------------|
| **Railway** | Simple, good DX, env UI | Can get pricey at scale | ~$5–20/mo |
| **Render** | Free tier, easy web services | Cold starts on free | $0 (free) or ~$7+ |
| **Fly.io** | Global, fast | More config (fly.toml) | ~$5–15/mo |
| **VPS** (DigitalOcean, Linode, etc.) | Full control | You manage OS, SSL, process | ~$5–12/mo |

### 25.2 Build and run the API in production

- **If using Railway / Render / Fly:**  
  - Connect your repo (or push the workspace).  
  - Set **build command** so the API’s dependencies install (e.g. from `projects/meridian/api/requirements.txt`; ensure `dilly_core` and any parent paths are on `PYTHONPATH` or in the build context).  
  - Set **start command** to run the API, e.g.  
    `uvicorn projects.dilly.api.main:app --host 0.0.0.0 --port 8000`  
    (or the port the host expects, e.g. `PORT`).  
  - If you use the existing **Dockerfile** (`projects/meridian/api/Dockerfile`), run from a build context that includes everything the app imports (e.g. workspace root so `dilly_core` is available); adjust Dockerfile or `PYTHONPATH` so `projects.dilly.api.main.app` and `dilly_core` resolve.

- **If using a VPS:**  
  - SSH in, clone repo, create a venv, install deps from `projects/meridian/api/requirements.txt`, set `PYTHONPATH` so `dilly_core` and the API are importable.  
  - Run with uvicorn (or gunicorn + uvicorn workers). Use systemd or supervisor so it restarts on crash and on reboot.

### 25.3 Environment variables (required and optional)

Set these on the host (Railway/Render/Fly dashboard or VPS `.env` / systemd env):

| Variable | Required? | What it does |
|----------|-----------|--------------|
| `OPENAI_API_KEY` | Yes if using LLM | OpenAI API key for auditor (and normalizer). |
| `MERIDIAN_USE_LLM` | No | `1` or `true` to use LLM; omit or `0` for rule-based only. |
| `MERIDIAN_LLM_MODEL` | No | Default `gpt-4o`; use `gpt-4o-mini` for cheaper runs. |
| `MERIDIAN_DEV` | No | Set `0` or unset in production (disables dev-unlock). |

- **Secrets:** Never commit keys. Use the host’s secret/env UI or a secrets manager.
- **Auth store:** The API uses file-based auth (e.g. `auth_store`). Ensure the app has write access to the path it uses (or switch to DB later).

### 25.4 CORS

- **Current:** API allows all origins (`allow_origins=["*"]`).
- **Production:** Restrict to your dashboard origin(s), e.g.  
  `allow_origins=["https://yourapp.vercel.app", "https://meridian.yoursite.com"]`  
  so only your front end can call the API. Set via env if you have a single `CORS_ORIGINS` (or similar) and parse it in code.

### 25.5 Health and URL

- **Health:** `GET /health` should return 200. Use it for uptime checks and for the dashboard “Test connection.”
- **Base URL:** Note the public API base URL (e.g. `https://your-api.railway.app` or `https://api.meridian.yoursite.com`). You’ll need it for Step 26.

### 25.6 Optional but recommended

- **Rate limit:** e.g. limit `/audit/v2` per IP or per user to control cost and abuse.  
- **Logging:** Ensure errors and request logs go to the host’s log stream (or a file you can tail).  
- **File storage:** Parsed resumes and report PDFs are on server disk; 7-day report cleanup exists. For single-server launch this is fine; later you can move to S3/R2.

---

## Step 26 — Dashboard deploy (Vercel or same host) + NEXT_PUBLIC_API_URL

**Goal:** The Next.js dashboard is live and talks to the deployed API.

### 26.1 Choose where to host the dashboard

- **Vercel (recommended):** Connect repo, set root or subpath to `projects/meridian/dashboard`, build, deploy. Free tier is usually enough at launch.  
- **Same host as API:** You can serve the dashboard as static export or via Node on the same server; more work unless you already have a reverse proxy.

### 26.2 Set NEXT_PUBLIC_API_URL

- In Vercel (or your host): add an **environment variable**:  
  `NEXT_PUBLIC_API_URL` = your API base URL from Step 25 (e.g. `https://your-api.railway.app`).  
- **No trailing slash.**  
- The app uses it in `page.tsx` and `auth/verify/page.tsx`:  
  `const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";`  
- Rebuild and deploy after setting the env so the client bundle gets the correct API URL.

### 26.3 Build and deploy

- **Build:** `npm run build` (or your host’s default) from the dashboard directory. Fix any build errors (e.g. missing env at build time).  
- **Auth:** Magic-link flow must work: sign-in link must point at the **deployed** dashboard URL (e.g. `https://yourapp.vercel.app/auth/verify?token=...`) so after the user clicks the link they land on your app. If you send email, the link in the email should use this domain.  
- **HTTPS:** Use HTTPS in production; cookies/tokens should be set with secure flags if you add them.

### 26.4 Smoke test

- Open the deployed dashboard URL.  
- Run: onboarding → sign in (magic link) → (dev-unlock if needed) → upload a PDF → run audit → see results → download PDF / copy share link.  
- Confirm no mixed-content or CORS errors in the browser console and that API requests go to `NEXT_PUBLIC_API_URL`.

---

## Step 27 — Runbook: restart, logs, clear cache, who to contact

**Goal:** One document that lets you (or someone) fix things at 2 a.m. without guessing.

### 27.1 Create RUNBOOK.md (or similar)

Put it in the repo (e.g. `projects/meridian/docs/RUNBOOK.md` or `RUNBOOK.md` at root). Include:

### 27.2 What to include

1. **Service URLs**  
   - Production dashboard URL.  
   - Production API URL.  
   - Link to health endpoint (e.g. `https://your-api.railway.app/health`).

2. **How to restart the API**  
   - **Railway/Render/Fly:** “Redeploy” or “Restart” from the dashboard (and where that is).  
   - **VPS:** Exact command, e.g. `sudo systemctl restart meridian-api` (and where the unit file lives).

3. **Where logs are**  
   - **Railway/Render/Fly:** “Logs” tab in the dashboard; optional: how to stream or download.  
   - **VPS:** e.g. `journalctl -u meridian-api -f` or path to log files.

4. **How to clear audit cache**  
   - API uses an in-memory audit cache (content hash, TTL 24h).  
   - Restarting the API clears it. Document: “To clear audit cache, restart the API.”  
   - If you add a cache-clear endpoint or script later, document it here.

5. **Who to contact**  
   - Your (or the team’s) contact for production issues (email / Slack / phone).  
   - Optional: when to escalate (e.g. “If API is down > 15 min, contact …”).

6. **Useful env and config**  
   - List production env vars (names only, no values): e.g. `OPENAI_API_KEY`, `MERIDIAN_USE_LLM`, `MERIDIAN_DEV`.  
   - Note: “To turn off LLM if OpenAI is down: set `MERIDIAN_USE_LLM=0` and restart” (rule-based audit will still run).

7. **Common issues (optional)**  
   - “Audit returns 504” → timeout; check OpenAI; consider turning off LLM.  
   - “Dashboard can’t reach API” → check CORS and `NEXT_PUBLIC_API_URL`.  
   - “Magic link doesn’t work” → confirm link points at production dashboard URL and token not expired.

---

## Step 28 — Launch story: who it’s for, one line, where we tell people

**Goal:** You can describe Meridian and where you’ll announce it (pitch, expo, email, etc.).

### 28.1 Who it’s for (audience)

- Write one sentence, e.g.:  
  “Meridian is for **University of Tampa students** (and eventually other .edu students) who want hiring-manager-level resume feedback before they apply.”
- Optionally add: year (e.g. undergrads, soon-to-graduate), or track (Pre-Health, Business, Tech, etc.) if you’re focusing first on one segment.

### 28.2 One-line pitch

- One sentence that fits in a tweet or a slide, e.g.:  
  “Meridian is the resume audit that scores you like a senior hiring manager—Smart, Grit, and Build—with evidence from your resume and consultant-level advice.”
- Keep it consistent with the dashboard and pitch deck.

### 28.3 Where you’ll tell people (channels)

- List 3–5 concrete places, e.g.:  
  - Pitch competition (date / event name).  
  - Expo (date / event name).  
  - University of Tampa career center (email or meeting).  
  - Email to [list or student org].  
  - Short post or link on [Discord / LinkedIn / Handshake].  
- For each: what you’ll do (e.g. “Send one email with link and one-line pitch,” “Demo at booth,” “Slides + live demo”).

### 28.4 Where to put it

- Add a **Launch story** section to your main roadmap or a short **LAUNCH_STORY.md** in `projects/meridian/docs/` with:  
  - Audience.  
  - One-line pitch.  
  - Channels and next actions (e.g. “Draft email to career center by [date]”).

---

## Quick checklist

| # | Step | Done when |
|---|------|-----------|
| 25 | API deploy | API is live on a public URL; env set; CORS restricted to dashboard; `/health` returns 200. |
| 26 | Dashboard deploy | Dashboard is live; `NEXT_PUBLIC_API_URL` points at live API; full flow works (sign in → audit → PDF). |
| 27 | Runbook | RUNBOOK.md (or equivalent) exists with URLs, restart, logs, cache, contact, and “turn off LLM” note. |
| 28 | Launch story | Audience, one-line pitch, and channels are written down and you know the next 2–3 actions. |

*Last updated: 2025-03. Adjust host names and paths to match your actual setup.*
