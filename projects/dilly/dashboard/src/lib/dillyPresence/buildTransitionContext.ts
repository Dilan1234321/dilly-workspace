import type { TransitionContext, TransitionSource } from "./types";

/**
 * Synchronous transition payloads for Voice — mid-thought openers (no LLM).
 * Fill `data` with the keys each branch expects.
 */
export function buildTransitionContext(
  source: TransitionSource,
  data: Record<string, unknown>,
): TransitionContext {
  switch (source) {
    case "ats_critical_issue": {
      const section = String(data.section ?? "Experience");
      return {
        opening_message: `The "${section}" header — Workday buckets it as "Other" and recruiters rarely search there. Here's the exact rename that fixes it.`,
        pre_loaded_intent: "fix_ats_section_header",
        relevant_data: { ...data, section },
      };
    }
    case "ats_fix_button": {
      return {
        opening_message: String(data.opening_message ?? "Let's fix this ATS issue step by step."),
        pre_loaded_intent: "ats_quick_fix",
        relevant_data: data,
      };
    }
    case "checklist_failing_item": {
      const item = String(data.item_name ?? "One checklist item");
      const score = data.score != null ? String(data.score) : "?";
      return {
        opening_message: `${item} — this is the one holding your score at ${score}. Here's what it needs to look like.`,
        pre_loaded_intent: "checklist_item_fix",
        relevant_data: data,
      };
    }
    case "action_item_cta": {
      return {
        opening_message: String(data.opening_message ?? "Let's knock out this action item."),
        pre_loaded_intent: "action_item",
        relevant_data: data,
      };
    }
    case "am_i_ready_followup": {
      const company = String(data.company ?? "that company");
      const verdict = String(data.verdict ?? "a verdict");
      const delta = String(data.delta ?? "0");
      return {
        opening_message: `Last time you asked about ${company} I said ${verdict}. Your score has moved ${delta} since then. Let's see if the answer changed.`,
        pre_loaded_intent: "am_i_ready_follow_up",
        relevant_data: data,
      };
    }
    case "score_card_grit": {
      const score = String(data.score ?? "?");
      const n = String(data.gap_points ?? "?");
      const weakness = String(data.weakness ?? "consistency on proof points");
      return {
        opening_message: `Your Grit is ${score} — ${n} points below Top 25%. The specific gap is ${weakness}. Want to fix it now?`,
        pre_loaded_intent: "improve_grit",
        relevant_data: data,
      };
    }
    case "score_card_smart": {
      const score = String(data.score ?? "?");
      const n = String(data.gap_points ?? "?");
      const weakness = String(data.weakness ?? "technical signal");
      return {
        opening_message: `Your Smart is ${score} — ${n} points below Top 25%. The specific gap is ${weakness}. Want to fix it now?`,
        pre_loaded_intent: "improve_smart",
        relevant_data: data,
      };
    }
    case "score_card_build": {
      const score = String(data.score ?? "?");
      const n = String(data.gap_points ?? "?");
      const weakness = String(data.weakness ?? "leadership proof");
      return {
        opening_message: `Your Build is ${score} — ${n} points below Top 25%. The specific gap is ${weakness}. Want to fix it now?`,
        pre_loaded_intent: "improve_build",
        relevant_data: data,
      };
    }
    case "deadline_card": {
      const company = String(data.company ?? "This firm");
      const n = String(data.days ?? "?");
      const vendor = String(data.vendor ?? "ATS");
      const score = String(data.ats_score ?? "?");
      const bar = data.above_bar === true ? "above" : "below";
      return {
        opening_message: `${company} closes in ${n} days. Your ${vendor} score is ${score} — ${bar} their typical bar. Here's what matters most right now.`,
        pre_loaded_intent: "deadline_prep",
        relevant_data: data,
      };
    }
    case "application_silence": {
      return {
        opening_message: String(
          data.opening_message ??
            "You've had quiet applications for a bit. Let's diagnose whether it's follow-up, targeting, or resume signal.",
        ),
        pre_loaded_intent: "application_silence",
        relevant_data: data,
      };
    }
    case "rejection_debrief": {
      return {
        opening_message: String(data.opening_message ?? "Walk me through what happened with that application — we'll turn it into a concrete next move."),
        pre_loaded_intent: "rejection_debrief",
        relevant_data: data,
      };
    }
    case "cohort_pulse_cta": {
      return {
        opening_message: String(data.opening_message ?? "Here's what moved in your cohort this week and what it means for you."),
        pre_loaded_intent: "cohort_pulse",
        relevant_data: data,
      };
    }
    case "cert_landing": {
      const name = String(data.cert_name ?? "this certification");
      return {
        opening_message: String(
          data.opening_message ?? `Let's make **${name}** land on your resume — placement, wording, and a line you can paste.`,
        ),
        pre_loaded_intent: "cert_resume_landing",
        relevant_data: data,
      };
    }
    default: {
      return {
        opening_message: String(data.opening_message ?? ""),
        pre_loaded_intent: "generic",
        relevant_data: data,
      };
    }
  }
}
