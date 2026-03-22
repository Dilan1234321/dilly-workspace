"use client";

import type { CSSProperties } from "react";

export const LB_VARS: CSSProperties = {
  ["--bg" as string]: "#080809",
  ["--s2" as string]: "#16161A",
  ["--s3" as string]: "#1E1E24",
  ["--s4" as string]: "#27272F",
  ["--b1" as string]: "rgba(255,255,255,0.05)",
  ["--b2" as string]: "rgba(255,255,255,0.09)",
  ["--t1" as string]: "#F4F4FA",
  ["--t2" as string]: "rgba(244,244,250,0.55)",
  ["--t3" as string]: "rgba(244,244,250,0.30)",
  ["--green" as string]: "#34C759",
  ["--gdim" as string]: "rgba(52,199,89,0.12)",
  ["--gbdr" as string]: "rgba(52,199,89,0.25)",
  ["--blue" as string]: "#0A84FF",
  ["--bdim" as string]: "rgba(10,132,255,0.12)",
  ["--amber" as string]: "#FF9F0A",
  ["--adim" as string]: "rgba(255,159,10,0.12)",
  ["--abdr" as string]: "rgba(255,159,10,0.25)",
  ["--coral" as string]: "#FF453A",
  ["--indigo" as string]: "#5E5CE6",
  ["--gold" as string]: "#d4af37",
  ["--goldText" as string]: "#1a1400",
};

export function lbScoreColor(score: number): string {
  if (score >= 80) return "var(--green)";
  if (score >= 55) return "var(--amber)";
  return "var(--coral)";
}

export function rankSuffix(n: number): string {
  const m = n % 100;
  if (m >= 11 && m <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
