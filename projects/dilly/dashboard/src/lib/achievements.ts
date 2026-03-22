/**
 * Dilly achievements system.
 * Achievements are stored in profile.achievements: { [id]: { unlockedAt: number } }
 * Unlock logic checks audit history, profile, etc.
 */

export type AchievementId =
  | "first_audit"
  | "top25_smart"
  | "top10_smart"
  | "top5_smart"
  | "top1_smart"
  | "top25_grit"
  | "top10_grit"
  | "top5_grit"
  | "top1_grit"
  | "top25_build"
  | "top10_build"
  | "top5_build"
  | "top1_build"
  | "triple_threat"
  | "century_club"
  | "first_application"
  | "first_interview"
  | "ten_applications"
  | "interview_ready"
  | "ats_ready"
  | "seven_day_streak"
  | "night_owl"
  | "one_pager"
  | "cohort_champion";

/** Dimension tier: 25 = blue, 10 = silver, 5 = gold, 1 = green */
export const DIMENSION_TIER_COLORS = {
  top25: "#3b82f6",
  top10: "#94a3b8",
  top5: "#eab308",
  top1: "#22c55e",
} as const;

/** Glyph path by dimension (PNG glyphs in public/achievement-glyphs/). */
export const DIMENSION_GLYPH_PATHS = {
  smart: "/achievement-glyphs/smart.png",
  grit: "/achievement-glyphs/grit.png",
  build: "/achievement-glyphs/build.png",
} as const;

export type AchievementDef = {
  id: AchievementId;
  name: string;
  emoji: string;
  description: string;
};

export const ACHIEVEMENT_DEFINITIONS: Record<AchievementId, AchievementDef> = {
  first_audit: {
    id: "first_audit",
    name: "First Audit",
    emoji: "📋",
    description: "Ran your first resume audit",
  },
  top25_smart: {
    id: "top25_smart",
    name: "Top 25% Smart",
    emoji: "🧠",
    description: "Reached Top 25% in Smart dimension",
  },
  top10_smart: {
    id: "top10_smart",
    name: "Top 10% Smart",
    emoji: "🧠",
    description: "Reached Top 10% in Smart dimension",
  },
  top5_smart: {
    id: "top5_smart",
    name: "Top 5% Smart",
    emoji: "🧠",
    description: "Reached Top 5% in Smart dimension",
  },
  top1_smart: {
    id: "top1_smart",
    name: "Top 1% Smart",
    emoji: "🧠",
    description: "Reached Top 1% in Smart dimension",
  },
  top25_grit: {
    id: "top25_grit",
    name: "Top 25% Grit",
    emoji: "💪",
    description: "Reached Top 25% in Grit dimension",
  },
  top10_grit: {
    id: "top10_grit",
    name: "Top 10% Grit",
    emoji: "💪",
    description: "Reached Top 10% in Grit dimension",
  },
  top5_grit: {
    id: "top5_grit",
    name: "Top 5% Grit",
    emoji: "💪",
    description: "Reached Top 5% in Grit dimension",
  },
  top1_grit: {
    id: "top1_grit",
    name: "Top 1% Grit",
    emoji: "💪",
    description: "Reached Top 1% in Grit dimension",
  },
  top25_build: {
    id: "top25_build",
    name: "Top 25% Build",
    emoji: "🔧",
    description: "Reached Top 25% in Build dimension",
  },
  top10_build: {
    id: "top10_build",
    name: "Top 10% Build",
    emoji: "🔧",
    description: "Reached Top 10% in Build dimension",
  },
  top5_build: {
    id: "top5_build",
    name: "Top 5% Build",
    emoji: "🔧",
    description: "Reached Top 5% in Build dimension",
  },
  top1_build: {
    id: "top1_build",
    name: "Top 1% Build",
    emoji: "🔧",
    description: "Reached Top 1% in Build dimension",
  },
  triple_threat: {
    id: "triple_threat",
    name: "Triple Threat",
    emoji: "🔥",
    description: "Top 25% in Smart, Grit, and Build",
  },
  century_club: {
    id: "century_club",
    name: "Century Club",
    emoji: "🏆",
    description: "Achieved a perfect 100 score",
  },
  first_application: {
    id: "first_application",
    name: "First Application",
    emoji: "📤",
    description: "Submitted your first job application",
  },
  first_interview: {
    id: "first_interview",
    name: "First Interview",
    emoji: "🎤",
    description: "Landed your first interview",
  },
  ten_applications: {
    id: "ten_applications",
    name: "Ten Applications",
    emoji: "📊",
    description: "Submitted 10 job applications",
  },
  interview_ready: {
    id: "interview_ready",
    name: "Interview Ready",
    emoji: "✅",
    description: "Completed interview prep in Dilly",
  },
  ats_ready: {
    id: "ats_ready",
    name: "ATS Ready",
    emoji: "🤖",
    description: "Achieved 80+ ATS readiness score",
  },
  seven_day_streak: {
    id: "seven_day_streak",
    name: "Seven Day Streak",
    emoji: "📅",
    description: "Used Dilly 7 days in a row",
  },
  night_owl: {
    id: "night_owl",
    name: "Night Owl",
    emoji: "🌙",
    description: "Used Dilly after midnight",
  },
  one_pager: {
    id: "one_pager",
    name: "One-Pager",
    emoji: "✨",
    description: "Resume fits on one page",
  },
  cohort_champion: {
    id: "cohort_champion",
    name: "Cohort Champion",
    emoji: "👑",
    description: "Top performer in your track",
  },
};

