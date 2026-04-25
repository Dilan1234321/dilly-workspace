/**
 * @dilly/api — Unified type definitions
 *
 * Single source of truth for all Dilly frontends (desktop, mobile, dashboard).
 * These mirror the Pydantic models in api/schemas.py.
 *
 * RULE: If you add a field to the API, add it here ONCE.
 * Never copy types into individual frontend codebases.
 *
 * Dashboard re-exports these via `dashboard/src/types/dilly.ts`.
 */

// ─── Scores & Dimensions ──────────────────────────────────────────────────

export type DimensionKey = "smart" | "grit" | "build";

export interface DimensionScores {
  smart: number;
  grit: number;
  build: number;
}

// ─── Audit ────────────────────────────────────────────────────────────────

/** Recommendation row inside an audit — short alias `Rec` available below. */
export interface AuditRecommendation {
  type?: "generic" | "line_edit" | "action";
  title: string;
  action: string;
  current_line?: string | null;
  suggested_line?: string | null;
  score_target?: string | null;
  diagnosis?: string | null;
}

/** Short alias used throughout the dashboard. */
export type Rec = AuditRecommendation;

/** @deprecated Inline union — prefer AuditRecommendation['type']. Kept for compat. */
export type RecommendationType = "generic" | "line_edit" | "action";

export interface AuditV2 {
  id?: string;
  candidate_name: string;
  detected_track: string;
  major: string;
  scores: DimensionScores;
  final_score: number;
  audit_findings: string[];
  evidence: Record<string, string>;
  evidence_quotes?: Record<string, string> | null;
  recommendations: AuditRecommendation[];
  raw_logs?: string[];
  dilly_take?: string | null;
  strongest_signal_sentence?: string | null;
  consistency_findings?: string[] | null;
  red_flags?: ({ message: string; line?: string | null } | string)[] | null;
  peer_percentiles?: Partial<DimensionScores> | null;
  peer_cohort_n?: number | null;
  peer_fallback_all?: boolean | null;
  benchmark_copy?: Record<string, string> | null;
  application_target?: string | null;
  resume_text?: string | null;
  structured_text?: string | null;
  page_count?: number | null;
  created_at?: string;
}

export interface AuditHistorySummary {
  id: string;
  final_score: number | null;
  scores: Partial<DimensionScores>;
  peer_percentiles?: Partial<DimensionScores>;
  dilly_take?: string;
  created_at: string;
}

/** Slim row from GET /audit/history — enough to paint score cards before full audit loads. */
export type AuditHistorySummaryRow = {
  id?: string;
  ts: number;
  scores: { smart: number; grit: number; build: number };
  final_score: number;
  detected_track: string;
  candidate_name?: string;
  major?: string;
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
  dilly_take?: string;
  strongest_signal_sentence?: string;
};

// ─── Voice / Chat ─────────────────────────────────────────────────────────

export type ChatMode = "coaching" | "practice";

/** One message inside a VoiceConvo. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts?: number;
}

/** A persisted Voice conversation (GET /voice/history). */
export type VoiceConvo = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  createdAt?: number;
};

/** Alias kept for backward-compat with desktop/mobile code. */
export type VoiceConversation = VoiceConvo;

// ─── AI Context ───────────────────────────────────────────────────────────

export interface RichContext {
  name: string;
  first_name: string;
  cohort: string;
  school: string;
  major: string;
  minor: string;
  pronouns: string;
  career_goal: string;
  industry_target: string;
  target_companies: string[];
  tagline: string;
  bio: string;
  linkedin: string;
  current_score: number | null;
  smart: number;
  grit: number;
  build: number;
  previous_score: number | null;
  score_delta: number | null;
  weakest_dimension: string | null;
  strongest_dimension: string | null;
  cohort_bar: number;
  reference_company: string;
  gap: number | null;
  cleared_bar: boolean;
  dilly_take: string;
  audit_count: number;
  days_since_audit: number | null;
  audit_history: Array<{
    score: number | null;
    scores: Partial<DimensionScores>;
    date: string | null;
    dilly_take: string;
  }>;
  app_counts: {
    saved: number;
    applied: number;
    interviewing: number;
    offer: number;
    rejected: number;
  };
  total_applications: number;
  interviewing_at: string[];
  applied_companies: string[];
  silent_apps: string[];
  upcoming_deadlines: Array<{
    label: string;
    date: string;
    days_until: number;
    type: string;
  }>;
  has_resume: boolean;
  has_editor_resume: boolean;
  resume_snippet: string;
  nudges: Array<{ priority: string; message: string }>;
  dilly_narrative?: string;
}

