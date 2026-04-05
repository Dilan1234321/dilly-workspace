"use client";

import React from "react";
import {
  ScoreCard,
  DillyInsight,
  ActionCard,
} from "@/components/career-center";
import { DillyHomeInsight, DillyFeed } from "@/components/presence";
import { CohortPulseCard } from "@/components/cohort-pulse/CohortPulseCard";

import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";

import { hapticLight } from "@/lib/haptics";
import { getDillyNoticedCard, markNoticedSeen } from "@/lib/dillyNoticed";
import { orderedFeedIds, type HomeInsightContext, type FeedOrderContext, type FeedCardType } from "@/lib/dillyPresence";
import {
  getTopThreeActions,
  toNaturalSuggestion,
} from "@/lib/dillyUtils";

import type {
  ActionItem,
  AuditV2,
  CohortPulse,
  UserCohortPulse,
} from "@/types/dilly";

export interface ScoreCardSectionProps {
  displayAudit: AuditV2;
  latestAtsScoreResolved: number | null;
  currentCohortPulse: (UserCohortPulse & { cohort: CohortPulse }) | null;
  setCurrentCohortPulse: React.Dispatch<React.SetStateAction<(UserCohortPulse & { cohort: CohortPulse }) | null>>;
  habits: {
    is_review_day?: boolean;
    applications_this_week?: number;
    upcoming_deadlines?: { label: string }[];
    silent_2_weeks?: number;
    silent_apps?: { company: string; role?: string }[];
    ritual_suggestions?: { id: string; label: string; prompt: string }[];
  } | null;
  dismissedNoticedId: string | null;
  setDismissedNoticedId: React.Dispatch<React.SetStateAction<string | null>>;
  goToStandaloneFullAuditReport: () => void;
  openVoiceWithNewChat: (prompt?: string, convoTitle?: string, opts?: { initialAssistantMessage?: string }) => void;
}

