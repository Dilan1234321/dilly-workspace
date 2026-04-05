"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { AuditV2 } from "@/types/dilly";

// ── Types ──────────────────────────────────────────────────────────────────────

export type AuditHistoryRow = {
  id?: string;
  ts: number;
  scores: { smart: number; grit: number; build: number };
  final_score: number;
  detected_track: string;
  candidate_name?: string;
  major?: string;
  peer_percentiles?: { smart?: number; grit?: number; build?: number };
  page_count?: number;
  dilly_take?: string;
};

export type DoorEligibility = {
  doors: {
    id: string;
    label: string;
    short_label: string;
    description: string;
    eligible: boolean;
    gap_summary?: string;
    cta_label: string;
    cta_path: string;
  }[];
  eligible_count: number;
  next_door: { id: string; short_label: string; gap_summary: string } | null;
};

// ── Context value ──────────────────────────────────────────────────────────────

interface AuditScoreContextValue {
  // Current audit
  audit: AuditV2 | null;
  setAudit: React.Dispatch<React.SetStateAction<AuditV2 | null>>;
  lastAudit: AuditV2 | null;
  setLastAudit: React.Dispatch<React.SetStateAction<AuditV2 | null>>;
  savedAuditForCenter: AuditV2 | null;
  setSavedAuditForCenter: React.Dispatch<React.SetStateAction<AuditV2 | null>>;
  viewingAudit: AuditV2 | null;
  setViewingAudit: React.Dispatch<React.SetStateAction<AuditV2 | null>>;
  // History
  auditHistory: AuditHistoryRow[];
  setAuditHistory: React.Dispatch<React.SetStateAction<AuditHistoryRow[]>>;
  auditHistoryLoading: boolean;
  setAuditHistoryLoading: React.Dispatch<React.SetStateAction<boolean>>;
  // ATS
  atsScoreHistory: { ts: number; score: number }[];
  setAtsScoreHistory: React.Dispatch<React.SetStateAction<{ ts: number; score: number }[]>>;
  atsPeerPercentile: number | null;
  setAtsPeerPercentile: React.Dispatch<React.SetStateAction<number | null>>;
  // Door eligibility
  doorEligibility: DoorEligibility | null;
  setDoorEligibility: React.Dispatch<React.SetStateAction<DoorEligibility | null>>;
  // Refresh trigger
  centerRefreshKey: number;
  setCenterRefreshKey: React.Dispatch<React.SetStateAction<number>>;
}

const AuditScoreContext = createContext<AuditScoreContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuditScoreProvider({ children }: { children: React.ReactNode }) {
  const [audit, setAudit] = useState<AuditV2 | null>(null);
  const [lastAudit, setLastAudit] = useState<AuditV2 | null>(null);
  const [savedAuditForCenter, setSavedAuditForCenter] = useState<AuditV2 | null>(null);
  const [viewingAudit, setViewingAudit] = useState<AuditV2 | null>(null);
  const [auditHistory, setAuditHistory] = useState<AuditHistoryRow[]>([]);
  const [auditHistoryLoading, setAuditHistoryLoading] = useState(false);
  const [atsScoreHistory, setAtsScoreHistory] = useState<{ ts: number; score: number }[]>([]);
  const [atsPeerPercentile, setAtsPeerPercentile] = useState<number | null>(null);
  const [doorEligibility, setDoorEligibility] = useState<DoorEligibility | null>(null);
  const [centerRefreshKey, setCenterRefreshKey] = useState(0);

  const value = useMemo<AuditScoreContextValue>(
    () => ({
      audit, setAudit,
      lastAudit, setLastAudit,
      savedAuditForCenter, setSavedAuditForCenter,
      viewingAudit, setViewingAudit,
      auditHistory, setAuditHistory,
      auditHistoryLoading, setAuditHistoryLoading,
      atsScoreHistory, setAtsScoreHistory,
      atsPeerPercentile, setAtsPeerPercentile,
      doorEligibility, setDoorEligibility,
      centerRefreshKey, setCenterRefreshKey,
    }),
    [audit, lastAudit, savedAuditForCenter, viewingAudit, auditHistory, auditHistoryLoading, atsScoreHistory, atsPeerPercentile, doorEligibility, centerRefreshKey],
  );

  return (
    <AuditScoreContext.Provider value={value}>
      {children}
    </AuditScoreContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAuditScore() {
  const ctx = useContext(AuditScoreContext);
  if (!ctx) throw new Error("useAuditScore must be used within AuditScoreProvider");
  return ctx;
}
