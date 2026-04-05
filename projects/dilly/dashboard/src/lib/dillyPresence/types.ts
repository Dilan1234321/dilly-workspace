import type {
  ActionItem,
  AuditV2,
  MemoryItem,
  DillyDeadline,
  UserCohortPulse,
} from "@/types/dilly";

/** Logged application row (Career Hub / API shape may vary). */
export type PresenceApplication = {
  id?: string;
  company?: string;
  company_name?: string;
  role?: string;
  status?: string;
  applied_at?: string;
  updated_at?: string;
};

export interface HomeInsightContext {
  latest_audit: AuditV2 | null;
  previous_audit: AuditV2 | null;
  score_delta: number | null;
  peer_percentile: number | null;
  upcoming_deadlines: DillyDeadline[];
  applications: PresenceApplication[];
  action_items: ActionItem[];
  memory_items: MemoryItem[];
  last_insight: string | null;
  last_insight_at: string | null;
  days_since_last_audit: number | null;
  cohort_pulse: UserCohortPulse | null;
}

export type FeedCardType =
  | "score"
  | "dilly_insight"
  | "cohort_pulse"
  | "ats"
  | "action_items"
  | "deadlines"
  | "applications"
  | "session_capture"
  | "conversation_output"
  | "am_i_ready";

export interface FeedCard {
  id: string;
  type: FeedCardType;
  priority_score: number;
  reason: string;
}

export interface FeedOrderContext {
  has_critical_ats_issues: boolean;
  days_until_nearest_deadline: number | null;
  deadline_label: string | null;
  undone_action_items: number;
  oldest_action_item_days: number;
  days_since_last_application: number | null;
  score_delta: number | null;
  unseen_session_capture: boolean;
  unseen_conversation_output: boolean;
  unseen_cohort_pulse: boolean;
  is_recruiting_season: boolean;
  peer_percentile: number | null;
  /** ATS scan score 0–100 when known */
  ats_score: number | null;
  /** When true, bumps am_i_ready card in feed ordering */
  am_i_ready_follow_up_pending?: boolean;
}

export type CardStripType = "score" | "ats" | "applications" | "deadlines" | "action_items";

export interface CardStripContext {
  /** eslint-disable @typescript-eslint/no-explicit-any */
  [key: string]: unknown;
}

export type TransitionSource =
  | "ats_critical_issue"
  | "ats_fix_button"
  | "checklist_failing_item"
  | "action_item_cta"
  | "am_i_ready_followup"
  | "score_card_grit"
  | "score_card_smart"
  | "score_card_build"
  | "deadline_card"
  | "application_silence"
  | "rejection_debrief"
  | "cohort_pulse_cta"
  | "cert_landing";

export interface TransitionContext {
  opening_message: string;
  pre_loaded_intent: string;
  relevant_data: Record<string, unknown>;
}
