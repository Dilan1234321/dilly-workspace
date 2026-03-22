# Meridian: Writing and Copy (Core Rules)

Core rules for all user-facing and generated copy in the Meridian app and API.

---

## NEVER use em dashes

**NEVER EVER show em dashes (—) in the app.** They look unprofessional and horrible.

- In UI copy, notifications, audit text, and Voice prompts: use a **colon**, **period**, or **rephrase** instead.
- Examples:
  - ✅ "Your strongest signal is Grit: you demonstrated leadership…"
  - ✅ "Your Build score is below the Top 25%. See recommendations to improve."
  - ❌ "Grit—you demonstrated…" or "Top 25%—see recommendations"

This applies to:

- `meridianUtils.ts` and any generated sentences (e.g. strongest signal, gap copy)
- `page.tsx`, `jobs/page.tsx`, and all dashboard UI strings
- Notifications and toast messages
- Voice prompt templates and system messages
- Any new feature copy

When in doubt, use a colon or split into two sentences.
