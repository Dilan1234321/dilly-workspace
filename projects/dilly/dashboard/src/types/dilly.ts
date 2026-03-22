/**
 * Shared Dilly types for dashboard and API responses.
 */

export type Rec = {
  type?: "generic" | "line_edit" | "action";
  title: string;
  action: string;
  current_line?: string | null;
  suggested_line?: string | null;
  score_target?: string | null;
  diagnosis?: string | null;
};

export type AuditV2 = {
  id?: string;
  candidate_name: string;
  detected_track: string;
  major: string;
  scores: { smart: number; grit: number; build: number };
  final_score: number;
  audit_findings: string[];
  evidence: Record<string, string>;
  evidence_quotes?: Record<string, string> | null;
  recommendations: Rec[];
  raw_logs: string[];
  dilly_take?: string | null;
  strongest_signal_sentence?: string | null;
  consistency_findings?: string[] | null;
  red_flags?: ({ message: string; line?: string | null } | string)[] | null;
  peer_percentiles?: { smart: number; grit: number; build: number } | null;
  peer_cohort_n?: number | null;
  peer_fallback_all?: boolean | null;
  benchmark_copy?: Record<string, string> | null;
  application_target?: string | null;
  resume_text?: string | null;
  structured_text?: string | null;
  page_count?: number | null;
};

export type DimensionKey = "smart" | "grit" | "build";

/** In-chat mock interview assistant turn (Voice). */
export type VoiceMockTurnDisplay =
  | {
      kind: "question";
      number: number;
      total: number;
      text: string;
    }
  | {
      kind: "feedback";
      questionNumber: number;
      total: number;
      score: number | null;
      label: string | null;
      feedback: string | null;
      strengths: string[];
      improvements: string[];
      nextQuestion: string | null;
      isFinal: boolean;
      sessionScore: number | null;
    }
  | {
      kind: "complete";
      sessionScore: number | null;
      summaryLines: string[];
    };

export type VoiceConvo = {
  id: string;
  title: string;
  messages: {
    role: "user" | "assistant";
    content: string;
    ts?: number;
    mockTurn?: VoiceMockTurnDisplay;
  }[];
  updatedAt: number;
  createdAt?: number;
};

export type DillySubDeadline = { id: string; label: string; date: string };

export type DillyDeadline = {
  id: string;
  label: string;
  date: string;
  subDeadlines?: DillySubDeadline[];
  createdBy?: "user" | "dilly";
  /** When set, deadline is "done": hidden from list/urgent banner but kept in calendar; Voice can reference it. */
  completedAt?: number | null;
};

export type DetectedDeadline = {
  label: string;
  date: string;
  subDeadlines?: { label: string; date: string }[];
};

export type ProfileAchievements = Record<string, { unlockedAt: number }>;

export type ProfileThemeId = "professional" | "bold" | "minimal" | "warm" | "high_contrast";

export type VoiceTone = "encouraging" | "direct" | "casual" | "professional" | "coach";

export type MemoryCategory =
  | "target_company"
  | "concern"
  | "mentioned_but_not_done"
  | "person_to_follow_up"
  | "deadline"
  | "achievement"
  | "preference"
  | "goal"
  | "rejection"
  | "interview"
  | "strength"
  | "weakness";

export type MemoryAction =
  | "open_am_i_ready"
  | "open_bullet_practice"
  | "open_interview_prep"
  | "open_templates"
  | "open_calendar"
  | "open_career_hub"
  | "open_voice"
  | "open_certifications"
  | "open_ats";

export type MemoryItem = {
  id: string;
  uid: string;
  category: MemoryCategory;
  label: string;
  value: string;
  source: "voice" | "audit" | "profile" | "application";
  created_at: string;
  updated_at: string;
  action_type: MemoryAction | null;
  action_payload: Record<string, string> | null;
  confidence: "high" | "medium" | "low";
  shown_to_user: boolean;
};

export type SessionCapture = {
  id: string;
  uid: string;
  conv_id: string;
  captured_at: string;
  items_added: string[];
  narrative_updated: boolean;
  items?: MemoryItem[];
};

export type ReadyCheckVerdict = "ready" | "almost" | "stretch" | "not_yet";

export type ReadyCheckAction = {
  id: string;
  ready_check_id: string;
  priority: number;
  title: string;
  description: string;
  dimension: "smart" | "grit" | "build";
  estimated_pts: number;
  effort: "low" | "medium" | "high";
  action_type: string;
  action_payload: Record<string, string>;
  completed: boolean;
  completed_at: string | null;
};

export type ReadyCheck = {
  id: string;
  uid: string;
  company: string;
  role: string | null;
  created_at: string;
  verdict: ReadyCheckVerdict;
  verdict_label: string;
  summary: string;
  user_scores: { smart: number; grit: number; build: number; final: number };
  company_bars: { smart_min: number; grit_min: number; build_min: number; final_min: number };
  dimension_gaps: { smart: number; grit: number; build: number; final: number };
  dimension_narratives: { smart: string; grit: string; build: string };
  actions: ReadyCheckAction[];
  timeline_weeks: number | null;
  timeline_note: string | null;
  follow_up_sent: boolean;
  follow_up_sent_at: string | null;
  follow_up_opened: boolean;
  re_checked_after_follow_up: boolean;
};

export type CohortPulse = {
  id: string;
  week_start: string;
  track: string;
  school_id: string;
  students_improved: number;
  students_total: number;
  avg_score_change: number;
  avg_grit_change: number;
  avg_smart_change: number;
  avg_build_change: number;
  top_improvement_pattern: string;
  top_improvement_dimension: "smart" | "grit" | "build";
  top_improvement_avg_pts: number;
  headline: string;
  insight: string;
  dilly_commentary: string;
  cohort_avg_score?: number;
};

