# Meridian Voice — Screen-aware help (Idea 2)

**Goal:** When the user asks "What does this number mean?" or "How do I use this?", Voice knows which part of the app they're on and can give in-context help.

---

## How it could work

1. **Frontend sends "current screen" with each message (optional)**  
   When the user is on a specific tab/section, the client includes a small context field when posting to `/voice/stream`:
   - `context.current_screen`: string, e.g. `"center"` | `"hiring"` | `"insights"` | `"insights_ats"` | `"insights_ats_keywords"` | `"insights_ready_check"` | `"voice"` | `"calendar"` | `"jobs"` | `"achievements"` | `"settings"`.
   - Optional: `context.focused_block` for a more specific area (e.g. `"score_cards"`, `"do_these_3_next"`, `"ats_overview"`, `"keyword_density"`).

2. **Where to set `current_screen`**  
   - **Option A (simplest):** When the user is in the Voice tab, we already know `mainAppTab`. So we could send `current_screen: mainAppTab` (e.g. `"voice"`). That doesn’t tell us “they were on Insights before opening Voice.”  
   - **Option B (better):** Track “last visited tab/section” in state (e.g. `lastVisitedScreen`). When the user switches to Voice, set `lastVisitedScreen = previousTab` (or the section they were on). Send `current_screen: lastVisitedScreen` with the next Voice message. So if they were on Insights > ATS Readiness and then open Voice and ask “What does this score mean?”, we send `current_screen: "insights_ats"`.  
   - **Option C (richest):** When the user is *inside* a tab (e.g. Insights), add a “Ask Meridian” or “?” button that opens Voice with a pre-filled prompt and `current_screen: "insights_ats_keywords"`. So the message is sent with screen context only when they explicitly ask from that screen.

3. **Backend injects a one-line hint**  
   In `_build_voice_user_content`, if `context.get("current_screen")` is present, append:
   - `"[User is currently on / was just on: {screen}. They may be asking about what they see on that screen.]"`
   - Optionally map `current_screen` to a short description (e.g. from `voice_app_features.json` or a small map) so the model gets: “User is on Insights > ATS Readiness. They may be asking about ATS score, keyword placement, or checklist.”

4. **Screen ID list (single source of truth)**  
   Define a small set of screen IDs and, for each, 1–2 sentences of “what the user sees here”:
   - `center` — Career center: goal, scores, Do these 3 next, playbook, Jobs/Audit/Achievements.
   - `hiring` — Resume Review: audit results, radar chart, findings, recommendations, share card.
   - `insights` — Insights home: progress, trajectory, playbook, career tools.
   - `insights_ats` — ATS Readiness: ATS score, what ATS sees, checklist, issues, keywords.
   - `insights_keywords` — Keywords tab: density, placement per keyword, JD match.
   - `insights_vendors` — Vendors tab: Workday/Greenhouse/etc scores.
   - `insights_ready` — Am I Ready?: company/role, verdict, gaps.
   - `voice` — Meridian Voice chat.
   - `calendar` — Calendar: deadlines.
   - `jobs` — Jobs list/bookmarks.
   - `achievements` — Achievement collection (stickers).
   - `settings` — Settings.

   Store this in the backend (e.g. a dict or a small section in `voice_app_features.json`) and use it to build the one-line hint so the model knows what “this screen” refers to.

5. **No hallucination**  
   System prompt: “When the user asks about ‘this’ or ‘here’ and you have current_screen, assume they mean that screen. Describe only what exists on that screen (from the app features reference). Do not invent UI.”

---

## Implementation order

**Option C (implemented):** "Ask Meridian" buttons on specific screens open Voice with a pre-filled prompt and send `current_screen` with that message only.

1. **Frontend:** `voiceScreenContext` state; `openVoiceFromScreen(screenId, prompt?)` sets context + pending prompt and switches to Voice tab. `buildVoiceContext()` includes `current_screen` when set; cleared after the next send so only that one message gets screen context.
2. **Backend:** `_VOICE_SCREEN_DESCRIPTIONS` map; in `_build_voice_user_content`, when `current_screen` is present, append the one-line hint. System prompt has "Screen-aware help" section.
3. **UI:** "Ask Meridian" button on Insights > ATS (insights_ats/keywords/vendors by tab), Am I Ready, Resume Review (hiring).
4. (Option B for later) Add a line to the Voice system prompt: “When current_screen is provided, the user may be asking about what they see on that screen. Use the app features reference to describe only what exists there.”

---

## Edge cases

- User opens Voice from the nav without having been on another tab: send `current_screen: "voice"` or omit.
- User asks something unrelated to the screen (“What stickers can I get?”): the model should still answer from the achievements list; the screen hint is “they might be asking about this screen,” not “only talk about this screen.”
- Multiple sections on one tab (e.g. Insights has ATS, Keywords, Vendors): use `focused_block` or a more specific `current_screen` (e.g. `insights_ats`) when we have it; otherwise use `insights`.
