# Skill Lab — future ideas

Running list of features that match the positioning ("stay ahead of AI", "real
learning, not a playlist, free forever") and the design system (editorial,
curated, calm). Not a roadmap — a bench.

## Shipped
- Industries as the primary entry point (`/industry/[slug]`)
- AI-era skills list per industry + "at risk vs moat" framing
- Cohort pages with a numbered "Start here" path + full library
- Video page with "Where this fits" sidebar and next-in-path nav
- 6-language UI with filter by video language
- Cohort-fit filter during ingest (keyword allowlist + denylist)
- Editorial design system: dark navy, glassmorphism, serif for prose

## Next round — easy wins
- **Full industry coverage**: add 5–10 more industries (nurse, pharmacist,
  accountant, real estate, recruiter, fitness, chef, journalist)
- **Weekly rotation**: `FEATURED_SLUG` on homepage rotates automatically by
  ISO week so every visit feels fresh without touching code
- **"About" page**: manifesto-length version of the home closing section
- **Channel trust signals**: show "trusted by X learners" on a channel across
  cohorts — turns anonymous channels into vetted sources
- **Search**: simple text search across title + cohort + industry. Postgres
  full-text index. No autocomplete in v1.
- **Sitemap + robots.txt**: SEO foundation so cohort/industry pages get indexed

## Next round — high-impact
- **Skills as first-class objects**: each industry's `ai_skills` becomes a
  browseable page with 3–7 curated videos per skill, a short essay ("why this
  matters"), and a checkpoint question. Users can check "I've got this" and
  track progress across their role.
- **Daily drill** at `/today`: one video + one question, builds a streak
  (Duolingo psychology, but for real learning). Saves as a single DB row per
  user per day.
- **Tool directory per industry**: editorial list of the actual tools people
  use, with a sentence each. Not a marketplace — a curated link index.
- **Auto-generated learning outcomes** (one-time LLM pass per video): "After
  watching, you should be able to…" — 3 bullets below the player. Works for
  all ~1,300 existing videos at ~$5 total via Haiku.
- **"Read before you watch"** editorial blurbs per video (curator's note): one
  LLM pass to generate a short "why this one made the cut." Premium feel, low
  cost.

## Differentiators — not yet attempted
- **AI-proof scorecard**: pick your role, answer 5 questions about your work,
  get a percentage breakdown of how automatable each part is. Controversial
  but shareable. Needs careful framing to avoid doom.
- **"The test"**: a 3-question gate at the end of each path that you have to
  answer from memory. Proves you learned, not just watched. Badge on pass.
- **Before/after job cards**: for each industry, show what the role looks
  like today and in 2030 side-by-side. Pure editorial, powerful framing.
- **Skill trees per industry**: visual graph of skills you can unlock by
  watching + passing checkpoints. Branching paths.
- **Study groups**: opt-in weekly cohort (6–10 people on the same industry
  path). Async chat, shared progress. First taste of community without forum
  overhead.

## Paid tier (Dilly Learning Paths — separate product)
- 30/45/60-day structured courses: spine video + exercise + AI coach
- AI coach is the Dilly profile-aware agent (unfair advantage over Coursera)
- Final capstone graded by AI, verification URL, lives on Dilly profile
- First 3–5 paths: "Master ML Foundations", "Become a Data Analyst",
  "Full-Stack Portfolio in 60 Days", "AI-First Marketer", "Operations with AI"

## Platform work
- **Nightly cron**: wire `scripts/ingest.py` into the repo's `crons.json`
  with `LANGUAGES` rotating across days so non-English libraries fill in over
  a week while staying under the 10k/day YouTube quota
- **LLM quality stamp**: once per video, score "signal density" with Haiku.
  Replace or augment the algorithmic `quality_score`. Budget ~$5/month.
- **Transcript search** (cohort-wide): ingest captions, index with tsvector,
  allow queries like "how do load balancers work" to surface the exact video
  and timestamp.
- **A/B framing tests**: the industry page hero copy is very opinionated.
  Test whether "what AI is taking" scares people off or pulls them in.

## Copy / positioning open questions
- Does the "stay ahead of AI" framing resonate with non-tech industries, or
  does it feel threatening? Soften for healthcare, law, teaching.
- Should we add social proof? ("Used by X colleges / Y companies") — only
  when it's true.
- Name the weekly featured path editorial column something. "The Syllabus"?
  "This Week's Reading"?

## Rejected / parked
- User profiles with follower counts (turns into a content site)
- Comments on videos (moderation burden, not our value)
- A "learn together" live viewing feature (cool, but needs real-time infra)
- Paid monthly subscription to "premium" videos (we're free forever; monetize
  via Learning Paths)
