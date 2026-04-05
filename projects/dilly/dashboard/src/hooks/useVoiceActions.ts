import { useRef, useCallback } from "react";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useDillyVoiceNotification } from "@/context/DillyVoiceNotificationContext";
import { getEffectiveCohortLabel } from "@/lib/trackDefinitions";
import { computeScoreTrajectory, safeUuid } from "@/lib/dillyUtils";
import { DILLY_PRESENCE_VOICE_ADDENDUM } from "@/lib/voice/presenceSystemPrompt";
import { getAchievementsReferenceForVoice, ACHIEVEMENT_DEFINITIONS, type AchievementId } from "@/lib/achievements";
import type { VoiceConvo, DillyDeadline } from "@/types/dilly";
import type { TransitionSource } from "@/lib/dillyPresence";

/** First message for the "Help Dilly know you better" resume deep-dive flow. */
export const RESUME_DEEP_DIVE_PROMPT =
  "I'd like to do a resume deep-dive. For each experience on my resume, ask me what skills I used, what tools or libraries I used, and what I had to leave off. Start with one experience and ask me 2–3 specific questions about it.";

/** Extract experience labels ("Role at Company") from audit structured_text for Voice deep-dive context. */
function extractExperienceLabelsFromStructuredText(text: string | null | undefined): string[] | undefined {
  if (!text?.trim()) return undefined;
  const labels: string[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^Company:/i.test(line)) {
      const company = line.replace(/^Company:\s*/i, "").trim().replace(/^N\/A$/i, "");
      let role = "";
      i++;
      while (i < lines.length && !/^Company:/i.test(lines[i])) {
        const l = lines[i];
        if (/^Role:/i.test(l)) role = l.replace(/^Role:\s*/i, "").trim().replace(/^N\/A$/i, "");
        i++;
      }
      const title = (role || "").trim();
      if (company || title) labels.push(company && title ? `${title} at ${company}` : company || title);
    } else {
      i++;
    }
  }
  return labels.length > 0 ? labels.slice(0, 8) : undefined;
}

interface UseVoiceActionsParams {
  proactiveLines: string[];
  proactiveNudges: {
    app_funnel?: { applied: number; responses: number; interviews: number; silent_2_weeks: number };
    relationship_nudges?: { person: string; weeks_ago: number }[];
    deadline_urgent?: { label: string; days: number };
    score_nudge?: { dimension: string; gain: number };
    seasonal?: { label: string };
  } | null;
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
}