/** Border color (hex) per achievement. Dimension tiers: 25=blue, 10=silver, 5=gold, 1=green. */
export const ACHIEVEMENT_BORDER_COLORS: Record<AchievementId, string> = {
  first_audit: "#3b82f6",
  top25_smart: DIMENSION_TIER_COLORS.top25,
  top10_smart: DIMENSION_TIER_COLORS.top10,
  top5_smart: DIMENSION_TIER_COLORS.top5,
  top1_smart: DIMENSION_TIER_COLORS.top1,
  top25_grit: DIMENSION_TIER_COLORS.top25,
  top10_grit: DIMENSION_TIER_COLORS.top10,
  top5_grit: DIMENSION_TIER_COLORS.top5,
  top1_grit: DIMENSION_TIER_COLORS.top1,
  top25_build: DIMENSION_TIER_COLORS.top25,
  top10_build: DIMENSION_TIER_COLORS.top10,
  top5_build: DIMENSION_TIER_COLORS.top5,
  top1_build: DIMENSION_TIER_COLORS.top1,
  triple_threat: "#ef4444",
  century_club: "#eab308",
  first_application: "#10b981",
  first_interview: "#06b6d4",
  ten_applications: "#6366f1",
  interview_ready: "#22c55e",
  ats_ready: "#14b8a6",
  seven_day_streak: "#f97316",
  night_owl: "#a855f7",
  one_pager: "#84cc16",
  cohort_champion: "#c084fc",
};

/** Glyph image path (under /) per achievement. Dimension-tier stickers use DIMENSION_GLYPH_PATHS. */
export const ACHIEVEMENT_GLYPH_PATHS: Partial<Record<AchievementId, string>> = {
  first_audit: "/achievement-glyphs/first_audit.png",
  first_application: "/achievement-glyphs/first_application.png",
  first_interview: "/achievement-glyphs/first_interview.png",
  ten_applications: "/achievement-glyphs/ten_applications.png",
  triple_threat: "/achievement-glyphs/triple_threat.png",
  century_club: "/achievement-glyphs/century_club.png",
  ats_ready: "/achievement-glyphs/ats_ready.png",
  seven_day_streak: "/achievement-glyphs/seven_day_streak.png",
  night_owl: "/achievement-glyphs/night_owl.png",
  one_pager: "/achievement-glyphs/one_pager.png",
  cohort_champion: "/achievement-glyphs/cohort_champion.png",
};

/** Background tint (rgba) for dimension-tier stickers so 25% / 10% / 5% / 1% look distinct. */
const DIMENSION_TIER_BG: Record<string, string> = {
  top25: "rgba(59, 130, 246, 0.22)",
  top10: "rgba(148, 163, 184, 0.28)",
  top5: "rgba(234, 179, 8, 0.28)",
  top1: "rgba(34, 197, 94, 0.22)",
};

/** Tier key from achievement id (e.g. top1_smart -> "top1"). */
function getTierKey(id: AchievementId): string | undefined {
  if (!id.startsWith("top")) return undefined;
  if (id.endsWith("_smart") || id.endsWith("_grit") || id.endsWith("_build")) {
    const tier = id.replace(/_smart$|_grit$|_build$/, "");
    return DIMENSION_TIER_BG[tier] ? tier : undefined;
  }
  return undefined;
}

