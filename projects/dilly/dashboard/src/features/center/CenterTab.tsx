"use client";

import React, { type MutableRefObject } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionCaptureCard } from "@/components/memory/SessionCaptureCard";
import { ConversationOutputCard } from "@/components/voice/ConversationOutputCard";
import { VoiceSessionRecapCard } from "@/components/voice/VoiceSessionRecapCard";
import {
  AppProfileHeader,
} from "@/components/career-center";
import { VoiceAvatar, VoiceAvatarButton } from "@/components/VoiceAvatarButton";

import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { useToast } from "@/hooks/useToast";

import { dilly } from "@/lib/dilly";
import { getEffectiveCohortLabel, getPlaybookForTrack } from "@/lib/trackDefinitions";
import { hapticLight } from "@/lib/haptics";
import { clearVoiceSessionRecap } from "@/lib/voiceSessionRecap";
import { TWENTY_X_MOMENTS, formatTwentyXCompact } from "@/lib/twentyXMoments";
import { dillyPresenceManager } from "@/lib/dillyPresence";
import {
  topPercentileHeadline,
  gapToNextLevel,
  progressPercentTowardTop25Rank,
  getTopThreeActions,
  toNaturalSuggestion,
  getStrongestSignalSentence,
  getMilestoneNudge,
  scoresCrossedMilestones,
} from "@/lib/dillyUtils";

import type {
  AppProfile,
  AuditV2,
  CohortPulse,
  DillyDeadline,
  UserCohortPulse,
} from "@/types/dilly";
import type { ProfileAchievements } from "@/lib/achievements";

// ── Extracted components ────────────────────────────────────────────────────────
import { EditProfileView } from "./EditProfileView";
import { ShareCard } from "./ShareCard";
import { ScoreCardSection } from "./ScoreCardSection";
import { QuickToolsGrid } from "./QuickToolsGrid";
import { InterviewPrepSection } from "./InterviewPrepSection";
import { DeadlineCards } from "./DeadlineCards";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface CenterTabProps {
  // Refs
  latestAuditRef: MutableRefObject<AuditV2 | null>;
  shareCardRef: React.RefObject<HTMLDivElement | null>;

  // Theme
  theme: { primary: string; secondary: string; backgroundTint?: string; primaryContrast?: string };

  // Profile photo
  profilePhotoUrl: string | null;
  setProfilePhotoUrl: React.Dispatch<React.SetStateAction<string | null>>;
  profilePhotoUploading: boolean;
  setPhotoCropImageSrc: React.Dispatch<React.SetStateAction<string | null>>;

  // Voice
  openVoiceWithNewChat: (prompt?: string, convoTitle?: string, opts?: { initialAssistantMessage?: string }) => void;
  openVoiceFromScreen: (screenId: string, prompt?: string, convoTitle?: string) => void;

  // Habits
  habits: {
    is_review_day?: boolean;
    applications_this_week?: number;
    upcoming_deadlines?: { label: string }[];
    silent_2_weeks?: number;
    silent_apps?: { company: string; role?: string }[];
    ritual_suggestions?: { id: string; label: string; prompt: string }[];
  } | null;

  // Cohort pulse
  currentCohortPulse: (UserCohortPulse & { cohort: CohortPulse }) | null;
  setCurrentCohortPulse: React.Dispatch<React.SetStateAction<(UserCohortPulse & { cohort: CohortPulse }) | null>>;

  // ATS resolved
  latestAtsScoreResolved: number | null;

  // Profile save
  saveProfile: (data: Partial<AppProfile>) => Promise<boolean>;

  // Achievements
  achievements: ProfileAchievements;
  shareCardAchievements: string[];

  // Share card capture
  captureShareCardAsPngFile: () => Promise<{ file: File; canvas: HTMLCanvasElement } | null>;

  // Navigation helpers
  goToStandaloneFullAuditReport: () => void;

  // Edit profile state
  editingProfile: boolean;
  setEditingProfile: React.Dispatch<React.SetStateAction<boolean>>;
  editName: string;
  setEditName: React.Dispatch<React.SetStateAction<string>>;
  editMajors: string[];
  setEditMajors: React.Dispatch<React.SetStateAction<string[]>>;
  editMinors: string[];
  setEditMinors: React.Dispatch<React.SetStateAction<string[]>>;
  editTrack: string;
  setEditTrack: React.Dispatch<React.SetStateAction<string>>;
  editPreProfessional: boolean;
  setEditPreProfessional: React.Dispatch<React.SetStateAction<boolean>>;
  editCareerGoal: string;
  setEditCareerGoal: React.Dispatch<React.SetStateAction<string>>;
  editJobLocations: string[];
  setEditJobLocations: React.Dispatch<React.SetStateAction<string[]>>;
  editJobLocationScope: "specific" | "domestic" | "international" | null;
  setEditJobLocationScope: React.Dispatch<React.SetStateAction<"specific" | "domestic" | "international" | null>>;
  editLinkedIn: string;
  setEditLinkedIn: React.Dispatch<React.SetStateAction<string>>;
  editProfileSaving: boolean;
  setEditProfileSaving: React.Dispatch<React.SetStateAction<boolean>>;

  // Career tools state
  handleGapScan: () => Promise<void>;
  handleCoverLetter: () => Promise<void>;
  handleInterviewPrepFromEvidence: () => Promise<void>;
  interviewPrepEvidenceOpen: boolean;
  setInterviewPrepEvidenceOpen: React.Dispatch<React.SetStateAction<boolean>>;
  interviewPrepEvidence: { dimensions: { name: string; question: string; strategy: string; script: string }[] } | null;
  interviewPrepEvidenceLoading: boolean;
  coverLetterOpen: boolean;
  setCoverLetterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  coverLetterResult: { cover_openers: string[]; outreach_hooks: string[] } | null;
  coverLetterLoading: boolean;
  gapScanOpen: boolean;
  setGapScanOpen: React.Dispatch<React.SetStateAction<boolean>>;
  gapScanResult: { gaps: { gap: string; dimension: string; severity: string; fix: string; impact: string }[]; overall_readiness: string; readiness_summary: string } | null;
  gapScanLoading: boolean;

  // Center UI state
  centerMoreOpen: boolean;
  setCenterMoreOpen: React.Dispatch<React.SetStateAction<boolean>>;
  dismissedNoticedId: string | null;
  setDismissedNoticedId: React.Dispatch<React.SetStateAction<string | null>>;
  setStickerSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Error
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  // Share / copy feedback
  copyFeedback: string | null;
  setCopyFeedback: React.Dispatch<React.SetStateAction<"one-line" | "suggested" | "report-link" | "top-pct" | "shared" | null>>;
  downloadFeedback: string | null;
  setDownloadFeedback: React.Dispatch<React.SetStateAction<"snapshot" | "pdf" | null>>;

  // Achievement picker state
  achievementPickerSlot: 0 | 1 | 2 | null;
  setAchievementPickerSlot: React.Dispatch<React.SetStateAction<0 | 1 | 2 | null>>;
  achievementPickerClosing: boolean;
  setAchievementPickerClosing: React.Dispatch<React.SetStateAction<boolean>>;
  shareCardDeselectingSlot: number | null;
  setShareCardDeselectingSlot: React.Dispatch<React.SetStateAction<number | null>>;
  shareCardAddingSlot: number | null;
  setShareCardAddingSlot: React.Dispatch<React.SetStateAction<number | null>>;
  shareImageSheet: { file: File; shareText: string; title: string } | null;
  setShareImageSheet: React.Dispatch<React.SetStateAction<{ file: File; shareText: string; title: string } | null>>;
  shareImagePreparing: boolean;
  setShareImagePreparing: React.Dispatch<React.SetStateAction<boolean>>;

}

