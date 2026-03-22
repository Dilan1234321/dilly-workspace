export type VoiceApplicationPreview = {
  company: string;
  role?: string;
  status?: string;
  deadline?: string | null;
};

export type VoiceVisualSegment =
  | { type: "text"; content: string }
  | { type: "scores_visual" }
  | { type: "top_recs_visual" }
  | { type: "deadline_timeline_visual" }
  | { type: "interview_agenda_visual"; highlightStep: number | null }
  | { type: "calendar_saved_visual"; summary: string | null }
  | { type: "before_after_visual"; before: string; after: string }
  | { type: "fact_chips_visual"; chips: { label: string; value: string }[] }
  | { type: "steps_visual"; items: string[] }
  | { type: "application_card_visual"; company: string; role?: string; status?: string; deadline?: string }
  | { type: "next_moves_visual"; items: string[] }
  | { type: "story_timeline_visual"; nodes: { kind: string; text: string }[] }
  | { type: "peer_context_visual" };

export type VoiceChatVisualContext = {
  scores: { smart: number; grit: number; build: number } | null;
  finalScore?: number | null;
  prevScores?: { smart: number; grit: number; build: number } | null;
  recommendations?: Array<{ title: string; score_target?: string | null; action?: string }>;
  deadlines?: Array<{ label: string; date: string }>;
};

/** Passed from page/overlay: flat triple + optional extras for inline visuals. */
export type DillyVoiceChatScoresBundle = {
  smart: number;
  grit: number;
  build: number;
  /** When false, Smart/Grit/Build numbers are placeholders — do not render score radar from them. */
  scoresAuthoritative?: boolean;
  final?: number | null;
  prevScores?: { smart: number; grit: number; build: number } | null;
  recommendations?: VoiceChatVisualContext["recommendations"];
  deadlines?: VoiceChatVisualContext["deadlines"];
  /** Tracker rows for application card visual (from GET /applications). */
  applications_preview?: VoiceApplicationPreview[];
  peer_percentiles?: { smart?: number; grit?: number; build?: number } | null;
  cohort_track?: string | null;
};
