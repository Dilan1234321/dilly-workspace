/**
 * Static UI copy in Dilly's voice. Prefer importing from here instead of ad-hoc strings
 * for empty states, buttons, loading, errors, and settings where personality is appropriate.
 * Excluded: billing, legal, auth (use neutral copy there).
 */
export const DILLY_COPY = {
  empty_states: {
    action_items:
      "Nothing here yet — start a conversation and I'll create your first ones.",
    memory: "Start a conversation with me and I'll start building your career story.",
    applications: "No applications yet. Add one when you apply somewhere.",
    history: "Your conversation history will appear here.",
    am_i_ready: "Type a company name and I'll tell you where you stand.",
  },
  loading: {
    audit: "Reading your resume...",
    ats_simulation: "Simulating how Workday reads this...",
    am_i_ready: "Comparing your scores to their bar...",
    home_insight: "",
    voice: "Getting ready...",
  },
  buttons: {
    start_audit: "Audit my resume",
    view_ats: "See how ATS reads this",
    talk_to_dilly: "Talk to Dilly",
    fix_with_dilly: "Fix this with Dilly",
    check_readiness: "Am I ready?",
    see_actions: "See action items",
    run_again: "Check again",
  },
  errors: {
    generic: "Something went wrong on my end. Give it another try.",
    audit_failed: "I couldn't read that resume. Try a different file format.",
    voice_failed: "Lost the connection. Come back and we'll pick up where we left off.",
  },
  settings: {
    notifications_description: "One message per day, maximum. Always specific to you.",
    memory_description: "Everything I know about you, in one place. You own it.",
    voice_description: "I remember everything from every conversation.",
  },
} as const;
