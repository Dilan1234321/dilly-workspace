# Meridian Voice — More power-up ideas

Ideas to make Voice more powerful beyond the current batch (screen-aware help, synthesis rules, tools, feedback, settings).

---

## Already implemented (this batch)

- **Multi-step synthesis:** When the user asked for a plan/steps/timeline, provide it after summarizing the tool result; after every tool result, give one concrete next step this week.
- **Voice-initiated actions:** `create_deadline` and `create_action_item` tools; side effects emitted in the done event; frontend persists to profile / action items.
- **Compare two audits:** `last_audit` in context with previous vs latest scores and meridian_take so Voice can compare progress.
- **Stronger model when it matters:** Expanded deep-dive phrases (plan, am I ready, give me a plan, steps, timeline) so we use the strong model for these.
- **Thumbs-down feedback:** Separate thumbs-down control next to the heart; both up and down sent to `/voice/feedback`.
- **Voice settings (no in-chat overrides):** `voice_always_end_with_ask` and `voice_max_recommendations` in Settings; injected into context so Meridian obeys them; users cannot change behavior by “telling” Meridian in chat.

---

## More ideas (future)

1. **Proactive nudge at session start**  
   When the user opens Voice, if we have a close deadline (e.g. &lt;7 days), one open action item, or a “do these 3 next” from the center, prepopulate a short system hint: “User just opened Voice. They have [X]. Consider opening with a one-line nudge if they don’t ask something specific.” Model can choose to mention it or not.

2. **“Explain this bullet” from Hiring tab**  
   Let the user select a bullet (or a finding) on the Hiring/Resume Review screen and tap “Ask Meridian why” or “How do I fix this?”. Send that bullet/finding as context with the message so Voice can explain and suggest a rewrite without the user pasting.

3. **Structured follow-ups**  
   Instead of only free-form suggestions, allow “Quick actions” in the done event: e.g. `{ "quick_actions": ["Run gap scan", "Add to calendar", "Add to tasks"] }`. Frontend shows chips; tapping one either runs the tool (gap scan) or sends a short message that triggers the right tool (e.g. “Add that to my tasks” → create_action_item).

4. **Voice memory that survives sessions**  
   Backend already has voice memory; ensure “Remember this” notes and key facts (e.g. “I’m targeting consulting”) are stored in profile (voice_notes) and optionally in a small “voice_facts” list that gets summarized into context so the model doesn’t forget across sessions.

5. **Confidence and hedging**  
   When the model is unsure (e.g. no audit data, missing track, or question outside resume), add a short instruction: “If you don’t have enough context, say so in one line and suggest what would help (e.g. run an audit, add a goal). Do not invent data.”

6. **One-click “Add to calendar” / “Add to tasks” from suggestions**  
   Voice extracts deadlines from the turn, persists them server-side, and returns `deadlines_auto_saved` in `/voice/chat` and stream `done`; the client merges into profile and toasts. No confirmation sheet. For `action_items`, the UI may still show a short follow-up. When the model uses create_deadline tools, avoid duplicating “saved” messaging.

7. **Voice from Insights (context-aware)**  
   When the user is on Insights > ATS Readiness (or Keywords, Vendors) and asks “What does this mean?” or “How do I fix this?”, send `current_screen` (see VOICE_SCREEN_AWARE_HELP.md) so the model can reference the exact screen and data.

8. **Short “today” summary**  
   Optional: at the start of the first Voice message of the day, inject one line: “Today’s focus (from Calendar): [soonest deadline]. Open action items: [first 2].” So the model can tailor the first reply without the user having to say it.

9. **Rate limit and backoff for tools**  
   If the user sends many messages in a row that all trigger heavy tools (e.g. gap_scan, ready_check), consider light rate limiting or a short “I already ran a gap scan above; want to go deeper on one of those?” to avoid repetition and cost.

10. **Personality presets in Settings**  
    Beyond tone (Encouraging, Direct, etc.), add optional presets: “Strict coach”, “Supportive friend”, “No fluff”. Each maps to a few injected lines (e.g. “Be brief and direct; no pep talk”) so the user picks behavior in Settings, not in chat.

---

## Doc references

- **Screen-aware help:** `VOICE_SCREEN_AWARE_HELP.md` — how to implement `current_screen` and inject a one-line hint.
- **What’s in the app:** `WHATS_IN_THE_APP.md` — single source of truth for built vs not built.
