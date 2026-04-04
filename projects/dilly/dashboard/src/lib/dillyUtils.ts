/**
 * Barrel re-export file for backward compatibility.
 *
 * All utilities have been split into domain-specific modules:
 *   - constants.ts   — storage keys, dimensions, goals, thresholds
 *   - scoreUtils.ts   — scoreColor, gapToNextLevel, computeScoreTrajectory, milestones
 *   - auditUtils.ts   — audit storage, handoff, history summary conversion
 *   - voiceUtils.ts   — voice storage keys, intro state, greeting
 *   - shareUtils.ts   — badge/share SVG generation, download/convert, clipboard
 *   - profileUtils.ts — profile photo cache, career center paths, headlines
 *   - formatUtils.ts  — UUID, actions, nudges, punchy findings, snapshot SVG
 *
 * New code should import from the specific module directly.
 * This file re-exports everything so existing imports continue to work.
 */

export * from "./constants";
export * from "./scoreUtils";
export * from "./auditUtils";
export * from "./voiceUtils";
export * from "./shareUtils";
export * from "./profileUtils";
export * from "./formatUtils";
