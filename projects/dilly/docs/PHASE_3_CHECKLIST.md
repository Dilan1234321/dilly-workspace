# Phase 3 — E2E polish, errors, mobile, launch

**Goal:** Full path works end-to-end. Onboarding → payment → resume upload → audit → Career Center + Voice. Ready for launch.

---

## 3.1 End-to-end flow

| Check | Done |
|-------|------|
| Welcome → enter .edu email → send code → no dead end | ✅ |
| Verify code → success → school theme / next step | ✅ |
| Onboarding: name, major, pre-prof, track, goals, What is Meridian, bridge, resume ask | ✅ |
| Payment screen: Unlock, Dev unlock, or Beta code → main app | ✅ |
| Main app: Career Center, Resume Review, Voice all reachable | ✅ |
| Run audit → results → PDF, share, Voice, Career Center all work | ✅ |
| Sign out / change school: no broken state | ✅ |

---

## 3.2 Gating (resume after payment)

| Check | Done |
|-------|------|
| Audit, report, Voice, Career Center require subscribed user (API returns 401/403 when not subscribed) | ✅ |
| Dashboard shows paywall when !user.subscribed; no access to audit/Voice/Center until paid or dev-unlock | ✅ |

---

## 3.3 Error states & friendly copy

| Check | Done |
|-------|------|
| Auth: invalid email, wrong code, missing code → friendly message (no raw API detail) | ✅ |
| Auth: network/API failure → "We couldn't send the code. Try again." / "Check your connection." | ✅ |
| Subscribe: Stripe not configured → inline message (no alert) | ✅ |
| Subscribe: Dev unlock fail → inline message (no alert) | ✅ |
| Audit: upload/API failure → friendly message in UI | ✅ |
| Voice: API failure → message in chat | ✅ |
| Profile save failure: optional toast or inline | ✅ |

---

## 3.4 Mobile-first

| Check | Done |
|-------|------|
| Viewport meta / layout: device-width, initialScale 1 | ✅ |
| 375px width: no horizontal scroll, content readable | ✅ |
| Touch targets ≥ 44px (buttons, nav, inputs) | ✅ |
| Bottom nav usable on phone; Voice chat scrolls | ✅ |
| Onboarding: all steps usable on small screen | ✅ |

---

## 3.5 Launch checklist

| Check | Done |
|-------|------|
| API: env doc (OPENAI, CORS, RESEND, STRIPE, etc.) | ✅ |
| API: runbook or start command (uvicorn, venv) | ✅ |
| Dashboard: build + deploy (e.g. Vercel); NEXT_PUBLIC_API_URL | ☐ (build passes; deploy remaining) |
| Optional: soft launch link or list | ☐ (remaining) |

Env doc and runbook: `docs/LAUNCH_ENV_AND_RUNBOOK.md`.

---

*Update the Done column as you complete each item. Phase 3 is "done" when 3.1–3.5 are checked.*
