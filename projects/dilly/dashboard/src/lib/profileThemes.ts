/**
 * Profile themes for share cards, snapshot, and in-app styling.
 * Each theme: accent color, bg tint, copy tone.
 */

export type ProfileThemeId = "professional" | "bold" | "minimal" | "warm" | "high_contrast";

export type ProfileTheme = {
  id: ProfileThemeId;
  name: string;
  accent: string;
  bgTint: string;
  copyTone: string;
};

export const PROFILE_THEMES: Record<ProfileThemeId, ProfileTheme> = {
  professional: {
    id: "professional",
    name: "Professional",
    accent: "#0f172a",
    bgTint: "#f8fafc",
    copyTone: "Polished, recruiter-ready",
  },
  bold: {
    id: "bold",
    name: "Bold",
    accent: "#c8102e",
    bgTint: "#fef2f2",
    copyTone: "Confident, standout",
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    accent: "#475569",
    bgTint: "#ffffff",
    copyTone: "Clean, understated",
  },
  warm: {
    id: "warm",
    name: "Warm",
    accent: "#b45309",
    bgTint: "#fffbeb",
    copyTone: "Approachable, friendly",
  },
  high_contrast: {
    id: "high_contrast",
    name: "High Contrast",
    accent: "#0f172a",
    bgTint: "#e2e8f0",
    copyTone: "Sharp, accessible",
  },
};

export const PROFILE_THEME_IDS: ProfileThemeId[] = [
  "professional",
  "bold",
  "minimal",
  "warm",
  "high_contrast",
];
