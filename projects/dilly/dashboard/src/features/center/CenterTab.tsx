"use client";

import React, { type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoaderOne } from "@/components/ui/loader-one";
import { DownloadDoneIcon } from "@/components/ui/animated-state-icons";
import { ProfilePhotoWithFrame } from "@/components/ProfilePhotoWithFrame";
import { MajorMinorAutocomplete } from "@/components/MajorMinorAutocomplete";
import { CityChipsInput } from "@/components/CityChipsInput";
import { TranscriptSection } from "@/components/TranscriptSection";
import { AchievementSticker } from "@/components/AchievementSticker";
import { SessionCaptureCard } from "@/components/memory/SessionCaptureCard";
import { ConversationOutputCard } from "@/components/voice/ConversationOutputCard";
import { VoiceSessionRecapCard } from "@/components/voice/VoiceSessionRecapCard";
import { CohortPulseCard } from "@/components/cohort-pulse/CohortPulseCard";
import {
  ScoreCard,
  DillyInsight,
  ActionCard,
  AppProfileHeader,
} from "@/components/career-center";
import { DillyHomeInsight, DillyFeed } from "@/components/presence";
import { VoiceAvatar, VoiceAvatarButton } from "@/components/VoiceAvatarButton";

import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { useToast } from "@/hooks/useToast";

import { dilly } from "@/lib/dilly";
import { getProfileFrame } from "@/lib/profileFrame";
import { getEffectiveCohortLabel, getPlaybookForTrack, PRE_PROFESSIONAL_TRACKS } from "@/lib/trackDefinitions";
import { UT_MAJORS, UT_MINORS } from "@/lib/utMajorsMinors";
import { JOB_CITIES_LIST } from "@/lib/jobCities";
import { DILLY_BASE_THEME } from "@/lib/schools";
import { hapticLight, hapticMedium, hapticSuccess } from "@/lib/haptics";
import { clearVoiceSessionRecap } from "@/lib/voiceSessionRecap";
import { getDillyNoticedCard, markNoticedSeen } from "@/lib/dillyNoticed";
import { TWENTY_X_MOMENTS, formatTwentyXCompact } from "@/lib/twentyXMoments";
import { dillyPresenceManager, type HomeInsightContext, orderedFeedIds, type FeedOrderContext, type FeedCardType } from "@/lib/dillyPresence";
import {
  topPercentileHeadline,
  oneLineSummary,
  gapToNextLevel,
  progressPercentTowardTop25Rank,
  getTopThreeActions,
  toNaturalSuggestion,
  getStrongestSignalSentence,
  getMilestoneNudge,
  scoresCrossedMilestones,
  copyTextSync,
  generateBadgeSvg,
  generateShareCardSvg,
  downloadSvg,
  profilePhotoCacheKey,
} from "@/lib/dillyUtils";
import {
  ACHIEVEMENT_IDS,
  isUnlocked,
  type AchievementId,
  type ProfileAchievements,
} from "@/lib/achievements";
import html2canvas from "html2canvas";

import type {
  ActionItem,
  AppProfile,
  AuditV2,
  CohortPulse,
  ConversationOutput,
  DillyDeadline,
  MemoryItem,
  SessionCapture,
  UserCohortPulse,
} from "@/types/dilly";
import type { VoiceSessionRecap } from "@/lib/voiceSessionRecap";
import type { VoiceActionItem } from "@/contexts/VoiceContext";

// ── Validate LinkedIn profile URL ──────────────────────────────────────────────
function isValidLinkedInUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  return /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[\w\-]+\/?$/i.test(trimmed);
}