// ── Component ──────────────────────────────────────────────────────────────────

export function CenterTab(props: CenterTabProps) {
  const {
    latestAuditRef,
    shareCardRef,
    theme,
    profilePhotoUrl,
    setProfilePhotoUrl,
    profilePhotoUploading,
    setPhotoCropImageSrc,
    openVoiceWithNewChat,
    openVoiceFromScreen,
    habits,
    currentCohortPulse,
    setCurrentCohortPulse,
    latestAtsScoreResolved,
    saveProfile,
    achievements,
    shareCardAchievements,
    captureShareCardAsPngFile,
    goToStandaloneFullAuditReport,
    editingProfile,
    setEditingProfile,
    editName,
    setEditName,
    editMajors,
    setEditMajors,
    editMinors,
    setEditMinors,
    editTrack,
    setEditTrack,
    editPreProfessional,
    setEditPreProfessional,
    editCareerGoal,
    setEditCareerGoal,
    editJobLocations,
    setEditJobLocations,
    editJobLocationScope,
    setEditJobLocationScope,
    editLinkedIn,
    setEditLinkedIn,
    editProfileSaving,
    setEditProfileSaving,
    handleGapScan,
    handleCoverLetter,
    handleInterviewPrepFromEvidence,
    interviewPrepEvidenceOpen,
    setInterviewPrepEvidenceOpen,
    interviewPrepEvidence,
    interviewPrepEvidenceLoading,
    coverLetterOpen,
    setCoverLetterOpen,
    coverLetterResult,
    coverLetterLoading,
    gapScanOpen,
    setGapScanOpen,
    gapScanResult,
    gapScanLoading,
    centerMoreOpen,
    setCenterMoreOpen,
    dismissedNoticedId,
    setDismissedNoticedId,
    setStickerSheetOpen,
    setError,
    copyFeedback,
    setCopyFeedback,
    downloadFeedback,
    setDownloadFeedback,
    achievementPickerSlot,
    setAchievementPickerSlot,
    achievementPickerClosing,
    setAchievementPickerClosing,
    shareCardDeselectingSlot,
    setShareCardDeselectingSlot,
    shareCardAddingSlot,
    setShareCardAddingSlot,
    shareImageSheet,
    setShareImageSheet,
    shareImagePreparing,
    setShareImagePreparing,
  } = props;

  // ── Context hooks ──────────────────────────────────────────────────────────
  const { user, appProfile, school } = useAppContext();
  const {
    audit,
    savedAuditForCenter,
    auditHistory,
    auditHistoryLoading,
    doorEligibility,
    setViewingAudit,
  } = useAuditScore();
  const {
    voiceAvatarIndex,
    voiceRecapForCard,
    setVoiceRecapForCard,
    voiceActionItems,
    memoryItems,
    setMemoryItems,
    outcomeAskingConsent,
    setOutcomeAskingConsent,
    latestConversationOutput,
    setLatestConversationOutput,
    pendingSessionCaptureCard,
    setPendingSessionCaptureCard,
  } = useVoice();
  const {
    setMainAppTab,
    setReviewSubView,
  } = useNavigation();
  const { toast } = useToast();

  // ── Derived state ─────────────────────────────────────────────────────────
  const displayAudit = latestAuditRef.current ?? audit ?? savedAuditForCenter;
  const topLine = displayAudit ? topPercentileHeadline(displayAudit) : null;
  const trackForPlaybook = getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track) || null;
  const playbook = trackForPlaybook ? getPlaybookForTrack(trackForPlaybook) : null;
  const activeDeadlines = (appProfile?.deadlines || []).filter((d) => d.date && d.label && !d.completedAt);
  const urgentBannerDeadline = activeDeadlines.find((d) => {
    try {
      const days = (new Date(d.date).getTime() - Date.now()) / 86400000;
      return days >= 0 && days <= 7;
    } catch { return false; }
  });

  const daysLeft = urgentBannerDeadline ? Math.ceil((new Date(urgentBannerDeadline.date).getTime() - Date.now()) / 86400000) : 0;
  const daysLeftPhrase = daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;

  const gaps = displayAudit ? gapToNextLevel(displayAudit) : [];
  const need = gaps[0]?.pointsToTop25 ?? 0;
  const alertGapLine = urgentBannerDeadline && gaps[0]
    ? need > 0
      ? `Your ${gaps[0].label} score needs +${need} points to hit the Top 25% threshold.`
      : `Your ${gaps[0].label} score is below the Top 25%. See recommendations to improve.`
    : urgentBannerDeadline
      ? "Prep your resume and application now."
      : null;

  // ── Edit profile view ──────────────────────────────────────────────────────
  if (editingProfile) {
    return (
      <EditProfileView
        theme={theme}
        profilePhotoUrl={profilePhotoUrl}
        setProfilePhotoUrl={setProfilePhotoUrl}
        profilePhotoUploading={profilePhotoUploading}
        setPhotoCropImageSrc={setPhotoCropImageSrc}
        saveProfile={saveProfile}
        editingProfile={editingProfile}
        setEditingProfile={setEditingProfile}
        editName={editName}
        setEditName={setEditName}
        editMajors={editMajors}
        setEditMajors={setEditMajors}
        editMinors={editMinors}
        setEditMinors={setEditMinors}
        editTrack={editTrack}
        setEditTrack={setEditTrack}
        editPreProfessional={editPreProfessional}
        setEditPreProfessional={setEditPreProfessional}
        editCareerGoal={editCareerGoal}
        setEditCareerGoal={setEditCareerGoal}
        editJobLocations={editJobLocations}
        setEditJobLocations={setEditJobLocations}
        editJobLocationScope={editJobLocationScope}
        setEditJobLocationScope={setEditJobLocationScope}
        editLinkedIn={editLinkedIn}
        setEditLinkedIn={setEditLinkedIn}
        editProfileSaving={editProfileSaving}
        setEditProfileSaving={setEditProfileSaving}
        displayAudit={displayAudit}
      />
    );
  }

  // ── Main career center view ────────────────────────────────────────────────
  return (
    <div className="career-center-talent min-h-full w-full" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
      <section className="max-w-[390px] mx-auto pb-40 px-4 min-w-0 overflow-hidden animate-fade-up min-h-full" aria-label="Career Center" style={{ background: "var(--bg)" }}>
        <AppProfileHeader
          name={appProfile?.name ?? undefined}
          track={getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track)}
          schoolName={school?.name ?? undefined}
          photoUrl={profilePhotoUrl ?? undefined}
          onPhotoTap={() => { hapticLight(); setMainAppTab("profile_details"); }}
          className="mb-4"
        />
        {/* Alert card: deadline text left-right; Voice button bottom right */}
        {urgentBannerDeadline && (
          <div className="mb-4 rounded-[18px] p-4 flex flex-col gap-3" style={{ background: "var(--s2)" }}>
            <div className="flex items-start gap-3 min-w-0">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: "var(--coral)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm" style={{ color: "var(--t1)" }}>{daysLeft === 1 ? "1 day" : `${daysLeft} days`} until {urgentBannerDeadline.label}</p>
                {alertGapLine && <p className="text-xs mt-0.5" style={{ color: "var(--t3)" }}>{alertGapLine}</p>}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  hapticLight();
                  const ats = latestAtsScoreResolved;
                  const tc = dillyPresenceManager.buildTransitionContext("deadline_card", {
                    company: urgentBannerDeadline.label.split("\u2014")[0]?.trim() || urgentBannerDeadline.label,
                    days: daysLeft,
                    vendor: "Workday",
                    ats_score: ats != null ? String(Math.round(ats)) : "?",
                    above_bar: ats != null && ats >= 70,
                  });
                  openVoiceWithNewChat(undefined, "Deadline prep", { initialAssistantMessage: tc.opening_message });
                }}
                className="text-[11px] font-medium px-2.5 py-1.5 shrink-0 inline-flex items-center gap-1 rounded-lg"
                style={{ background: "var(--blue)", color: "#fff" }}
              >
                <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="ring-2 ring-[var(--s2)]" />
                How can I help?
              </button>
            </div>
          </div>
        )}
        {/* Score card + Dilly home insight + ordered feed strip */}
        {displayAudit?.scores ? (
          <ScoreCardSection
            displayAudit={displayAudit}
            latestAtsScoreResolved={latestAtsScoreResolved}
            currentCohortPulse={currentCohortPulse}
            setCurrentCohortPulse={setCurrentCohortPulse}
            habits={habits}
            dismissedNoticedId={dismissedNoticedId}
            setDismissedNoticedId={setDismissedNoticedId}
            goToStandaloneFullAuditReport={goToStandaloneFullAuditReport}
            openVoiceWithNewChat={openVoiceWithNewChat}
          />
        ) : auditHistoryLoading ? (
          <div className="mb-4 rounded-[24px] p-5" style={{ background: "var(--s2)" }}>
            <p className="text-sm" style={{ color: "var(--t2)" }}>Loading your previous audit&hellip;</p>
          </div>
        ) : (
          <div className="mb-4 rounded-[24px] p-5" style={{ background: "var(--s2)" }}>
            <p className="text-sm" style={{ color: "var(--t2)" }}>No scores to show here yet.</p>
          </div>
        )}
        {/* Quick tools: ATS, Jobs, Recruiter view, Gap, Cover, Interview, Achievements */}
        <QuickToolsGrid
          displayAudit={displayAudit}
          handleGapScan={handleGapScan}
          handleCoverLetter={handleCoverLetter}
          handleInterviewPrepFromEvidence={handleInterviewPrepFromEvidence}
          setStickerSheetOpen={setStickerSheetOpen}
        />
        {/* Deadline reminder */}
        <DeadlineCards theme={theme} />
        {/* Gap / Cover / Interview prep results */}
        <InterviewPrepSection
          theme={theme}
          openVoiceWithNewChat={openVoiceWithNewChat}
          interviewPrepEvidenceOpen={interviewPrepEvidenceOpen}
          setInterviewPrepEvidenceOpen={setInterviewPrepEvidenceOpen}
          interviewPrepEvidence={interviewPrepEvidence}
          interviewPrepEvidenceLoading={interviewPrepEvidenceLoading}
          coverLetterOpen={coverLetterOpen}
          setCoverLetterOpen={setCoverLetterOpen}
          coverLetterResult={coverLetterResult}
          coverLetterLoading={coverLetterLoading}
          gapScanOpen={gapScanOpen}
          setGapScanOpen={setGapScanOpen}
          gapScanResult={gapScanResult}
          gapScanLoading={gapScanLoading}
          handleGapScan={handleGapScan}
        />
        {/* Ask Dilly AI */}
        <button
          type="button"
          onClick={() => { hapticLight(); openVoiceFromScreen("center", "What should I focus on from the Career Center?"); }}
          className="w-full rounded-[18px] p-3 flex items-center gap-3 text-left min-h-[48px] transition-opacity hover:opacity-90 active:opacity-80 mb-4"
          style={{ background: "var(--s2)" }}
          title="Ask Dilly AI about this screen"
        >
          <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="sm" className="ring-0 shrink-0" />
          <span className="text-sm font-medium" style={{ color: "var(--t2)" }}>Ask Dilly AI</span>
          <span className="ml-auto text-xs" style={{ color: "var(--t3)" }}>Get help with this screen</span>
        </button>
        {/* Weekly review card */}
        {user && habits?.is_review_day && (
          <button
            type="button"
            onClick={() => { hapticLight(); openVoiceWithNewChat(
              "It's my weekly review. What did I apply to this week? What's coming up? What should I follow up on? Give me a short plan for the week.",
              "Weekly review"
            ); }}
            className="w-full mb-4 rounded-[18px] p-4 text-left transition-opacity hover:opacity-90 active:opacity-80"
            style={{ background: "var(--s2)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Weekly review</p>
            <p className="text-sm mb-2" style={{ color: "var(--t2)" }}>What did you apply to? What&apos;s coming up? What should you follow up on?</p>
            <div className="flex flex-wrap gap-2 text-[10px]" style={{ color: "var(--t3)" }}>
              {habits.applications_this_week != null && <span>{habits.applications_this_week} apps this week</span>}
              {(habits.upcoming_deadlines?.length ?? 0) > 0 && <span>{habits.upcoming_deadlines!.length} upcoming</span>}
              {(habits.silent_2_weeks ?? 0) > 0 && <span>{habits.silent_2_weeks} to follow up</span>}
            </div>
            <span className="text-[11px] font-medium mt-2 inline-flex items-center gap-1" style={{ color: "var(--blue)" }}>Plan your week &rarr;</span>
          </button>
        )}
        {/* Ritual cards */}
        {user && (() => {
          const rituals = habits?.ritual_suggestions?.filter((r) => r.id !== "sunday_planning" || !habits?.is_review_day) ?? [];
          return rituals.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-4">
              {rituals.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { hapticLight(); openVoiceWithNewChat(r.prompt, r.label); }}
                  className="rounded-[18px] px-3 py-2.5 text-left min-h-[44px] transition-opacity hover:opacity-90 active:opacity-80 flex items-center gap-2"
                  style={{ background: "var(--s2)" }}
                >
                  <span className="text-sm font-medium" style={{ color: "var(--t2)" }}>{r.label}</span>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} />
                </button>
              ))}
            </div>
          ) : null;
        })()}
        {/* Collapsible More */}
        <button type="button" onClick={() => { hapticLight(); setCenterMoreOpen((v) => !v); }} className="w-full mb-4 rounded-[18px] p-3 flex items-center justify-between gap-2 text-left min-h-[44px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s2)" }} aria-expanded={centerMoreOpen}>
          <span className="text-sm font-medium" style={{ color: "var(--t2)" }}>{centerMoreOpen ? "Show less" : "More from your career center"}</span>
          <svg className={`w-5 h-5 shrink-0 transition-transform ${centerMoreOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ color: "var(--t3)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
        </button>
        {centerMoreOpen && (
          <>
            {/* Action items + conversation history links */}
            <div className="flex gap-2 mb-4">
              <button type="button" className="flex-1 rounded-[14px] p-3 text-left flex items-center gap-2" style={{ background: "var(--s2)" }} onClick={() => { hapticLight(); setMainAppTab("actions"); }}>
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="var(--green)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span className="text-[12px] font-semibold" style={{ color: "var(--t1)" }}>Action items</span>
              </button>
              <button type="button" className="flex-1 rounded-[14px] p-3 text-left flex items-center gap-2" style={{ background: "var(--s2)" }} onClick={() => { hapticLight(); setMainAppTab("voice_history"); }}>
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h10" stroke="var(--blue)" strokeWidth={1.5} strokeLinecap="round"/></svg>
                <span className="text-[12px] font-semibold" style={{ color: "var(--t1)" }}>Voice history</span>
              </button>
            </div>
            {/* Share card */}
            {displayAudit && (
              <ShareCard
                shareCardRef={shareCardRef}
                theme={theme}
                displayAudit={displayAudit}
                latestAtsScoreResolved={latestAtsScoreResolved}
                saveProfile={saveProfile}
                achievements={achievements}
                shareCardAchievements={shareCardAchievements}
                captureShareCardAsPngFile={captureShareCardAsPngFile}
                copyFeedback={copyFeedback}
                setCopyFeedback={setCopyFeedback}
                downloadFeedback={downloadFeedback}
                setDownloadFeedback={setDownloadFeedback}
                achievementPickerSlot={achievementPickerSlot}
                setAchievementPickerSlot={setAchievementPickerSlot}
                achievementPickerClosing={achievementPickerClosing}
                setAchievementPickerClosing={setAchievementPickerClosing}
                shareCardDeselectingSlot={shareCardDeselectingSlot}
                setShareCardDeselectingSlot={setShareCardDeselectingSlot}
                shareCardAddingSlot={shareCardAddingSlot}
                setShareCardAddingSlot={setShareCardAddingSlot}
                shareImageSheet={shareImageSheet}
                setShareImageSheet={setShareImageSheet}
                shareImagePreparing={shareImagePreparing}
                setShareImagePreparing={setShareImagePreparing}
                setError={setError}
              />
            )}
            {/* Gamification: progress to next level */}
            {displayAudit?.peer_percentiles && (() => {
              const gapsLocal = gapToNextLevel(displayAudit);
              if (gapsLocal.length === 0) return null;
              return (
                <div className="mb-5 rounded-[18px] p-4" style={{ background: "var(--s2)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--amber)" }}>Steps to next level</p>
                  <p className="text-xs mb-3" style={{ color: "var(--t3)" }}>Get to Top 25% in each dimension. Bar tracks peer rank, not raw score alone.</p>
                  <div className="space-y-3">
                    {gapsLocal.slice(0, 3).map((g) => {
                      const needLocal = g.pointsToTop25 ?? 1;
                      const pct = progressPercentTowardTop25Rank(g.topPct);
                      return (
                        <div key={g.key}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-slate-200 text-sm font-medium">{g.label}</span>
                            <span className="text-amber-400 text-xs font-medium">~{needLocal} pts to Top 25%</span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden bg-slate-700/50">
                            <div className="h-full rounded-full bg-amber-500/80 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="text-slate-500 text-[10px] mt-0.5">Top {g.topPct}% now &middot; goal Top 25%</p>
                        </div>
                      );
                    })}
                  </div>
                  <VoiceAvatarButton voiceAvatarIndex={voiceAvatarIndex} size="xs" label="How can I get there?" onClick={() => openVoiceWithNewChat("Based on my scores and audit, what's the single highest-impact change I should make to get to Top 25%? Give me one concrete, actionable fix.")} className="mt-3 shrink-0" />
                </div>
              );
            })()}
            {/* This week */}
            {(displayAudit || !audit) && (() => {
              const deadlines = (appProfile?.deadlines ?? []).filter((d) => !d.completedAt);
              const now = Date.now();
              const soonest = deadlines
                .filter((d) => d.date && d.label && new Date(d.date).getTime() > now)
                .map((d) => ({ ...d, daysLeft: Math.ceil((new Date(d.date).getTime() - now) / 86400000) }))
                .sort((a, b) => a.daysLeft - b.daysLeft)[0];
              const deadlineLine = soonest && soonest.daysLeft <= 14
                ? `Your "${soonest.label}" deadline is in ${soonest.daysLeft} day${soonest.daysLeft !== 1 ? "s" : ""}. Refresh your audit or ask Dilly AI to prep.`
                : null;
              const prevAudit = auditHistory.length >= 2 ? auditHistory[auditHistory.length - 2] : null;
              const milestoneNudge = displayAudit && prevAudit ? getMilestoneNudge(displayAudit, prevAudit) : null;
              const crossed = displayAudit && prevAudit ? scoresCrossedMilestones(displayAudit, prevAudit) : [];
              const showLoadingAudit = !displayAudit && auditHistoryLoading;
              if (
                !deadlineLine &&
                !milestoneNudge &&
                crossed.length === 0 &&
                !showLoadingAudit
              ) {
                return null;
              }
              return (
                <div className="mb-5 m-rounded-card p-4 border" style={{ backgroundColor: "var(--ut-surface-raised)", borderColor: "var(--ut-border)" }}>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-2">This week</p>
                  {milestoneNudge && (
                    <p className="text-green-400/90 text-sm font-medium mb-2">&#127881; {milestoneNudge}</p>
                  )}
                  {crossed.length > 0 && (
                    <p className="text-amber-400/90 text-xs mb-2">You crossed a score milestone. Keep it up.</p>
                  )}
                  {deadlineLine && (
                    <p className="text-slate-200 text-sm font-medium mb-2">{deadlineLine}</p>
                  )}
                  {displayAudit && (
                    <Button type="button" variant="outline" size="sm" onClick={() => goToStandaloneFullAuditReport()} className="mt-2 m-rounded-tight border-[var(--ut-border)] text-xs">View recommendations</Button>
                  )}
                  {showLoadingAudit && (
                    <span className="text-slate-400 text-sm mt-2 inline-block">Loading your previous audit&hellip;</span>
                  )}
                </div>
              );
            })()}
            {/* Six-second profile CTA */}
            {appProfile?.profile_slug && (
              <div
                className="relative rounded-xl p-4 mb-4 overflow-hidden flex flex-col gap-4"
                style={{
                  background: "linear-gradient(135deg, rgba(201, 168, 130, 0.18) 0%, rgba(201, 168, 130, 0.08) 50%, rgba(30, 41, 59, 0.4) 100%)",
                  border: "2px solid rgba(201, 168, 130, 0.5)",
                  boxShadow: "0 4px 24px rgba(201, 168, 130, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <div className="min-w-0">
                  <p className="text-amber-400/90 text-[10px] font-semibold uppercase tracking-widest mb-1">Your recruiter profile</p>
                  <h3 className="text-lg font-bold text-slate-100 tracking-tight mb-1">Wins recruiters in 6 seconds</h3>
                  <p className="text-slate-400 text-xs mb-3">One link&mdash;yours to customize. Scores, proof, your tagline and bio. Add it to your resume.</p>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="font-semibold bg-amber-500 hover:bg-amber-400 text-slate-900 border-0 shadow-md shadow-amber-500/20 w-full sm:w-auto"
                      onClick={() => window.open(`/p/${appProfile.profile_slug}?preview=1`, "_blank")}
                    >
                      See what recruiters see
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-slate-500 text-slate-200 hover:bg-slate-700/50 w-full sm:w-auto"
                      onClick={() => window.open(`/p/${appProfile.profile_slug}`, "_blank")}
                    >
                      Open profile link
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-slate-500 text-[10px] font-medium uppercase tracking-wider">Copy for resume</p>
                  <code className="px-2.5 py-2 rounded-lg text-[11px] text-slate-300 bg-slate-800/70 break-all border border-slate-600/60">
                    {typeof window !== "undefined" ? `${window.location.origin}/p/${appProfile.profile_slug}` : `/p/${appProfile.profile_slug}`}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full border-slate-500 text-slate-300 hover:bg-slate-700/50 text-xs"
                    onClick={() => {
                      const url = typeof window !== "undefined" ? `${window.location.origin}/p/${appProfile?.profile_slug}` : "";
                      const line = `Full profile: ${url}`;
                      navigator.clipboard.writeText(line);
                      toast("Copied to clipboard", "success");
                    }}
                  >
                    Copy line
                  </Button>
                </div>
              </div>
            )}
            {/* 20x moment: mental load */}
            <div className="mb-4 rounded-[18px] p-3" style={{ background: "var(--s2)" }}>
              <p className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Your Dilly advantage</p>
              <p className="text-xs" style={{ color: "var(--t2)" }}>{formatTwentyXCompact(TWENTY_X_MOMENTS.mental_load)}</p>
            </div>
            {/* Outcome capture */}
            {(() => {
              const snap = appProfile?.first_audit_snapshot;
              const ts = snap?.ts;
              const fourteenDaysSec = 14 * 24 * 3600;
              const showPrompt = ts != null && (Date.now() / 1000 - ts) >= fourteenDaysSec
                && !(appProfile as { got_interview_at?: number })?.got_interview_at
                && !(appProfile as { got_offer_at?: number })?.got_offer_at
                && !(appProfile as { outcome_prompt_dismissed_at?: number })?.outcome_prompt_dismissed_at;
              if (!showPrompt && !outcomeAskingConsent) return null;
              return (
                <div className="mb-4 rounded-[18px] p-4" style={{ background: "var(--s2)" }}>
                  {!outcomeAskingConsent ? (
                    <>
                      <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>Quick question (optional)</p>
                      <p className="text-sm mb-3" style={{ color: "var(--t1)" }}>Did you get an interview or offer?</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90" style={{ background: "var(--s3)", color: "var(--t2)" }} onClick={async () => {
                          const now = Math.floor(Date.now() / 1000);
                          await saveProfile({ got_interview_at: now });
                          setOutcomeAskingConsent("interview");
                        }}>Yes, interview</button>
                        <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90" style={{ background: "var(--s3)", color: "var(--t2)" }} onClick={async () => {
                          const now = Math.floor(Date.now() / 1000);
                          await saveProfile({ got_offer_at: now });
                          setOutcomeAskingConsent("offer");
                        }}>Yes, offer</button>
                        <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90" style={{ color: "var(--t3)" }} onClick={async () => {
                          await saveProfile({ outcome_prompt_dismissed_at: Math.floor(Date.now() / 1000) });
                        }}>Not yet</button>
                        <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90" style={{ color: "var(--t3)" }} onClick={async () => {
                          await saveProfile({ outcome_prompt_dismissed_at: Math.floor(Date.now() / 1000) });
                        }}>Skip</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm mb-3" style={{ color: "var(--t1)" }}>Can we use your outcome in stories (e.g. &quot;Students got interviews after Dilly&quot;)?</p>
                      <div className="flex gap-2">
                        <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90" style={{ background: "var(--blue)", color: "#fff" }} onClick={async () => {
                          await saveProfile({ outcome_story_consent: true });
                          setOutcomeAskingConsent(null);
                        }}>Yes</button>
                        <button type="button" className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90" style={{ background: "var(--s3)", color: "var(--t2)" }} onClick={async () => {
                          await saveProfile({ outcome_story_consent: false });
                          setOutcomeAskingConsent(null);
                        }}>No</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            {/* 2-week sprint */}
            {(() => {
              const dls = (appProfile?.deadlines || []).filter((d) => d.date && d.label && !d.completedAt);
              const now = Date.now();
              const soonest = dls
                .filter((d) => new Date(d.date).getTime() > now)
                .map((d) => ({ ...d, daysLeft: Math.ceil((new Date(d.date).getTime() - now) / 86400000) }))
                .sort((a, b) => a.daysLeft - b.daysLeft)[0];
              if (!soonest || soonest.daysLeft > 14) return null;
              const topThree = displayAudit ? getTopThreeActions(displayAudit) : [];
              const sprintItems: { label: string; action: () => void }[] = [
                { label: "Refresh your audit", action: () => { setMainAppTab("hiring"); setReviewSubView("upload"); } },
                { label: "Review recommendations", action: () => goToStandaloneFullAuditReport() },
                { label: "Prep with Dilly AI", action: () => openVoiceWithNewChat(`I have "${soonest.label}" in ${soonest.daysLeft} days. Help me prepare: interview prep and one thing to fix on my resume.`) },
              ];
              topThree.slice(0, 2).forEach((item) => {
                const { label } = toNaturalSuggestion(item.title, item.type, item.suggestedLine);
                sprintItems.push({ label, action: () => openVoiceWithNewChat(`Help me fix this: ${item.title}. ${item.suggestedLine ? `Suggested: ${item.suggestedLine}` : ""}`) });
              });
              return (
                <div className="mb-5 m-rounded-card p-4 border" style={{ backgroundColor: "rgba(234,179,8,0.06)", borderColor: "rgba(234,179,8,0.35)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/90 mb-2">2-week sprint</p>
                  <p className="text-slate-300 text-xs mb-3">Prioritized to-dos before your deadline.</p>
                  <ul className="space-y-2">
                    {sprintItems.slice(0, 5).map((item, i) => (
                      <li key={i}>
                        <button type="button" onClick={item.action} className="text-left w-full flex items-center gap-2 text-slate-200 text-sm hover:text-slate-100 group">
                          <span className="flex h-5 w-5 shrink-0 rounded border border-amber-500/50 group-hover:border-amber-400 mt-0.5" aria-hidden />
                          <span className="flex-1">{item.label}</span>
                          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            {/* One superpower sentence */}
            {displayAudit && getStrongestSignalSentence(displayAudit) && (
              <div className="mb-5 m-rounded-card p-4 border" style={{ backgroundColor: "rgba(34,197,94,0.06)", borderLeft: "3px solid rgba(34,197,94,0.5)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-green-400/90 mb-1.5">Your strongest signal</p>
                <p className="text-slate-100 text-sm leading-relaxed">{getStrongestSignalSentence(displayAudit)}</p>
              </div>
            )}
            <SessionCaptureCard
              capture={pendingSessionCaptureCard}
              latestAudit={displayAudit}
              voiceAvatarIndex={voiceAvatarIndex}
              onOpenMemory={() => {
                setPendingSessionCaptureCard(null);
                setMainAppTab("memory");
              }}
              onDismiss={async () => {
                const ids = (pendingSessionCaptureCard?.items ?? []).map((item) => item.id);
                setPendingSessionCaptureCard(null);
                if (ids.length === 0) return;
                if (!localStorage.getItem("dilly_auth_token")) return;
                try {
                  await dilly.fetch(`/memory/items/mark-seen`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ item_ids: ids }),
                  });
                  setMemoryItems((prev) => prev.map((row) => (ids.includes(row.id) ? { ...row, shown_to_user: true } : row)));
                } catch {
                  // ignore mark-seen failures
                }
              }}
            />
            {latestConversationOutput && (
              <ConversationOutputCard
                output={latestConversationOutput}
                voiceAvatarIndex={voiceAvatarIndex}
                onDismiss={() => {
                  const convId = latestConversationOutput.conv_id;
                  setLatestConversationOutput(null);
                  if (typeof localStorage !== "undefined") {
                    localStorage.setItem(`conv_output_dismissed_${convId}`, "1");
                  }
                }}
              />
            )}
            {voiceRecapForCard && (
              <VoiceSessionRecapCard
                recap={voiceRecapForCard}
                voiceAvatarIndex={voiceAvatarIndex}
                onDismiss={() => {
                  clearVoiceSessionRecap();
                  setVoiceRecapForCard(null);
                }}
                onOpenVoice={() => {
                  setMainAppTab("voice");
                }}
              />
            )}
            {/* One resume, one audit, many doors */}
            {displayAudit && doorEligibility && doorEligibility.doors.length > 0 && (
              <div className="mt-6 mb-5 m-rounded-card p-4 border" style={{ backgroundColor: "var(--ut-surface-raised)", borderColor: "var(--ut-border)", borderLeft: "4px solid rgba(168, 85, 247, 0.6)" }}>
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-1">One resume, one audit, many doors</p>
                <p className="text-slate-400 text-xs mb-3">Your audit unlocks these opportunities. Improve your scores to open more.</p>
                {doorEligibility.eligible_count > 0 ? (
                  <ul className="space-y-2 mb-3">
                    {doorEligibility.doors.filter((d) => d.eligible).map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-slate-200 text-sm font-medium">{d.short_label}</span>
                        <Link href={d.cta_path} className="text-xs font-medium m-rounded-tight px-2.5 py-1.5" style={{ backgroundColor: "rgba(168, 85, 247, 0.2)", color: "var(--m-accent)" }}>
                          {d.cta_label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-400 text-sm mb-2">Improve your scores to unlock more doors.</p>
                )}
                {doorEligibility.next_door && doorEligibility.eligible_count < doorEligibility.doors.length && (
                  <p className="text-slate-500 text-xs">
                    Unlock <strong className="text-slate-300">{doorEligibility.next_door.short_label}</strong>: {doorEligibility.next_door.gap_summary}
                  </p>
                )}
              </div>
            )}
            {/* Deadlines summary */}
            {(() => {
              const dls: DillyDeadline[] = (appProfile?.deadlines || []).filter((d) => d.date && d.label);
              const activeDls = dls.filter((d) => !d.completedAt);
              const upcoming = activeDls.filter((d) => new Date(d.date).getTime() > Date.now()).length;
              if (dls.length === 0) return null;
              return (
                <div
                  className="mb-5 w-full m-rounded-card p-4 border flex items-center justify-between gap-3 text-left"
                  style={{ backgroundColor: "var(--ut-surface-raised)", borderColor: "var(--ut-border)" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <svg className="w-5 h-5 shrink-0" style={{ color: theme.primary }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                    <div>
                      <p className="text-slate-200 font-medium text-sm">{upcoming > 0 ? `${upcoming} upcoming deadline${upcoming !== 1 ? "s" : ""}` : "Deadlines"}</p>
                      <p className="text-slate-500 text-xs">Ask Dilly AI to add or prep for them</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </section>
    </div>
  );
}
