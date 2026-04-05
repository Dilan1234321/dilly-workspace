/**
 * Profile-related utilities: photo cache keys, career center paths, headline/summary helpers.
 */

import type { AuditV2, DimensionKey } from "@/types/dilly";
import { DIMENSIONS, LAST_CAREER_CENTER_PATH_KEY } from "./constants";

/** localStorage key for cached profile photo (data URL). Survives refresh and sign-in. */
export function profilePhotoCacheKey(email?: string | null): string {
  return email ? `dilly_profile_photo_${email}` : "dilly_profile_photo";
}

/** Get the path to return to Career Center (user's last tab). Falls back to "/?tab=center" so Back from child pages returns to Career Center, not new audit. Never returns /audit (deprecated). */
export function getCareerCenterReturnPath(): string {
  if (typeof window === "undefined") return "/?tab=center";
  try {
    const stored = sessionStorage.getItem(LAST_CAREER_CENTER_PATH_KEY);
    if (stored && stored.startsWith("/") && !stored.includes("//") && stored !== "/audit") return stored;
  } catch {}
  return "/?tab=center";
}

/** Store the current Career Center path so Back buttons on child pages return here. Call from main page when tab changes; skip when on upload (new audit) flow. */
export function setCareerCenterReturnPath(path: string): void {
  if (typeof window === "undefined") return;
  try {
    if (path && path.startsWith("/") && !path.includes("//")) {
      sessionStorage.setItem(LAST_CAREER_CENTER_PATH_KEY, path);
    }
  } catch {}
}

export function topPercentileHeadline(audit: AuditV2 | null | undefined): string | null {
  if (!audit?.peer_percentiles) return null;
  const pct = audit.peer_percentiles;
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  let best: { key: DimensionKey; topPct: number } = { key: "smart", topPct: Math.max(1, 100 - (pct.smart ?? 50)) };
  for (const k of keys) {
    const topPct = Math.max(1, 100 - (pct[k] ?? 50));
    if (topPct < best.topPct) best = { key: k, topPct };
  }
  const label = DIMENSIONS.find((d) => d.key === best.key)?.label ?? best.key;
  // peer_fallback_all: backend compared vs all audited resumes (track cohort too small).
  if (audit.peer_fallback_all) {
    return `Top ${best.topPct}% ${label} among Dilly students`;
  }
  const track = (audit.detected_track || "").trim() || "your track";
  return `Top ${best.topPct}% ${label} in ${track}`;
}

export function oneLineSummary(audit: AuditV2 | null | undefined): string {
  if (!audit) return "";
  const take = audit.dilly_take;
  if (take && take.trim()) return take.trim();
  const { scores, audit_findings: _audit_findings, recommendations, detected_track } = audit;
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  const low = keys.reduce(
    (acc, k) => (scores[k] < acc.score ? { key: k, score: scores[k] } : acc),
    { key: keys[0], score: scores[keys[0]] }
  );
  const high = keys.reduce(
    (acc, k) => (scores[k] > acc.score ? { key: k, score: scores[k] } : acc),
    { key: keys[0], score: scores[keys[0]] }
  );
  const dimLabel = DIMENSIONS.find((d) => d.key === low.key)?.label ?? low.key;
  const rec = recommendations?.find((r) => (r.score_target ?? "").toLowerCase() === low.key) || recommendations?.[0];
  const action = rec?.title || (rec?.action?.slice(0, 60) + (rec?.action && rec.action.length > 60 ? "..." : "")) || "";
  const track = (detected_track || "").trim() || "your field";
  const allStrong = keys.every((k) => scores[k] >= 65);
  const oneWeak = low.score < 55 && high.score >= 60;

  if (allStrong) {
    return action
      ? `Strong across Smart, Grit, and Build for ${track}. Next: ${action}.`
      : `Solid profile for ${track}. Small tweaks in the recommendations will sharpen the story.`;
  }
  if (oneWeak && action) {
    const templates = [
      `Your ${dimLabel} is the lever. ${action} and recruiters will see the difference.`,
      `Strong ${DIMENSIONS.find((d) => d.key === high.key)?.label ?? high.key}; one move for ${dimLabel}: ${action}.`,
      `For ${track}, lift ${dimLabel}: ${action}.`,
    ];
    const idx = keys.indexOf(low.key) % templates.length;
    return templates[idx];
  }
  if (action) {
    return `What would move the needle: ${action}.`;
  }
  return `See your recommendations. They're tailored to what ${track} recruiters look for.`;
}

/** "Your strongest signal to recruiters right now is [X]." From API or derived from scores + evidence. */
export function getStrongestSignalSentence(audit: AuditV2 | null | undefined): string | null {
  if (!audit?.scores) return null;
  const precomputed = (audit as AuditV2 & { strongest_signal_sentence?: string | null }).strongest_signal_sentence;
  if (precomputed && precomputed.trim()) return precomputed.trim();
  const scores = audit.scores;
  const evidence = audit.evidence ?? {};
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  const strongest = keys.reduce(
    (acc, k) => (scores[k] > acc.score ? { key: k, score: scores[k] } : acc),
    { key: keys[0], score: scores[keys[0]] }
  );
  const dimLabel = strongest.key.charAt(0).toUpperCase() + strongest.key.slice(1);
  const ev = (evidence[strongest.key] ?? "").trim().replace(/\.+$/, "");
  if (!ev) return null;
  return `Your strongest signal to recruiters right now is ${dimLabel}: ${ev}.`;
}

export function findingForDimension(audit: AuditV2, dimKey: DimensionKey): string | null {
  const prefix = (DIMENSIONS.find((d) => d.key === dimKey)?.label ?? dimKey) + ": ";
  const finding = audit.audit_findings?.find((f) => f.startsWith(prefix));
  if (!finding) return null;
  return finding.slice(prefix.length).trim() || null;
}
