"use client";

import React, { useState, useRef } from "react";
import { ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { getEffectiveCohortLabel, getPlaybookForTrack } from "@/lib/trackDefinitions";
import { QUICK_TIPS } from "@/lib/quickTips";
import { Button } from "@/components/ui/button";
import { DimensionBreakdown } from "@/components/DimensionBreakdown";
import { fireConfetti } from "@/components/ConfettiCelebration";
import { checkAuditEasterEggs } from "@/lib/easterEggs";
import { playSound } from "@/lib/sounds";
import { hapticLight, hapticMedium, hapticSuccess } from "@/lib/haptics";
import { fireConfettiSubmit } from "@/components/ui/confetti";
import { useToast } from "@/hooks/useToast";
import { useDillyVoiceNotification } from "@/context/DillyVoiceNotificationContext";
import { MessageCircle } from "lucide-react";
import { VoiceAvatar, VoiceAvatarButton } from "@/components/VoiceAvatarButton";
import { SuccessIcon } from "@/components/ui/animated-state-icons";
import { LoaderOne } from "@/components/ui/loader-one";
import { Input } from "@/components/ui/input";
import {
  DIMENSIONS,
  DILLY_LEADERBOARD_REFRESH_KEY,
  auditStorageKey,
  scoreColor,
  gapToNextLevel,
  computeScoreTrajectory,
  getStrongestSignalSentence,
  scoresCrossedMilestones,
} from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import { AppProfileHeader } from "@/components/career-center";
import { ScoreHomeRedirect } from "@/components/score/ScoreHomeRedirect";
import { NewAuditExperience } from "@/components/audit/NewAuditExperience";
import { mapHistoryToAuditRecords, mergeHistoryWithLatest } from "@/components/audit/mapAuditHistory";
import { useNavigation } from "@/contexts/NavigationContext";
import { DILLY_BASE_THEME } from "@/lib/schools";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import type { AuditV2, DimensionKey } from "@/types/dilly";
import type { TransitionSource } from "@/lib/dillyPresence";

// ── Props ──────────────────────────────────────────────────────────────────────

interface HiringTabProps {
  /** Upload file state (kept in page.tsx for URL-sync) */
  file: File | null;
  setFile: React.Dispatch<React.SetStateAction<File | null>>;
  pasteMode: boolean;
  setPasteMode: React.Dispatch<React.SetStateAction<boolean>>;
  pasteText: string;
  setPasteText: React.Dispatch<React.SetStateAction<string>>;
  wantsNewAudit: boolean;
  setWantsNewAudit: React.Dispatch<React.SetStateAction<boolean>>;
  /** Page-level functions that can't move in */
  openVoiceWithNewChat: (prompt?: string, title?: string, opts?: { initialAssistantMessage?: string; transitionSource?: TransitionSource }) => void;
  openVoiceFromScreen: (screenId: string, prompt?: string, convoTitle?: string) => void;
  navigateToAuditReport: (auditId: string, explicitFullAudit?: AuditV2 | null) => void;
  goToStandaloneFullAuditReport: (explicitId?: string | null) => void;
  saveProfile: (data: Record<string, unknown>) => Promise<boolean>;
  profilePhotoUrl: string | null;
  latestAuditRef: React.MutableRefObject<AuditV2 | null>;
}

const MAX_FILE_MB = 5;
const TAKING_LONGER_MS = 60_000;

export function HiringTab({
  file,
  setFile,
  pasteMode,
  setPasteMode,
  pasteText,
  setPasteText,
  wantsNewAudit,
  setWantsNewAudit,
  openVoiceWithNewChat,
  openVoiceFromScreen,
  navigateToAuditReport,
  goToStandaloneFullAuditReport,
  saveProfile,
  profilePhotoUrl,
  latestAuditRef,
}: HiringTabProps) {
  // ── Contexts ───────────────────────────────────────────────────────────────
  const { user, setUser, appProfile, school } = useAppContext();
  const {
    audit, setAudit,
    lastAudit, setLastAudit,
    savedAuditForCenter, setSavedAuditForCenter,
    viewingAudit,
    auditHistory, setAuditHistory, auditHistoryLoading,
    setCenterRefreshKey,
  } = useAuditScore();
  const { state: { mainAppTab: _mainAppTab, reviewSubView }, setMainAppTab, setReviewSubView } = useNavigation();
  const { voiceAvatarIndex } = useVoice();
  const { toast } = useToast();
  const { showVoiceNotification } = useDillyVoiceNotification();

  const theme = school?.theme ?? DILLY_BASE_THEME;

  // ── Local upload state ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditProgress, setAuditProgress] = useState(0);
  const [auditStep, setAuditStep] = useState("");
  const [takingLonger, setTakingLonger] = useState(false);
  const [auditSuccess, setAuditSuccess] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const takingLongerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const auditSuccessRef = useRef(false);

  // ── Upload functions ───────────────────────────────────────────────────────
  const cancelAudit = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (takingLongerTimeoutRef.current) {
      clearTimeout(takingLongerTimeoutRef.current);
      takingLongerTimeoutRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setTakingLonger(false);
    setAuditProgress(0);
    setAuditStep("");
    setLoading(false);
    setError(null);
  };

  const handlePasteAudit = async () => {
    const text = pasteText.trim();
    if (!text || text.split(/\s+/).length < 50) {
      setError("Paste at least 50 words of resume content (education, experience, skills).");
      return;
    }
    setError(null);
    hapticMedium();
    setAuditProgress(0);
    setAuditStep("Parsing your resume…");
    setTakingLonger(false);
    setLoading(true);
    fireConfettiSubmit();
    const steps = [
      { at: 0, label: "Parsing your resume…" },
      { at: 30, label: "Scoring Smart, Grit & Build…" },
      { at: 70, label: "Getting recommendations…" },
    ];
    progressIntervalRef.current = setInterval(() => {
      setAuditProgress((p) => {
        const next = Math.min(p + 3, 92);
        const step = steps.filter((s) => s.at <= next).pop();
        if (step) setAuditStep(step.label);
        return next;
      });
    }, 280);
    if (!localStorage.getItem("dilly_auth_token")) {
      setError("Sign in to run audit.");
      setLoading(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      return;
    }
    try {
      const res = await dilly.fetch(`/audit/from-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setAuditProgress(100);
      setAuditStep("Done!");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(typeof err?.detail === "string" ? err.detail : err?.error ?? "Audit failed");
      }
      const data: AuditV2 = await res.json();
      setAudit(data);
      setSavedAuditForCenter(data);
      latestAuditRef.current = data;
      setCenterRefreshKey((k: number) => k + 1);
      setAuditSuccess(true);
      setPasteText("");
      setPasteMode(false);
      setWantsNewAudit(false);
      {
        const aid = (data.id || "").trim();
        if (aid) navigateToAuditReport(aid, data);
        else setReviewSubView("home");
      }
      try {
        const res = await dilly.fetch(`/audit/history`);
        if (res.ok) {
          const { audits } = await res.json();
          setAuditHistory(Array.isArray(audits) ? audits : []);
        }
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed. Try again.");
    } finally {
      setLoading(false);
      setAuditProgress(0);
      setAuditStep("");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError("That file's heavier than a Spartan shield. Keep it under 5 MB.");
      return;
    }
    hapticMedium();
    setAuditProgress(0);
    setAuditStep("Reading your resume…");
    setTakingLonger(false);
    setLoading(true);
    fireConfettiSubmit();

    if (takingLongerTimeoutRef.current) {
      clearTimeout(takingLongerTimeoutRef.current);
      takingLongerTimeoutRef.current = null;
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    takingLongerTimeoutRef.current = setTimeout(() => setTakingLonger(true), TAKING_LONGER_MS);

    const steps = [
      { at: 0, label: "Reading your resume…" },
      { at: 22, label: "Parsing sections & experience…" },
      { at: 45, label: "Scoring Smart, Grit & Build…" },
      { at: 68, label: "Getting your recommendations…" },
      { at: 88, label: "Almost there…" },
    ];
    progressIntervalRef.current = setInterval(() => {
      setAuditProgress((p) => {
        let increment: number;
        if (p < 10) {
          increment = 0.5;
        } else if (p < 30) {
          increment = 2;
        } else if (p < 60) {
          increment = 3;
        } else if (p < 80) {
          increment = 2.5;
        } else {
          increment = 1;
        }
        const next = Math.min(p + increment, 92);
        const step = steps.filter((s) => s.at <= next).pop();
        if (step) setAuditStep(step.label);
        return next;
      });
    }, 280);

    const formData = new FormData();
    formData.append("file", file);
    if (user?.email) formData.append("user_email", user.email);
    const effectiveTarget = appProfile?.application_target || "exploring";
    formData.append("application_target", effectiveTarget);

    const headers: Record<string, string> = {};

    try {
      const res = await dilly.fetch(`/audit/v2`, {
        method: "POST",
        headers,
        body: formData,
        signal,
      });
      if (takingLongerTimeoutRef.current) {
        clearTimeout(takingLongerTimeoutRef.current);
        takingLongerTimeoutRef.current = null;
      }
      setTakingLonger(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setAuditProgress(100);
      setAuditStep("Done!");
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText, error: res.statusText }));
        const msg =
          typeof err?.detail === "string"
            ? err.detail
            : typeof err?.error === "string"
              ? err.error
              : "We couldn't complete the audit. Try Again.";
        if (res.status === 401) {
          try { localStorage.removeItem("dilly_auth_token"); } catch { /* ignore */ }
          setUser(null);
        }
        throw new Error(msg);
      }
      const data: AuditV2 = await res.json();
      try {
        const stored = localStorage.getItem(auditStorageKey(user?.email));
        if (stored) setLastAudit(JSON.parse(stored) as AuditV2);
      } catch {
        setLastAudit(null);
      }
      setAudit(data);
      setSavedAuditForCenter(data);
      latestAuditRef.current = data;
      setCenterRefreshKey((k: number) => k + 1);
      setWantsNewAudit(false);
      {
        const aid = (data.id || "").trim();
        if (aid) navigateToAuditReport(aid, data);
        else setReviewSubView("home");
      }
      const prevStored = typeof localStorage !== "undefined" ? localStorage.getItem(auditStorageKey(user?.email)) : null;
      const prevForMilestone = prevStored ? (() => { try { return JSON.parse(prevStored) as AuditV2; } catch { return null; } })() : null;
      try {
        localStorage.setItem(auditStorageKey(user?.email), JSON.stringify(data));
      } catch {
        /* ignore */
      }
      // Confetti when any dimension hits Top 25%
      const pct = data.peer_percentiles ?? { smart: 50, grit: 50, build: 50 };
      const hasTop25 = (["smart", "grit", "build"] as const).some((k) => Math.max(1, 100 - (pct[k] ?? 50)) <= 25);
      if (hasTop25) {
        fireConfetti();
        playSound("celebration");
      }
      // Confetti when any score crosses 50, 70, or 85
      const crossed = scoresCrossedMilestones(data, prevForMilestone);
      if (crossed.length > 0) {
        fireConfetti();
        playSound("celebration");
      }
      // Easter eggs
      const egg = checkAuditEasterEggs(data);
      if (egg) {
        if (egg.confetti) fireConfetti();
        if (egg.sound) playSound(egg.sound === "celebration" ? "celebration" : "badge_unlock");
        setTimeout(() => toast(egg.message, "success", 5000), 600);
      }
      // Sound + haptic: audit complete
      playSound("audit_done");
      hapticSuccess();
      try {
        sessionStorage.setItem(DILLY_LEADERBOARD_REFRESH_KEY, "1");
      } catch {
        /* ignore */
      }
      // Dilly notification after new audit
      showVoiceNotification("I noted your new audit. Ask me about your scores or what to do next.");
      if (effectiveTarget) {
        dilly.fetch(`/profile`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ application_target: effectiveTarget }),
        }).catch(() => {});
      }
      auditSuccessRef.current = true;
      setAuditProgress(100);
      setAuditStep("Complete");
      setAuditSuccess(true);
      setTimeout(() => {
        setLoading(false);
        setAuditSuccess(false);
        auditSuccessRef.current = false;
      }, 1500);
    } catch (err) {
      if (takingLongerTimeoutRef.current) {
        clearTimeout(takingLongerTimeoutRef.current);
        takingLongerTimeoutRef.current = null;
      }
      setTakingLonger(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setAuditProgress(0);
      setAuditStep("");
      if (err instanceof Error && err.name === "AbortError") {
        setError(null);
      } else {
        const message =
          err instanceof TypeError && err.message === "Failed to fetch"
            ? "We couldn't reach the server. Check your connection and try again."
            : err instanceof Error
              ? err.message
              : "Something Went Wrong. Try Again.";
        setError(message);
      }
    } finally {
      if (!auditSuccessRef.current) setLoading(false);
      abortControllerRef.current = null;
    }
  };

  // ── Computed values ────────────────────────────────────────────────────────
  const latestForHistoryMerge = latestAuditRef.current ?? audit ?? savedAuditForCenter ?? undefined;
  const newAuditExperienceRecords = mapHistoryToAuditRecords(
    mergeHistoryWithLatest(auditHistory, latestForHistoryMerge)
  );

  // ── Insights sub-view ─────────────────────────────────────────────────────
  if (reviewSubView === "insights") {
    const displayAudit = latestAuditRef.current ?? audit ?? savedAuditForCenter;
    const trackForPlaybook = getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track) || null;
    const _playbook = trackForPlaybook ? getPlaybookForTrack(trackForPlaybook) : null;
    return (
      <section className="w-full max-w-[min(375px,100vw)] mx-auto px-3 sm:px-5 pt-0 pb-40 min-w-0 animate-fade-up overflow-x-hidden" aria-label="Insights">
        <Button type="button" variant="ghost" size="sm" onClick={() => setReviewSubView("home")} className="mb-4 text-slate-400 hover:text-slate-200 -ml-1 min-h-[44px]">← Back</Button>
        <header className="te-page-hero mb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="te-hero-title">Insights</h1>
              <p className="te-hero-sub">Progress, milestones, and career tools.</p>
            </div>
            <button
              type="button"
              onClick={() => openVoiceFromScreen("insights", "What does the Insights screen show me?")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors shrink-0 mt-1"
              title="Ask Dilly AI about this screen"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Ask Dilly AI
            </button>
          </div>
        </header>
        {!displayAudit ? (
          auditHistoryLoading ? (
            <div
              className="m-rounded-card p-6 rounded-xl text-center min-w-0 border"
              style={{
                background: "var(--ut-surface-raised)",
                borderLeftWidth: "4px",
                borderLeftColor: "#94a3b8",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                borderColor: "var(--ut-border)",
              }}
            >
              <p className="text-sm text-slate-400">Loading your previous audit…</p>
            </div>
          ) : (
          <div
            className="m-rounded-card p-6 rounded-xl text-center min-w-0 border"
            style={{
              background: "var(--ut-surface-raised)",
              borderLeftWidth: "4px",
              borderLeftColor: theme.primary,
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
              borderColor: "var(--ut-border)",
            }}
          >
            <p className="text-sm text-slate-400">Nothing to show here yet.</p>
          </div>
          )
        ) : (
          <React.Fragment>
            {/* Score trajectory */}
            {(() => {
              const traj = computeScoreTrajectory(displayAudit);
              if (!traj) return null;
              const current = displayAudit.scores ?? { smart: 0, grit: 0, build: 0 };
              const hasGain = traj.smart > (current.smart ?? 0) || traj.grit > (current.grit ?? 0) || traj.build > (current.build ?? 0);
              if (!hasGain) return null;
              const dims = [
                { key: "Smart", val: Math.round(traj.smart), color: "#6d28d9", label: "Smart" },
                { key: "Grit", val: Math.round(traj.grit), color: "#be185d", label: "Grit" },
                { key: "Build", val: Math.round(traj.build), color: "#b45309", label: "Build" },
              ];
              return (
                <div
                  className="m-rounded-card p-5 mb-5 min-w-0 border rounded-xl"
                  style={{
                    background: "var(--ut-surface-raised)",
                    borderLeftWidth: "4px",
                    borderLeftColor: theme.primary,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                    borderColor: "var(--ut-border)",
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-slate-500">Your potential</p>
                  <p className="text-sm mb-4 text-slate-400">Complete top 3 recommendations to reach these scores.</p>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {dims.map((d) => (
                      <span key={d.key} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold border border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: d.color }}>
                        {d.label} <span className="tabular-nums">{d.val}</span>
                      </span>
                    ))}
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold border border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: theme.primary }}>
                      Overall <span className="tabular-nums">{Math.round(traj.final)}</span>
                    </span>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => goToStandaloneFullAuditReport()} className="rounded-lg text-xs border-[var(--ut-border)] text-slate-200 hover:bg-white/10">
                    View recommendations →
                  </Button>
                </div>
              );
            })()}
            {/* Progress to Next Tier */}
            {displayAudit?.scores && (() => {
              const tiers = [{ threshold: 85, label: "Elite" }, { threshold: 70, label: "Strong" }, { threshold: 50, label: "Average" }];
              const dims = [{ key: "Smart", val: displayAudit.scores.smart ?? 0 }, { key: "Grit", val: displayAudit.scores.grit ?? 0 }, { key: "Build", val: displayAudit.scores.build ?? 0 }];
              const bars = dims.map((d) => {
                const next = tiers.find((t) => d.val < t.threshold);
                const target = next?.threshold ?? 100;
                const label = next?.label ?? "Max";
                const pct = Math.min(100, (d.val / target) * 100);
                const remaining = Math.max(0, target - d.val);
                const color = d.val >= 70 ? "#15803d" : d.val >= 50 ? "#a16207" : "#b91c1c";
                return { ...d, target, label, pct, remaining, color };
              });
              return (
                <div
                  className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 border"
                  style={{
                    background: "var(--ut-surface-raised)",
                    borderLeftWidth: "4px",
                    borderLeftColor: "#94a3b8",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                    borderColor: "var(--ut-border)",
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-slate-500">Progress to next tier</p>
                  <div className="space-y-4 mt-3">
                    {bars.map((b) => (
                      <div key={b.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium text-slate-200">{b.key}</span>
                          <span className="text-xs text-slate-500">{Math.round(b.remaining)} pts to {b.label}</span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden bg-white/10">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${b.pct}%`, backgroundColor: b.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* Before & after */}
            {appProfile?.first_audit_snapshot && displayAudit?.scores && (
              <div
                className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 border"
                style={{
                  background: "var(--ut-surface-raised)",
                  borderLeftWidth: "4px",
                  borderLeftColor: "#94a3b8",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                  borderColor: "var(--ut-border)",
                }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-slate-500">Before & after</p>
                <div className="grid grid-cols-2 gap-6 mt-3">
                  <div>
                    <p className="text-xs mb-2 text-slate-500">Baseline</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-200">
                      {(["smart", "grit", "build"] as const).map((k) => (
                        <span key={k}>{k.charAt(0).toUpperCase() + k.slice(1)}: <span className="font-semibold">{Math.round(appProfile.first_audit_snapshot?.scores[k] ?? 0)}</span></span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs mb-2 text-slate-500">Latest</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-200">
                      {(["smart", "grit", "build"] as const).map((k) => {
                        const first = appProfile.first_audit_snapshot?.scores[k] ?? 0;
                        const latest = displayAudit.scores[k] ?? 0;
                        const delta = latest - first;
                        const color = delta > 0 ? "#22c55e" : delta < 0 ? "#ef4444" : "inherit";
                        return (
                          <span key={k}>
                            {k.charAt(0).toUpperCase() + k.slice(1)}: <span className="font-semibold" style={{ color }}>{Math.round(latest)}</span>
                            {delta !== 0 && <span className="text-[10px] ml-0.5" style={{ color }}>({delta > 0 ? "+" : ""}{Math.round(delta)})</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Dilly's take */}
            {displayAudit?.dilly_take && (
              <div
                className="m-rounded-card p-5 mb-5 min-w-0 border rounded-xl"
                style={{
                  background: "var(--ut-surface-raised)",
                  borderLeftWidth: "4px",
                  borderLeftColor: theme.primary,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                  borderColor: "var(--ut-border)",
                }}
              >
                <p className="text-xl font-bold tracking-tight text-slate-100" style={{ fontFamily: '"Times New Roman", Times, serif' }}>Dilly&apos;s take</p>
                <p className="text-sm mt-1 leading-tight text-slate-500" style={{ fontFamily: '"Times New Roman", Times, serif' }}>Senior hiring manager view on your resume.</p>
                <p className="mt-4 text-[15px] leading-relaxed font-medium text-slate-200">{displayAudit.dilly_take}</p>
              </div>
            )}
            {/* Your strongest signal */}
            {displayAudit && getStrongestSignalSentence(displayAudit) && (
              <div
                className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 border"
                style={{
                  background: "var(--ut-surface-raised)",
                  borderLeftWidth: "4px",
                  borderLeftColor: "#22c55e",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                  borderColor: "var(--ut-border)",
                }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 text-green-400">Your strongest signal</p>
                <p className="text-[15px] leading-relaxed font-medium text-slate-200">{getStrongestSignalSentence(displayAudit)}</p>
              </div>
            )}
            {/* Top X% / Gap to next level */}
            {displayAudit?.peer_percentiles && (() => {
              const best = (["smart", "grit", "build"] as const).reduce((b, k) => {
                const topPct = Math.max(1, 100 - (displayAudit.peer_percentiles![k] ?? 50));
                return topPct < b.topPct ? { key: k, topPct } : b;
              }, { key: "smart" as DimensionKey, topPct: 101 });
              const label = DIMENSIONS.find((d) => d.key === best.key)?.label ?? best.key;
              const track = getEffectiveCohortLabel(displayAudit.detected_track, appProfile?.track) || "your track";
              const gaps = gapToNextLevel(displayAudit);
              return (
                <>
                  <div
                    className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 text-center border"
                    style={{
                      background: "var(--ut-surface-raised)",
                      borderLeftWidth: "4px",
                      borderLeftColor: "#22c55e",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                      borderColor: "var(--ut-border)",
                    }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-green-400">Your rank</p>
                    <p className="text-2xl font-bold tabular-nums mt-2 text-slate-100" style={{ fontFamily: '"Times New Roman", Times, serif' }}>Top {best.topPct}%</p>
                    <p className="text-sm mt-1 text-slate-500">{label} vs other {track} students</p>
                    <button
                      type="button"
                      className="inline-block mt-3 text-xs font-semibold"
                      style={{ color: "#818cf8" }}
                      onClick={() => { hapticLight(); setMainAppTab("rank"); }}
                    >
                      Weekly leaderboard →
                    </button>
                  </div>
                  {gaps.length > 0 && (
                    <div
                      className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 border"
                      style={{
                        background: "var(--ut-surface-raised)",
                        borderLeftWidth: "4px",
                        borderLeftColor: "#eab308",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                        borderColor: "var(--ut-border)",
                      }}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 text-amber-400">Gap to next level</p>
                      <div className="space-y-2">
                        {gaps.slice(0, 2).map((g) => (
                          <p key={g.key} className="text-[15px] leading-relaxed text-slate-200">
                            You&apos;re Top {g.topPct}% in {g.label}. {g.pointsToTop25 && g.pointsToTop25 > 0 ? `~${g.pointsToTop25} more points could get you to Top 25%.` : "Keep building. You\u0027re close."}
                          </p>
                        ))}
                      </div>
                      <VoiceAvatarButton
                        voiceAvatarIndex={voiceAvatarIndex}
                        size="xs"
                        label="How can I help?"
                        onClick={() => openVoiceWithNewChat("Based on my scores and audit, what's the single highest-impact change I should make to my resume right now? Give me a concrete, actionable fix, not general advice. What exactly should I add, remove, or rewrite?")}
                        className="mt-2 shrink-0"
                      />
                    </div>
                  )}
                </>
              );
            })()}
            {/* Milestone nudges */}
            {auditHistory.length >= 2 && displayAudit?.scores && (() => {
              const prev = auditHistory[auditHistory.length - 2];
              const nudges: string[] = [];
              const dims = ["smart", "grit", "build"] as const;
              for (const d of dims) {
                const delta = (displayAudit.scores[d] ?? 0) - (prev.scores?.[d] ?? 0);
                if (delta >= 3) nudges.push(`${d.charAt(0).toUpperCase() + d.slice(1)} up ${Math.round(delta)} points since your last audit`);
              }
              if (displayAudit.peer_percentiles) {
                for (const d of dims) {
                  const pct = displayAudit.peer_percentiles[d] ?? 50;
                  const topPct = Math.max(1, 100 - pct);
                  if (topPct <= 25) nudges.push(`You're in the top ${topPct}% for ${d.charAt(0).toUpperCase() + d.slice(1)} among your peers`);
                }
              }
              if (nudges.length === 0) return null;
              return (
                <div
                  className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 border"
                  style={{
                    background: "var(--ut-surface-raised)",
                    borderLeftWidth: "4px",
                    borderLeftColor: "#22c55e",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                    borderColor: "var(--ut-border)",
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 text-green-400">Milestones</p>
                  <ul className="space-y-2 list-none">
                    {nudges.slice(0, 3).map((n, i) => (
                      <li key={i} className="text-[15px] leading-relaxed flex items-start gap-2 text-slate-200">
                        <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-green-400" aria-hidden />
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            {/* Progress (previous vs now) */}
            {audit && lastAudit && (() => {
              const nowTotal = (audit.scores?.smart ?? 0) + (audit.scores?.grit ?? 0) + (audit.scores?.build ?? 0);
              const prevTotal = lastAudit.scores.smart + lastAudit.scores.grit + lastAudit.scores.build;
              const delta = Math.round(nowTotal - prevTotal);
              const up = delta > 0;
              const down = delta < 0;
              const leftColor = up ? "#22c55e" : down ? "#ef4444" : "#94a3b8";
              return (
                <div
                  className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 border"
                  style={{
                    background: "var(--ut-surface-raised)",
                    borderLeftWidth: "4px",
                    borderLeftColor: leftColor,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                    borderColor: "var(--ut-border)",
                  }}
                >
                  {up ? <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-green-400">+{delta} since last audit</p> : down ? <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-red-400">{delta} since last audit</p> : <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-slate-500">Progress</p>}
                  <div className="flex items-center gap-4 text-sm mt-3">
                    <div className="flex-1">
                      <p className="text-xs mb-0.5 text-slate-500">Previous</p>
                      <p className="tabular-nums font-medium text-slate-200">{Math.round(lastAudit.scores.smart)} · {Math.round(lastAudit.scores.grit)} · {Math.round(lastAudit.scores.build)}</p>
                    </div>
                    <svg className="w-4 h-4 shrink-0" style={{ color: up ? "#22c55e" : down ? "#ef4444" : "#94a3b8" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    <div className="flex-1">
                      <p className="text-xs mb-0.5 text-slate-500">Now</p>
                      <p className="tabular-nums font-medium flex gap-1.5 text-slate-200">
                        {(["smart", "grit", "build"] as const).map((k, i) => {
                          const s = Math.round(audit.scores?.[k] ?? 0);
                          return <span key={k} style={{ color: scoreColor(s).color }}>{s}{i < 2 ? " ·" : ""}</span>;
                        })}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => goToStandaloneFullAuditReport()} className="text-xs mt-3 hover:underline font-medium" style={{ color: theme.primary }}>See full breakdown</button>
                </div>
              );
            })()}
            {/* Quick tips */}
            <details
              className="m-rounded-card overflow-hidden mb-5 rounded-xl border"
              style={{
                background: "var(--ut-surface-raised)",
                borderLeftWidth: "4px",
                borderLeftColor: "#94a3b8",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                borderColor: "var(--ut-border)",
              }}
            >
              <summary className="p-5 cursor-pointer flex items-center gap-3 select-none list-none [&::-webkit-details-marker]:hidden">
                <span className="text-xl shrink-0" aria-hidden>💡</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5 text-slate-500">Quick tips</p>
                  <p className="text-sm font-medium text-slate-200">Resume FAQs: GPA, dates, what recruiters scan</p>
                </div>
              </summary>
              <div className="px-5 pb-5 pt-0 space-y-2">
                {QUICK_TIPS.map((tip, i) => (
                  <details key={i} className="rounded-lg overflow-hidden border border-white/10 bg-white/5">
                    <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-slate-200 hover:text-slate-100 select-none list-none [&::-webkit-details-marker]:hidden">{tip.question}</summary>
                    <p className="px-4 pb-4 pt-1 text-sm leading-relaxed text-slate-400">{tip.answer}</p>
                  </details>
                ))}
              </div>
            </details>
            {/* Progress over time */}
            {auditHistory.length >= 2 && (
              <div
                className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 border"
                style={{
                  background: "var(--ut-surface-raised)",
                  borderLeftWidth: "4px",
                  borderLeftColor: theme.primary,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                  borderColor: "var(--ut-border)",
                }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-slate-500">Progress over time</p>
                <div className="h-40 mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={[...auditHistory].reverse().map((a) => ({ ts: a.ts, date: typeof a.ts === "number" ? new Date(a.ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-", final: Math.round(a.final_score ?? 0), smart: Math.round(a.scores?.smart ?? 0), grit: Math.round(a.scores?.grit ?? 0), build: Math.round(a.scores?.build ?? 0) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} labelStyle={{ color: "#e2e8f0" }} />
                      <Line type="monotone" dataKey="final" stroke="#e2e8f0" strokeWidth={2} dot={{ r: 3 }} name="Overall" />
                      <Line type="monotone" dataKey="smart" stroke="#22c55e" strokeWidth={1.5} dot={{ r: 2 }} name="Smart" strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="grit" stroke="#eab308" strokeWidth={1.5} dot={{ r: 2 }} name="Grit" strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="build" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} name="Build" strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {/* Momentum */}
            {auditHistory.length >= 2 && (
              <div
                className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 border"
                style={{
                  background: "var(--ut-surface-raised)",
                  borderLeftWidth: "4px",
                  borderLeftColor: "#22c55e",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                  borderColor: "var(--ut-border)",
                }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-green-400">Momentum</p>
                <p className="text-[15px] leading-relaxed mt-2 text-slate-200">
                  {auditHistory.filter((a) => { const d = new Date((a.ts ?? 0) * 1000); const n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).length} audits this month
                  {auditHistory.length >= 2 && (auditHistory[0].final_score ?? 0) > (auditHistory[1].final_score ?? 0) ? " · Score up since last run" : ""}.
                </p>
              </div>
            )}
            {/* Audit history */}
            {auditHistory.length > 0 && (
              <div
                className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 border"
                style={{
                  background: "var(--ut-surface-raised)",
                  borderLeftWidth: "4px",
                  borderLeftColor: "#94a3b8",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                  borderColor: "var(--ut-border)",
                }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3 text-slate-500">History ({auditHistory.length} audits)</p>
                <div className="space-y-0 max-h-[50vh] overflow-y-auto pr-1">
                  {auditHistory.map((a, i) => {
                    const hsc = scoreColor(a.final_score ?? 0);
                    return (
                      <button
                        key={a.id ?? i}
                        type="button"
                        onClick={() => {
                          if (!a.id) return;
                          hapticLight();
                          navigateToAuditReport(a.id);
                        }}
                        className="flex items-center justify-between w-full py-3 px-3 -mx-3 rounded-lg transition-colors border-b last:border-0 border-white/10 hover:bg-white/10 text-slate-200"
                      >
                        <span className="text-sm text-slate-500">{typeof a.ts === "number" ? new Date(a.ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "\u2014"}</span>
                        <span className="tabular-nums text-sm font-semibold" style={{ color: hsc.color }}>{Math.round(a.final_score ?? 0)}</span>
                        <span className="text-xs flex items-center gap-1 text-slate-500">{a.detected_track || "\u2014"}<svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Target firms */}
            {appProfile?.target_school ? (
              <div
                className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 flex items-center justify-between border"
                style={{
                  background: "var(--ut-surface-raised)",
                  borderLeftWidth: "4px",
                  borderLeftColor: theme.primary,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                  borderColor: "var(--ut-border)",
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0" aria-hidden>🏛️</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: theme.primary }}>Target firms</p>
                    <p className="text-sm font-medium truncate text-slate-200">{appProfile.target_school}</p>
                  </div>
                </div>
                <button type="button" onClick={async () => { await saveProfile({ target_school: null }); }} className="text-xs shrink-0 ml-2 font-medium text-slate-500 hover:text-slate-300">Clear</button>
              </div>
            ) : (
              <form className="mb-5" onSubmit={async (e) => {
                e.preventDefault();
                const input = (e.currentTarget.elements.namedItem("targetSchoolInput") as HTMLInputElement)?.value?.trim();
                if (!input) return;
                const ok = await saveProfile({ target_school: input });
                if (ok) (e.target as HTMLFormElement).reset();
              }}>
                <div
                  className="m-rounded-card p-5 mb-5 rounded-xl min-w-0 border"
                  style={{
                    background: "var(--ut-surface-raised)",
                    borderLeftWidth: "4px",
                    borderLeftColor: theme.primary,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                    borderColor: "var(--ut-border)",
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 text-slate-500">Target firms</p>
                  <div className="flex gap-2">
                    <Input name="targetSchoolInput" placeholder="E.g. Goldman Sachs, Google" className="flex-1 rounded-lg bg-slate-800/70 border-[var(--ut-border)] text-slate-100 placeholder:text-slate-500 text-sm" />
                    <Button type="submit" size="sm" className="rounded-lg shrink-0" style={{ backgroundColor: theme.primary }}>Set</Button>
                  </div>
                </div>
              </form>
            )}
          </React.Fragment>
        )}
      </section>
    );
  }

  // ── Main Hiring view ──────────────────────────────────────────────────────
  const displayAudit = viewingAudit ?? latestAuditRef.current ?? audit ?? savedAuditForCenter;
  const showUpload = !displayAudit || wantsNewAudit;
  const showUploadView = reviewSubView === "upload" || (showUpload && !["home", "report", "insights", "dimensions"].includes(reviewSubView));

  /** Review hub: legacy Score tab → canonical `/score` route */
  if (reviewSubView === "home") {
    return <ScoreHomeRedirect />;
  }

  /** Dimensions detail page (not in nav): full breakdown per Smart / Grit / Build */
  if (reviewSubView === "dimensions" && displayAudit) {
    const dimAccent: Record<DimensionKey, string> = {
      smart: "var(--blue)",
      grit: "var(--amber)",
      build: "var(--indigo)",
    };
    return (
      <div className="career-center-talent min-h-full w-full animate-fade-up overflow-x-hidden" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
        <section className="w-full max-w-[390px] mx-auto px-4 pb-40 pt-2 min-w-0" aria-label="Score breakdown">
          <button
            type="button"
            onClick={() => { hapticLight(); setMainAppTab("score"); }}
            className="mb-4 flex items-center gap-1 min-h-[44px] text-sm font-medium transition-opacity hover:opacity-90 outline-none border-0 bg-transparent"
            style={{ color: "var(--t2)" }}
          >
            ← Back to Score
          </button>
          <header className="mb-5">
            <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "var(--t3)", letterSpacing: "0.12em" }}>Review</p>
            <h2 className="text-[18px] font-semibold leading-tight" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>Score breakdown</h2>
            <p className="text-[12px] mt-1.5" style={{ color: "var(--t2)" }}>What drove each dimension and how to improve.</p>
          </header>
          <div className="w-full rounded-[18px] p-4 mb-5 min-w-0" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
            <p className="text-[10px] font-semibold uppercase" style={{ color: "var(--t3)", letterSpacing: "0.1em" }}>Dilly score</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: "var(--blue)" }}>{(displayAudit.final_score ?? 0).toFixed(0)}</p>
            <p className="text-xs mt-1" style={{ color: "var(--t2)" }}>What jobs look for: skills, academics, leadership, proof</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>{getEffectiveCohortLabel(displayAudit.detected_track, appProfile?.track)}{displayAudit.major ? ` · ${displayAudit.major}` : ""}</p>
          </div>
          {(() => {
            const gaps = gapToNextLevel(displayAudit);
            return (
              <div className="space-y-4">
                {(DIMENSIONS as { key: DimensionKey; label: string }[]).map((d) => {
                  const val = Math.round(displayAudit.scores?.[d.key] ?? 0);
                  const { label: scoreLabel } = scoreColor(val);
                  const accent = dimAccent[d.key];
                  const topPct = displayAudit.peer_percentiles?.[d.key] != null ? Math.max(1, 100 - (displayAudit.peer_percentiles[d.key] ?? 50)) : null;
                  const gapForDim = gaps.find((g) => g.key === d.key);
                  const benchCopy = displayAudit.benchmark_copy?.[d.key];
                  return (
                    <div
                      key={d.key}
                      className="rounded-[18px] p-5 min-w-0 overflow-hidden"
                      style={{ background: "var(--s2)", borderLeft: `4px solid ${accent}` }}
                    >
                      <div className="mb-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h3 className="text-base font-semibold" style={{ color: "var(--t1)" }}>{d.label}</h3>
                          <span className="text-xl font-bold tabular-nums" style={{ color: accent }}>{val}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-[8px]" style={{ background: "var(--s3)", color: accent }}>{scoreLabel}</span>
                          {topPct != null && <span className="text-[10px]" style={{ color: "var(--t3)" }}>Top {topPct}% in cohort</span>}
                        </div>
                        {benchCopy && <p className="text-xs mt-2" style={{ color: "var(--t3)" }}>{benchCopy}</p>}
                        {gapForDim && gapForDim.pointsToTop25 != null && gapForDim.pointsToTop25 > 0 && (
                          <p className="text-xs mt-2" style={{ color: "var(--t2)" }}>~{gapForDim.pointsToTop25} more points could get you to Top 25%.</p>
                        )}
                      </div>
                      <DimensionBreakdown audit={displayAudit} selectedDimension={d.key} />
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => goToStandaloneFullAuditReport()}
              className="min-h-[44px] px-4 rounded-[12px] text-xs font-semibold transition-opacity hover:opacity-90 border"
              style={{ background: "var(--s3)", borderColor: "var(--b2)", color: "var(--t2)" }}
            >
              See full report with all recommendations
            </button>
          </div>
        </section>
      </div>
    );
  }

  /** Report requested but no audit: show placeholder */
  if (reviewSubView === "report" && !displayAudit) {
    return (
      <div className="career-center-talent min-h-full w-full" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
        <section className="w-full max-w-[min(375px,100vw)] mx-auto px-3 sm:px-5 pt-0 pb-40 min-w-0 animate-fade-up overflow-x-hidden" aria-label="Report">
          <Button type="button" variant="ghost" size="sm" onClick={() => setReviewSubView("home")} className="mb-2 text-slate-400 hover:text-slate-200 -ml-1 min-h-[44px]">← Back</Button>
          <div className="m-rounded-card p-6 border min-w-0 text-center" style={{ backgroundColor: "var(--ut-surface-raised)", borderColor: "var(--ut-border)" }}>
            <p className="text-slate-400 text-sm">No report here yet.</p>
          </div>
        </section>
      </div>
    );
  }

  if (showUploadView) return (
    <div className="career-center-talent min-h-full w-full animate-fade-up overflow-x-hidden" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }} aria-label="New resume audit">
      <div className="max-w-[390px] mx-auto w-full px-4 pt-2 pb-0">
        <AppProfileHeader
          name={appProfile?.name ?? undefined}
          track={getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track)}
          schoolName={school?.name ?? undefined}
          photoUrl={profilePhotoUrl ?? undefined}
          onPhotoTap={() => { hapticLight(); setMainAppTab("profile_details"); }}
          back={() => {
            if (wantsNewAudit && displayAudit) {
              setWantsNewAudit(false);
              setReviewSubView("home");
              setPasteMode(false);
              setPasteText("");
              return;
            }
            if (!displayAudit) {
              setReviewSubView("home");
              setPasteMode(false);
              setPasteText("");
            }
          }}
          className="mb-2"
        />
      </div>
      <NewAuditExperience
        auditRecords={newAuditExperienceRecords}
        historyLoading={auditHistoryLoading}
        onFileSelect={(f) => { setFile(f); setError(null); }}
        onPasteRowClick={() => setPasteMode(true)}
        onViewReport={(auditId) => {
          if (!auditId) return;
          hapticLight();
          navigateToAuditReport(auditId);
        }}
        onShare={async (auditId) => {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          const url = `${origin}/audit/${encodeURIComponent(auditId)}`;
          try {
            await navigator.clipboard.writeText(url);
            toast("Report link copied", "success");
          } catch {
            toast("Couldn't copy — try again", "error");
          }
        }}
        pasteMode={pasteMode}
        pasteSlot={(
          <div className="space-y-3 -mx-4 px-4">
            <div className="rounded-[14px] p-4 min-w-0" style={{ background: "var(--s2)" }}>
              <textarea
                value={pasteText}
                onChange={(e) => { setPasteText(e.target.value); setError(null); }}
                placeholder="Paste your resume here. Include education, experience, skills. At least 50 words."
                rows={10}
                className="w-full px-4 py-3 rounded-[12px] resize-y min-h-[200px] text-sm outline-none"
                style={{ background: "var(--s3)", color: "var(--t1)" }}
              />
            </div>
            <button
              type="button"
              onClick={() => { setPasteMode(false); setPasteText(""); setError(null); }}
              className="text-[12px] font-medium transition-opacity hover:opacity-90 outline-none border-0 bg-transparent"
              style={{ color: "var(--blue)" }}
            >
              Or upload a file instead
            </button>
          </div>
        )}
        actionSlot={
          (file || (pasteMode && pasteText.trim().length > 0)) ? (
            <div className="mt-6 space-y-4 -mx-4 px-4">
              {loading ? (
                <div className="overflow-hidden rounded-[16px] p-5 space-y-4" style={{ background: "var(--s2)" }}>
                  {auditSuccess ? (
                    <div className="flex flex-col items-center justify-center py-4 gap-3">
                      <div className="w-16 h-16 rounded-[14px] flex items-center justify-center" style={{ background: "var(--bdim)" }}>
                        <SuccessIcon size={48} color="var(--blue)" state={true} />
                      </div>
                      <span className="text-sm font-medium" style={{ color: "var(--t2)" }}>Audit complete</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium" style={{ color: "var(--t1)" }}>{auditStep}</span>
                        <span className="font-mono tabular-nums" style={{ color: "var(--blue)" }}>{auditProgress}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--b1)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${auditProgress}%`, backgroundColor: "var(--blue)" }}
                        />
                      </div>
                    </>
                  )}
                  {takingLonger && !auditSuccess && (
                    <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3" style={{ borderTop: "1px solid var(--b1)" }}>
                      <p className="text-sm flex-1" style={{ color: "var(--t3)" }}>This is taking longer than usual. You can cancel and try again.</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={cancelAudit} className="min-h-[44px] rounded-[12px] px-4 text-sm font-medium outline-none border-0" style={{ background: "var(--s3)", color: "var(--t2)" }}>
                          Cancel
                        </button>
                        <button type="button" onClick={() => { cancelAudit(); setTimeout(() => handleUpload(), 0); }} className="min-h-[44px] rounded-[12px] px-4 text-sm font-semibold border-0 outline-none text-white" style={{ background: "var(--blue)" }}>
                          Try Again
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => { if (pasteMode) void handlePasteAudit(); else void handleUpload(); }}
                disabled={loading}
                className="w-full min-h-[48px] py-3.5 rounded-[12px] font-semibold border-0 outline-none disabled:opacity-50"
                style={{ background: "var(--green)", color: "#05140A" }}
              >
                {loading ? <LoaderOne color="#05140A" size={16} /> : "Run audit"}
              </button>
            </div>
          ) : null
        }
        footerSlot={(
          <div className="mt-6 space-y-4 -mx-4 px-4 pb-4">
            <div className="w-full rounded-[14px] p-3" style={{ background: "var(--s2)" }}>
              <button
                type="button"
                onClick={() => openVoiceFromScreen("hiring", "What does this screen show?")}
                className="w-full flex items-center gap-3 text-left min-w-0 outline-none border-0 bg-transparent"
                title="Ask Dilly AI about this screen"
              >
                <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="sm" className="shrink-0" />
                <span className="flex-1 min-w-0 text-sm truncate" style={{ color: "var(--t2)" }}>Ask Dilly AI about resumes, audits, or this screen…</span>
                <svg className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
              <div className="flex flex-wrap gap-2 mt-3">
                {[
                  { label: "What does this screen do?", prompt: "What does this screen show? How does the resume audit work?" },
                  { label: "What format should my resume be?", prompt: "What format should my resume be? PDF or DOCX? What if I have multiple pages?" },
                  { label: "How do I improve before auditing?", prompt: "How can I improve my resume before running an audit? What should I include?" },
                ].map(({ label, prompt }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => openVoiceWithNewChat(prompt)}
                    className="text-xs px-3 py-2 rounded-[12px] transition-opacity hover:opacity-90 min-h-[40px] outline-none border-0"
                    style={{ background: "var(--s3)", color: "var(--t2)" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {error ? (
              <div className="rounded-[14px] p-4 text-center" style={{ background: "var(--cdim)" }}>
                <p className="text-sm mb-2" style={{ color: "var(--coral)" }}>{error}</p>
                <button type="button" onClick={() => setError(null)} className="text-sm font-medium outline-none border-0 bg-transparent" style={{ color: "var(--t3)" }}>Try again</button>
              </div>
            ) : null}
          </div>
        )}
      />
    </div>
  );

  return null;
}
