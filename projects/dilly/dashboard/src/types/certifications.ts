/**
 * Certifications hub (curated list + personalized copy). API may return this shape;
 * client falls back to audit + hub when GET /certifications is unavailable.
 */

export type CertificationShieldColor = "green" | "amber" | "blue" | "indigo";

export interface Certification {
  id: string;
  name: string;
  provider: string;
  price_label: string;
  is_free: boolean;
  estimated_build_pts: number;
  estimated_build_score_after: number;
  url: string;
  why_it_matters: string[];
  dilly_pick: boolean;
  shield_color: CertificationShieldColor;
  track: string;
}

export interface CertificationsPageData {
  track: string;
  current_build_score: number;
  certifications: Certification[];
  dilly_commentary: string;
  dilly_top_pick_reason: string;
  total_certs: number;
}