/** Background color for Smart/Grit/Build tier stickers (by %). Undefined for non-tier achievements. */
export function getAchievementTierBackground(id: AchievementId): string | undefined {
  const key = getTierKey(id);
  return key ? DIMENSION_TIER_BG[key] : undefined;
}

/** Get glyph path for an achievement. Dimension-tier IDs use smart/grit/build glyphs. */
export function getAchievementGlyphPath(id: AchievementId): string | undefined {
  if (ACHIEVEMENT_GLYPH_PATHS[id]) return ACHIEVEMENT_GLYPH_PATHS[id];
  if (id.startsWith("top") && id.endsWith("_smart")) return DIMENSION_GLYPH_PATHS.smart;
  if (id.startsWith("top") && id.endsWith("_grit")) return DIMENSION_GLYPH_PATHS.grit;
  if (id.startsWith("top") && id.endsWith("_build")) return DIMENSION_GLYPH_PATHS.build;
  return undefined;
}

const DIMENSION_TIER_ORDER: AchievementId[] = [
  "top1_smart", "top5_smart", "top10_smart", "top25_smart",
  "top1_grit", "top5_grit", "top10_grit", "top25_grit",
  "top1_build", "top5_build", "top10_build", "top25_build",
];

/** For dimension-tier achievements: IDs that imply this tier (self + any higher tier). E.g. top1_smart implies top25_smart. */
function getTierIdsThatImplyUnlock(achievementId: AchievementId): AchievementId[] | null {
  if (!achievementId.startsWith("top") || !achievementId.endsWith("_smart") && !achievementId.endsWith("_grit") && !achievementId.endsWith("_build")) return null;
  const dim = achievementId.endsWith("_smart") ? "smart" : achievementId.endsWith("_grit") ? "grit" : "build";
  const tierIdsForDim = DIMENSION_TIER_ORDER.filter((id) => id.endsWith(`_${dim}`));
  const idx = tierIdsForDim.indexOf(achievementId);
  if (idx === -1) return null;
  return tierIdsForDim.slice(0, idx + 1);
}

/** Best unlocked tier per dimension for sticker sheet (show only this one; others show as locked). */
export function getBestDimensionTier(
  achievementId: AchievementId,
  achievements: ProfileAchievements | undefined
): AchievementId | null {
  if (!achievementId.startsWith("top") || !achievements) return null;
  const dim = achievementId.endsWith("_smart") ? "smart" : achievementId.endsWith("_grit") ? "grit" : "build";
  const tierIds = DIMENSION_TIER_ORDER.filter((id) => id.endsWith(`_${dim}`));
  for (const id of tierIds) {
    if (achievements[id]?.unlockedAt) return id;
  }
  return null;
}

/** Whether this dimension-tier sticker should be shown (only the best tier per dimension is shown). */
export function isDisplayedDimensionTier(
  achievementId: AchievementId,
  achievements: ProfileAchievements | undefined
): boolean {
  const best = getBestDimensionTier(achievementId, achievements);
  return best === achievementId;
}

/** Dimension-tier achievement IDs (Smart 25/10/5/1, Grit 25/10/5/1, Build 25/10/5/1). */
export const DIMENSION_TIER_ACHIEVEMENT_IDS: AchievementId[] = DIMENSION_TIER_ORDER;

/** Sticker sheet: one slot per dimension (best tier only). Returns achievement IDs in display order. */
export function getStickerSheetIds(achievements: ProfileAchievements | undefined): AchievementId[] {
  const smartSlot = getBestDimensionTier("top25_smart", achievements) ?? "top25_smart";
  const gritSlot = getBestDimensionTier("top25_grit", achievements) ?? "top25_grit";
  const buildSlot = getBestDimensionTier("top25_build", achievements) ?? "top25_build";
  const dimensionIds = new Set(DIMENSION_TIER_ACHIEVEMENT_IDS);
  const rest = ACHIEVEMENT_IDS.filter((id) => !dimensionIds.has(id));
  return [rest[0], smartSlot, gritSlot, buildSlot, ...rest.slice(1)];
}

export type ProfileAchievements = Record<string, { unlockedAt: number }>;

export type AuditSummary = {
  id?: string;
  ts: number;
  scores?: { smart?: number; grit?: number; build?: number };
  final_score?: number;
  detected_track?: string;
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
  page_count?: number;
};

