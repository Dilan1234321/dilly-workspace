/**
 * Profile photo frame logic. Derives frame from audit peer percentiles.
 * Best dimension = lowest percentile (e.g. percentile 95 = Top 5%).
 */

export type ProfileFrame = "top5" | "top10" | "top25" | null;

export function getProfileFrame(peerPercentiles: { smart?: number; grit?: number; build?: number } | null | undefined): ProfileFrame {
  if (!peerPercentiles) return null;
  const pct = peerPercentiles;
  const dims = ["smart", "grit", "build"] as const;
  let bestTopPct = 101;
  for (const k of dims) {
    const percentile = pct[k] ?? 50;
    const topPct = Math.max(1, 100 - Math.round(percentile));
    if (topPct < bestTopPct) bestTopPct = topPct;
  }
  if (bestTopPct <= 5) return "top5";
  if (bestTopPct <= 10) return "top10";
  if (bestTopPct <= 25) return "top25";
  return null;
}

/** Human-readable label for frame. */
export function getProfileFrameLabel(frame: ProfileFrame): string {
  if (!frame) return "";
  if (frame === "top5") return "Top 5%";
  if (frame === "top10") return "Top 10%";
  if (frame === "top25") return "Top 25%";
  return "";
}