// ─── Memory ───────────────────────────────────────────────────────────────

export type MemoryCategory =
  | "target_company"
  | "concern"
  | "goal"
  | "deadline"
  | "achievement"
  | "skill"
  | "interest"
  | "experience"
  | "feedback"
  | "preference"
  | "context"
  | "other"
  | "mentioned_but_not_done"
  | "person_to_follow_up"
  | "rejection"
  | "interview"
  | "strength"
  | "weakness";

export type MemorySource = "voice" | "audit" | "profile" | "application";
export type MemoryConfidence = "high" | "medium" | "low";

export type MemoryAction =
  | "open_am_i_ready"
  | "open_voice"
  | "open_calendar"
  | "open_audit"
  | "open_applications"
  | "open_leaderboard"
  | "open_jobs"
  | "open_settings"
  | "open_bullet_practice"
  | "open_interview_prep"
  | "open_templates"
  | "open_career_hub"
  | "open_certifications"
  | "open_ats";

export type MemoryItem = {
  id: string;
  uid: string;
  category: MemoryCategory;
  label: string;
  value: string;
  source: MemorySource;
  confidence: MemoryConfidence;
  created_at: string;
  updated_at?: string;
  action_type?: MemoryAction | null;
  action_payload?: Record<string, string> | null;
  shown_to_user?: boolean;
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

// ─── Deadlines ────────────────────────────────────────────────────────────

export type DillySubDeadline = {
  id: string;
  label: string;
  date: string;
  completed?: boolean;
};

export type DillyDeadline = {
  id: string;
  label: string;
  date: string;
  type?: "deadline" | "interview" | "career_fair" | "application";
  /** camelCase JS convention — preferred. */
  subDeadlines?: DillySubDeadline[];
  /** Legacy snake_case alias — prefer subDeadlines. */
  sub_deadlines?: DillySubDeadline[];
  createdBy?: "user" | "dilly" | string;
  completed?: boolean;
  /** Unix timestamp when completed; richer than the boolean `completed`. */
  completedAt?: number | null;
};

export type DetectedDeadline = {
  label: string;
  date: string;
  subDeadlines?: { label: string; date: string }[];
};

// ─── Applications ─────────────────────────────────────────────────────────

export type ApplicationStatus =
  | "saved"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected";

export interface Application {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  url?: string;
  notes?: string;
  applied_at?: string;
  updated_at?: string;
}

// ─── Ready Check ──────────────────────────────────────────────────────────

export type ReadyCheckVerdict = "ready" | "almost" | "stretch" | "not_yet";

export type ReadyCheckAction = {
  id: string;
  ready_check_id: string;
  priority: number;
  title: string;
  description: string;
  dimension: DimensionKey;
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
  headline?: string;
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

// ─── Cohort Pulse ─────────────────────────────────────────────────────────

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
  top_improvement_dimension: DimensionKey;
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

// ─── Score Impact ─────────────────────────────────────────────────────────

export type ScoreImpactEstimate = {
  total_pts: number;
  dimension_breakdown: { smart: number; grit: number; build: number };
  confidence: "high" | "medium" | "low";
  qualifying_note: string;
};

// ─── Action Items ─────────────────────────────────────────────────────────

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
  dimension: DimensionKey | null;
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
  /** Legacy aliases kept for compat. */
  source?: string;
  completed?: boolean;
};

// ─── Conversation Outputs ─────────────────────────────────────────────────

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
  /** Legacy fields for backward-compat. */
  conversation_id?: string;
  action_items?: ActionItem[];
  deadlines?: DillyDeadline[];
  created_at?: string;
};