export type UserCohortPulse = {
  id: string;
  uid: string;
  pulse_id: string;
  week_start: string;
  user_score: number;
  user_score_change: number;
  user_grit: number;
  user_smart: number;
  user_build: number;
  user_percentile: number;
  cta_type: string;
  cta_label: string;
  cta_payload: Record<string, string>;
  seen: boolean;
  seen_at: string | null;
  acted: boolean;
  acted_at: string | null;
  dilly_commentary?: string;
};

export type ScoreImpactEstimate = {
  total_pts: number;
  dimension_breakdown: { smart: number; grit: number; build: number };
  confidence: "high" | "medium" | "low";
  qualifying_note: string;
};

export type SummaryLine = {
  type: "action" | "deadline" | "memory" | "profile" | "impact";
  icon_color: string;
  text: string;
  action_type: string | null;
  action_payload: Record<string, string> | null;
};

export type ActionItem = {
  id: string;
  uid: string;
  conv_id: string;
  text: string;
  dimension: "smart" | "grit" | "build" | null;
  estimated_pts: number | null;
  effort: "low" | "medium" | "high";
  action_type: string | null;
  action_payload: Record<string, string>;
  done: boolean;
  done_at: string | null;
  created_at: string;
  snoozed_until: string | null;
  dismissed: boolean;
  acted?: boolean;
  acted_at?: string | null;
};

export type ConversationOutput = {
  id: string;
  uid: string;
  conv_id: string;
  generated_at: string;
  action_items_created: ActionItem[];
  deadlines_created: { id: string; label: string; date: string }[];
  profile_updates: { id: string; field: string; old_value: unknown; new_value: unknown; confirmed: boolean }[];
  memory_items_added: string[];
  companies_added: string[];
  score_impact: ScoreImpactEstimate | null;
  summary_lines: SummaryLine[];
  session_title: string;
  session_topic: string;
};

export type AppProfile = {
  name?: string | null;
  major?: string | null;
  majors?: string[];
  minors?: string[];
  goals?: string[];
  track?: string | null;
  preProfessional?: boolean;
  application_target?: string | null;
  application_target_label?: string | null;
  career_goal?: string | null;
  deadlines?: DillyDeadline[];
  target_school?: string | null;
  profile_slug?: string | null;
  profile_background_color?: string | null;
  profile_tagline?: string | null;
  profile_theme?: ProfileThemeId | null;
  profile_bio?: string | null;
  linkedin_url?: string | null;
  job_locations?: string[];
  job_location_scope?: "specific" | "domestic" | "international" | null;
  custom_tagline?: string | null;
  share_card_achievements?: string[];
  share_card_metric?: "smart" | "grit" | "build" | "mts" | "ats" | null;
  achievements?: ProfileAchievements;
  first_audit_snapshot?: { scores: { smart: number; grit: number; build: number }; ts: number } | null;
  first_application_at?: number | null;
  first_interview_at?: number | null;
  /** Outcome capture: set when user reports interview/offer (unix ts). */
  got_interview_at?: number | null;
  got_offer_at?: number | null;
  /** User consented to use their outcome in stories. */
  outcome_story_consent?: boolean | null;
  /** When user dismissed the outcome prompt (unix ts); don't show again until re-prompt logic. */
  outcome_prompt_dismissed_at?: number | null;
  referral_code?: string | null;
  voice_tone?: VoiceTone | null;
  voice_notes?: string[];
  voice_onboarding_done?: boolean;
  voice_onboarding_answers?: { key: string; raw: string }[];
  streak?: { current_streak: number; longest_streak: number; last_checkin: string };
  beyond_resume?: unknown[];
  experience_expansion?: unknown[];
  voice_always_end_with_ask?: boolean;
  voice_max_recommendations?: number;
  voice_save_to_profile?: boolean;
  voice_biggest_concern?: string;
  /** Transcript (optional): upload PDF → GPA + courses stored read-only. */
  transcript_uploaded_at?: string | null;
  transcript_gpa?: number | null;
  transcript_bcpm_gpa?: number | null;
  transcript_courses?: Array<{ code?: string | null; name?: string | null; term?: string | null; credits?: number | null; grade?: string | null }>;
  transcript_honors?: string[];
  transcript_major?: string | null;
  transcript_minor?: string | null;
  transcript_warnings?: string[];
  push_token?: string | null;
  notification_prefs?: {
    uid?: string;
    enabled?: boolean;
    quiet_hours_start?: number;
    quiet_hours_end?: number;
    timezone?: string;
  };
  last_deep_dive_at?: string | null;
  weekly_review_day?: number;
  dilly_narrative?: string | null;
  dilly_narrative_updated_at?: string | null;
  dilly_memory_items?: MemoryItem[];
  voice_session_captures?: SessionCapture[];
  /** Set true when the new onboarding flow is finished (Career Center unlock). */
  onboarding_complete?: boolean | null;
};

/** Response from POST /career-playbook — personalized Get Hired playbook brief. */
export type CareerPlaybookSignal = {
  signal: string;
  from_resume: string;
  why: string;
};

export type CareerPlaybookDeepDive = {
  theme: string;
  for_you: string;
  this_week: string;
};

export type CareerPlaybookPayload = {
  opening: string;
  cohort_lens: string;
  resume_signals: CareerPlaybookSignal[];
  deep_dive: CareerPlaybookDeepDive[];
  gaps_to_close: string[];
  closer: string;
  fallback?: boolean;
};

export type User = { email: string; subscribed: boolean };

export type MainAppTab = "center" | "hiring" | "voice" | "calendar" | "insights";
