# Integrations + Portability — Not Yet Implemented

**Purpose:** Track what we planned but haven't built yet. Update when we ship or deprioritize.

---

## LinkedIn

- **Planned:** Sync experience, connections; suggest profile updates.
- **Why not yet:** Requires LinkedIn OAuth and API integration. Higher effort; LinkedIn API access can be restrictive.
- **When to revisit:** When we have bandwidth for OAuth flows and external API integrations.

---

## Email

- **Planned:** Parse recruiter emails for deadlines and next steps.
- **Why not yet:** Requires email integration (Gmail/Outlook OAuth or IMAP), parsing logic, and clear UX for "what we read vs store."
- **When to revisit:** After calendar and import are proven; when users ask for it.

---

## External calendar sync (read)

- **Planned:** Link interviews and deadlines from Google/Apple Calendar into Meridian.
- **Why not yet:** We have one-way export (.ics). Two-way sync needs OAuth and conflict resolution.
- **When to revisit:** If users want Meridian to pull in existing calendar events.

---

---

## Reference

- **Implemented:** See `IDEAS.md` (Integrations + Portability) and `WHATS_IN_THE_APP.md`.
- **In app:** Settings > Integrations > "Coming soon" lists LinkedIn and Email.

*Last updated: March 2026*
