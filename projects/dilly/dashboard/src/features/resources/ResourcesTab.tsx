"use client";

import React, { useState, useEffect } from "react";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useNavigation } from "@/contexts/NavigationContext";

import { hapticLight } from "@/lib/haptics";
import { getEffectiveCohortLabel, getPlaybookForTrack, getTrackTips } from "@/lib/trackDefinitions";
import {
  deriveJobSearchChecklistStage,
  getJobSearchChecklistPhases,
  jobSearchChecklistStageSubtitle,
} from "@/lib/jobSearchChecklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppProfileHeader, ApplicationsSection } from "@/components/career-center";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import { JobsPanel } from "@/components/jobs/JobsPanel";
import type { AuditV2 } from "@/types/dilly";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ResourcesTabProps {
  openVoiceWithNewChat: (prompt: string, convoTitle?: string) => void;
  openVoiceFromScreen: (screenId: string, prompt?: string, convoTitle?: string) => void;
  profilePhotoUrl: string | null;
  latestAuditRef: React.RefObject<AuditV2 | null>;
  habits: {
    streak?: number;
    longest_streak?: number;
    already_checked_in?: boolean;
    today?: string;
    daily_action?: { id: string; label: string; action: string };
    applications_this_month?: number;
    applications_this_week?: number;
    applied_count?: number;
    silent_2_weeks?: number;
    silent_apps?: { company: string; role: string }[];
    upcoming_deadlines?: { label: string; date: string; days: number }[];
    is_review_day?: boolean;
    milestones?: { first_application?: boolean; first_interview?: boolean; first_offer?: boolean; ten_applications?: boolean };
    ritual_suggestions?: { id: string; label: string; prompt: string }[];
    pipeline_counts?: { applied?: number; interviewing?: number; offers?: number };
  } | null;
  proactiveNudges: {
    app_funnel?: { applied: number; responses: number; interviews: number; silent_2_weeks: number };
    relationship_nudges?: { person: string; weeks_ago: number }[];
    deadline_urgent?: { label: string; days: number };
    score_nudge?: { dimension: string; gain: number };
    seasonal?: { label: string };
  } | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ResourcesTab({
  openVoiceWithNewChat,
  openVoiceFromScreen,
  profilePhotoUrl,
  latestAuditRef,
  habits,
  proactiveNudges,
}: ResourcesTabProps) {
  const { user, appProfile, school } = useAppContext();
  const { audit, savedAuditForCenter } = useAuditScore();
  const { voiceAvatarIndex } = useVoice();
  const { state: { getHiredSubTab, jobsPanelInitialFilter }, setGetHiredSubTab, setReadyCheckCompany, setMainAppTab } = useNavigation();

  // ── Local state (was page-level, only used here) ──────────────────────────
  const [readyCheckTarget, setReadyCheckTarget] = useState("");

  const [jobChecklist, setJobChecklist] = useState<Record<string, boolean>>({});

  // Job checklist localStorage persistence
  const JOB_CHECKLIST_STORAGE_KEY = typeof window !== "undefined" ? `dilly_job_checklist_${user?.email ?? "anon"}` : "";
  useEffect(() => {
    if (!JOB_CHECKLIST_STORAGE_KEY || typeof localStorage === "undefined") return;
    try {
      const raw = localStorage.getItem(JOB_CHECKLIST_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        if (parsed && typeof parsed === "object") setJobChecklist(parsed);
      }
    } catch { /* ignore */ }
  }, [JOB_CHECKLIST_STORAGE_KEY]);
  useEffect(() => {
    if (!JOB_CHECKLIST_STORAGE_KEY || typeof localStorage === "undefined" || Object.keys(jobChecklist).length === 0) return;
    try {
      localStorage.setItem(JOB_CHECKLIST_STORAGE_KEY, JSON.stringify(jobChecklist));
    } catch { /* ignore */ }
  }, [JOB_CHECKLIST_STORAGE_KEY, jobChecklist]);

  // ── Derived ───────────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/refs -- intentional
  const displayAudit = latestAuditRef.current ?? audit ?? savedAuditForCenter;
  const trackForPlaybook = getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track) || null;
  const playbook = trackForPlaybook ? getPlaybookForTrack(trackForPlaybook) : null;
  const jobSearchStage = deriveJobSearchChecklistStage({ habits, proactiveNudges, displayAudit });
  const JOB_SEARCH_CHECKLIST_PHASES = getJobSearchChecklistPhases(jobSearchStage);
  const jobChecklistAllIds = JOB_SEARCH_CHECKLIST_PHASES.flatMap((p) => p.items.map((i) => i.id));
  const jobChecklistDone = jobChecklistAllIds.filter((id) => jobChecklist[id]).length;
  const jobChecklistTotal = jobChecklistAllIds.length;
  const jobChecklistPct = jobChecklistTotal ? Math.round((jobChecklistDone / jobChecklistTotal) * 100) : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="career-center-talent min-h-full w-full" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
    <section className="max-w-[390px] mx-auto pb-40 px-4 min-w-0 overflow-hidden animate-fade-up min-h-full" aria-label="Get Hired" style={{ background: "var(--bg)" }}>
      <AppProfileHeader
        name={appProfile?.name ?? undefined}
        // eslint-disable-next-line react-hooks/refs -- intentional
        track={getEffectiveCohortLabel((latestAuditRef.current ?? audit ?? savedAuditForCenter)?.detected_track, appProfile?.track)}
        schoolName={school?.name ?? undefined}
        photoUrl={profilePhotoUrl ?? undefined}
        className="mb-4"
      />
      <header className="mb-5">
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Job Ready</p>
        <h1 className="text-[15px] font-semibold" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>Get Hired</h1>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>Prep tools, checklists, and evidence-based strategies to land the role.</p>
      </header>

      <div id="get-hired-tabs" className="mb-5 scroll-mt-24 sticky top-0 z-[5] -mx-4 px-4 py-2" style={{ background: "var(--bg)" }}>
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: "var(--s2)", border: "1px solid var(--b1)" }}
          role="tablist"
          aria-label="Get Hired sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={getHiredSubTab === "applications"}
            onClick={() => { hapticLight(); setGetHiredSubTab("applications"); }}
            className="min-w-0 flex-1 basis-0 py-2.5 px-2 rounded-[14px] text-[11px] sm:text-[12px] font-semibold transition-all text-center leading-tight min-h-[44px]"
            style={{
              background: getHiredSubTab === "applications" ? "var(--blue)" : "transparent",
              color: getHiredSubTab === "applications" ? "#fff" : "var(--t2)",
              border: getHiredSubTab === "applications" ? "none" : "1px solid transparent",
            }}
          >
            Applications
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={getHiredSubTab === "jobs"}
            onClick={() => { hapticLight(); setGetHiredSubTab("jobs"); }}
            className="min-w-0 flex-1 basis-0 py-2.5 px-2 rounded-[14px] text-[11px] sm:text-[12px] font-semibold transition-all text-center leading-tight min-h-[44px]"
            style={{
              background: getHiredSubTab === "jobs" ? "var(--blue)" : "transparent",
              color: getHiredSubTab === "jobs" ? "#fff" : "var(--t2)",
              border: getHiredSubTab === "jobs" ? "none" : "1px solid transparent",
            }}
          >
            Jobs
          </button>
        </div>
      </div>

      <div id="get-hired-subpanel" className="mb-8 min-w-0">
        {getHiredSubTab === "applications" ? (
          <div id="get-hired-applications" className="scroll-mt-28 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>Pipeline</p>
            <div className="rounded-[18px] p-4" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t3)" }}>Application tracker</p>
              <ApplicationsSection />
            </div>
          </div>
        ) : (
          <div className="min-w-0 -mx-4">
            <JobsPanel
              userEmail={user?.email}
              subscribed={!!user?.subscribed}
              embedded
              initialFilter={jobsPanelInitialFilter}
            />
          </div>
        )}
      </div>

      {/* Track-specific playbook */}
      {playbook && (
        <div className="mb-5 rounded-[18px] p-5 transition-opacity hover:opacity-95" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(253, 185, 19, 0.15)" }}>
              <svg className="w-4 h-4" style={{ color: "var(--te-gold)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-0" style={{ color: "var(--te-gold)" }}>Your playbook</p>
          </div>
          <p className="text-slate-500 text-xs mb-3">{playbook.headline}</p>
          <ul className="space-y-1.5 text-sm text-slate-400">
            {playbook.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--te-gold)" }} aria-hidden />
                {b}
              </li>
            ))}
          </ul>
          {trackForPlaybook && (() => {
            const tips = getTrackTips(trackForPlaybook);
            if (tips.length === 0) return null;
            return (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--ut-border-subtle)" }}>
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-2">Common mistakes in your track</p>
                <ul className="space-y-1 text-sm text-slate-500">
                  {tips.map((t, i) => (
                    <li key={i} className="flex gap-2"><span className="text-slate-600">•</span>{t}</li>
                  ))}
                </ul>
              </div>
            );
          })()}
          <Button type="button" variant="outline" size="sm" onClick={() => { hapticLight(); setMainAppTab("career_playbook"); }} className="mt-4 m-rounded-tight border-[var(--te-border-gold)] text-slate-200 text-xs">
            View full playbook
          </Button>
        </div>
      )}

      {/* Featured: Am I Ready? */}
      <details id="am-i-ready" className="cc-card overflow-hidden mb-5 group transition-all hover:border-[var(--te-border-gold)]" style={{
        background: "linear-gradient(145deg, rgba(253, 185, 19, 0.12) 0%, rgba(253, 185, 19, 0.04) 100%)",
        borderLeftColor: "var(--te-gold)",
        borderLeftWidth: "4px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
      }}>
        <summary className="p-5 cursor-pointer flex items-center gap-4 select-none list-none [&::-webkit-details-marker]:hidden">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(253, 185, 19, 0.2)", border: "1px solid rgba(253, 185, 19, 0.35)" }}>
            <svg className="w-6 h-6" style={{ color: "var(--te-gold)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-100 text-sm">Am I Ready?</p>
            <p className="text-slate-400 text-xs mt-0.5">Check fit for a company or role · Get gaps to address</p>
          </div>
          <span className="text-slate-500 shrink-0 transition-transform group-open:rotate-180" aria-hidden>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </span>
        </summary>
        <div className="px-4 pb-4 pt-1">
          <div className="flex gap-2 mb-3">
            <Input
              value={readyCheckTarget}
              onChange={(e) => setReadyCheckTarget(e.target.value)}
              placeholder="E.g. Goldman Sachs, Google SWE, Summer Analyst"
              className="flex-1 bg-slate-800/70 border-[var(--ut-border)] text-slate-100 text-sm"
            />
            <Button
              type="button"
              size="sm"
              className="rounded-lg shrink-0"
              disabled={!readyCheckTarget.trim()}
              onClick={() => {
                const c = readyCheckTarget.trim();
                if (!c) return;
                setReadyCheckCompany(c);
                setMainAppTab("ready_check");
              }}
            >
              Check
            </Button>
          </div>
          {readyCheckResult && (
            <div className="rounded-lg p-4 space-y-3 border" style={{ backgroundColor: "var(--ut-surface-raised)", borderColor: "var(--ut-border)" }}>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold px-2 py-0.5 rounded ${readyCheckResult.verdict === "ready" ? "bg-slate-600/50 text-slate-200" : readyCheckResult.verdict === "stretch" ? "bg-slate-600/50 text-slate-300" : "bg-slate-600/30 text-slate-400"}`}>
                  {readyCheckResult.verdict === "ready" ? "Ready" : readyCheckResult.verdict === "stretch" ? "Stretch" : "Not yet"}
                </span>
              </div>
              <p className="text-slate-200 text-sm">{readyCheckResult.summary}</p>
              {readyCheckResult.gaps.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Gaps to address</p>
                  <ul className="space-y-1">
                    {readyCheckResult.gaps.map((g, i) => (
                      <li key={i} className="text-slate-300 text-sm flex gap-2">
                        <span className="text-slate-600">•</span>
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </details>

      {/* Certifications Hub */}
      <button
        type="button"
        onClick={() => { hapticLight(); setMainAppTab("certifications"); }}
        className="w-full mb-5 flex items-center gap-4 text-left min-h-[56px] p-5 rounded-2xl transition-all group"
        style={{
          background: "linear-gradient(145deg, rgba(253, 185, 19, 0.1) 0%, rgba(253, 185, 19, 0.03) 100%)",
          border: "1px solid rgba(253, 185, 19, 0.25)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(253, 185, 19, 0.2)", border: "1px solid rgba(253, 185, 19, 0.35)" }}>
          <svg className="w-6 h-6" style={{ color: "var(--te-gold)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
          </div>
        <div className="min-w-0 flex-1">
          <span className="text-[15px] font-semibold text-slate-100 block">Certifications</span>
          <span className="text-[12px] text-slate-400">Industry-recognized credentials for your track</span>
        </div>
        <svg className="w-5 h-5 shrink-0 text-slate-500 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
      </button>

      {/* Prep tools */}
      <p className="text-[10px] font-semibold uppercase tracking-widest cc-text-muted mb-3">Prep tools</p>
      <div className="space-y-4 mb-8">
        {/* Score trajectory */}
        <div className="cc-card p-4 min-w-0 transition-colors hover:border-[var(--te-border-gold)]" style={{ borderLeftWidth: "4px", borderLeftColor: "rgba(253, 185, 19, 0.35)" }}>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(253, 185, 19, 0.12)" }}>
              <svg className="w-4 h-4" style={{ color: "var(--te-gold)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 011.414 1.414l2.25 2.25M3 75.75v10.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V75.75m-13.5-9A2.25 2.25 0 0175.75 54h10.5a2.25 2.25 0 012.25 2.25v10.5m-13.5 9v-10.5a2.25 2.25 0 012.25-2.25h10.5a2.25 2.25 0 012.25 2.25v10.5" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-100 text-sm">Score trajectory</p>
              <p className="text-slate-500 text-xs mt-0.5">Where your scores could go if you complete top recommendations.</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full min-h-[44px] m-rounded-tight border-[var(--te-border-gold)] text-slate-200 text-xs" onClick={() => openVoiceWithNewChat("Walk me through my score trajectory if I complete my top recommendations.")}>Open in Dilly AI</Button>
        </div>
      </div>

      {/* Job search checklist — phased playbook below */}
      <h2
        className="font-cinzel font-semibold tracking-[0.04em] mb-3 mt-1 leading-[1.12]"
        style={{
          color: "var(--te-gold)",
          fontSize: "clamp(1.625rem, 5.5vw, 2.25rem)",
          textShadow: "0 1px 0 rgba(0,0,0,0.35), 0 0 48px rgba(253, 185, 19, 0.2)",
        }}
      >
        Job search checklist
      </h2>
      <div className="cc-card p-4 mb-6 min-w-0 transition-colors hover:border-[var(--te-border-gold)]" style={{ borderLeftWidth: "4px", borderLeftColor: "rgba(253, 185, 19, 0.3)" }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-100 leading-snug">Your pipeline, in order</p>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Three phases from story → volume → interviews. Steps and hints match where you are:{" "}
              <span className="font-medium" style={{ color: "var(--te-gold)" }}>
                {jobSearchChecklistStageSubtitle(jobSearchStage)}
              </span>
              . Check items when they&apos;re truly done—not to clear the list.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold tabular-nums text-slate-100">{jobChecklistPct}%</p>
            <p className="text-[10px] text-slate-500 tabular-nums">{jobChecklistDone}/{jobChecklistTotal}</p>
          </div>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ backgroundColor: "var(--s2)" }}>
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${jobChecklistPct}%`, backgroundColor: "var(--te-gold)" }}
          />
        </div>
        <div className="space-y-3">
          {JOB_SEARCH_CHECKLIST_PHASES.map((phase) => {
            const phaseDone = phase.items.filter((it) => jobChecklist[it.id]).length;
            return (
              <div
                key={phase.id}
                className="rounded-xl border overflow-hidden min-w-0"
                style={{ borderColor: "var(--ut-border)", backgroundColor: "rgba(255,255,255,0.02)" }}
              >
                <div className="px-3 py-2.5 border-b" style={{ borderColor: "var(--ut-border)" }}>
                  <p className="text-xs font-semibold text-slate-100">{phase.title}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{phase.blurb}</p>
                  <p className="text-[10px] font-medium mt-1.5 tabular-nums" style={{ color: "var(--te-gold)" }}>
                    {phaseDone}/{phase.items.length} complete
                  </p>
                </div>
                <ul className="divide-y" style={{ borderColor: "var(--ut-border)" }}>
                  {phase.items.map(({ id, title, hint }) => {
                    const done = jobChecklist[id] ?? false;
                    const checklistStepPrompt =
                      `I'm on the Get Hired tab working through the Job search checklist.\n\n` +
                      `Phase: "${phase.title}"\n` +
                      `Checklist step: "${title}"\n` +
                      `What "done" means in the app: ${hint}\n` +
                      `I've ${done ? "checked this off but still want help to refine, verify, or go deeper" : "not checked this off yet"}.\n\n` +
                      `Use my resume, profile, scores, and goals. Help me with this step: concrete actions, examples tailored to me, and drafts where useful (target sentence, LinkedIn headline, follow-up message, tracker columns, questions to ask, etc.). ` +
                      `Start with a scannable reply using short bullets; offer to expand any part.`;
                    const checkInputId = `job-search-check-${id}`;
                    return (
                      <li key={id} className="min-w-0">
                        <div className="px-3 py-3 hover:bg-white/[0.03] transition-colors">
                          <div className="flex gap-3 items-start">
                            <input
                              id={checkInputId}
                              type="checkbox"
                              checked={done}
                              onChange={() => setJobChecklist((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }))}
                              className="mt-1 rounded border-slate-500 w-[18px] h-[18px] shrink-0 accent-[var(--te-gold)]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-1.5 min-w-0">
                                <label htmlFor={checkInputId} className="min-w-0 flex-1 cursor-pointer pt-0.5">
                                  <span className={`block text-[13px] font-medium leading-snug ${done ? "text-slate-500 line-through" : "text-slate-100"}`}>{title}</span>
                                </label>
                                <button
                                  type="button"
                                  className="shrink-0 p-0.5 rounded-full hover:bg-white/10 active:opacity-80 transition-colors flex items-center justify-center touch-manipulation"
                                  aria-label={`Ask Dilly about: ${title}`}
                                  onClick={() => {
                                    hapticLight();
                                    openVoiceFromScreen("get_hired_job_checklist", checklistStepPrompt, "Job checklist");
                                  }}
                                >
                                  <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="ring-1 ring-white/25" />
                                </button>
                              </div>
                              <label htmlFor={checkInputId} className="block mt-1 cursor-pointer">
                                <span className={`block text-[11px] leading-relaxed ${done ? "text-slate-600" : "text-slate-500"}`}>{hint}</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full min-h-[44px] m-rounded-tight border-[var(--te-border-gold)] text-slate-200 text-xs font-medium"
            onClick={() => {
              hapticLight();
              openVoiceFromScreen(
                "get_hired_job_checklist",
                "I'm working through the Job search checklist on Get Hired. Given my profile and resume context, which single phase should I prioritize this week and what is the one concrete next action? Keep it short.",
                "Job checklist",
              );
            }}
          >
            Ask Dilly what to do next
          </Button>
          <button
            type="button"
            className="text-[11px] text-slate-500 hover:text-slate-300 py-2 min-h-[40px] transition-colors"
            onClick={() => {
              setJobChecklist({});
              try {
                if (JOB_CHECKLIST_STORAGE_KEY && typeof localStorage !== "undefined") {
                  localStorage.setItem(JOB_CHECKLIST_STORAGE_KEY, "{}");
                }
              } catch { /* ignore */ }
            }}
          >
            Reset playbook progress
          </button>
        </div>
      </div>

      {/* Interview day checklist */}
      <p className="text-[10px] font-semibold uppercase tracking-widest cc-text-muted mb-3">Interview day</p>
      <div className="cc-card p-4 mb-6 min-w-0 transition-colors hover:border-[var(--te-border-gold)]" style={{ borderLeftWidth: "4px", borderLeftColor: "rgba(253, 185, 19, 0.3)" }}>
        <ul className="space-y-2.5 text-slate-300 text-sm">
          <li className="flex gap-2"><span className="text-slate-500 shrink-0">•</span> Copy of resume, notebook, pen</li>
          <li className="flex gap-2"><span className="text-slate-500 shrink-0">•</span> Research the company and role</li>
          <li className="flex gap-2"><span className="text-slate-500 shrink-0">•</span> Prepare 2–3 questions to ask them</li>
          <li className="flex gap-2"><span className="text-slate-500 shrink-0">•</span> Test tech (video/audio) if remote</li>
          <li className="flex gap-2"><span className="text-slate-500 shrink-0">•</span> Log in 5 min early</li>
        </ul>
        <Button type="button" variant="outline" size="sm" className="mt-3 min-h-[44px] m-rounded-tight border-[var(--ut-border)] text-slate-200 hover:bg-slate-700/40 text-xs w-full" onClick={() => openVoiceWithNewChat("I have an interview coming up. Give me a short interview-day checklist and one thing I should do the night before.")}>Ask Dilly AI for more</Button>
      </div>

      {/* Networking & outreach */}
      <p className="text-[10px] font-semibold uppercase tracking-widest cc-text-muted mb-3">Networking & outreach</p>
      <div className="cc-card p-4 min-w-0 transition-colors hover:border-[var(--te-border-gold)]" style={{ borderLeftWidth: "4px", borderLeftColor: "rgba(253, 185, 19, 0.35)" }}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(253, 185, 19, 0.12)" }}>
            <svg className="w-4 h-4" style={{ color: "var(--te-gold)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-100 text-sm">Templates</p>
            <p className="text-slate-500 text-xs mt-0.5">LinkedIn requests, thank-you emails, follow-ups.</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="w-full min-h-[44px] m-rounded-tight border-[var(--te-border-gold)] text-slate-200 text-xs font-medium" onClick={() => openVoiceWithNewChat("Give me 3 short templates: (1) LinkedIn connection request to a recruiter, (2) thank-you email after an interview, (3) follow-up when I haven't heard back in a week. Keep each under 4 lines.")}>Get templates from Dilly AI</Button>
      </div>
    </section>
    </div>
  );
}