export type UnlockContext = {
  profile: {
    achievements?: ProfileAchievements;
    track?: string | null;
    first_application_at?: number | null;
    first_interview_at?: number | null;
    application_count?: number;
  };
  audits: AuditSummary[];
  atsScore?: number;
  streakDays?: number;
  lastVisitDates?: number[];
};

/** Check if user has unlocked this achievement. For dimension tiers (top 1/5/10/25% smart/grit/build), having a higher tier counts as unlocked (e.g. top 1% smart implies top 25%, 10%, 5% smart). */
export function isUnlocked(
  achievementId: AchievementId,
  achievements: ProfileAchievements | undefined
): boolean {
  const tierIds = getTierIdsThatImplyUnlock(achievementId);
  if (tierIds) {
    return tierIds.some((id) => Boolean(achievements?.[id]?.unlockedAt));
  }
  return Boolean(achievements?.[achievementId]?.unlockedAt);
}

/** Get unlock timestamp for an achievement, or null if locked. For dimension tiers, returns the earliest unlock among self and higher tiers. */
export function getUnlockTime(
  achievementId: AchievementId,
  achievements: ProfileAchievements | undefined
): number | null {
  const tierIds = getTierIdsThatImplyUnlock(achievementId);
  if (tierIds && achievements) {
    const times = tierIds.map((id) => achievements[id]?.unlockedAt).filter((t): t is number => typeof t === "number");
    return times.length > 0 ? Math.min(...times) : null;
  }
  return achievements?.[achievementId]?.unlockedAt ?? null;
}

/** Compute which achievements should be unlocked based on context. Returns new unlocks only (not already in profile). */
export function computeNewUnlocks(ctx: UnlockContext): Partial<ProfileAchievements> {
  const existing = ctx.profile.achievements ?? {};
  const newUnlocks: Partial<ProfileAchievements> = {};
  const now = Date.now() / 1000;

  // first_audit: has at least one audit
  if (!existing.first_audit && ctx.audits.length >= 1) {
    newUnlocks.first_audit = { unlockedAt: now };
  }

  // Dimension tiers: top 1% (green), top 5% (gold), top 10% (silver), top 25% (blue). Grant best tier per dimension.
  // API peer_percentiles: 0–100 where higher = better (100 = best). topPct = 100 - pct = "top X%" (1 = top 1%).
  const latest = ctx.audits[0];
  if (latest?.peer_percentiles) {
    const pct = latest.peer_percentiles;
    const topPct = (dim: "smart" | "grit" | "build") =>
      Math.max(1, 100 - (pct[dim] ?? 50)); // top X% (e.g. 1 = top 1%, 25 = top 25%)
    const tierFor = (topX: number): "top1" | "top5" | "top10" | "top25" | null =>
      topX <= 1 ? "top1" : topX <= 5 ? "top5" : topX <= 10 ? "top10" : topX <= 25 ? "top25" : null;
    const smartTier = tierFor(topPct("smart"));
    const gritTier = tierFor(topPct("grit"));
    const buildTier = tierFor(topPct("build"));
    const tierId = (dim: "smart" | "grit" | "build", t: "top1" | "top5" | "top10" | "top25") =>
      `${t}_${dim}` as AchievementId;
    if (smartTier && !existing[tierId("smart", smartTier)]) {
      newUnlocks[tierId("smart", smartTier)] = { unlockedAt: now };
    }
    if (gritTier && !existing[tierId("grit", gritTier)]) {
      newUnlocks[tierId("grit", gritTier)] = { unlockedAt: now };
    }
    if (buildTier && !existing[tierId("build", buildTier)]) {
      newUnlocks[tierId("build", buildTier)] = { unlockedAt: now };
    }
  }

  // triple_threat: all three Top 25%
  if (!existing.triple_threat && latest?.peer_percentiles) {
    const pct = latest.peer_percentiles;
    const allTop25 = ["smart", "grit", "build"].every(
      (d) => Math.max(1, 100 - (pct[d as keyof typeof pct] ?? 50)) <= 25
    );
    if (allTop25) newUnlocks.triple_threat = { unlockedAt: now };
  }

  // century_club: final score 100
  if (!existing.century_club && (latest?.final_score ?? 0) >= 99.5) {
    newUnlocks.century_club = { unlockedAt: now };
  }

  // ten_applications: application_count >= 10
  const appCount = ctx.profile.application_count ?? 0;
  if (!existing.ten_applications && appCount >= 10) {
    newUnlocks.ten_applications = { unlockedAt: now };
  }

  // ats_ready: ATS score >= 80
  if (!existing.ats_ready && (ctx.atsScore ?? 0) >= 80) {
    newUnlocks.ats_ready = { unlockedAt: now };
  }

  // seven_day_streak: 7 consecutive days of visits
  if (!existing.seven_day_streak && (ctx.streakDays ?? 0) >= 7) {
    newUnlocks.seven_day_streak = { unlockedAt: now };
  }

  // night_owl: used after midnight (checked client-side, typically)
  // one_pager: page_count === 1
  if (!existing.one_pager && latest?.page_count === 1) {
    newUnlocks.one_pager = { unlockedAt: now };
  }

  // cohort_champion: Top 10% in track (simplified: all dims Top 10%)
  if (!existing.cohort_champion && latest?.peer_percentiles) {
    const pct = latest.peer_percentiles;
    const allTop10 = ["smart", "grit", "build"].every(
      (d) => Math.max(1, 100 - (pct[d as keyof typeof pct] ?? 50)) <= 10
    );
    if (allTop10) newUnlocks.cohort_champion = { unlockedAt: now };
  }

  return newUnlocks;
}