export function useVoiceActions({ proactiveLines, proactiveNudges, habits }: UseVoiceActionsParams) {
  const { appProfile, setAppProfile } = useAppContext();
  const {
    audit,
    savedAuditForCenter,
    viewingAudit,
    auditHistory,
  } = useAuditScore();
  const {
    voiceConvos, setVoiceConvos,
    setOpenVoiceConvIds,
    setActiveVoiceConvId,
    setVoiceMessages,
    setVoiceMessageQueue,
    setVoiceFeedback,
    setVoiceStreamingText,
    setVoiceFollowUpSuggestions,
    voiceActionItems,
    voiceCompany,
    voiceMemory,
    voiceApplicationsPreview,
    setVoiceOverlayOpen,
    voiceScreenContext, setVoiceScreenContext,
    pendingVoicePrompt: _pendingVoicePrompt, setPendingVoicePrompt,
    setVoiceMockInterviewSession,
    voiceMessages: _voiceMessages,
    voiceCalendarSyncKey: _voiceCalendarSyncKey, setVoiceCalendarSyncKey,
  } = useVoice();
  const { showVoiceNotification } = useDillyVoiceNotification();

  /** True only when pendingVoicePrompt was set by an explicit action. */
  const allowAutoSendPendingRef = useRef(false);
  /** When Voice opens from `/audit/[id]`, backend context can reference this audit id. */
  const voiceAuditReportIdRef = useRef<string | null>(null);
  /** When Voice opens from certifications "Make it land". */
  const voiceCertLandingRef = useRef<{ cert_id: string; name?: string; provider?: string; source?: string } | null>(null);

  /** Start a new Voice chat. Creates a fresh convo and opens it. */
  const openVoiceWithNewChat = useCallback(
    (
      prompt?: string,
      title?: string,
      opts?: { initialAssistantMessage?: string; transitionSource?: TransitionSource },
    ) => {
      const now = Date.now();
      const hasPrompt = !!prompt?.trim();
      const derivedTitle = title ?? (hasPrompt && prompt === RESUME_DEEP_DIVE_PROMPT ? "Resume deep-dive" : "New Chat");
      const seedMessages = opts?.initialAssistantMessage?.trim()
        ? [{ role: "assistant" as const, content: opts.initialAssistantMessage.trim(), ts: now }]
        : [];
      const newConvo: VoiceConvo = {
        id: safeUuid(),
        title: derivedTitle,
        messages: seedMessages,
        updatedAt: now,
        createdAt: now,
      };
      setVoiceConvos((prev) => [...prev, newConvo]);
      setOpenVoiceConvIds((prev) => [newConvo.id, ...prev.filter((x) => x !== newConvo.id)]);
      setActiveVoiceConvId(newConvo.id);
      setVoiceMessages(seedMessages);
      setVoiceMessageQueue([]);
      setVoiceFeedback({});
      setVoiceStreamingText("");
      setVoiceFollowUpSuggestions([]);
      if (hasPrompt) {
        allowAutoSendPendingRef.current = true;
        setPendingVoicePrompt(prompt ?? null);
      } else {
        allowAutoSendPendingRef.current = false;
        setPendingVoicePrompt(null);
      }
      setVoiceOverlayOpen(true);
    },
    [setVoiceConvos, setOpenVoiceConvIds, setActiveVoiceConvId, setVoiceMessages, setVoiceMessageQueue, setVoiceFeedback, setVoiceStreamingText, setVoiceFollowUpSuggestions, setPendingVoicePrompt, setVoiceOverlayOpen],
  );

  const openVoiceWithNewChatRef = useRef(openVoiceWithNewChat);
  // eslint-disable-next-line react-hooks/refs -- intentional
  openVoiceWithNewChatRef.current = openVoiceWithNewChat;

  /** Open Voice from a specific screen with optional prompt. */
  const openVoiceFromScreen = useCallback(
    (screenId: string, prompt?: string, convoTitle?: string) => {
      setVoiceScreenContext({ current_screen: screenId, prompt });
      openVoiceWithNewChat(prompt ?? "What does this screen mean?", convoTitle ?? "New Chat");
    },
    [openVoiceWithNewChat, setVoiceScreenContext],
  );

  const openVoiceResumeRecentChat = useCallback(() => {
    setPendingVoicePrompt(null);
    allowAutoSendPendingRef.current = false;
    setVoiceStreamingText("");
    setVoiceMessageQueue([]);
    setVoiceFollowUpSuggestions([]);
    setVoiceFeedback({});

    const sorted = [...voiceConvos].sort(
      (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
    );
    const latest = sorted[0];
    if (latest) {
      setActiveVoiceConvId(latest.id);
      setVoiceMessages(latest.messages ?? []);
      setOpenVoiceConvIds((prev) => {
        const rest = prev.filter((x) => x !== latest.id);
        return [latest.id, ...rest];
      });
    } else {
      setActiveVoiceConvId(null);
      setVoiceMessages([]);
      setOpenVoiceConvIds([]);
    }
    setVoiceOverlayOpen(true);
  }, [voiceConvos, setPendingVoicePrompt, setVoiceStreamingText, setVoiceMessageQueue, setVoiceFollowUpSuggestions, setVoiceFeedback, setActiveVoiceConvId, setVoiceMessages, setOpenVoiceConvIds, setVoiceOverlayOpen]);

  const endVoiceMockInterviewByUser = useCallback(() => {
    setVoiceMockInterviewSession(null);
    setVoiceMessages((m) => [
      ...m,
      {
        role: "assistant",
        content:
          "Mock interview ended. Open Practice anytime to start another round, or ask me to run a mock interview again.",
        ts: Date.now(),
      },
    ]);
  }, [setVoiceMockInterviewSession, setVoiceMessages]);

  /** Build context for gap-scan, interview-prep, etc. Shared across Insights and Voice. */
  const buildVoiceContext = useCallback(() => {
    const displayAudit = viewingAudit ?? audit ?? savedAuditForCenter;
    const prevAuditScores = auditHistory.length >= 2 ? auditHistory[1].scores : null;
    return {
      client_local_date:
        typeof window !== "undefined" ? new Date().toLocaleDateString("en-CA") : undefined,
      name: appProfile?.name ?? undefined,
      track: getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track)?.trim() || undefined,
      major: appProfile?.major ?? undefined,
      majors: appProfile?.majors?.length ? appProfile.majors : undefined,
      minors: appProfile?.minors?.length ? appProfile.minors : undefined,
      goals: appProfile?.goals?.length ? appProfile.goals : undefined,
      career_goal: appProfile?.career_goal?.trim() || undefined,
      deadlines: appProfile?.deadlines?.length ? appProfile.deadlines : undefined,
      last_dilly_take: displayAudit?.dilly_take?.trim() || undefined,
      scores: displayAudit?.scores ? { smart: displayAudit.scores.smart, grit: displayAudit.scores.grit, build: displayAudit.scores.build } : undefined,
      prev_scores: prevAuditScores ? { smart: prevAuditScores.smart, grit: prevAuditScores.grit, build: prevAuditScores.build } : undefined,
      final_score: displayAudit?.final_score ?? undefined,
      application_target: displayAudit?.application_target?.trim() || undefined,
      audit_findings: displayAudit?.audit_findings?.slice(0, 8) ?? undefined,
      recommendations: displayAudit?.recommendations?.slice(0, 10) ?? undefined,
      peer_percentiles: displayAudit?.peer_percentiles ?? undefined,
      benchmark_copy: displayAudit?.benchmark_copy ?? undefined,
      company: voiceCompany.trim() || undefined,
      target_school: appProfile?.target_school?.trim() || undefined,
      memory: voiceMemory.length > 0 ? voiceMemory.slice(-7) : undefined,
      achievements_reference: getAchievementsReferenceForVoice(),
      achievements_unlocked: appProfile?.achievements
        ? Object.keys(appProfile.achievements).map((id) => ACHIEVEMENT_DEFINITIONS[id as AchievementId]?.name).filter(Boolean)
        : undefined,
      voice_tone: appProfile?.voice_tone ?? undefined,
      voice_notes: appProfile?.voice_notes?.length ? appProfile.voice_notes.slice(-10) : undefined,
      voice_always_end_with_ask: (appProfile as { voice_always_end_with_ask?: boolean })?.voice_always_end_with_ask ?? undefined,
      voice_max_recommendations: (appProfile as { voice_max_recommendations?: number })?.voice_max_recommendations ?? undefined,
      voice_save_to_profile: (appProfile as { voice_save_to_profile?: boolean })?.voice_save_to_profile,
      voice_onboarding_answers: appProfile?.voice_onboarding_answers?.length ? appProfile.voice_onboarding_answers : undefined,
      voice_biggest_concern: (appProfile as { voice_biggest_concern?: string })?.voice_biggest_concern?.trim() || undefined,
      beyond_resume: (appProfile as { beyond_resume?: unknown[] })?.beyond_resume?.length
        ? (appProfile as { beyond_resume: unknown[] }).beyond_resume.slice(-50)
        : undefined,
      experience_expansion: (appProfile as { experience_expansion?: unknown[] })?.experience_expansion?.length
        ? (appProfile as { experience_expansion: unknown[] }).experience_expansion.slice(-30)
        : undefined,
      last_audit: auditHistory.length >= 2 ? { scores: auditHistory[1].scores, dilly_take: auditHistory[1].dilly_take?.trim() || undefined } : undefined,
      first_audit_snapshot: appProfile?.first_audit_snapshot ?? undefined,
      score_trajectory: displayAudit ? computeScoreTrajectory(displayAudit) ?? undefined : undefined,
      action_items: voiceActionItems.filter((i) => !i.done).slice(0, 8).map((i) => i.text),
      current_screen: voiceScreenContext?.current_screen ?? undefined,
      proactive_lines: proactiveLines.length > 0 ? proactiveLines : undefined,
      pipeline_context: (() => {
        const o: Record<string, unknown> = {};
        if (habits?.upcoming_deadlines?.length) {
          o.habits_upcoming_deadlines = habits.upcoming_deadlines.slice(0, 12);
        }
        if (habits?.pipeline_counts && typeof habits.pipeline_counts === "object") {
          o.pipeline_counts = habits.pipeline_counts;
        }
        if (habits?.applications_this_week != null) o.applications_this_week = habits.applications_this_week;
        if (habits?.applications_this_month != null) o.applications_this_month = habits.applications_this_month;
        if (habits?.applied_count != null) o.applied_total_tracked = habits.applied_count;
        if (habits?.silent_apps?.length) {
          o.applications_needing_followup = habits.silent_apps.slice(0, 8);
        }
        if (habits?.daily_action?.label) {
          o.suggested_action_today = `${habits.daily_action.label} (${habits.daily_action.action})`;
        }
        if (habits?.is_review_day) o.is_weekly_review_day = true;
        if (proactiveNudges?.app_funnel) o.app_funnel = proactiveNudges.app_funnel;
        if (proactiveNudges?.deadline_urgent) o.urgent_deadline_nudge = proactiveNudges.deadline_urgent;
        return Object.keys(o).length > 0 ? o : undefined;
      })(),
      deep_dive_experiences: extractExperienceLabelsFromStructuredText(displayAudit?.structured_text),
      dilly_presence_voice_addendum: DILLY_PRESENCE_VOICE_ADDENDUM,
      audit_report_id: voiceAuditReportIdRef.current ?? undefined,
      cert_landing: voiceCertLandingRef.current?.cert_id
        ? {
            source: voiceCertLandingRef.current.source ?? "cert_landing",
            cert_id: voiceCertLandingRef.current.cert_id,
            cert_name: voiceCertLandingRef.current.name,
            provider: voiceCertLandingRef.current.provider,
          }
        : undefined,
      applications_preview: voiceApplicationsPreview.length ? voiceApplicationsPreview : undefined,
    };
  }, [viewingAudit, audit, savedAuditForCenter, auditHistory, appProfile, voiceCompany, voiceMemory, voiceActionItems, voiceScreenContext, proactiveLines, proactiveNudges, habits, voiceApplicationsPreview]);

  const mergeVoiceAutoSavedDeadlines = useCallback(
    (rows: DillyDeadline[]) => {
      if (!rows.length) return;
      let added = 0;
      setAppProfile((prev) => {
        if (!prev) return prev;
        const cur = prev.deadlines || [];
        const keys = new Set(cur.map((d) => `${(d.label || "").toLowerCase()}|${d.date || ""}`));
        const merge = rows.filter(
          (d) => d?.label && d?.date && !keys.has(`${String(d.label).toLowerCase()}|${String(d.date)}`),
        );
        added = merge.length;
        if (merge.length === 0) return prev;
        return { ...prev, deadlines: [...cur, ...merge] };
      });
      if (added === 1 && rows[0]?.label) {
        showVoiceNotification(`Added "${rows[0].label}" to your calendar.`);
      } else if (added > 0) {
        showVoiceNotification(`Added ${added} date${added !== 1 ? "s" : ""} to your calendar.`);
      }
      setVoiceCalendarSyncKey((k) => k + 1);
    },
    [showVoiceNotification, setAppProfile, setVoiceCalendarSyncKey],
  );

  return {
    openVoiceWithNewChat,
    openVoiceWithNewChatRef,
    openVoiceFromScreen,
    openVoiceResumeRecentChat,
    endVoiceMockInterviewByUser,
    buildVoiceContext,
    mergeVoiceAutoSavedDeadlines,
    allowAutoSendPendingRef,
    voiceAuditReportIdRef,
    voiceCertLandingRef,
  };
}