export function ScoreCardSection(props: ScoreCardSectionProps) {
  const {
    displayAudit,
    latestAtsScoreResolved,
    currentCohortPulse,
    setCurrentCohortPulse,
    habits,
    dismissedNoticedId,
    setDismissedNoticedId,
    goToStandaloneFullAuditReport,
    openVoiceWithNewChat,
  } = props;

  const { user, appProfile } = useAppContext();
  const {
    auditHistory,
    atsPeerPercentile: _atsPeerPercentile,
  } = useAuditScore();
  const {
    voiceAvatarIndex,
    scoreCardDillyStrip,
    voiceActionItems,
    memoryItems,
  } = useVoice();

  const activeDeadlines = (appProfile?.deadlines || []).filter((d) => d.date && d.label && !d.completedAt);

  const homeInsightRefreshKey = `${auditHistory[0]?.ts ?? 0}-${(appProfile?.deadlines ?? []).map((d) => `${d.date}:${d.label}`).join("|")}-${habits?.silent_2_weeks ?? 0}-${Math.round(displayAudit.final_score ?? 0)}-${latestAtsScoreResolved ?? ""}`;
  const actionItemsForPresence: ActionItem[] = voiceActionItems
    .filter((i) => !i.done)
    .map((i) => ({
      id: i.id,
      uid: user?.email ?? "",
      conv_id: i.convId ?? "",
      text: i.text,
      dimension: null,
      estimated_pts: null,
      effort: "medium" as const,
      action_type: null,
      action_payload: {},
      done: false,
      done_at: null,
      created_at: new Date(0).toISOString(),
      snoozed_until: null,
      dismissed: false,
    }));
  const homeInsightCtx: HomeInsightContext = {
    latest_audit: displayAudit,
    previous_audit: null,
    score_delta:
      auditHistory.length >= 2
        ? Math.round((auditHistory[0].final_score ?? 0) - (auditHistory[1].final_score ?? 0))
        : null,
    peer_percentile: displayAudit.peer_percentiles
      ? Math.round(
          ((displayAudit.peer_percentiles.smart ?? 50) +
            (displayAudit.peer_percentiles.grit ?? 50) +
            (displayAudit.peer_percentiles.build ?? 50)) /
            3,
        )
      : null,
    upcoming_deadlines: activeDeadlines.slice(0, 12),
    applications: (habits?.silent_apps ?? []).map((s) => ({
      company: s.company,
      company_name: s.company,
      role: s.role,
      status: "silent",
    })),
    action_items: actionItemsForPresence,
    memory_items: memoryItems.slice(0, 8),
    last_insight: null,
    last_insight_at: null,
    days_since_last_audit:
      // eslint-disable-next-line react-hooks/purity -- intentional
      auditHistory[0]?.ts != null ? Math.floor((Date.now() / 1000 - auditHistory[0].ts) / 86400) : null,
    cohort_pulse: currentCohortPulse,
  };
  const homeInsightEmphases = [
    ...(displayAudit.final_score != null ? [String(Math.round(displayAudit.final_score))] : []),
    ...activeDeadlines.map((d) => d.label).filter(Boolean),
    ...(habits?.silent_apps?.map((s) => s.company).filter(Boolean) ?? []),
  ];
  let nearestDeadlineDays: number | null = null;
  let nearestDeadlineLabel: string | null = null;
  for (const d of activeDeadlines) {
    try {
      // eslint-disable-next-line react-hooks/purity -- intentional
      const days = Math.ceil((new Date(d.date).getTime() - Date.now()) / 86400000);
      if (days >= 0 && (nearestDeadlineDays === null || days < nearestDeadlineDays)) {
        nearestDeadlineDays = days;
        nearestDeadlineLabel = d.label ?? null;
      }
    } catch {
      /* ignore */
    }
  }
  const undoneActions = voiceActionItems.filter((i) => !i.done);
  const feedOrderContext: FeedOrderContext = {
    has_critical_ats_issues: false,
    days_until_nearest_deadline: nearestDeadlineDays,
    deadline_label: nearestDeadlineLabel,
    undone_action_items: undoneActions.length,
    oldest_action_item_days: undoneActions.length ? 3 : 0,
    days_since_last_application: (habits?.silent_2_weeks ?? 0) > 0 ? 15 : null,
    score_delta:
      auditHistory.length >= 2
        ? Math.round((auditHistory[0].final_score ?? 0) - (auditHistory[1].final_score ?? 0))
        : null,
    unseen_session_capture: false,
    unseen_conversation_output: false,
    unseen_cohort_pulse: currentCohortPulse ? !currentCohortPulse.seen : false,
    is_recruiting_season: [8, 9, 10, 11, 0, 1, 2].includes(new Date().getMonth()),
    peer_percentile: displayAudit.peer_percentiles
      ? Math.round(
          ((displayAudit.peer_percentiles.smart ?? 50) +
            (displayAudit.peer_percentiles.grit ?? 50) +
            (displayAudit.peer_percentiles.build ?? 50)) /
              3,
        )
      : null,
    ats_score: latestAtsScoreResolved,
    am_i_ready_follow_up_pending: false,
  };
  const topThreeFeed = getTopThreeActions(displayAudit);
  const cohortNode =
    currentCohortPulse && (new Date().getDay() === 1 || !currentCohortPulse.seen) ? (
      <CohortPulseCard
        pulse={currentCohortPulse}
        onHidden={() => setCurrentCohortPulse((prev) => (prev ? { ...prev, seen: true } : prev))}
      />
    ) : null;
  const dillyNode =
    (displayAudit.dilly_take ?? displayAudit.dilly_take)?.trim() ? (
      <DillyInsight
        take={(displayAudit.dilly_take ?? displayAudit.dilly_take)!.trim()}
        onViewRecommendation={() => {
          goToStandaloneFullAuditReport();
        }}
        voiceAvatarIndex={voiceAvatarIndex}
      />
    ) : null;
  const actionsNode =
    topThreeFeed.length > 0 ? (
      <>
        <h2 className="text-[13px] font-semibold mb-3" style={{ color: "var(--t2)", letterSpacing: "-0.02em" }}>
          Recommended actions
        </h2>
        <div className="rounded-[16px] overflow-hidden min-w-0" style={{ border: "1px solid var(--b1)" }}>
          {topThreeFeed.map((action, i) => (
            <div
              key={i}
              style={{
                borderBottom: i < topThreeFeed.length - 1 ? "1px solid var(--b1)" : undefined,
              }}
            >
              <ActionCard
                action={action}
                index={i}
                onClick={() => {
                  hapticLight();
                  const { prompt } = toNaturalSuggestion(action.title, action.type, action.suggestedLine);
                  openVoiceWithNewChat(prompt);
                }}
              />
            </div>
          ))}
        </div>
      </>
    ) : null;
  const feedInputs: { id: string; type: FeedCardType }[] = [];
  const feedChildren: Record<string, React.ReactNode> = {};
  if (cohortNode) {
    feedInputs.push({ id: "feed_cohort", type: "cohort_pulse" });
    feedChildren.feed_cohort = <div className="mt-4">{cohortNode}</div>;
  }
  if (dillyNode) {
    feedInputs.push({ id: "feed_dilly", type: "conversation_output" });
    feedChildren.feed_dilly = <div className="mt-4">{dillyNode}</div>;
  }
  if (actionsNode) {
    feedInputs.push({ id: "feed_actions", type: "action_items" });
    feedChildren.feed_actions = <div className="mt-4">{actionsNode}</div>;
  }
  const feedOrder = orderedFeedIds(feedInputs, feedOrderContext);

  return (
    <div className="mb-4">
      <ScoreCard
        audit={displayAudit}
        dillyStrip={scoreCardDillyStrip}
        voiceAvatarIndex={voiceAvatarIndex}
        reportHref={displayAudit?.id?.trim() ? `/audit/${displayAudit.id.trim()}` : undefined}
      />
      {/* What Dilly noticed -- directly under score card */}
      {(() => {
        const deadlines = (appProfile?.deadlines ?? []).filter((d) => !d.completedAt);
        const improved3 = auditHistory.length >= 3 && (() => {
          const [a, b, c] = [auditHistory[0], auditHistory[1], auditHistory[2]];
          return (a?.final_score ?? 0) > (b?.final_score ?? 0) && (b?.final_score ?? 0) > (c?.final_score ?? 0);
        })();
        const consistentCal = deadlines.length >= 3;
        const firstTop25 = displayAudit?.peer_percentiles && (["smart", "grit", "build"] as const).some((k) => Math.max(1, 100 - (displayAudit.peer_percentiles![k] ?? 50)) <= 25);
        const card = getDillyNoticedCard({
          improved3AuditsInRow: improved3,
          consistentCalendar: consistentCal,
          firstTop25: !!firstTop25,
        });
        if (!card || dismissedNoticedId === card.id) return null;
        return (
          <div className="mt-3 mb-1 rounded-[18px] p-3 flex items-center justify-between gap-3" style={{ background: "var(--s2)" }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/dilly-noticed-glyph.png"
                alt=""
                className="w-10 h-10 object-contain shrink-0"
                width={40}
                height={40}
                aria-hidden
              />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--t3)" }}>{card.title}</p>
                <p className="text-sm" style={{ color: "var(--t2)" }}>{card.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { hapticLight(); markNoticedSeen(card.id); setDismissedNoticedId(card.id); }}
              className="min-w-[48px] min-h-[48px] flex items-center justify-center rounded-xl shrink-0 transition-opacity hover:opacity-80 leading-none"
              style={{ color: "var(--t3)" }}
              aria-label="Dismiss"
            >
              <span className="text-[28px] font-light translate-y-[-1px]" aria-hidden>×</span>
            </button>
          </div>
        );
      })()}
      {user?.email && appProfile ? (
        <DillyHomeInsight
          uid={user.email}
          profile={appProfile}
          context={homeInsightCtx}
          voiceAvatarIndex={voiceAvatarIndex}
          refreshKey={homeInsightRefreshKey}
          emphases={homeInsightEmphases}
        />
      ) : null}
      <DillyFeed order={feedOrder}>{feedChildren}</DillyFeed>
    </div>
  );
}
