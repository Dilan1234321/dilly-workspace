# Verification code auth (B.1)

Students get a **6-digit code** by email instead of a magic link. The email is **school-themed** (e.g. UTampa: Spartans, red/gold, exciting copy) so it feels like the start of something good, not corporate.

---

## API

- **POST /auth/send-verification-code**  
  Body: `{ "email": "you@spartans.ut.edu" }`  
  - Validates .edu email, creates a 6-digit code (10 min expiry), sends school-themed email (or in dev returns `dev_code`).  
  - Response: `{ "ok": true, "message": "Check your inbox. No spam, we promise." }`  
  - If email is not sent (no Resend key or send failed): `{ "ok": true, "message": "...", "dev_code": "123456" }`

- **POST /auth/verify-code**  
  Body: `{ "email": "you@spartans.ut.edu", "code": "123456" }`  
  - Verifies code, creates session, ensures profile.  
  - Response: `{ "token": "<session_token>", "user": { "email": "...", "subscribed": true/false } }`  
  - Frontend stores `token` and sends `Authorization: Bearer <token>` on subsequent requests.

---

## Email

- **Content:** School-specific headline (e.g. *"Spartans don't wait for permission."*), subhead, big 6-digit code, “We don’t sell your data.”
- **Subject (UTampa):** *"Your code is in — Spartans, you're in."*
- **Theme:** Dark background, school primary color (UTampa red) for border and Meridian wordmark. One clear code block.

School is derived from email domain (`spartans.ut.edu`, `ut.edu`, `tampa.edu` → UTampa). Config in `api/schools.py`; add more schools there and in `dashboard/src/lib/schools.ts` when scaling.

---

## Sending email (Resend)

- **With Resend:** Set `RESEND_API_KEY` in env. Optional: `MERIDIAN_EMAIL_FROM` (default `Meridian <onboarding@resend.dev>` for Resend’s test domain).
- **Without key:** No email is sent; API returns `dev_code` in the response so you can paste it in the app during development.

Resend: https://resend.com — verify your domain and set a proper `MERIDIAN_EMAIL_FROM` for production.

---

## Resend in production (runbook)

**Goal:** Verification codes are delivered to real .edu inboxes.

1. **Get an API key**
   - Sign up at [resend.com](https://resend.com).
   - In the dashboard: API Keys → Create API Key. Copy the key (starts with `re_`).

2. **Set env where the API runs**
   - API loads `.env` from the workspace root (see `main.py`). Add:
   ```bash
   RESEND_API_KEY=re_xxxxxxxxxxxx
   ```
   - Optional for production (recommended): set a custom “from” address after verifying your domain (step 3):
   ```bash
   MERIDIAN_EMAIL_FROM="Meridian <onboarding@yourdomain.com>"
   ```
   - If you don’t set `MERIDIAN_EMAIL_FROM`, Resend’s test domain is used: `Meridian <onboarding@resend.dev>`. That works for testing; for production, use your own domain.

3. **Verify a domain (required to send to students)**
   - When sending from `onboarding@resend.dev`, Resend only allows sending **to your own account email**. To send to any .edu (or other) address, you must verify a domain.
   - In Resend: [Domains](https://resend.com/domains) → Add Domain → add your domain (e.g. `yourdomain.com`).
   - Add the DNS records Resend shows (SPF, DKIM, etc.) at your DNS provider.
   - After the domain shows as verified, set `MERIDIAN_EMAIL_FROM` to an address on that domain (e.g. `Meridian <onboarding@yourdomain.com>`).

4. **Restart the API** so it picks up the new env.

5. **Test**
   - Use the dashboard: enter a real .edu email (e.g. your own), click “Get my verification code.”
   - Check that email; you should see the school-themed message with the 6-digit code. Enter the code and complete sign-in.
   - If the email doesn’t arrive: check API logs for `Resend send failed:` (the sender now logs failures). Common causes: invalid API key, domain not verified, or “from” address not allowed.

**Dev vs production**
- **No `RESEND_API_KEY`** (or send fails): API returns `dev_code` when `MERIDIAN_DEV=1` or when the request is from localhost, so you can develop without email or domain verification.
- **With `RESEND_API_KEY`**: Emails are sent. In production, do not set `MERIDIAN_DEV=1` so `dev_code` is never returned.

---

## Frontend (onboarding Screen 2)

1. User enters .edu email on Screen 1 → call **POST /auth/send-verification-code**.
2. Show Screen 2: “Check your inbox. No spam, we promise.” + 6-digit code input.
3. On submit → **POST /auth/verify-code** with `email` + `code`.
4. Store `token` (e.g. localStorage); redirect to Screen 3 (school theme) or next step.

In dev, if the API returns `dev_code`, you can pre-fill or show it so the user can copy/paste without opening email.
