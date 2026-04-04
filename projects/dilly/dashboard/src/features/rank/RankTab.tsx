"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { hapticLight } from "@/lib/haptics";
import { coerceLeaderboardTrackForApi } from "@/lib/trackDefinitions";
import { dilly } from "@/lib/dilly";
import { DILLY_LEADERBOARD_REFRESH_KEY } from "@/lib/dillyUtils";
import type { LeaderboardData, LeaderboardEntry, LeaderboardPodiumSlot } from "@/types/leaderboardPage";
import { GLOBAL_LEADERBOARD_CACHE_KEY, LEADERBOARD_CACHE_KEY, parseLeaderboardEntry, parsePodiumSlot } from "@/types/leaderboardPage";
import { LB_VARS } from "@/components/leaderboard/leaderboardTokens";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PodiumRow } from "@/components/leaderboard/PodiumRow";
import { RankingsList } from "@/components/leaderboard/RankingsList";
import { MoveUpCard } from "@/components/leaderboard/MoveUpCard";
import { WeeklyFeed } from "@/components/leaderboard/WeeklyFeed";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoWeekBucketUTC(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function defaultLeaderboard(track: string): LeaderboardData {
  return {
    track: track || "Humanities",
    school_short: "",
    student_rank: 1,
    student_rank_last_week: null,
    rank_change: 0,
    peer_count: 0,
    student_score: 0,
    student_first_name: "You",
    pts_to_next_rank: 0,
    move_up_insight: "Run an audit to see how you stack up.",
    podium: [],
    entries: [],
    weekly_events: [],
    is_free_tier: true,
    locked_count: 0,
    weakest_dimension: "grit",
    goldman_application_days: 14,
  };
}

function normalizeLeaderboardPayload(raw: unknown, fallbackTrack: string): LeaderboardData {
  const base = defaultLeaderboard(fallbackTrack);
  if (!raw || typeof raw !== "object") return base;
  const j = raw as Record<string, unknown>;
  const wk = j.weakest_dimension;
  const weakest = wk === "smart" || wk === "grit" || wk === "build" ? wk : base.weakest_dimension;
  const rawTrack = typeof j.track === "string" ? j.track : null;
  const trackNorm =
    rawTrack && rawTrack.trim().toLowerCase() === "all cohorts"
      ? "All cohorts"
      : coerceLeaderboardTrackForApi(rawTrack, base.track);
  const entriesParsed = Array.isArray(j.entries)
    ? (j.entries as unknown[]).map(parseLeaderboardEntry).filter((x): x is LeaderboardEntry => x != null)
    : base.entries;
  const podiumParsed = Array.isArray(j.podium)
    ? (j.podium as unknown[]).map(parsePodiumSlot).filter((x): x is LeaderboardPodiumSlot => x != null)
    : base.podium;
  return {
    ...base, ...j,
    track: trackNorm,
    school_short: typeof j.school_short === "string" ? j.school_short : base.school_short,
    student_rank: typeof j.student_rank === "number" && Number.isFinite(j.student_rank) ? j.student_rank : base.student_rank,
    student_rank_last_week:
      j.student_rank_last_week === null || (typeof j.student_rank_last_week === "number" && Number.isFinite(j.student_rank_last_week))
        ? (j.student_rank_last_week as number | null) : base.student_rank_last_week,
    rank_change: typeof j.rank_change === "number" && Number.isFinite(j.rank_change) ? j.rank_change : base.rank_change,
    peer_count: typeof j.peer_count === "number" && Number.isFinite(j.peer_count) ? j.peer_count : base.peer_count,
    student_score: typeof j.student_score === "number" && Number.isFinite(j.student_score) ? j.student_score : base.student_score,
    student_first_name: typeof j.student_first_name === "string" ? j.student_first_name : base.student_first_name,
    pts_to_next_rank: typeof j.pts_to_next_rank === "number" && Number.isFinite(j.pts_to_next_rank) ? j.pts_to_next_rank : base.pts_to_next_rank,
    move_up_insight: typeof j.move_up_insight === "string" ? j.move_up_insight : base.move_up_insight,
    podium: podiumParsed,
    entries: entriesParsed,
    weekly_events: Array.isArray(j.weekly_events) ? (j.weekly_events as LeaderboardData["weekly_events"]) : base.weekly_events,
    is_free_tier: typeof j.is_free_tier === "boolean" ? j.is_free_tier : base.is_free_tier,
    locked_count: typeof j.locked_count === "number" && Number.isFinite(j.locked_count) ? j.locked_count : base.locked_count,
    weakest_dimension: weakest,
    goldman_application_days:
      typeof j.goldman_application_days === "number" && Number.isFinite(j.goldman_application_days)
        ? j.goldman_application_days : base.goldman_application_days,
  };
}

function readCachedLeaderboardForTrack(track: string): LeaderboardData | null {
  if (typeof window === "undefined") return null;
  try {
    const wk = isoWeekBucketUTC();
    const raw = sessionStorage.getItem(LEADERBOARD_CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { w?: string; track?: string; payload?: unknown };
    if (o?.payload && o.w === wk && o.track === track) return normalizeLeaderboardPayload(o.payload, track);
  } catch { /* ignore */ }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RankTab() {
  const { appProfile } = useAppContext();
  const { auditHistory } = useAuditScore();
  const { mainAppTab } = useNavigation();

  // ── Local state (was page-level, only used here) ──────────────────────────
  const [lbData, setLbData] = useState<LeaderboardData | null>(null);
  const [lbErr, setLbErr] = useState<string | null>(null);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbShowUpdated, setLbShowUpdated] = useState(false);
  const [lbUpdatedFade, setLbUpdatedFade] = useState(1);
  const [lbViewMode, setLbViewMode] = useState<"track" | "all">("track");
  const [lbGlobalData, setLbGlobalData] = useState<LeaderboardData | null>(null);
  const [lbGlobalLoading, setLbGlobalLoading] = useState(false);
  const [lbGlobalErr, setLbGlobalErr] = useState<string | null>(null);

  // ── Load functions ────────────────────────────────────────────────────────
  const loadLeaderboard = useCallback(async (opts?: { force?: boolean }) => {
    if (!localStorage.getItem("dilly_auth_token")) return;
    const rawTrack = auditHistory[0]?.detected_track?.trim() || appProfile?.track?.trim() || null;
    if (!rawTrack) return;
    const track = coerceLeaderboardTrackForApi(rawTrack, "Humanities");
    let forceRefresh = opts?.force ?? false;
    try {
      if (sessionStorage.getItem(DILLY_LEADERBOARD_REFRESH_KEY) === "1") {
        sessionStorage.removeItem(DILLY_LEADERBOARD_REFRESH_KEY);
        forceRefresh = true;
      }
    } catch { /* ignore */ }
    const wk = isoWeekBucketUTC();
    if (!forceRefresh) {
      const cached = readCachedLeaderboardForTrack(track);
      if (cached) { setLbData(cached); setLbErr(null); return; }
    }
    setLbLoading(true);
    setLbErr(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 35_000);
    try {
      const params = new URLSearchParams({ track });
      if (forceRefresh) params.set("refresh", "true");
      const res = await dilly.fetch(`/leaderboard-dashboard?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`lb-${res.status}`);
      const body: unknown = await res.json();
      const payload = normalizeLeaderboardPayload(body, track);
      setLbData(payload);
      setLbErr(null);
      try { sessionStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify({ w: wk, track: payload.track || track, payload })); } catch { /* ignore */ }
      if (forceRefresh) {
        setLbShowUpdated(true); setLbUpdatedFade(1);
        setTimeout(() => setLbUpdatedFade(0), 3500);
        setTimeout(() => { setLbShowUpdated(false); setLbUpdatedFade(1); }, 4000);
      }
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      setLbErr(aborted ? "Request timed out. Try again." : "Could not load leaderboard.");
      setLbData((d) => d ?? defaultLeaderboard(track));
    } finally {
      window.clearTimeout(timeoutId);
      setLbLoading(false);
    }
  }, [auditHistory, appProfile?.track]);

  const loadGlobalLeaderboard = useCallback(async (opts?: { force?: boolean }) => {
    if (!localStorage.getItem("dilly_auth_token")) return;
    const wk = isoWeekBucketUTC();
    if (!opts?.force) {
      try {
        const raw = sessionStorage.getItem(GLOBAL_LEADERBOARD_CACHE_KEY);
        if (raw) {
          const o = JSON.parse(raw) as { w?: string; payload?: unknown };
          if (o?.payload && o.w === wk) { setLbGlobalData(normalizeLeaderboardPayload(o.payload, "All cohorts")); return; }
        }
      } catch { /* ignore */ }
    }
    setLbGlobalLoading(true); setLbGlobalErr(null);
    try {
      const controller = new AbortController();
      const kill = setTimeout(() => controller.abort(), 90_000);
      let res: Response | null = null;
      try {
        for (const path of ["/leaderboard-dashboard/global", "/leaderboard/page/global"] as const) {
          const r = await dilly.fetch(`${path}`, { cache: "no-store", signal: controller.signal });
          if (r.ok || r.status !== 404) { res = r; break; }
          res = r;
        }
      } finally { clearTimeout(kill); }
      if (!res?.ok) throw new Error(`gl-${res?.status ?? 0}`);
      const body: unknown = await res.json();
      const payload = normalizeLeaderboardPayload(body, "All cohorts");
      setLbGlobalData(payload);
      try { sessionStorage.setItem(GLOBAL_LEADERBOARD_CACHE_KEY, JSON.stringify({ w: wk, payload })); } catch { /* ignore */ }
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      setLbGlobalErr(aborted ? "That took too long. Try again." : "Could not load the global leaderboard.");
    } finally { setLbGlobalLoading(false); }
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mainAppTab !== "rank") return;
    if (!appProfile?.track && auditHistory.length === 0) return;
    void loadLeaderboard();
  }, [mainAppTab, loadLeaderboard, appProfile?.track, auditHistory]);

  useEffect(() => {
    if (mainAppTab !== "rank" || lbViewMode !== "all") return;
    void loadGlobalLeaderboard();
  }, [mainAppTab, lbViewMode, loadGlobalLeaderboard]);

  // ── Render ────────────────────────────────────────────────────────────────
  const lbTrack = coerceLeaderboardTrackForApi(
    auditHistory[0]?.detected_track?.trim() || appProfile?.track?.trim() || null,
    "Humanities"
  );
  const d = lbData ?? defaultLeaderboard(lbTrack);
  const g = lbGlobalData ?? defaultLeaderboard("All cohorts");

  return (
    <div
      className="min-h-screen w-full max-w-[430px] mx-auto pb-36 overflow-x-hidden animate-fade-up"
      style={{ ...LB_VARS, background: "var(--bg)", fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <main className="min-w-0 pb-2">
        <div className="px-5 pt-11 pb-3" style={{ paddingTop: 44 }}>
          <div
            className="flex gap-1 p-1 rounded-xl"
            style={{ background: "var(--s2)", border: "1px solid var(--b1)" }}
            role="tablist"
            aria-label="Leaderboard view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={lbViewMode === "track"}
              className="flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: lbViewMode === "track" ? "var(--s4)" : "transparent",
                color: lbViewMode === "track" ? "var(--t1)" : "var(--t3)",
                boxShadow: lbViewMode === "track" ? "inset 0 0 0 1px var(--b2)" : "none",
              }}
              onClick={() => { hapticLight(); setLbViewMode("track"); }}
            >
              My track
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lbViewMode === "all"}
              className="flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors"
              style={{
                background: lbViewMode === "all" ? "var(--s4)" : "transparent",
                color: lbViewMode === "all" ? "var(--t1)" : "var(--t3)",
                boxShadow: lbViewMode === "all" ? "inset 0 0 0 1px var(--b2)" : "none",
              }}
              onClick={() => { hapticLight(); setLbViewMode("all"); }}
            >
              All cohorts
            </button>
          </div>
        </div>

        {lbViewMode === "track" ? (
          <>
            {lbErr ? (
              <p className="px-5 py-2 text-xs" style={{ color: "var(--coral)" }}>{lbErr}</p>
            ) : null}
            {lbLoading && !lbData ? (
              <p className="px-5 py-4 text-xs" style={{ color: "var(--t3)" }}>Loading leaderboard…</p>
            ) : (
              <>
                <LeaderboardHeader data={d} showUpdated={lbShowUpdated} updatedOpacity={lbUpdatedFade} />
                <PodiumRow slots={d.podium} studentFirstName={d.student_first_name} />
                <RankingsList data={d} />
                <MoveUpCard data={d} />
                <WeeklyFeed track={d.track} events={d.weekly_events} />
              </>
            )}
          </>
        ) : lbGlobalErr && !lbGlobalData ? (
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs" style={{ color: "var(--coral)" }}>{lbGlobalErr}</p>
            <button
              type="button"
              onClick={() => void loadGlobalLeaderboard({ force: true })}
              className="min-h-[44px] w-full rounded-xl text-sm font-semibold"
              style={{ background: "var(--s3)", color: "var(--t1)", border: "1px solid var(--b2)" }}
            >
              Try again
            </button>
          </div>
        ) : lbGlobalLoading && !lbGlobalData ? (
          <p className="px-5 py-4 text-xs" style={{ color: "var(--t3)" }}>Loading global leaderboard…</p>
        ) : (
          <>
            {lbGlobalErr ? (
              <p className="px-5 py-2 text-xs" style={{ color: "var(--coral)" }}>{lbGlobalErr}</p>
            ) : null}
            <LeaderboardHeader data={g} />
            <PodiumRow slots={g.podium} studentFirstName={g.student_first_name} />
            <RankingsList data={g} />
            <MoveUpCard data={g} />
            <WeeklyFeed track={g.track} events={g.weekly_events} />
          </>
        )}
      </main>
    </div>
  );
}
