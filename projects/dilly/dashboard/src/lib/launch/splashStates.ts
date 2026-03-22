export type SplashStateType =
  | "deadline_urgent"
  | "deadline_ready"
  | "score_gap"
  | "score_improved"
  | "new_user"
  | "not_applying"
  | "rejected"
  | "top_25"
  | "interview_tomorrow";

export type EyebrowColorKey = "coral" | "gold" | "green" | "amber" | "muted";

export type GlowColorKey = "gold" | "green";

export interface SplashState {
  state: SplashStateType;
  eyebrow: string;
  eyebrow_color: EyebrowColorKey;
  eyebrow_pulse: boolean;
  headline: string;
  headline_gold: string;
  sub: string;
  cta_primary: string;
  cta_route: string;
  /** Query string for `/voice?…` when using voice handoff, or empty */
  cta_context: string;
  glow_color: GlowColorKey;
  /**
   * When primary CTA opens Voice: server-built message; client sets PENDING_VOICE_KEY + overlay.
   * Empty when navigating to a concrete route without a preset prompt.
   */
  voice_prompt?: string | null;
}
