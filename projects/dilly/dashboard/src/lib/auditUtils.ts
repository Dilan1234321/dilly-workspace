/**
 * Audit-related utilities: storage keys, handoff stashing, history summary conversion.
 */

import type { AuditV2 } from "@/types/dilly";
import {
  DILLY_AUDIT_REPORT_HANDOFF_KEY,
  DILLY_LAST_ATS_SCORE_KEY,
  DILLY_STORAGE_KEY_BASE,
} from "@dilly/api";

export type LastAtsScoreCache = { score: number; ts: number; audit_id?: string | null };

export function readLastAtsScoreCache(): LastAtsScoreCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DILLY_LAST_ATS_SCORE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as LastAtsScoreCache;
    if (typeof o?.score !== "number" || Number.isNaN(o.score)) return null;
    return {
      score: Math.round(Math.max(0, Math.min(100, o.score))),
      ts: typeof o.ts === "number" ? o.ts : 0,
      audit_id: o.audit_id ?? null,
    };
  } catch {
    return null;
  }
}

export function writeLastAtsScoreCache(entry: LastAtsScoreCache): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      DILLY_LAST_ATS_SCORE_KEY,
      JSON.stringify({
        score: Math.round(Math.max(0, Math.min(100, entry.score))),
        ts: entry.ts,
        audit_id: entry.audit_id ?? null,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function stashAuditForReportHandoff(audit: AuditV2 | null | undefined): void {
  if (typeof window === "undefined" || !audit?.scores) return;
  const id = String(audit.id || "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(DILLY_AUDIT_REPORT_HANDOFF_KEY, JSON.stringify(audit));
  } catch {
    /* ignore */
  }
}

/** Returns stashed audit if id matches `expectedAuditId`; clears key on success or on unreadable data. */
export function consumeAuditReportHandoff(expectedAuditId: string): AuditV2 | null {
  const want = String(expectedAuditId || "").trim();
  if (typeof window === "undefined" || !want) return null;
  try {
    const raw = sessionStorage.getItem(DILLY_AUDIT_REPORT_HANDOFF_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as AuditV2;
    const id = String(a?.id || "").trim();
    if (id !== want || !a?.scores) {
      try {
        sessionStorage.removeItem(DILLY_AUDIT_REPORT_HANDOFF_KEY);
      } catch {
        /* ignore */
      }
      return null;
    }
    sessionStorage.removeItem(DILLY_AUDIT_REPORT_HANDOFF_KEY);
    return a;
  } catch {
    try {
      sessionStorage.removeItem(DILLY_AUDIT_REPORT_HANDOFF_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** sessionStorage key for scroll position on `/audit/[id]` (restore when returning from Voice, etc.). */
export function auditScrollStorageKey(auditId: string): string {
  return `dilly_audit_scroll_${auditId}`;
}

export function auditStorageKey(email?: string | null): string {
  return email ? `${DILLY_STORAGE_KEY_BASE}_${email}` : DILLY_STORAGE_KEY_BASE;
}

/** One row from GET /audit/history — enough to paint the home score card before full detail loads. */
export type AuditHistorySummaryRow = {
  id?: string;
  ts: number;
  scores: { smart: number; grit: number; build: number };
  final_score: number;
  detected_track: string;
  candidate_name?: string;
  major?: string;
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
  dilly_take?: string;
  strongest_signal_sentence?: string;
};

/** Build a minimal AuditV2 from history summary so the dashboard never spins on "Loading your previous audit…" while GET /audit/history/{id} is slow or stuck. */
export function minimalAuditFromHistorySummary(row: AuditHistorySummaryRow): AuditV2 {
  const scores =
    row.scores && typeof row.scores === "object"
      ? {
            smart: Number(row.scores.smart) || 0,
            grit: Number(row.scores.grit) || 0,
            build: Number(row.scores.build) || 0,
          }
      : { smart: 0, grit: 0, build: 0 };
  const finalCoerced = Number(row.final_score);
  const final =
    row.final_score != null && !Number.isNaN(finalCoerced) && finalCoerced > 0
      ? finalCoerced
      : (scores.smart + scores.grit + scores.build) / 3;
  const pp = row.peer_percentiles;
  return {
    id: row.id?.trim(),
    candidate_name: (row.candidate_name ?? "").trim(),
    detected_track: (row.detected_track ?? "").trim(),
    major: (row.major ?? "").trim(),
    scores,
    final_score: final,
    audit_findings: [],
    evidence: {},
    recommendations: [],
    raw_logs: [],
    dilly_take: row.dilly_take ?? null,
    strongest_signal_sentence: row.strongest_signal_sentence ?? null,
    peer_percentiles: pp
      ? {
            smart: Number(pp.smart ?? 50) || 50,
            grit: Number(pp.grit ?? 50) || 50,
            build: Number(pp.build ?? 50) || 50,
          }
      : null,
  };
}
