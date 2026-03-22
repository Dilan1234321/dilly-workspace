import type { AuditRecord } from "./AuditHistoryCard";
import type { AuditV2 } from "@/types/dilly";

/** Shape from GET /audit/history list items */
export type AuditHistoryListItem = {
  id?: string;
  ts: number;
  final_score: number;
  scores: { smart: number; grit: number; build: number };
  detected_track: string;
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
};

/**
 * Ensure the list reflects the user's real audits: server list plus the latest in-memory
 * audit when it isn’t in the response yet (refetch lag) or after a fresh run.
 * `latest` should be the canonical newest audit (e.g. latestAuditRef / savedAuditForCenter / audit) — not a historical viewingAudit.
 */
export function mergeHistoryWithLatest(
  apiList: AuditHistoryListItem[],
  latest: (AuditV2 & { ts?: number }) | null | undefined
): AuditHistoryListItem[] {
  const sorted = [...apiList]
    .filter((a) => a && typeof a.ts === "number")
    .sort((a, b) => b.ts - a.ts);

  if (!latest?.scores) return sorted;

  const latestId = latest.id?.trim();
  const latestTs =
    typeof latest.ts === "number" && !Number.isNaN(latest.ts)
      ? latest.ts
      : Math.floor(Date.now() / 1000);

  if (latestId) {
    if (sorted.some((a) => a.id === latestId)) return sorted;
    const row: AuditHistoryListItem = {
      id: latestId,
      ts: latestTs,
      final_score: Number(latest.final_score) || 0,
      scores: {
        smart: Number(latest.scores?.smart) || 0,
        grit: Number(latest.scores?.grit) || 0,
        build: Number(latest.scores?.build) || 0,
      },
      detected_track: (latest.detected_track || "").trim(),
      peer_percentiles: latest.peer_percentiles ?? undefined,
    };
    return [row, ...sorted.filter((a) => a.id !== latestId)];
  }

  // No id yet: only merge if server returned nothing (first paint before persist)
  if (sorted.length === 0) {
    return [
      {
        id: undefined,
        ts: latestTs,
        final_score: Number(latest.final_score) || 0,
        scores: {
          smart: Number(latest.scores?.smart) || 0,
          grit: Number(latest.scores?.grit) || 0,
          build: Number(latest.scores?.build) || 0,
        },
        detected_track: (latest.detected_track || "").trim(),
        peer_percentiles: latest.peer_percentiles ?? undefined,
      },
    ];
  }

  return sorted;
}

/** Best “Top X%” across dimensions (smallest top bucket = strongest). */
function bestTopPercent(peer?: { smart?: number; grit?: number; build?: number } | null): number {
  if (!peer) return 50;
  const tops = (["smart", "grit", "build"] as const).map((k) => Math.max(1, 100 - (peer[k] ?? 50)));
  return Math.min(...tops);
}

export function mapHistoryToAuditRecords(audits: AuditHistoryListItem[]): AuditRecord[] {
  const sorted = [...audits].sort((a, b) => b.ts - a.ts);
  return sorted.map((a, i) => {
    const prev = sorted[i + 1];
    const sid = a.id?.trim();
    const rowKey = sid && sid.length > 0 ? sid : `ts-${a.ts}`;
    return {
      id: rowKey,
      serverAuditId: sid && sid.length > 0 ? sid : null,
      date: new Date(a.ts * 1000).toISOString(),
      score: Math.round(Number(a.final_score) || 0),
      previousScore: prev != null ? Math.round(Number(prev.final_score) || 0) : null,
      percentile: bestTopPercent(a.peer_percentiles),
      track: (a.detected_track || "").trim() || "your track",
      dimensions: {
        smart: Math.round(Number(a.scores?.smart) || 0),
        grit: Math.round(Number(a.scores?.grit) || 0),
        build: Math.round(Number(a.scores?.build) || 0),
      },
    };
  });
}
