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

- [ ] **Provenance passthrough** — the DB already has `source` + `confidence` on every `profile_fact`. Server currently drops them. Wire them through: `server/routes.ts` mapping, `Candidate` type in `client/.../BlindAudition.tsx`, expanded-facts panel renders a compact receipt ("from conversation · March 12, 2026 · high confidence"). Makes every claim inspectable.
- [ ] **Post-reveal reflection panel** — after all three are revealed, show the fact-count distribution and close with the industry argument: "A resume would have made these three look similar. Dilly didn't. This is what the difference looks like."
- [ ] **Live ecosystem stat in intro** — `/api/health` already returns `totalFacts`. Surface in intro: "Live from production. N facts across 3 candidates. Updated as they talk to Dilly." Makes the real-data claim tangible.
- [ ] **Staggered reveal sequence** — "Reveal all at once" currently no-ops. Wire it to reveal cards one at a time with ~1.5–2s between each. Drama matters for the competition demo.

### Deferred / nice-to-have
- Saved-interests panel — `/api/blind-audition/interests?recruiter_email=...` already exists server-side; build the client surface for returning recruiters.
- Mobile polish pass on the full flow.
- Exportable outcome card (PNG).

### 2026-04-23 — Session start
- Audited full recruiter surface (6,550 lines across 9 files) in `dashboard/src/app/recruiter/`.
- Original plan (now revised — see pivot above): 8 hardcoded archetype candidates + ATS-filter analytics + provenance on the dashboard demo.
