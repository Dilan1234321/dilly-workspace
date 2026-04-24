# Dilly Recruiter — Autonomous Progress Log

This file is Claude's cockpit notebook while Dilan is away.
Read top-down for a chronological log of what got shipped, what's queued, and where decisions were made.

---

## North star

Make Dilly Recruiter / The Blind Audition powerful, impressive, and *legitimately great for the industry* — the kind of product hiring managers and recruitment teams respect and actually use. The Perplexity competition is the near-term forcing function; industry adoption is the real prize.

## Operating principles

- Work only in the real live code — the deployed app at `projects/blind-audition/`, not the legacy dashboard demo
- Branch: `recruiter-v2` (already in use — commit here, push after each atomic change)
- Never force-push, never touch main, never bypass hooks, never modify git config
- Safe-by-default: commits are atomic and revertible; each commit builds cleanly
- Prefer editing existing files over creating new ones
- Keep the three philosophical commitments: profile-first, narrative-first, no scores

## The revolutionary thesis (why this matters beyond the competition)

The Dilly Profile is a primitive. Every other product is the same profile refracted through a different lens:
- App = profile looking inward (self-knowledge)
- Skills = profile looking forward (what to learn next)
- Web profile = profile looking outward (who sees me)
- Recruiter = profile seen through an employer's eyes
- Student/Seeker/Holder modes = profile across life stages

Three latent unlocks the product has but doesn't yet shout about:
1. **Provenance** — every `profile_fact` has `source` + `confidence`. Make it a visible receipt on every claim.
2. **Lifetime identity** — Student → Seeker → Holder already exists. The first career identity system that grows with a person from 15 to 65.
3. **Dilly knows first** — background conversation extraction. The conversation IS the product. No form can compete with what a person tells Dilly over six months.

The Blind Audition is the demonstration of these at once. The current thesis (per the April 23 rebuild): **the reveal is about depth, not school prestige.** Fact count IS the signal. Dilan (20 facts) ranks above Gabriel (0 facts) not because of his school but because he has actually used Dilly.

---

## Log (newest first)

### 2026-04-23 — Pivot: the real Blind Audition is at `projects/blind-audition/`
- Discovered mid-session that my batch-1 work was targeting the wrong file. The real deployed Blind Audition lives at `projects/blind-audition/` (standalone Express+Vite React SPA) and is live at **https://dilly-blind-audition.pplx.app** on Perplexity Labs.
- Server: `projects/blind-audition/server/routes.ts` connects to production RDS via `DILLY_DB_PASSWORD`. Pulls 3 live Dilly users on every request (Dilan Kochhar 20 facts, Hamza Qureshi 3, Gabriel Cruz 15).
- Ecosystem integration is already wired: recruiter expresses interest → server calls `/internal/recruiter-interest/notify` on the Dilly API (via `DILLY_INTERNAL_KEY` header) → Dilly queues email + push to the candidate.
- My batch-1 commit (`798803c`) on the wrong file is preserved on branch `claude-batch-1-archive` — candidate writing and analytics-panel ideas may be salvageable if we ever bring the dashboard-route Blind Audition back.

### Revised plan — layer onto the real blind-audition app
All work below targets `projects/blind-audition/**`, not the dashboard. Each ships as an atomic commit on `recruiter-v2`.

- [x] **Provenance passthrough** — shipped as `45146f3`. Candidate type now carries a proper `ProfileFact` shape with `source`, `confidence`, `created_at`; `formatProvenance()` turns them into "From conversation with Dilly · March 12, 2026 · medium confidence" receipts under each fact, with a tiny document-icon prefix. Keeps quiet when confidence is high (default case).
- [x] **Staggered reveal sequence** — shipped as `b4e013f`. "Reveal all at once" was a no-op; now reveals candidates with a 1.4s pause between each. The pause is where the thesis lands.
- [x] **Post-reveal reflection panel** — shipped as `b4e013f`. Shows fact-count distribution as horizontal bars, a 3-stat row (total facts, depth spread, live profile count), and closes on a black panel: "A resume would have made these three look similar. Dilly didn't."
- [x] **Live ecosystem stat in intro** — shipped as `0f2d773`. Pulls `totalFacts` from `/api/health` and renders as a pill with a pulsing green dot: "● Live from production · 38 facts across 3 profiles". Hidden gracefully if the DB is unreachable.

All three commits pushed to `origin/recruiter-v2` at `0f2d773`. Perplexity Labs should auto-pick up the next preview build.

### Deferred / nice-to-have (next batch candidates)
- **Saved-interests panel** — `/api/blind-audition/interests?recruiter_email=...` already exists server-side; build the client surface so returning recruiters see their candidate history.
- **Mobile polish pass** on the full flow — verify ≤390px, fix any overflow/stacking in the role-select grid and the ReflectionPanel bars.
- **Exportable outcome card (PNG)** — "Share this reveal" button that captures the ReflectionPanel + top 3 ranks as an image a recruiter can drop in Slack/email. Viral loop.
- **Candidate depth comparison view** — a sticky "comparison tray" recruiters can drag candidates into for side-by-side reading.
- **Real-time profile growth ticker** — tiny subscriber to candidate profile updates so "38 facts" becomes "39 facts" live during the demo.
- **Lockout UX when DILLY_INTERNAL_KEY is missing** — right now the server quietly skips the notification when the key is absent; surface this on the interest-success screen so the recruiter knows whether the candidate will actually hear from them.

### 2026-04-23 — Session start
- Audited full recruiter surface (6,550 lines across 9 files) in `dashboard/src/app/recruiter/`.
- Original plan (now revised — see pivot above): 8 hardcoded archetype candidates + ATS-filter analytics + provenance on the dashboard demo.