// ─── Notifications ────────────────────────────────────────────────────────

export interface DillyNotification {
  id: string;
  uid: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  deeplink?: string;
  created_at: string;
}

// ─── Achievements ─────────────────────────────────────────────────────────

export type MilestoneType =
  | "first-audit"
  | "cleared-bar"
  | "top-25"
  | "top-10"
  | "score-jump"
  | "applied-job";

export type ProfileAchievements = Record<string, { unlockedAt: number }>;

// ─── Profile ──────────────────────────────────────────────────────────────

export type ProfileThemeId =
  | "professional"
  | "bold"
  | "minimal"
  | "warm"
  | "high_contrast";

export type VoiceTone =
  | "encouraging"
  | "direct"
  | "casual"
  | "professional"
  | "coach";

export type MainAppTab = "center" | "hiring" | "voice" | "calendar" | "insights";

export interface CohortScore {
  cohort: string;
  smart: number;
  grit: number;
  build: number;
  dilly_score: number;
  percentile?: number;
  rank?: number;
  n?: number;
}

export type AppProfile = {
  /** Core identity */
  uid?: string;
  email?: string;
  name?: string | null;
  first_name?: string;
  school?: string;
  school_id?: string;

  /** Academics */
  major?: string | null;
  majors?: string[];
  minor?: string;
  minors?: string[];
  pre_professional_track?: string;
  preProfessional?: boolean;
  graduation_year?: number;
  gpa?: number;

  /** Scoring */
  cohort?: string;
  cohort_scores?: Record<string, CohortScore>;
  overall_smart?: number;
  overall_grit?: number;
  overall_build?: number;
  overall_dilly_score?: number;

  /** Career goals */
  track?: string | null;
  goals?: string[];
  career_goal?: string | null;
  industry_target?: string;
  target_companies?: string[];
  interests?: string[];
  application_target?: string | null;
  application_target_label?: string | null;
  job_locations?: string[];
  job_location_scope?: "specific" | "domestic" | "international" | null;

  /** Target school (med/law/etc.) */
  target_school?: string | null;

  /** Public profile */
  profile_slug?: string | null;
  profile_background_color?: string | null;
  profile_tagline?: string | null;
  profile_theme?: ProfileThemeId | null;
  profile_bio?: string | null;
  tagline?: string;
  bio?: string;
  custom_tagline?: string | null;
  linkedin?: string;
  linkedin_url?: string | null;
  pronouns?: string;
  photo_url?: string;

  /** Resume */
  resume_text?: string;
  has_resume?: boolean;
  has_editor_resume?: boolean;

  /** Transcript */
  transcript_uploaded_at?: string | null;
  transcript_gpa?: number | null;
  transcript_bcpm_gpa?: number | null;
  transcript_courses?: Array<{
    code?: string | null;
    name?: string | null;
    term?: string | null;
    credits?: number | null;
    grade?: string | null;
  }>;
  transcript_honors?: string[];
  transcript_major?: string | null;
  transcript_minor?: string | null;
  transcript_warnings?: string[];

  /** Achievements & share */
  achievements?: ProfileAchievements;
  share_card_achievements?: string[];
  share_card_metric?: "smart" | "grit" | "build" | "mts" | "ats" | null;
  first_audit_snapshot?: { scores: DimensionScores; ts: number } | null;
  first_application_at?: number | null;
  first_interview_at?: number | null;
  got_interview_at?: number | null;
  got_offer_at?: number | null;
  outcome_story_consent?: boolean | null;
  outcome_prompt_dismissed_at?: number | null;

  /** Subscriptions & billing */
  is_subscribed?: boolean;
  subscription_tier?: string;
  referral_code?: string | null;

  /** Notifications */
  push_token?: string | null;
  notification_preferences?: Record<string, boolean>;
  notification_prefs?: {
    uid?: string;
    enabled?: boolean;
    quiet_hours_start?: number;
    quiet_hours_end?: number;
    timezone?: string;
  };

  /** Voice / Dilly personality */
  voice_tone?: VoiceTone | null;
  voice_notes?: string[];
  voice_onboarding_done?: boolean;
  voice_onboarding_answers?: { key: string; raw: string }[];
  voice_always_end_with_ask?: boolean;
  voice_max_recommendations?: number;
  voice_save_to_profile?: boolean;
  voice_biggest_concern?: string;

  /** Memory & narrative */
  dilly_narrative?: string | null;
  dilly_narrative_updated_at?: string | null;
  dilly_memory_items?: MemoryItem[];
  voice_session_captures?: SessionCapture[];

  /** Streak */
  streak?: { current_streak: number; longest_streak: number; last_checkin: string };

  /** Deadlines (stored on profile for quick access) */
  deadlines?: DillyDeadline[];

  /** UI state */
  theme?: ProfileThemeId;
  beyond_resume?: unknown[];
  experience_expansion?: unknown[];
  onboarding_complete?: boolean | null;
  last_deep_dive_at?: string | null;
  weekly_review_day?: number;
  leaderboard_opt_in?: boolean | null;

  /** Timestamps */
  created_at?: string;
  updated_at?: string;
};

