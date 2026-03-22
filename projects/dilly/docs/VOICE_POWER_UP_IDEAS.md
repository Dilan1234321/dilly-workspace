# Meridian Voice — Power-Up Ideas (Deep Dives)

Detailed explanations for features you wanted to hear more about before implementing.

---

## #7 — Tool Use / Inline Actions ✅ Implemented

**What it is:** Let Meridian Voice trigger backend actions directly from the conversation, without the user leaving chat or tapping a separate button.

**How it works:**
- The Voice LLM is given a list of "tools" (functions) it can call: `gap_scan`, `ready_check`, `rewrite_bullet`, `interview_prep`, etc.
- When the user says something like "Run a gap scan for me" or "Am I ready for Goldman?", the model returns a structured request: `{ "tool": "gap_scan", "params": {} }` instead of (or in addition to) text.
- The backend runs the tool, gets the result, and injects it into the next LLM turn: "Here's your gap scan: [result]. Based on that, [follow-up advice]."
- The user gets a seamless experience: ask in natural language, get the action + tailored interpretation in one reply.

**Implementation options:**
1. **OpenAI function calling** — Use `tools` and `tool_choices` in the Chat Completions API. Model returns `tool_calls`; you execute and send the result back in the next message.
2. **Structured output + fallback** — Ask the model to output JSON with optional `{ "action": "gap_scan" }`. Parse the response; if present, run the action and append to context for a second LLM call that synthesizes the reply.
3. **Keyword triggers** — Simpler: detect phrases like "run gap scan", "am I ready for X", "rewrite this bullet" and call the right endpoint before the main reply. Less flexible but no schema changes.

**Pros:** Feels like a real advisor who can "do things" for you. Reduces friction (no tab switching, no separate buttons).  
**Cons:** Adds latency (extra round-trip), cost (more tokens), and complexity. Need to handle tool errors gracefully.

**Recommendation:** Start with option 3 (keyword triggers) for 1–2 high-value actions (gap scan, ready check). If it lands, invest in full function calling.

---

## #8 — Score Trajectory Coaching

**What it is:** Before or during a Voice session, show the user a projected score: "If you complete your top 3 recommendations, your Grit could reach ~78."

**How it works:**
- **Input:** Current scores, audit recommendations (line edits + strategic), and optionally which recs the user has "committed" to (e.g. from action items).
- **Logic:** Heuristic mapping from recommendation type to score delta:
  - Line edit (strong bullet rewrite): +2–5 per dimension it touches
  - Strategic rec (add project, get shadowing hours): +3–8 depending on severity of gap
  - Action rec (add date, fix format): +1–2
- **Output:** "Your potential: Smart 78, Grit 82, Build 75 (if you complete your top recommendations)" — shown as a small card in Career Center or at the top of Voice.

**Implementation:**
- New endpoint `GET /voice/score-trajectory` or computed client-side from audit + recommendations.
- Simple rule table: `{ "line_edit": { "grit": 3, "build": 2 }, "strategic_add_project": { "build": 6 }, ... }`.
- Or: one LLM call: "Given these scores and recommendations, estimate new scores if user completes top 3. Return JSON."
- Display: "Your potential" block with projected scores + "Complete your recommendations to get there."

**Pros:** Gives a concrete target. Motivates action. Differentiator (most tools don't show "what if").  
**Cons:** Heuristic can be wrong; users might over-trust it. LLM version adds cost.

**Recommendation:** Start with a conservative heuristic (low deltas). A/B test whether it drives completion of recommendations.

---

## #9 — Proactive Nudges

**What it is:** Meridian reaches out to the user instead of waiting for them to open the app. "One thing to do this week" pushed to them based on their profile and last audit.

**How it works:**
- **Trigger:** Cron or heartbeat runs daily (or 2–3x/week). For each active user (e.g. ran audit in last 30 days, subscribed):
  - Load profile + last audit.
  - Pick the single highest-leverage action: weakest dimension, top recommendation, or deadline within 7 days.
  - Generate a short, personalized message: "Your Grit is 63. Your leadership bullet about [X] is underselling you. Rewrite it this week."
- **Delivery:** Push notification (requires FCM/APNs setup) or in-app notification (simpler: "When you open the app, show a banner: 'Meridian has a tip for you'") or email.

**Implementation:**
- **Backend:** Cron job that iterates users, calls a `generate_nudge(email)` helper, stores nudge in a `pending_nudges` table or app state.
- **Frontend:** On app open, fetch `GET /nudges`; if any, show banner or modal with the nudge.
- **Push:** Requires mobile app (React Native, etc.) or PWA with push subscription. More infra.
- **Email:** Use Resend (already in stack). "Subject: One thing to do this week — [name]". Body: short, actionable, link to app.

**Pros:** Keeps Meridian top-of-mind. Habit-forming. Feels like a coach checking in.  
**Cons:** Risk of being annoying. Need frequency cap (max 1–2/week). Push/email require user opt-in and deliverability.

**Recommendation:** Start with in-app only: "When you open the app, if it's been 3+ days since last audit and you have recommendations, show a 'One thing to do' card." No push/email until you validate engagement.

---

## #10 — Scraped Company Criteria in Voice

**What it is:** When the user sets a target company (e.g. Goldman Sachs, Google), inject that company's scraped "what we look for" content from public career pages into the Voice context so advice is tailored to that firm's stated priorities.

**How it works:**
- You already have `load_scraped_criteria(company_name)` in `knowledge/loader.py` and `scraped_criteria.json` (populated by `company_criteria_scraper.py`).
- Currently it's used in `build_gap_scan_context` but **not** in `build_voice_knowledge_snippet`.
- **Change:** In `_build_voice_user_content`, when `company` or `target_school` is set, call `load_scraped_criteria(company or target_school)`. If results exist, append a short snippet (200–400 chars) to the knowledge block.
- Voice then sees: "Goldman Sachs career page says: We look for leadership, analytical rigor, teamwork... [snippet]." So when the user asks "What should I emphasize for Goldman?", Voice can reference that.

**Implementation:**
- In `main.py` inside `_build_voice_user_content`, after the track knowledge block:
  ```python
  target = target_school or company
  if target:
      scraped = load_scraped_criteria(target)
      if scraped:
          parts.append("\n== Scraped from company career page ==")
          for s in scraped[:2]:
              parts.append(f"  {s.get('heading','')}: {s.get('content','')[:300]}...")
  ```
- Keep it short to avoid blowing the token budget. 2–3 snippets max, ~300 chars each.

**Pros:** Advice feels more specific to the firm. Reuses existing data. Low effort.  
**Cons:** Scraped data can be stale or generic. Some firms have thin career pages. Need to respect robots.txt and rate limits (already in scraper).

**Recommendation:** Implement. It's a small change, reuses existing infra, and improves company-aware advice. If scraped data is sparse, Voice still has track knowledge and audit data.

---

## Summary

| # | Feature              | Effort | Impact | Next step                          |
|---|----------------------|--------|--------|------------------------------------|
| 7 | Tool use / inline    | Medium | High   | Start with keyword triggers        |
| 8 | Score trajectory     | Low    | Medium | Heuristic + "Your potential" card   |
| 9 | Proactive nudges     | Medium | High   | In-app only first                  |
|10 | Scraped criteria     | Low    | Medium | Add to `_build_voice_user_content`  |
