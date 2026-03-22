export type College = {
  id: string;
  name: string;
  state: string;
  /** Historical overall admit rate (0–1), illustrative */
  admitRate: number;
  satMid: number;
  gpaMid: number;
  tags: string[];
  deadlines: Record<string, string>;
};

export type ListTier = "reach" | "match" | "safety";

export type MatchResult = {
  college: College;
  /** Estimated acceptance probability 0–1 (model output, not a guarantee) */
  estimatedRate: number;
  tier: ListTier;
  /** Short explanation for UI */
  rationale: string;
};