// ─── Auth ─────────────────────────────────────────────────────────────────

export interface AuthUser {
  uid: string;
  email: string;
  name?: string;
  school?: string;
  is_subscribed?: boolean;
  /** Server-side account classification. Defaults to "student" if absent. */
  account_type?: string;
  subscribed?: boolean;
  company_name?: string | null;
  company_domain?: string | null;
  company_logo_url?: string | null;
  company_jobs_count?: number | null;
}

/** Slim alias used in some dashboard code. */
export type User = { email: string; subscribed: boolean };

export interface AuthSendCodeResponse {
  ok: boolean;
  message: string;
}

export interface AuthVerifyCodeResponse {
  token: string;
  uid: string;
  email: string;
  is_new?: boolean;
}

// ─── Visuals (chat card payloads) ─────────────────────────────────────────

export type VisualType =
  | "score_breakdown"
  | "cohort_comparison"
  | "interview_checklist"
  | "bullet_comparison"
  | "timeline";

export interface ScoreBreakdownPayload {
  type: "score_breakdown";
  overall: number;
  smart: number;
  grit: number;
  build: number;
  bar: number;
  cohort: string;
  reference_company?: string;
  smart_label?: string;
  grit_label?: string;
  build_label?: string;
}

export interface CohortComparisonPayload {
  type: "cohort_comparison";
  rank: number;
  total: number;
  percentile: number;
  cohort: string;
  score: number;
  bar: number;
  reference_company?: string;
}

export interface InterviewChecklistPayload {
  type: "interview_checklist";
  company: string;
  role?: string;
  round?: string;
  items: Array<{
    label: string;
    priority: "high" | "medium" | "low";
    done?: boolean;
  }>;
}

export interface BulletComparisonPayload {
  type: "bullet_comparison";
  before: string;
  after: string;
  dimension: string;
  impact: string;
}

export interface TimelineEvent {
  id: string;
  label: string;
  date: string;
  event_type?: "interview" | "meeting" | "deadline" | "other";
  createdBy?: string;
}

export interface TimelinePayload {
  type: "timeline";
  events: TimelineEvent[];
  title?: string;
}

export type VisualPayload =
  | ScoreBreakdownPayload
  | CohortComparisonPayload
  | InterviewChecklistPayload
  | BulletComparisonPayload
  | TimelinePayload;

// ─── ATS ──────────────────────────────────────────────────────────────────

export type ATSStrictness = "lenient" | "moderate" | "strict";

export interface ATSInfo {
  system: string;
  strictness: ATSStrictness;
  color: string;
  tips: string;
}

// ─── Automation Risk ──────────────────────────────────────────────────────

export type AutomationRisk = "high" | "evolving" | "amplified";

export interface RiskProfile {
  level: AutomationRisk;
  label: string;
  shortLabel: string;
  reason: string;
  color: string;
  bg: string;
  border: string;
}

// ─── Career Playbook ──────────────────────────────────────────────────────

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

// ─── API Error ────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code: string;
  detail?: string;
  request_id?: string;
}