/** Desktop Chrome (and many browsers) report no file sharing or reject share({ files }) */
function navigatorCanSharePngFile(file: File): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

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
  const { user, appProfile, setAppProfile, school } = useAppContext();
  const {
    audit,
    savedAuditForCenter,
    auditHistory,
    auditHistoryLoading,
    atsScoreHistory,
    atsPeerPercentile,
    doorEligibility,
    centerRefreshKey,
    setCenterRefreshKey,
    viewingAudit,
    setViewingAudit,
  } = useAuditScore();
  const {
    voiceAvatarIndex,
    scoreCardDillyStrip,
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

  // ── Derived state (was the top of the IIFE) ───────────────────────────────
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
      <div className="career-center-talent min-h-full w-full overflow-x-hidden" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
        <section className="w-full max-w-[390px] mx-auto px-4 pt-0 pb-40 min-w-0 overflow-x-hidden animate-edit-profile-screen" aria-label="Edit profile" style={{ background: "var(--bg)" }}>
          <header className="sticky top-0 z-20 flex items-center justify-between gap-2 py-3 mb-4 border-b" style={{ background: "var(--bg)", borderColor: "var(--b1)" }}>
            <button type="button" onClick={() => setEditingProfile(false)} className="flex items-center justify-center w-9 h-9 min-h-[44px] shrink-0 rounded-[18px] transition-colors hover:bg-[var(--s2)]" style={{ color: "var(--t2)" }} aria-label="Back">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h2 className="text-[15px] font-semibold truncate min-w-0" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>Edit profile</h2>
            <button type="button" onClick={() => { hapticLight(); setMainAppTab("settings"); }} className="flex items-center gap-1.5 min-h-[44px] px-3 py-2 text-sm font-medium rounded-[18px] transition-colors hover:bg-[var(--s2)] border-0 bg-transparent" style={{ color: "var(--t2)" }} aria-label="Settings">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span>Settings</span>
            </button>
          </header>
          <button
            type="button"
            onClick={() => { hapticLight(); setMainAppTab("memory"); }}
            className="w-full mb-3 rounded-[16px] border px-4 py-3 text-left"
            style={{ background: "var(--s2)", borderColor: "var(--bbdr)" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--t3)" }}>
              Your career story
            </p>
            <p className="text-[13px] mt-1 font-semibold" style={{ color: "var(--t1)" }}>
              What Dilly knows about you
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>
              {memoryItems.length} saved {memoryItems.length === 1 ? "memory" : "memories"} · Open →
            </p>
          </button>
          <div className="rounded-[18px] overflow-hidden space-y-0" style={{ background: "var(--s2)", borderLeft: "4px solid var(--blue)" }}>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setEditProfileSaving(true);
                const majorsClean = editMajors.map((m) => m.trim()).filter(Boolean);
                const minorsClean = editMinors.map((m) => m.trim()).filter(Boolean);
                const jobScope = editJobLocationScope === "domestic" || editJobLocationScope === "international"
                  ? editJobLocationScope
                  : (editJobLocations.length > 0 ? "specific" : undefined);
                const jobLocs = jobScope === "domestic" || jobScope === "international" ? [] : editJobLocations.slice(0, 20);
                const linkedInTrimmed = editLinkedIn.trim();
                if (linkedInTrimmed && !isValidLinkedInUrl(linkedInTrimmed)) {
                  toast("Please enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/username)", "error");
                  setEditProfileSaving(false);
                  return;
                }
                const ok = await saveProfile({
                  name: editName.trim() || undefined,
                  major: majorsClean[0] || undefined,
                  majors: majorsClean,
                  minors: minorsClean,
                  track: editTrack.trim() || undefined,
                  preProfessional: editPreProfessional,
                  career_goal: editCareerGoal.trim() || null,
                  linkedin_url: linkedInTrimmed || undefined,
                  job_location_scope: jobScope,
                  job_locations: jobLocs,
                });
                setEditProfileSaving(false);
                if (ok) {
                  toast("Saved: name, major(s), minor(s), track, career goal, LinkedIn, job locations", "success");
                  setEditingProfile(false);
                }
              }}
              className="p-5 space-y-5"
            >
              {/* Profile photo */}
              <div style={{ borderBottom: "1px solid var(--b1)", paddingBottom: "1.25rem" }}>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-3 block" style={{ color: "var(--t3)" }}>Profile photo</label>
                <div className="flex items-center gap-4">
                  {profilePhotoUrl ? (
                    <button
                      type="button"
                      onClick={() => setPhotoCropImageSrc(profilePhotoUrl)}
                      className="relative shrink-0 cursor-pointer rounded-full overflow-hidden ring-2 ring-white/60"
                    >
                      <ProfilePhotoWithFrame photoUrl={profilePhotoUrl} frame={getProfileFrame(displayAudit?.peer_percentiles)} size="lg" fallbackLetter={appProfile?.name || "?"} />
                      <div className="absolute inset-0 rounded-full bg-black/60 flex flex-col items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21V7h14v14M3 17V3h14v14" /></svg>
                        <span className="text-xs font-medium text-white">Crop</span>
                      </div>
                    </button>
                  ) : (
                    <label
                      htmlFor="profile-photo-input"
                      className="relative w-36 h-36 rounded-full overflow-hidden flex items-center justify-center shrink-0 cursor-pointer ring-2 ring-white"
                      style={{ background: "var(--s2)" }}
                    >
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                        <span className="text-xs font-medium text-white">Add Photo</span>
                      </div>
                    </label>
                  )}
                  <div className="flex flex-col gap-2">
                    {profilePhotoUploading ? (
                      <span className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-[18px] px-3 text-[0.8rem] font-medium opacity-50 min-h-[44px]" style={{ background: "var(--s3)", border: "1px solid var(--b2)" }}>
                        <LoaderOne color={theme.primary} size={8} />
                      </span>
                    ) : (
                      <label
                        htmlFor="profile-photo-input"
                        className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-[18px] px-3 text-[0.8rem] font-medium transition-colors hover:bg-[var(--s3)] min-h-[44px]"
                        style={{ border: "1px solid var(--b2)", color: "var(--t2)" }}
                      >
                        {profilePhotoUrl ? "Change photo" : "Add photo"}
                      </label>
                    )}
                    {profilePhotoUrl && (
                      <Button type="button" variant="outline" size="sm" onClick={async () => {
                        try {
                          const res = await dilly.fetch(`/profile/photo`, { method: "DELETE" });
                          if (res.ok) {
                            try { localStorage.removeItem(profilePhotoCacheKey(user?.email)); } catch {}
                            setProfilePhotoUrl((u) => { if (u && u.startsWith("blob:")) URL.revokeObjectURL(u); return null; });
                          }
                        } catch {}
                      }} className="rounded-[18px] min-h-[44px] border-[var(--b2)]" style={{ color: "var(--coral)" }}>Remove photo</Button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Name</label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-[18px] min-h-[44px] text-sm" style={{ background: "var(--s3)", border: "1px solid var(--b2)", color: "var(--t1)" }} placeholder="Your Name" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>LinkedIn</label>
                <Input value={editLinkedIn} onChange={(e) => setEditLinkedIn(e.target.value)} className="rounded-[18px] min-h-[44px] text-sm" style={{ background: "var(--s3)", border: "1px solid var(--b2)", color: "var(--t1)" }} placeholder="https://linkedin.com/in/username" type="url" />
                <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>Your LinkedIn profile URL (e.g. linkedin.com/in/yourname)</p>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Major(s)</label>
                <p className="text-xs mb-2" style={{ color: "var(--t3)" }}>Type to search University of Tampa majors</p>
                <div className="space-y-2">
                  {editMajors.map((m, i) => (
                    <div key={i} className="flex gap-2">
                      <MajorMinorAutocomplete value={m} onChange={(v) => setEditMajors((prev) => { const n = [...prev]; n[i] = v; return n; })} options={UT_MAJORS} placeholder="E.g. Computer Science" className="flex-1" />
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditMajors((prev) => prev.filter((_, j) => j !== i))} className="rounded-[18px] shrink-0 min-h-[44px] border-[var(--b2)]" style={{ color: "var(--t3)" }}>×</Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditMajors((prev) => [...prev, ""])} className="rounded-[18px] border-dashed border-[var(--b2)] w-full min-h-[44px]" style={{ color: "var(--t3)" }}>+ Add Major</Button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Minor(s)</label>
                <p className="text-xs mb-2" style={{ color: "var(--t3)" }}>Type to search University of Tampa minors</p>
                <div className="space-y-2">
                  {editMinors.map((m, i) => (
                    <div key={i} className="flex gap-2">
                      <MajorMinorAutocomplete value={m} onChange={(v) => setEditMinors((prev) => { const n = [...prev]; n[i] = v; return n; })} options={UT_MINORS} placeholder="E.g. Spanish" className="flex-1" />
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditMinors((prev) => prev.filter((_, j) => j !== i))} className="rounded-[18px] shrink-0 min-h-[44px] border-[var(--b2)]" style={{ color: "var(--t3)" }}>×</Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditMinors((prev) => [...prev, ""])} className="rounded-[18px] border-dashed border-[var(--b2)] w-full min-h-[44px]" style={{ color: "var(--t3)" }}>+ Add Minor</Button>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Your cohort</label>
                <p className="text-sm font-medium py-2.5 px-3 rounded-[18px] min-h-[44px] flex items-center" style={{ background: "var(--s3)", border: "1px solid var(--b2)", color: "var(--t2)" }}>
                  {getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track) || "\u2014"}
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>Pre-Law and pre-health paths use your cohort choice; otherwise your resume audit sets your cohort (updates when you re-run an audit).</p>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Pre-professional track</label>
                <select
                  value={editTrack}
                  onChange={(e) => { setEditTrack(e.target.value); setEditPreProfessional(!!e.target.value); }}
                  className="w-full rounded-[18px] min-h-[44px] text-sm px-3 py-2"
                  style={{ background: "var(--s3)", border: "1px solid var(--b2)", color: "var(--t1)" }}
                >
                  <option value="">None</option>
                  {PRE_PROFESSIONAL_TRACKS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: "var(--t3)" }}>Pre-Law maps to the Pre-Law cohort; pre-health paths map to Pre-Health.</p>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: "var(--t3)" }}>Career goal</label>
                <Input value={editCareerGoal} onChange={(e) => setEditCareerGoal(e.target.value)} className="rounded-[18px] min-h-[44px] text-sm" style={{ background: "var(--s3)", border: "1px solid var(--b2)", color: "var(--t1)" }} placeholder="e.g. Land Summer Analyst at Goldman" />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: "var(--t3)" }}>Job locations</label>
                {(editJobLocationScope !== "domestic" && editJobLocationScope !== "international") && (
                  <CityChipsInput value={editJobLocations} onChange={setEditJobLocations} placeholder="Add cities" options={JOB_CITIES_LIST} />
                )}
                <p className="text-xs mt-2 mb-1" style={{ color: "var(--t3)" }}>Open to anywhere?</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(["domestic", "international"] as const).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => {
                        const next = scope === editJobLocationScope ? null : scope;
                        setEditJobLocationScope(next);
                        if (next === "domestic" || next === "international") setEditJobLocations([]);
                      }}
                      className={`px-3 py-2 rounded-[18px] text-xs font-medium min-h-[44px] transition-colors`}
                      style={editJobLocationScope === scope ? { background: "var(--blue)", color: "#fff" } : { background: "var(--s3)", color: "var(--t2)", border: "1px solid var(--b2)" }}
                    >
                      {scope === "domestic" ? "Domestic (US)" : "International"}
                    </button>
                  ))}
                </div>
                {(editJobLocationScope === "domestic" || editJobLocationScope === "international") && (
                  <button
                    type="button"
                    onClick={() => setEditJobLocationScope(null)}
                    className="mt-2 text-xs font-medium transition-colors underline underline-offset-2"
                    style={{ color: "var(--t3)" }}
                  >
                    No, I&apos;m looking for specific cities
                  </button>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={editProfileSaving} className="rounded-[18px] px-5 py-2.5 min-h-[44px] text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50" style={{ background: "var(--blue)", color: "#fff" }}>{editProfileSaving ? "Saving\u2026" : "Save"}</button>
                <button type="button" onClick={() => {
                  const dirty = editName.trim() !== (appProfile?.name ?? "").trim()
                    || JSON.stringify(editMajors.map((m) => m.trim()).filter(Boolean)) !== JSON.stringify(appProfile?.majors ?? (appProfile?.major ? [appProfile.major] : []))
                    || JSON.stringify(editMinors.map((m) => m.trim()).filter(Boolean)) !== JSON.stringify(appProfile?.minors ?? [])
                    || editTrack.trim() !== (appProfile?.track ?? "").trim()
                    || editPreProfessional !== !!appProfile?.preProfessional
                    || editCareerGoal.trim() !== (appProfile?.career_goal ?? "").trim()
                    || editLinkedIn.trim() !== (appProfile?.linkedin_url ?? "").trim()
                    || editJobLocationScope !== (appProfile?.job_location_scope ?? null)
                    || JSON.stringify(editJobLocations) !== JSON.stringify(appProfile?.job_locations ?? []);
                  if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
                  setEditingProfile(false);
                }} className="rounded-[18px] px-5 py-2.5 min-h-[44px] text-sm font-medium transition-opacity hover:opacity-90" style={{ background: "var(--s3)", color: "var(--t2)", border: "1px solid var(--b2)" }}>Cancel</button>
              </div>
            </form>
          </div>
        </section>
      </div>
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
        {displayAudit?.scores ? (() => {
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
                      {/* eslint-disable-next-line @next/next/no-img-element -- static public asset */}
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
              <DillyFeed order={feedOrder} children={feedChildren} />
            </div>
          );
        })() : auditHistoryLoading ? (
          <div className="mb-4 rounded-[24px] p-5" style={{ background: "var(--s2)" }}>
            <p className="text-sm" style={{ color: "var(--t2)" }}>Loading your previous audit\u2026</p>
          </div>
        ) : (
          <div className="mb-4 rounded-[24px] p-5" style={{ background: "var(--s2)" }}>
            <p className="text-sm" style={{ color: "var(--t2)" }}>No scores to show here yet.</p>
          </div>
        )}
        {/* Compact tool row: ATS, Jobs */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {displayAudit ? (
            <Link href="/ats/overview?run=1" className="rounded-[18px] p-3 text-center flex flex-col items-center justify-center gap-1 min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s2)" }}>
              <img src="/ats-scan-icon.png" alt="" className="w-5 h-5 object-contain shrink-0" aria-hidden />
              <span className="text-[11px] font-medium truncate w-full" style={{ color: "var(--t2)" }}>ATS Scan</span>
            </Link>
          ) : (
            <button type="button" onClick={() => { hapticLight(); setMainAppTab("hiring"); }} className="rounded-[18px] p-3 text-center flex flex-col items-center justify-center gap-1 min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80 opacity-60" style={{ background: "var(--s2)" }}>
              <img src="/ats-scan-icon.png" alt="" className="w-5 h-5 object-contain shrink-0" aria-hidden />
              <span className="text-[11px] font-medium truncate w-full" style={{ color: "var(--t3)" }}>ATS Scan</span>
            </button>
          )}
          <Link href="/?tab=resources&view=jobs" className="rounded-[18px] p-3 text-center flex flex-col items-center justify-center gap-1 min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s2)" }}>
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" style={{ color: "var(--blue)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg>
            <span className="text-[11px] font-medium truncate w-full" style={{ color: "var(--t2)" }}>Jobs</span>
          </Link>
          {appProfile?.profile_slug ? (
            <button type="button" onClick={() => { hapticLight(); window.open(`/p/${appProfile.profile_slug}?preview=1`, "_blank"); }} className="rounded-[18px] p-3 text-center flex flex-col items-center justify-center gap-1 min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s2)" }}>
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" style={{ color: "var(--amber)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              <span className="text-[11px] font-medium truncate w-full" style={{ color: "var(--t1)" }}>Recruiter view</span>
            </button>
          ) : (
            <div className="rounded-[18px] p-3 text-center flex flex-col items-center justify-center gap-1 min-h-[52px] opacity-60" style={{ background: "var(--s2)" }}>
              <span className="text-[11px] font-medium truncate w-full" style={{ color: "var(--t3)" }}>Recruiter view</span>
            </div>
          )}
        </div>
        {/* Deadline reminder */}
        {(() => {
          const dls = (appProfile?.deadlines || []).filter((d) => d.date && d.label && !d.completedAt);
          const now = Date.now();
          const soonest = dls
            .filter((d) => new Date(d.date).getTime() > now)
            .map((d) => ({ ...d, daysLeft: Math.ceil((new Date(d.date).getTime() - now) / 86400000) }))
            .sort((a, b) => a.daysLeft - b.daysLeft)[0];
          if (!soonest) return null;
          const isSprint = soonest.daysLeft <= 14;
          return (
            <div className="mb-4 m-rounded-card p-4 border overflow-hidden" style={{ backgroundColor: isSprint ? "rgba(234,179,8,0.08)" : "var(--ut-surface-raised)", borderColor: isSprint ? "rgba(234,179,8,0.4)" : "var(--ut-border)", borderLeftWidth: "4px", borderLeftColor: isSprint ? "#eab308" : theme.primary }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500/90">Deadline reminder</span>
                <span className="text-sm font-bold tabular-nums text-slate-100">{soonest.daysLeft} day{soonest.daysLeft !== 1 ? "s" : ""} left</span>
              </div>
              <p className="text-slate-200 font-medium text-sm mb-2">&quot;{soonest.label}&quot;</p>
              <div className="h-2 rounded-full overflow-hidden bg-slate-700/50">
                <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, 100 - (soonest.daysLeft / 14) * 100))}%` }} />
              </div>
              <p className="text-slate-500 text-[10px] mt-1.5">Due {new Date(soonest.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
            </div>
          );
        })()}
        {/* Career Tools row */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => { hapticLight(); handleGapScan(); }}
            className="rounded-[18px] p-3 flex items-center gap-2.5 text-left min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80"
            style={{ background: "var(--s2)" }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" style={{ color: "var(--blue)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <span className="text-[11px] font-medium leading-tight" style={{ color: "var(--t2)" }}>Gap Analysis</span>
          </button>
          <button
            type="button"
            onClick={() => { hapticLight(); handleCoverLetter(); }}
            className="rounded-[18px] p-3 flex items-center gap-2.5 text-left min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80"
            style={{ background: "var(--s2)" }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" style={{ color: "var(--blue)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.981l7.5-4.039a2.25 2.25 0 012.134 0l7.5 4.039a2.25 2.25 0 011.183 1.98V19.5z" /></svg>
            <span className="text-[11px] font-medium leading-tight" style={{ color: "var(--t2)" }}>Cover Letter</span>
          </button>
          <button
            type="button"
            disabled={!displayAudit}
            onClick={() => {
              hapticLight();
              void handleInterviewPrepFromEvidence();
            }}
            className="rounded-[18px] p-3 flex items-center gap-2.5 text-left min-h-[52px] min-w-0 transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50 disabled:pointer-events-none"
            style={{ background: "var(--s2)" }}
            title={displayAudit ? "Questions and scripts from your resume evidence (Smart, Grit, Build)" : "Complete an audit first"}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" style={{ color: "var(--blue)" }}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
            <span className="text-[11px] font-medium leading-tight" style={{ color: "var(--t2)" }}>Interview Prep</span>
          </button>
          {(() => {
            const unlockedCount = appProfile?.achievements ? Object.keys(appProfile.achievements).length : 0;
            return (
              <button
                type="button"
                onClick={() => { hapticLight(); setStickerSheetOpen(true); }}
                className="rounded-[18px] p-3 flex items-center gap-2.5 min-h-[52px] min-w-0 transition-opacity hover:opacity-90 active:opacity-80 text-left"
                style={{ background: "var(--s2)" }}
              >
                <img src="/achievements-collection-icon.png" alt="" className="w-5 h-5 object-contain shrink-0" aria-hidden />
                <div className="min-w-0">
                  <span className="text-[11px] font-medium leading-tight block" style={{ color: "var(--t2)" }}>Achievements</span>
                  {unlockedCount > 0 && (
                    <span className="text-[10px] font-medium" style={{ color: "var(--amber)" }}>{unlockedCount} unlocked</span>
                  )}
                </div>
              </button>
            );
          })()}
        </div>
        {/* Gap / Cover / Interview prep results */}
        {interviewPrepEvidenceOpen && (
          <div className="mb-4 rounded-[18px] border p-4 min-w-0 overflow-hidden" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--t1)" }}>Interview prep from your evidence</p>
                <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--t3)" }}>
                  <span className="font-cinzel" style={{ color: "var(--te-gold)" }}>Smart</span>,{" "}
                  <span className="font-cinzel" style={{ color: "var(--te-gold)" }}>Grit</span>,{" "}
                  <span className="font-cinzel" style={{ color: "var(--te-gold)" }}>Build</span>
                  {" "}\u2014 tap a section to expand
                </p>
              </div>
              <button
                type="button"
                onClick={() => { hapticLight(); setInterviewPrepEvidenceOpen(false); }}
                className="p-2 rounded-lg transition-colors shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
                style={{ color: "var(--t3)" }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {interviewPrepEvidenceLoading ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary }} />
                <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "200ms" }} />
                <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "400ms" }} />
                <span className="text-xs ml-1" style={{ color: "var(--t3)" }}>Generating from your resume\u2026</span>
              </div>
            ) : interviewPrepEvidence?.dimensions?.length ? (
              <div className="space-y-2 min-w-0">
                {interviewPrepEvidence.dimensions.map((dim, i) => (
                  <details
                    key={i}
                    className="rounded-[14px] border min-w-0 overflow-hidden open:[&_summary_.evidence-dim-chevron]:rotate-90"
                    style={{ borderColor: "var(--b1)", background: "var(--s1)" }}
                  >
                    <summary className="flex min-h-[48px] items-center justify-between gap-2 px-3 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                      <span className="text-sm font-semibold text-left font-cinzel" style={{ color: "var(--t1)" }}>{dim.name}</span>
                      <ChevronRight className="evidence-dim-chevron w-4 h-4 shrink-0 transition-transform duration-200" style={{ color: "var(--t3)" }} aria-hidden />
                    </summary>
                    <div className="px-3 pb-3 pt-0 space-y-2 border-t min-w-0" style={{ borderColor: "var(--b1)" }}>
                      <details className="rounded-lg border min-w-0 overflow-hidden open:[&_summary_.evidence-sub-chevron]:rotate-90" style={{ borderColor: "var(--b1)", background: "var(--s2)" }}>
                        <summary className="flex min-h-[44px] items-center justify-between gap-2 px-2.5 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--t3)" }}>Question</span>
                          <ChevronRight className="evidence-sub-chevron w-3.5 h-3.5 shrink-0 transition-transform duration-200" style={{ color: "var(--t3)" }} aria-hidden />
                        </summary>
                        <p className="text-sm px-2.5 pb-2.5 leading-relaxed" style={{ color: "var(--t2)" }}>{dim.question}</p>
                      </details>
                      <details className="rounded-lg border min-w-0 overflow-hidden open:[&_summary_.evidence-sub-chevron]:rotate-90" style={{ borderColor: "var(--b1)", background: "var(--s2)" }}>
                        <summary className="flex min-h-[44px] items-center justify-between gap-2 px-2.5 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--t3)" }}>Strategy</span>
                          <ChevronRight className="evidence-sub-chevron w-3.5 h-3.5 shrink-0 transition-transform duration-200" style={{ color: "var(--t3)" }} aria-hidden />
                        </summary>
                        <p className="text-xs px-2.5 pb-2.5 leading-relaxed" style={{ color: "var(--t2)" }}>{dim.strategy}</p>
                      </details>
                      <details className="rounded-lg border min-w-0 overflow-hidden open:[&_summary_.evidence-sub-chevron]:rotate-90" style={{ borderColor: "var(--b1)", background: "var(--s2)" }}>
                        <summary className="flex min-h-[44px] items-center justify-between gap-2 px-2.5 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--t3)" }}>30-second script</span>
                          <ChevronRight className="evidence-sub-chevron w-3.5 h-3.5 shrink-0 transition-transform duration-200" style={{ color: "var(--t3)" }} aria-hidden />
                        </summary>
                        <p className="text-xs px-2.5 pb-2.5 leading-relaxed italic" style={{ color: "var(--t2)" }}>&quot;{dim.script}&quot;</p>
                      </details>
                      <button
                        type="button"
                        onClick={() => {
                          hapticLight();
                          openVoiceWithNewChat(`I need to practice this answer for: "${dim.question}" My script: ${dim.script}. Give me feedback and a stronger version.`);
                        }}
                        className="w-full text-[11px] font-medium px-3 py-2.5 rounded-xl border min-h-[44px] inline-flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                        style={{ borderColor: "var(--b2)", color: "var(--t2)" }}
                      >
                        <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="ring-0 shrink-0" />
                        Practice with Dilly AI
                      </button>
                    </div>
                  </details>
                ))}
              </div>
            ) : !interviewPrepEvidenceLoading && interviewPrepEvidence ? (
              <p className="text-sm" style={{ color: "var(--t3)" }}>No dimensions generated. Try again in a moment.</p>
            ) : null}
          </div>
        )}
        {coverLetterOpen && (
          <div className="mb-4 rounded-[18px] border p-4 min-w-0 overflow-hidden" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold" style={{ color: "var(--t1)" }}>Cover letter lines</p>
              <button
                type="button"
                onClick={() => { hapticLight(); setCoverLetterOpen(false); }}
                className="p-2 rounded-lg transition-colors shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
                style={{ color: "var(--t3)" }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {coverLetterLoading ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary }} />
                <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "200ms" }} />
                <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "400ms" }} />
                <span className="text-xs ml-1" style={{ color: "var(--t3)" }}>Generating lines\u2026</span>
              </div>
            ) : coverLetterResult ? (
              <div className="space-y-4">
                {coverLetterResult.cover_openers?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>Cover letter openers</p>
                    <div className="space-y-2">
                      {coverLetterResult.cover_openers.map((line, i) => (
                        <div key={i} className="p-3 rounded-[14px] border text-xs leading-relaxed" style={{ borderColor: "var(--b1)", background: "var(--s1)", color: "var(--t2)" }}>{line}</div>
                      ))}
                    </div>
                  </div>
                )}
                {coverLetterResult.outreach_hooks?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>LinkedIn / email hooks</p>
                    <div className="space-y-2">
                      {coverLetterResult.outreach_hooks.map((line, i) => (
                        <div key={i} className="p-3 rounded-[14px] border text-xs leading-relaxed" style={{ borderColor: "var(--b1)", background: "var(--s1)", color: "var(--t2)" }}>{line}</div>
                      ))}
                    </div>
                  </div>
                )}
                {(!coverLetterResult.cover_openers?.length && !coverLetterResult.outreach_hooks?.length) && (
                  <p className="text-sm" style={{ color: "var(--t3)" }}>Could not generate lines. Try again.</p>
                )}
              </div>
            ) : null}
          </div>
        )}
        {gapScanOpen && (
          <div className="mb-4 rounded-[18px] border p-4 min-w-0 overflow-hidden" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold" style={{ color: "var(--t1)" }}>Gap analysis</p>
              <button
                type="button"
                onClick={() => { hapticLight(); setGapScanOpen(false); }}
                className="p-2 rounded-lg transition-colors shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
                style={{ color: "var(--t3)" }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {gapScanLoading ? (
              <div className="flex items-center gap-2 py-4 justify-center">
                <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary }} />
                <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "200ms" }} />
                <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "400ms" }} />
                <span className="text-xs ml-1" style={{ color: "var(--t3)" }}>Scanning your profile\u2026</span>
              </div>
            ) : gapScanResult ? (
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: gapScanResult.overall_readiness === "ready" ? "var(--bdim)" : gapScanResult.overall_readiness === "stretch" ? "var(--adim)" : "var(--s3)",
                      color: "var(--t1)",
                    }}
                  >
                    {gapScanResult.overall_readiness === "ready" ? "Ready" : gapScanResult.overall_readiness === "stretch" ? "Stretch" : "Not yet"}
                  </span>
                  {gapScanResult.readiness_summary ? (
                    <p className="text-xs flex-1 min-w-0" style={{ color: "var(--t3)" }}>{gapScanResult.readiness_summary}</p>
                  ) : null}
                </div>
                <div className="space-y-2.5">
                  {gapScanResult.gaps.map((gap, i) => (
                    <div key={i} className="p-3 rounded-[14px] border min-w-0" style={{ borderColor: "var(--b1)", background: "var(--s1)" }}>
                      <div className="flex items-start gap-2">
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 mt-0.5" style={{ background: "var(--s3)", color: "var(--t3)" }}>{gap.severity}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium mb-1" style={{ color: "var(--t1)" }}>{gap.gap}</p>
                          <p className="text-xs leading-relaxed" style={{ color: "var(--t2)" }}>{gap.fix}</p>
                          {gap.impact ? <p className="text-xs mt-1" style={{ color: "var(--blue)" }}>{gap.impact}</p> : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => { hapticLight(); void handleGapScan(); }}
                  className="mt-3 text-xs font-medium transition-opacity hover:opacity-90"
                  style={{ color: "var(--blue)" }}
                >
                  Re-scan
                </button>
              </div>
            ) : null}
          </div>
        )}
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
            <span className="text-[11px] font-medium mt-2 inline-flex items-center gap-1" style={{ color: "var(--blue)" }}>Plan your week \u2192</span>
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
              <div
                className="mb-5 rounded-[24px] p-4 min-w-0"
                style={{
                  maxWidth: "375px",
                  width: "100%",
                  boxSizing: "border-box",
                  background: "var(--s2)",
                }}
              >
                {/* Friend-focused headline */}
                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold tracking-tight" style={{ color: "var(--t1)" }}>Send this to your friends</h3>
                  <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>They&apos;ll see your score \u2014 and can get their own.</p>
                </div>
                {/* Top 25% nudge */}
                {displayAudit?.peer_percentiles && (() => {
                  const pct = displayAudit.peer_percentiles;
                  const hasTop25 = (["smart", "grit", "build"] as const).some((k) => Math.max(1, 100 - (pct[k] ?? 50)) <= 25);
                  return hasTop25 ? (
                    <div className="rounded-[18px] p-3 mb-4 flex items-center gap-3 min-w-0" style={{ background: "var(--gdim)" }}>
                      <span className="text-2xl shrink-0">&#127881;</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "var(--t1)" }}>You&apos;re in the Top 25%</p>
                        <p className="text-xs" style={{ color: "var(--t3)" }}>Your friends will want to see this.</p>
                      </div>
                    </div>
                  ) : null;
                })()}
                {/* Inner platinum card */}
                {(() => {
                  const shareMetric = (appProfile?.share_card_metric === "smart" || appProfile?.share_card_metric === "grit" || appProfile?.share_card_metric === "build" || appProfile?.share_card_metric === "mts" || appProfile?.share_card_metric === "ats")
                    ? appProfile.share_card_metric
                    : "grit";
                  const isDimension = shareMetric === "smart" || shareMetric === "grit" || shareMetric === "build";
                  const k = isDimension ? shareMetric : "grit";
                  const percentile = displayAudit?.peer_percentiles?.[k] ?? 50;
                  const topPct = Math.max(1, Math.min(100, 100 - percentile));
                  const cohort = getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track) || "your track";
                  const size = 56;
                  const r = size / 2 - 5;
                  const circumference = 2 * Math.PI * r;
                  const dimensionPeerRankArc = ((100 - topPct) / 100) * circumference;
                  const dimensionScore = Math.round(displayAudit?.scores?.[k] ?? 0);
                  const mtsScore = displayAudit?.final_score != null ? Math.round(displayAudit.final_score) : null;
                  const atsScore = latestAtsScoreResolved;
                  const atsTopPct = atsPeerPercentile != null ? Math.max(1, 100 - atsPeerPercentile) : null;
                  const shareCardStickers = appProfile?.share_card_achievements ?? [];
                  const circleLabel = shareMetric === "mts"
                    ? (mtsScore != null ? String(mtsScore) : "\u2014")
                    : shareMetric === "ats"
                      ? (atsScore != null ? String(atsScore) : "\u2014")
                      : (displayAudit?.peer_percentiles ? `${topPct}%` : String(dimensionScore));
                  const subLabel = shareMetric === "mts"
                    ? "Final \u00B7 Overall"
                    : shareMetric === "ats"
                      ? atsTopPct != null ? `ATS \u00B7 Top ${atsTopPct}% vs peers` : "Dilly ATS score"
                      : `${k.charAt(0).toUpperCase() + k.slice(1)} in ${cohort}`;
                  const showPercentRing = (isDimension && displayAudit?.peer_percentiles) || (shareMetric === "mts" && mtsScore != null) || (shareMetric === "ats" && atsScore != null);
                  const ringArcLength =
                    shareMetric === "mts"
                      ? (Math.min(100, Math.max(0, mtsScore ?? 0)) / 100) * circumference
                      : shareMetric === "ats"
                        ? (Math.min(100, Math.max(0, atsScore ?? 0)) / 100) * circumference
                        : dimensionPeerRankArc;
                  return (
                    <div
                      ref={shareCardRef}
                      className="share-card-canvas m-rounded-card p-4 select-none mb-4 flex flex-col gap-3 min-w-0"
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        background: "#ffffff",
                        color: "#1e293b",
                      }}
                      aria-label="Dilly score card"
                    >
                      {/* Row 1: Dilly left, circle further left */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-left min-w-0 flex-1 flex flex-col justify-center" style={{ maxWidth: "58%" }}>
                          <p className="text-2xl font-bold tracking-tight" style={{ color: "#0f172a", fontFamily: '"Times New Roman", Times, serif' }}>Dilly</p>
                          <p className="text-sm mt-2 leading-tight" style={{ color: "#475569", fontFamily: '"Times New Roman", Times, serif' }}>
                            Resume scored like a<br />senior hiring manager.
                          </p>
                          <p className="text-xs mt-2 whitespace-nowrap" style={{ color: "#64748b" }}>Your career center. Open 24/7.</p>
                        </div>
                        {/* Right: single metric circle */}
                        <div className="flex flex-col items-center shrink-0 ml-5 mr-2">
                          <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#64748b" }}>{shareMetric === "mts" ? "Final" : shareMetric === "ats" ? "ATS" : "Top"}</p>
                          <div className="relative shrink-0" style={{ width: size, height: size }}>
                            <svg width={size} height={size} className="pointer-events-none" style={{ display: "block" }} aria-hidden>
                              <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={4} />
                                {showPercentRing && (
                                  <circle
                                    cx={size / 2}
                                    cy={size / 2}
                                    r={r}
                                    fill="none"
                                    stroke={theme.primary}
                                    strokeWidth={4}
                                    strokeLinecap="round"
                                    strokeDasharray={`${ringArcLength} ${circumference}`}
                                    strokeDashoffset={0}
                                  />
                                )}
                              </g>
                              <text
                                x={size / 2}
                                y={size / 2}
                                textAnchor="middle"
                                dominantBaseline="central"
                                className="font-bold tabular-nums"
                                style={{
                                  fill: "#0f172a",
                                  fontFamily: '"Times New Roman", Times, serif',
                                  fontSize: circleLabel.length > 3 ? 14 : 16,
                                }}
                              >
                                {circleLabel}
                              </text>
                            </svg>
                          </div>
                          <p className="text-[9px] font-medium text-center mt-0.5 leading-tight max-w-[100px]" style={{ color: "#475569" }}>{subLabel}</p>
                        </div>
                      </div>
                      {/* Row 2: achievement stickers */}
                      {shareCardStickers.length > 0 && (
                        <div className="flex justify-start gap-2 flex-wrap min-w-0 pt-1 items-center">
                          {(shareCardStickers as AchievementId[]).slice(0, 3).map((id, index) => {
                            const isDeselecting = shareCardDeselectingSlot === index;
                            const isAdding = shareCardAddingSlot === index;
                            return (
                              <div
                                key={id}
                                className={`origin-center ${isDeselecting ? "share-card-sticker-pop-out" : isAdding ? "share-card-sticker-pop-in" : ""}`}
                              >
                                <AchievementSticker achievementId={id} unlocked size="sm" showName={false} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* CTA: choose metric, add achievements, then send */}
                <div className="space-y-3 mb-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-2">Show on card</p>
                    <div className="flex flex-wrap gap-2">
                      {(["smart", "grit", "build", "mts", "ats"] as const).map((dim) => {
                        const isSelected = (appProfile?.share_card_metric === "smart" || appProfile?.share_card_metric === "grit" || appProfile?.share_card_metric === "build" || appProfile?.share_card_metric === "mts" || appProfile?.share_card_metric === "ats")
                          ? appProfile?.share_card_metric === dim
                          : dim === "grit";
                        const noAtsYet = dim === "ats" && latestAtsScoreResolved == null;
                        const label = dim === "mts" ? "Final" : dim === "ats" ? "ATS" : dim.charAt(0).toUpperCase() + dim.slice(1);
                        return (
                          <button
                            key={dim}
                            type="button"
                            disabled={noAtsYet}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (noAtsYet) return;
                              hapticLight();
                              const previous = appProfile?.share_card_metric ?? null;
                              setAppProfile((prev) => prev ? { ...prev, share_card_metric: dim } : prev);
                              saveProfile({ share_card_metric: dim }).then((ok) => {
                                if (!ok) setAppProfile((p) => p ? { ...p, share_card_metric: previous } : p);
                              });
                            }}
                            className="px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: isSelected ? theme.primary : "var(--ut-surface-raised)",
                              color: isSelected ? (theme.primaryContrast ?? "#0f172a") : "var(--m-text-3)",
                              border: isSelected ? "none" : "1px solid var(--ut-border)",
                            }}
                            title={noAtsYet ? "Run an ATS scan in Review to show ATS on your card" : undefined}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Add achievements to card */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Add to card:</span>
                    <div className="flex gap-2 items-center min-h-[48px]">
                      {[0, 1, 2].map((slot) => {
                        const id = shareCardAchievements[slot];
                        const isDeselecting = shareCardDeselectingSlot === slot;
                        const isAdding = shareCardAddingSlot === slot;
                        return id ? (
                          <button
                            key={`${slot}-${id}`}
                            type="button"
                            disabled={shareCardDeselectingSlot !== null}
                            onClick={() => {
                              if (shareCardDeselectingSlot !== null) return;
                              hapticLight();
                              setShareCardDeselectingSlot(slot);
                            }}
                            onAnimationEnd={(e) => {
                              if (isDeselecting) {
                                const next = shareCardAchievements.filter((_, i) => i !== slot);
                                setAppProfile((prev) => (prev ? { ...prev, share_card_achievements: next } : prev));
                                setShareCardDeselectingSlot(null);
                                if (localStorage.getItem("dilly_auth_token")) {
                                  dilly.fetch(`/profile`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ share_card_achievements: next }),
                                  }).catch(() => toast("Couldn't update card", "error"));
                                }
                              }
                              if (isAdding && ((e as { propertyName?: string }).propertyName === "transform" || (e as { propertyName?: string }).propertyName === "opacity")) {
                                setShareCardAddingSlot(null);
                              }
                            }}
                            className={`shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400 origin-center min-h-[48px] min-w-[48px] flex items-center justify-center ${
                              isDeselecting ? "share-card-sticker-pop-out" : isAdding ? "share-card-sticker-pop-in" : ""
                            } disabled:pointer-events-none disabled:opacity-70`}
                            aria-label={isDeselecting ? undefined : `Remove ${id} from card`}
                          >
                            <AchievementSticker achievementId={id as AchievementId} unlocked size="sm" showName={false} />
                          </button>
                        ) : (
                          <button
                            key={`empty-${slot}`}
                            type="button"
                            onClick={() => { hapticLight(); setAchievementPickerSlot(slot as 0 | 1 | 2); }}
                            disabled={shareCardDeselectingSlot !== null}
                            className="w-12 h-12 shrink-0 rounded-full border-2 border-dashed border-slate-500/60 flex items-center justify-center text-slate-500/60 hover:border-slate-400 hover:text-slate-400 transition-colors min-h-[44px] min-w-[44px] disabled:opacity-60 disabled:pointer-events-none"
                            aria-label="Add achievement to card"
                          >
                            <span className="text-lg leading-none">+</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Picker modal */}
                  {achievementPickerSlot !== null && typeof document !== "undefined" && createPortal(
                    <div
                      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 ${achievementPickerClosing ? "share-card-picker-backdrop-out" : "share-card-picker-backdrop-in"}`}
                      onClick={() => !achievementPickerClosing && setAchievementPickerClosing(true)}
                      aria-modal="true"
                      role="dialog"
                      aria-label="Choose achievement for card"
                    >
                      <div
                        className={`bg-slate-800 rounded-xl p-4 max-h-[70vh] overflow-y-auto w-full max-w-sm border border-slate-600 ${achievementPickerClosing ? "share-card-picker-panel-out" : "share-card-picker-panel-in"}`}
                        onClick={(e) => e.stopPropagation()}
                        onAnimationEnd={(e) => {
                          if (!achievementPickerClosing || e.target !== e.currentTarget) return;
                          setAchievementPickerSlot(null);
                          setAchievementPickerClosing(false);
                        }}
                      >
                        <p className="text-sm font-medium text-slate-200 mb-3">Pick an achievement for your card</p>
                        <div className="flex flex-wrap gap-2">
                          {ACHIEVEMENT_IDS.filter((aid) => isUnlocked(aid, achievements)).map((aid) => {
                            const inOtherSlot = shareCardAchievements.some((_, i) => i !== achievementPickerSlot && shareCardAchievements[i] === aid);
                            return (
                              <button
                                key={aid}
                                type="button"
                                disabled={inOtherSlot}
                                onClick={() => {
                                  if (inOtherSlot) return;
                                  const slot = achievementPickerSlot!;
                                  const arr = [shareCardAchievements[0], shareCardAchievements[1], shareCardAchievements[2]];
                                  arr[slot] = aid;
                                  const next = arr.filter(Boolean) as string[];
                                  setShareCardAddingSlot(slot);
                                  setAppProfile((prev) => (prev ? { ...prev, share_card_achievements: next } : prev));
                                  setAchievementPickerClosing(true);
                                  if (localStorage.getItem("dilly_auth_token")) {
                                    dilly.fetch(`/profile`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ share_card_achievements: next }),
                                    }).catch(() => toast("Couldn't update card", "error"));
                                  }
                                }}
                                className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400 disabled:opacity-50 disabled:pointer-events-none"
                              >
                                <AchievementSticker achievementId={aid} unlocked size="sm" showName={false} />
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => !achievementPickerClosing && setAchievementPickerClosing(true)}
                          className="mt-3 w-full py-2 text-sm font-medium text-slate-400 hover:text-slate-200 border border-slate-600 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>,
                    document.body
                  )}
                  {typeof navigator !== "undefined" && navigator.share ? (
                    <>
                      <button
                        type="button"
                        disabled={shareImagePreparing}
                        className="w-full min-h-[44px] font-semibold text-sm rounded-lg transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-55 disabled:pointer-events-none"
                        style={{ background: "var(--blue)", color: "#fff" }}
                        onClick={async () => {
                          hapticMedium();
                          const url = appProfile?.profile_slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${appProfile.profile_slug}` : "";
                          const shareText = (topPercentileHeadline(displayAudit) || oneLineSummary(displayAudit) || "I got my resume scored on Dilly") + " \u2014 get yours too." + (url ? ` ${url}` : "");
                          const sharePayload = {
                            title: "My Dilly Resume Score",
                            text: shareText,
                            url: url || undefined,
                          } as const;
                          const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
                          const isAppleTouch =
                            /iPad|iPhone|iPod/.test(ua) ||
                            (typeof navigator !== "undefined" &&
                              navigator.platform === "MacIntel" &&
                              (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints > 1);
                          const isSafari =
                            /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg\//i.test(ua);
                          const useWebKitDeferredImageShare = isAppleTouch || isSafari;
                          let shareTextPrimed = false;
                          const onShareFail = async (e: unknown) => {
                            const name =
                              e instanceof DOMException ? e.name : (e as { name?: string })?.name ?? "";
                            if (name === "AbortError") return;
                            if (shareTextPrimed || copyTextSync(shareText)) {
                              hapticLight();
                              toast("Copied your message \u2014 paste to share.", "success");
                              return;
                            }
                            try {
                              await navigator.clipboard.writeText(shareText);
                              hapticLight();
                              toast("Copied your message \u2014 paste to share.", "success");
                            } catch {
                              toast(
                                "Couldn't copy automatically \u2014 tap Copy link to send to friends or Download below.",
                                "info"
                              );
                            }
                          };
                          if (useWebKitDeferredImageShare) {
                            setShareImagePreparing(true);
                            try {
                              const captured = await captureShareCardAsPngFile();
                              if (captured?.file) {
                                setShareImageSheet({
                                  file: captured.file,
                                  shareText,
                                  title: sharePayload.title,
                                });
                                toast("Tap Share card to send the image", "info");
                                return;
                              }
                            } catch {
                              /* fall through to text share */
                            } finally {
                              setShareImagePreparing(false);
                            }
                            toast("Couldn't capture the card image \u2014 sharing your message and link only.", "info");
                            try {
                              await navigator.share({ text: shareText });
                              hapticSuccess();
                              setCopyFeedback("shared");
                              setTimeout(() => setCopyFeedback(null), 2000);
                              toast("Sent!", "success");
                            } catch (e) {
                              const n =
                                e instanceof DOMException ? e.name : (e as { name?: string })?.name ?? "";
                              if (n !== "AbortError") await onShareFail(e);
                            }
                            return;
                          }
                          setShareImagePreparing(true);
                          try {
                            const captured = await captureShareCardAsPngFile();
                            if (captured?.file) {
                              const canShareFile = navigatorCanSharePngFile(captured.file);
                              if (canShareFile) {
                                try {
                                  await navigator.share({
                                    title: sharePayload.title,
                                    text: shareText,
                                    files: [captured.file],
                                  });
                                  hapticSuccess();
                                  setCopyFeedback("shared");
                                  setTimeout(() => setCopyFeedback(null), 2000);
                                  toast("Sent!", "success");
                                  return;
                                } catch (e) {
                                  const n =
                                    e instanceof DOMException ? e.name : (e as { name?: string })?.name ?? "";
                                  if (n === "AbortError") return;
                                }
                              }
                              setShareImageSheet({
                                file: captured.file,
                                shareText,
                                title: sharePayload.title,
                              });
                              toast(
                                canShareFile
                                  ? "Tap Share card to send the image with your message."
                                  : "This browser usually can't attach the image in one step \u2014 tap Share card to copy or download it, then add it to your message.",
                                "info",
                              );
                              return;
                            }
                            toast("Couldn't capture the card image \u2014 sharing your message and link only.", "info");
                            shareTextPrimed = copyTextSync(shareText);
                            await navigator.share(sharePayload);
                            hapticSuccess();
                            setCopyFeedback("shared");
                            setTimeout(() => setCopyFeedback(null), 2000);
                            toast("Sent!", "success");
                          } catch (e) {
                            await onShareFail(e);
                          } finally {
                            setShareImagePreparing(false);
                          }
                        }}
                      >
                        {shareImagePreparing ? "Preparing card\u2026" : "Send to friends"}
                      </button>
                      {shareImageSheet
                        ? createPortal(
                            <div
                              role="dialog"
                              aria-modal="true"
                              aria-label="Share score card"
                              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 p-4"
                              onClick={() => setShareImageSheet(null)}
                            >
                              <div
                                className="w-full max-w-[360px] rounded-t-[20px] sm:rounded-[20px] border p-4 shadow-xl"
                                style={{ background: "var(--s2)", borderColor: "var(--b1)" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <p className="text-sm font-semibold mb-1" style={{ color: "var(--t1)" }}>Share your score card</p>
                                <p className="text-xs mb-4 leading-relaxed" style={{ color: "var(--t3)" }}>
                                  Tries to attach the card image. On desktop, you may need to paste the copied image into your message after the share sheet opens.
                                </p>
                                <button
                                  type="button"
                                  className="w-full min-h-[44px] font-semibold text-sm rounded-lg transition-opacity hover:opacity-90 active:opacity-80 mb-2"
                                  style={{ background: "var(--blue)", color: "#fff" }}
                                  onClick={async () => {
                                    const sheet = shareImageSheet;
                                    if (!sheet) return;
                                    const openTextShare = async () => {
                                      try {
                                        await navigator.share({
                                          title: sheet.title,
                                          text: sheet.shareText,
                                        });
                                        hapticSuccess();
                                        setCopyFeedback("shared");
                                        setTimeout(() => setCopyFeedback(null), 2000);
                                        toast("Sent!", "success");
                                      } catch (e2) {
                                        const n2 =
                                          e2 instanceof DOMException ? e2.name : (e2 as { name?: string })?.name ?? "";
                                        if (n2 !== "AbortError") {
                                          hapticLight();
                                          toast("Paste the image from your clipboard into your message.", "info");
                                        }
                                      }
                                    };
                                    try {
                                      await navigator.share({
                                        title: sheet.title,
                                        text: sheet.shareText,
                                        files: [sheet.file],
                                      });
                                      hapticSuccess();
                                      setCopyFeedback("shared");
                                      setTimeout(() => setCopyFeedback(null), 2000);
                                      toast("Sent!", "success");
                                    } catch (e) {
                                      const n = e instanceof DOMException ? e.name : (e as { name?: string })?.name ?? "";
                                      if (n === "AbortError") {
                                        setShareImageSheet(null);
                                        return;
                                      }
                                      try {
                                        if (typeof ClipboardItem !== "undefined") {
                                          await navigator.clipboard.write([
                                            new ClipboardItem({ [sheet.file.type]: sheet.file }),
                                          ]);
                                          hapticLight();
                                          toast("Image copied \u2014 opening share for your text; paste the image into the draft.", "info");
                                          await openTextShare();
                                        } else {
                                          throw new Error("no clipboard item");
                                        }
                                      } catch {
                                        const ou = URL.createObjectURL(sheet.file);
                                        const a = document.createElement("a");
                                        a.href = ou;
                                        a.download = "dilly-score-card.png";
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(ou);
                                        toast("Card saved \u2014 opening share for your text; attach the downloaded image.", "info");
                                        await openTextShare();
                                      }
                                    }
                                    setShareImageSheet(null);
                                  }}
                                >
                                  Share card
                                </button>
                                <button
                                  type="button"
                                  className="w-full min-h-[40px] text-sm font-medium rounded-lg transition-opacity hover:opacity-90"
                                  style={{ color: "var(--t3)" }}
                                  onClick={() => setShareImageSheet(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>,
                            document.body,
                          )
                        : null}
                    </>
                  ) : appProfile?.profile_slug ? (
                    <button
                      type="button"
                      className="w-full min-h-[44px] font-semibold text-sm rounded-lg transition-opacity hover:opacity-90 active:opacity-80"
                      style={{ background: "var(--blue)", color: "#fff" }}
                      onClick={() => {
                        const url = typeof window !== "undefined" ? `${window.location.origin}/p/${appProfile?.profile_slug}` : "";
                        navigator.clipboard.writeText(url);
                        hapticSuccess();
                        setCopyFeedback("report-link");
                        setTimeout(() => setCopyFeedback(null), 2000);
                        toast("Link copied \u2014 paste in a text to your friends!", "success");
                      }}
                    >
                      {copyFeedback === "report-link" ? "Copied!" : "Copy link to send to friends"}
                    </button>
                  ) : null}
                </div>
                {/* Secondary: LinkedIn, download, etc. */}
                <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>Or share elsewhere</p>
                <p className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>Snapshot = full score (all 3 dimensions + findings). Share card above = one metric for quick share.</p>
                <div className="flex flex-wrap gap-2 items-center [&>button]:min-h-[44px] [&>button]:min-w-0 [&>button]:flex-1 [&>button]:sm:flex-initial [&>button.copy-link-icon-btn]:flex-initial [&>button.copy-link-icon-btn]:flex-none">
                  <button type="button" className="text-xs font-medium rounded-lg px-4 py-2 min-h-[44px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s3)", color: "var(--t2)" }} onClick={async () => {
                    try {
                      const caption = (topPercentileHeadline(displayAudit) || oneLineSummary(displayAudit)) + " \u00B7 Dilly Careers \u00B7 trydilly.com";
                      const el = shareCardRef.current;
                      if (el && typeof html2canvas !== "undefined") {
                        const canvas = await html2canvas(el, {
                          scale: 2,
                          backgroundColor: "#ebe9e6",
                          useCORS: true,
                          logging: false,
                        });
                        const dataUrl = canvas.toDataURL("image/png");
                        const a = document.createElement("a");
                        a.href = dataUrl;
                        a.download = "dilly-score-card.png";
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      } else {
                        const svg = generateBadgeSvg(displayAudit, "grit", {
                          customTagline: appProfile?.custom_tagline ?? null,
                          selectedAchievements: appProfile?.share_card_achievements ?? [],
                        });
                        downloadSvg(svg, "dilly-score-card.svg");
                      }
                      navigator.clipboard.writeText(caption);
                      hapticSuccess();
                      setCopyFeedback("shared");
                      window.location.href = "https://www.linkedin.com/feed/";
                    } catch (e) {
                      if ((e as Error)?.name === "AbortError") return;
                      setError(e instanceof Error ? e.message : "Share failed");
                      setTimeout(() => setError(null), 4000);
                    }
                  }}>Share to LinkedIn</button>
                  <button type="button" className="text-xs font-medium rounded-lg px-4 py-2 min-h-[44px] flex items-center justify-center gap-2 transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s3)", color: "var(--t2)" }} onClick={() => {
                    try {
                      const shareMetric = (appProfile?.share_card_metric === "smart" || appProfile?.share_card_metric === "grit" || appProfile?.share_card_metric === "build" || appProfile?.share_card_metric === "mts" || appProfile?.share_card_metric === "ats")
                        ? appProfile.share_card_metric
                        : "grit";
                      const svg = generateShareCardSvg(displayAudit, {
                        shareCardMetric: shareMetric,
                        selectedAchievements: appProfile?.share_card_achievements ?? [],
                        atsScore: latestAtsScoreResolved,
                        atsPeerPercentile: atsPeerPercentile ?? null,
                      });
                      downloadSvg(svg, "dilly-snapshot.svg");
                      setDownloadFeedback("snapshot");
                      setTimeout(() => setDownloadFeedback(null), 1500);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Download failed");
                      setTimeout(() => setError(null), 4000);
                    }
                  }}>{downloadFeedback === "snapshot" ? <><DownloadDoneIcon size={16} state={true} color="currentColor" /> Downloaded</> : "Download Snapshot"}</button>
                  {appProfile?.profile_slug && (
                    <button
                      type="button"
                      onClick={() => {
                        const url = typeof window !== "undefined" ? `${window.location.origin}/p/${appProfile?.profile_slug}` : "";
                        navigator.clipboard.writeText(url);
                        hapticSuccess();
                        setCopyFeedback("report-link");
                        setTimeout(() => setCopyFeedback(null), 2000);
                        toast("Link copied", "success");
                      }}
                      className="copy-link-icon-btn inline-flex items-center justify-center rounded-lg w-[44px] h-[44px] shrink-0 transition-opacity hover:opacity-90 active:opacity-80"
                      style={{
                        background: copyFeedback === "report-link" ? "var(--gdim)" : "var(--s3)",
                      }}
                      title={copyFeedback === "report-link" ? "Copied" : "Copy link"}
                      aria-label={copyFeedback === "report-link" ? "Copied" : "Copy link"}
                    >
                      <img src="/copy-link-icon.png" alt="" className="w-5 h-5 object-contain" aria-hidden />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-center mt-4" style={{ color: "var(--t3)" }}>Friends can get their own score free \u2014 trydilly.com</p>
              </div>
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
                          <p className="text-slate-500 text-[10px] mt-0.5">Top {g.topPct}% now \u00B7 goal Top 25%</p>
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
                    <span className="text-slate-400 text-sm mt-2 inline-block">Loading your previous audit\u2026</span>
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
                  <p className="text-slate-400 text-xs mb-3">One link\u2014yours to customize. Scores, proof, your tagline and bio. Add it to your resume.</p>
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