/** Achievements that can be manually unlocked (first_application, first_interview). */
export const MANUAL_UNLOCK_IDS: AchievementId[] = [
  "first_application",
  "first_interview",
];

/** One-line "how to unlock" hint for Voice. Not all achievements have hints. */
const ACHIEVEMENT_UNLOCK_HINTS: Partial<Record<AchievementId, string>> = {
  first_audit: "Complete a resume audit in Dilly.",
  top25_smart: "Reach Top 25% in Smart (peer percentile from your latest audit).",
  top10_smart: "Reach Top 10% in Smart.",
  top5_smart: "Reach Top 5% in Smart.",
  top1_smart: "Reach Top 1% in Smart.",
  top25_grit: "Reach Top 25% in Grit.",
  top10_grit: "Reach Top 10% in Grit.",
  top5_grit: "Reach Top 5% in Grit.",
  top1_grit: "Reach Top 1% in Grit.",
  top25_build: "Reach Top 25% in Build.",
  top10_build: "Reach Top 10% in Build.",
  top5_build: "Reach Top 5% in Build.",
  top1_build: "Reach Top 1% in Build.",
  triple_threat: "Reach Top 25% in Smart, Grit, AND Build at the same time.",
  century_club: "Score a perfect 100 (or 99.5+) on an audit.",
  first_application: "Log your first job application in Dilly.",
  first_interview: "Log that you landed your first interview.",
  ten_applications: "Log 10 job applications in Dilly.",
  interview_ready: "Complete interview prep in Dilly.",
  ats_ready: "Achieve an ATS readiness score of 80 or higher.",
  seven_day_streak: "Use Dilly 7 days in a row.",
  night_owl: "Use Dilly after midnight.",
  one_pager: "Have a one-page resume (audit detects page count).",
  cohort_champion: "Reach Top 10% in Smart, Grit, and Build (your track cohort).",
};

/** Build a reference string for Dilly so it can answer questions about achievements/stickers. */
export function getAchievementsReferenceForVoice(): string {
  return ACHIEVEMENT_IDS.map((id) => {
    const def = ACHIEVEMENT_DEFINITIONS[id];
    const hint = ACHIEVEMENT_UNLOCK_HINTS[id];
    if (!def) return "";
    const line = `${def.emoji} ${def.name}: ${def.description}`;
    return hint ? `${line} How to unlock: ${hint}` : line;
  }).filter(Boolean).join("\n");
}

/** All achievement IDs in display order. Smart 25→10→5→1, Grit 25→10→5→1, Build 25→10→5→1, then rest. */
export const ACHIEVEMENT_IDS: AchievementId[] = [
  "first_audit",
  "top25_smart",
  "top10_smart",
  "top5_smart",
  "top1_smart",
  "top25_grit",
  "top10_grit",
  "top5_grit",
  "top1_grit",
  "top25_build",
  "top10_build",
  "top5_build",
  "top1_build",
  "triple_threat",
  "century_club",
  "first_application",
  "first_interview",
  "ten_applications",
  "interview_ready",
  "ats_ready",
  "seven_day_streak",
  "night_owl",
  "one_pager",
  "cohort_champion",
];
