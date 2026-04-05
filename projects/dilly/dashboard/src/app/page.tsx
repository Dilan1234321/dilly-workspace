"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DILLY_BASE_THEME } from "@/lib/schools";
import { ProfilePhotoCrop } from "@/components/ProfilePhotoCrop";
import { PRE_PROFESSIONAL_TRACKS } from "@/lib/trackDefinitions";
import { hapticLight } from "@/lib/haptics";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { VoiceOverlay } from "@/components/VoiceOverlay";
import { LoadingScreen } from "@/components/ui/loading-screen";
import {
  GOALS_ALL,
  readLastAtsScoreCache,
  getDillyVoiceEmptyGreeting,
  profilePhotoCacheKey,
} from "@/lib/dillyUtils";
import { isUnlocked } from "@/lib/achievements";
import { dilly } from "@/lib/dilly";
import { VOICE_AVATAR_OPTIONS, getVoiceAvatarUrl } from "@/lib/voiceAvatars";
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_BORDER_COLORS,
  getAchievementGlyphPath,
  getStickerSheetIds,
  type AchievementId,
} from "@/lib/achievements";
import { cn } from "@/lib/utils";
import { useNavigation } from "@/contexts/NavigationContext";
import type { MainAppTabKey } from "@/components/career-center";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import html2canvas from "html2canvas";
import type { AuditV2 } from "@/types/dilly";

import { ScoreTab } from "@/components/score/ScoreTab";
import { MemoryTab } from "@/components/memory/MemoryTab";
import { ActionsTab } from "@/components/actions/ActionsTab";
import { VoiceHistoryTab } from "@/components/voice/VoiceHistoryTab";
import { CertificationsTab } from "@/components/certifications/CertificationsTab";
import { CareerPlaybookTab } from "@/components/career-playbook/CareerPlaybookTab";
import SettingsPage from "@/app/settings/page";
import ProfileDetailsPage from "@/app/profile/details/page";
import ResumeEditPage from "@/app/resume-edit/page";
import { ReadyCheckTab } from "@/components/ready-check/ReadyCheckTab";
import { VoiceTab } from "@/features/voice/VoiceTab";
import { CenterTab } from "@/features/center/CenterTab";
import { CalendarTab } from "@/features/calendar/CalendarTab";
import { ResourcesTab } from "@/features/resources/ResourcesTab";
import { RankTab } from "@/features/rank/RankTab";
import { HiringTab } from "@/features/hiring/HiringTab";
import { PracticeTab } from "@/features/practice/PracticeTab";
import {
  BottomNav,
  CareerCenterMinibar,
  JobsTabIcon,
  RankTabIcon,
  CareerCenterTabIcon,
} from "@/components/career-center";

// ── Extracted hooks ──────────────────────────────────────────────────────────
import { useProfileActions } from "@/hooks/useProfileActions";
import { useAuditActions } from "@/hooks/useAuditActions";
import { useVoiceActions, RESUME_DEEP_DIVE_PROMPT } from "@/hooks/useVoiceActions";
import { useAppLifecycle } from "@/hooks/useAppLifecycle";
import { useVoiceLifecycle } from "@/hooks/useVoiceLifecycle";
import { useDeepLinks } from "@/hooks/useDeepLinks";
import { useDataFetching } from "@/hooks/useDataFetching";

/** Validate LinkedIn profile URL. Accepts linkedin.com/in/username format. */
function _isValidLinkedInUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  return /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[\w\-]+\/?$/i.test(trimmed);
}

export default function DashboardPage() {
  return <Dashboard />;
}

function Dashboard() {
  const router = useRouter();
  const {
    state: { mainAppTab, reviewSubView, getHiredSubTab: _getHiredSubTab, readyCheckCompany, jobsPanelInitialFilter: _jobsPanelInitialFilter },
    setMainAppTab, setReviewSubView, setGetHiredSubTab: _setGetHiredSubTab, setReadyCheckCompany, setJobsPanelInitialFilter: _setJobsPanelInitialFilter,
  } = useNavigation();
  const {
    user, setUser: _setUser,
    authLoading, setAuthLoading: _setAuthLoading,
    allowMainApp,
    appProfile, setAppProfile,
    school,
  } = useAppContext();
  const {
    audit,
    savedAuditForCenter,
    viewingAudit,
    auditHistory,
    atsScoreHistory,
  } = useAuditScore();
  const {
    voiceConvos, setVoiceConvos,
    openVoiceConvIds,
    activeVoiceConvId,
    voiceAvatarIndex,
    voiceMessages,
    voiceMockInterviewSession,
    voiceInput, setVoiceInput,
    voiceLoading,
    voiceStreamingText,
    voiceFollowUpSuggestions,
    lastAuditTsOnVoiceEnter, setLastAuditTsOnVoiceEnter,
    voiceMemory,
    voiceApplicationsPreview: _voiceApplicationsPreview,
    voiceOverlayOpen, setVoiceOverlayOpen,
    voiceBadgeLastSeen, setVoiceBadgeLastSeen,
    pendingVoicePrompt: _pendingVoicePrompt,
    voiceAvatarPickerOpen, setVoiceAvatarPickerOpen,
    setVoiceAvatarIndex,
    setVoiceFollowUpSuggestions,
    setVoiceMessageQueue,
  } = useVoice();

  // ── Remaining local state (render-only or prop-passing) ─────────────────
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [_error, setError] = useState<string | null>(null);
  const [_pdfError, _setPdfError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<"one-line" | "suggested" | "report-link" | "top-pct" | "shared" | null>(null);
  const [_reportShareUrl, _setReportShareUrl] = useState<string | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<"snapshot" | "pdf" | null>(null);
  const [_applicationTarget, setApplicationTarget] = useState<string>("");
  const latestAuditRef = useRef<AuditV2 | null>(null);
  const voiceEndRef = useRef<HTMLDivElement>(null);
  const voiceSendRef = useRef<((text?: string) => void) | null>(null);
  const voiceOverlayActionsRef = useRef<{ startNewChat: () => void; openChat: (id: string) => void; deleteChat: (id: string) => void; closeTab: (id: string) => void } | null>(null);
  const latestVoiceConvIdRef = useRef<string | null>(null);
  const voiceMessagesRef = useRef(voiceMessages);
  voiceMessagesRef.current = voiceMessages;
  const shareCardRef = useRef<HTMLDivElement>(null);

  // ── Extracted hooks ─────────────────────────────────────────────────────
  const { saveProfile, profileSaveError: _profileSaveError, setProfileSaveError: _setProfileSaveError } = useProfileActions();

  const {
    navigateToAuditReport,
    replaceToAuditReport,
    goToStandaloneFullAuditReport,
  } = useAuditActions(latestAuditRef);

  const {
    currentCohortPulse, setCurrentCohortPulse,
    habits,
    proactiveLines,
    proactiveNudges,
    recommendedJobs: _recommendedJobs,
    jobsLoading: _jobsLoading,
    cohortStats: _cohortStats,
    progressExplainer: _progressExplainer,
    progressExplainerLoading: _progressExplainerLoading,
  } = useDataFetching({ latestAuditRef, setApplicationTarget });

  const {
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
  } = useVoiceActions({ proactiveLines, proactiveNudges, habits });

  const {
    isOffline,
    profilePhotoUrl, setProfilePhotoUrl,
    profilePhotoUploading, setProfilePhotoUploading,
    photoCropImageSrc, setPhotoCropImageSrc,
    photoInputRef,
    signOut: _signOut,
  } = useAppLifecycle({ setApplicationTarget });

  const {
    voiceStarterSuggestions,
    voiceScoresForChat,
    voiceMemoryLengthAtVoiceEnterRef,
  } = useVoiceLifecycle({
    latestAuditRef,
    voiceEndRef,
    voiceSendRef,
    latestVoiceConvIdRef,
    openVoiceWithNewChatRef,
    allowAutoSendPendingRef,
    voiceAuditReportIdRef,
    voiceCertLandingRef,
    proactiveNudges,
  });

  const {
    stickerSheetOpen, setStickerSheetOpen,
    fromSettingsWhenEditingProfileRef: _fromSettingsWhenEditingProfileRef,
    wantsNewAudit, setWantsNewAudit,
    pasteMode, setPasteMode,
  } = useDeepLinks({
    replaceToAuditReport,
    voiceAuditReportIdRef,
    voiceCertLandingRef,
  });

  // ── Remaining local state: editing, insights, etc. ──────────────────────
  const [editingProfile, setEditingProfile] = useState(false);
  const [dismissedNoticedId, setDismissedNoticedId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMajors, setEditMajors] = useState<string[]>([]);
  const [editMinors, setEditMinors] = useState<string[]>([]);
  const [editTrack, setEditTrack] = useState<string>("");
  const [editPreProfessional, setEditPreProfessional] = useState(false);
  const [editCareerGoal, setEditCareerGoal] = useState("");
  const [editJobLocations, setEditJobLocations] = useState<string[]>([]);
  const [editJobLocationScope, setEditJobLocationScope] = useState<"specific" | "domestic" | "international" | null>(null);
  const [editLinkedIn, setEditLinkedIn] = useState("");
  const [editProfileSaving, setEditProfileSaving] = useState(false);
  const [_primaryGoalSaving, _setPrimaryGoalSaving] = useState(false);
  const [_primaryGoalInput, setPrimaryGoalInput] = useState("");
  const [_primaryGoalEditing, _setPrimaryGoalEditing] = useState(false);
  const [_appTargetLabelEditing, _setAppTargetLabelEditing] = useState(false);
  const [_appTargetLabelInput, setAppTargetLabelInput] = useState("");
  const [_appTargetLabelSaving, _setAppTargetLabelSaving] = useState(false);
  const [centerMoreOpen, setCenterMoreOpen] = useState(false);

  // Insights panel state
  const [interviewPrepEvidence, setInterviewPrepEvidence] = useState<{ dimensions: { name: string; question: string; strategy: string; script: string }[] } | null>(null);
  const [interviewPrepEvidenceLoading, setInterviewPrepEvidenceLoading] = useState(false);
  const [interviewPrepEvidenceOpen, setInterviewPrepEvidenceOpen] = useState(false);
  const [gapScanOpen, setGapScanOpen] = useState(false);
  const [gapScanResult, setGapScanResult] = useState<{ gaps: { gap: string; dimension: string; severity: string; fix: string; impact: string }[]; overall_readiness: string; readiness_summary: string } | null>(null);
  const [gapScanLoading, setGapScanLoading] = useState(false);
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);
  const [coverLetterResult, setCoverLetterResult] = useState<{ cover_openers: string[]; outreach_hooks: string[] } | null>(null);
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);

  // Share card state
  const [achievementPickerSlot, setAchievementPickerSlot] = useState<0 | 1 | 2 | null>(null);
  const [achievementPickerClosing, setAchievementPickerClosing] = useState(false);
  const [shareCardDeselectingSlot, setShareCardDeselectingSlot] = useState<number | null>(null);
  const [shareCardAddingSlot, setShareCardAddingSlot] = useState<number | null>(null);
  const [shareImageSheet, setShareImageSheet] = useState<{ file: File; shareText: string; title: string } | null>(null);
  const [shareImagePreparing, setShareImagePreparing] = useState(false);

  // ── Sync effects that reference local state ──────────────────────────────
  useEffect(() => {
    const val = appProfile?.career_goal?.trim() || (appProfile?.goals?.length ? (GOALS_ALL.find((o) => o.key === appProfile!.goals![0])?.label ?? appProfile!.goals![0]) : "") || "";
    setPrimaryGoalInput(val);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [appProfile?.career_goal, appProfile?.goals]);

  useEffect(() => {
    setAppTargetLabelInput(appProfile?.application_target_label?.trim() || "");
  }, [appProfile?.application_target_label]);

  // Open Edit Portfolio when coming from Settings (?edit=profile)
  useEffect(() => {
    const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (searchParams?.get("edit") !== "profile" || !user?.subscribed || !appProfile) return;
    setEditName(appProfile.name || "");
    setEditMajors(appProfile.majors?.length ? [...appProfile.majors] : (appProfile.major ? [appProfile.major] : [""]));
    setEditMinors(appProfile.minors?.length ? [...appProfile.minors] : []);
    const trackVal = appProfile.track || "";
    setEditTrack(PRE_PROFESSIONAL_TRACKS.some((t) => t.value === trackVal) ? trackVal : "");
    setEditPreProfessional(!!appProfile.preProfessional);
    const existing = appProfile.job_locations || [];
    if (school?.city && school?.state && !existing.some((c) => c.toLowerCase().includes(school!.city!.toLowerCase()))) {
      setEditJobLocations([`${school.city}, ${school.state}`, ...existing]);
    } else {
      setEditJobLocations([...existing]);
    }
    setEditJobLocationScope((appProfile.job_location_scope as "specific" | "domestic" | "international" | null) || null);
    setEditLinkedIn(appProfile.linkedin_url?.trim() || "");
    setEditingProfile(true);
    setMainAppTab("center");
    router.replace("/");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [user?.subscribed, appProfile, school]);

  // ── Insight handlers ─────────────────────────────────────────────────────
  const handleGapScan = async () => {
    setCoverLetterOpen(false);
    setInterviewPrepEvidenceOpen(false);
    setGapScanOpen(true);
    setGapScanLoading(true);
    try {
      const res = await dilly.fetch(`/voice/gap-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: buildVoiceContext() }),
      });
      const data = res.ok ? await res.json() : null;
      setGapScanResult(data || null);
    } catch {
      setGapScanResult({ gaps: [{ gap: "Gap scan unavailable. Try Again.", dimension: "", severity: "minor", fix: "", impact: "" }], overall_readiness: "not_yet", readiness_summary: "" });
    } finally {
      setGapScanLoading(false);
    }
  };

  const handleInterviewPrepFromEvidence = async () => {
    setGapScanOpen(false);
    setCoverLetterOpen(false);
    setInterviewPrepEvidenceOpen(true);
    setInterviewPrepEvidenceLoading(true);
    setInterviewPrepEvidence(null);
    const displayAudit = viewingAudit ?? audit ?? savedAuditForCenter;
    if (!displayAudit) {
      setInterviewPrepEvidenceOpen(false);
      setInterviewPrepEvidenceLoading(false);
      return;
    }
    try {
      const res = await dilly.fetch(`/interview-prep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit: displayAudit }),
      });
      const data = res.ok ? await res.json() : null;
      setInterviewPrepEvidence(data && Array.isArray(data?.dimensions) ? { dimensions: data.dimensions } : { dimensions: [] });
    } catch {
      setInterviewPrepEvidence({ dimensions: [] });
    } finally {
      setInterviewPrepEvidenceLoading(false);
    }
  };

  const handleCoverLetter = async () => {
    setGapScanOpen(false);
    setInterviewPrepEvidenceOpen(false);
    setCoverLetterOpen(true);
    setCoverLetterLoading(true);
    setCoverLetterResult(null);
    const displayAudit = viewingAudit ?? audit ?? savedAuditForCenter;
    try {
      const res = await dilly.fetch(`/generate-lines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit: displayAudit ?? {}, target: appProfile?.application_target ?? "" }),
      });
      const data = res.ok ? await res.json() : null;
      setCoverLetterResult(data || { cover_openers: [], outreach_hooks: [] });
    } catch {
      setCoverLetterResult({ cover_openers: [], outreach_hooks: [] });
    } finally {
      setCoverLetterLoading(false);
    }
  };

  // ── Computed values ──────────────────────────────────────────────────────
  const latestAtsScoreResolved = useMemo(() => {
    const row = atsScoreHistory[0];
    if (row != null && row.score != null && !Number.isNaN(Number(row.score))) {
      return Math.round(Number(row.score));
    }
    const forAudit = viewingAudit ?? latestAuditRef.current ?? audit ?? savedAuditForCenter;
    const c = readLastAtsScoreCache();
    if (!c) return null;
    const aid = forAudit?.id?.trim();
    if (aid && c.audit_id != null && String(c.audit_id).trim() !== aid) return null;
    return c.score;
  }, [atsScoreHistory, viewingAudit, audit, savedAuditForCenter]);

  const captureShareCardAsPngFile = useCallback(async (): Promise<{ file: File; canvas: HTMLCanvasElement } | null> => {
    const el = shareCardRef.current;
    if (!el) return null;
    try {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ebe9e6", useCORS: true, logging: false });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png", 1));
      if (!blob) return null;
      const file = new File([blob], "dilly-score-card.png", { type: "image/png" });
      return { file, canvas };
    } catch { return null; }
  }, []);

  const theme = school?.theme ?? DILLY_BASE_THEME;
  const achievements = appProfile?.achievements ?? {};
  const shareCardAchievements = appProfile?.share_card_achievements ?? [];

  const toggleStickerShareCard = (id: string) => {
    if (!localStorage.getItem("dilly_auth_token") || !isUnlocked(id as AchievementId, achievements)) return;
    hapticLight();
    let next = [...shareCardAchievements];
    const idx = next.indexOf(id);
    if (idx >= 0) { next = next.filter((x) => x !== id); }
    else if (next.length < 3) { next = [...next, id]; }
    else { next = [next[1], next[2], id]; }
    dilly.fetch(`/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ share_card_achievements: next }),
    }).then(() => {
      setAppProfile((prev) => (prev ? { ...prev, share_card_achievements: next } : prev));
    });
  };

  // ── Early returns ───────────────────────────────────────────────────────
  const mainAppBlocked = !allowMainApp;

  if (!user) {
    if (authLoading) return <LoadingScreen variant="career-center" message="Loading\u2026" />;
    return null;
  }

  if (mainAppBlocked) return <LoadingScreen variant="career-center" message="Loading your career center\u2026" />;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden file input for profile photo */}
      {user?.subscribed && mainAppTab === "center" && (
        <input
          id="profile-photo-input"
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file || !user?.email) return;
            e.target.value = "";
            const url = URL.createObjectURL(file);
            setPhotoCropImageSrc(url);
          }}
        />
      )}
      {photoCropImageSrc && (
        <ProfilePhotoCrop
          imageSrc={photoCropImageSrc}
          onComplete={async (blob) => {
            setProfilePhotoUploading(true);
            try {
              const fd = new FormData();
              const file = new File([blob], "profile.jpg", { type: "image/jpeg" });
              fd.append("file", file);
              const res = await dilly.fetch(`/profile/photo`, { method: "POST", body: fd });
              if (res.ok) {
                const photoRes = await dilly.fetch(`/profile/photo`, { cache: "no-store" });
                if (photoRes.ok) {
                  const newBlob = await photoRes.blob();
                  const objUrl = URL.createObjectURL(newBlob);
                  setProfilePhotoUrl((old) => { if (old && old.startsWith("blob:")) URL.revokeObjectURL(old); return objUrl; });
                  const img = new Image();
                  img.onload = () => {
                    try {
                      const canvas = document.createElement("canvas");
                      const size = 128;
                      canvas.width = size; canvas.height = size;
                      const ctx = canvas.getContext("2d");
                      if (ctx && user?.email) {
                        ctx.drawImage(img, 0, 0, size, size);
                        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
                        if (dataUrl.length < 100_000) {
                          localStorage.setItem(profilePhotoCacheKey(user.email), dataUrl);
                        }
                      }
                    } catch { /* ignore */ }
                  };
                  img.src = objUrl;
                }
              }
            } finally {
              setProfilePhotoUploading(false);
              URL.revokeObjectURL(photoCropImageSrc);
              setPhotoCropImageSrc(null);
            }
          }}
          onCancel={() => {
            URL.revokeObjectURL(photoCropImageSrc);
            setPhotoCropImageSrc(null);
          }}
        />
      )}
      {/* Voice avatar picker modal */}
      {voiceAvatarPickerOpen && user?.subscribed && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setVoiceAvatarPickerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Choose your avatar!"
        >
          <div
            className="bg-slate-900 m-rounded-card border border-slate-700/60 shadow-xl max-w-[375px] w-full p-4 animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Choose your avatar!</h3>
              <button type="button" onClick={() => setVoiceAvatarPickerOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors" aria-label="Close">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {VOICE_AVATAR_OPTIONS.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setVoiceAvatarIndex(idx); setVoiceAvatarPickerOpen(false); }}
                  style={{ animationDelay: `${idx * 25}ms` }}
                  className={`voice-avatar-picker-option w-12 h-12 rounded-full overflow-hidden flex items-center justify-center p-1 border-2 transition-colors bg-white ${voiceAvatarIndex === idx ? "border-white ring-2 ring-white/30" : "border-transparent hover:border-slate-500"}`}
                >
                  <img src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    <div className={`m-app ${school?.id === "utampa" ? "school-theme-ut" : ""} app-talent`}>
      {isOffline && (
        <div className="px-4 py-2 text-center text-sm font-medium" style={{ backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#fca5a5" }}>
          You&apos;re offline. Check your connection and try again.
        </div>
      )}
        <>
          {(mainAppTab as string) === "center" ? (<div className="tab-enter"><CenterTab
            latestAuditRef={latestAuditRef}
            shareCardRef={shareCardRef}
            theme={theme}
            profilePhotoUrl={profilePhotoUrl}
            setProfilePhotoUrl={setProfilePhotoUrl}
            profilePhotoUploading={profilePhotoUploading}
            setPhotoCropImageSrc={setPhotoCropImageSrc}
            openVoiceWithNewChat={openVoiceWithNewChat}
            openVoiceFromScreen={openVoiceFromScreen}
            habits={habits}
            currentCohortPulse={currentCohortPulse}
            setCurrentCohortPulse={setCurrentCohortPulse}
            latestAtsScoreResolved={latestAtsScoreResolved}
            saveProfile={saveProfile}
            achievements={achievements}
            shareCardAchievements={shareCardAchievements}
            captureShareCardAsPngFile={captureShareCardAsPngFile}
            goToStandaloneFullAuditReport={goToStandaloneFullAuditReport}
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
            handleGapScan={handleGapScan}
            handleCoverLetter={handleCoverLetter}
            handleInterviewPrepFromEvidence={handleInterviewPrepFromEvidence}
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
            centerMoreOpen={centerMoreOpen}
            setCenterMoreOpen={setCenterMoreOpen}
            dismissedNoticedId={dismissedNoticedId}
            setDismissedNoticedId={setDismissedNoticedId}
            setStickerSheetOpen={setStickerSheetOpen}
            setError={setError}
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
          /></div>) : null}
          {mainAppTab === "hiring" && (<div className="tab-enter"><HiringTab
            file={file}
            setFile={setFile}
            pasteMode={pasteMode}
            setPasteMode={setPasteMode}
            pasteText={pasteText}
            setPasteText={setPasteText}
            wantsNewAudit={wantsNewAudit}
            setWantsNewAudit={setWantsNewAudit}
            openVoiceWithNewChat={openVoiceWithNewChat}
            openVoiceFromScreen={openVoiceFromScreen}
            navigateToAuditReport={navigateToAuditReport}
            goToStandaloneFullAuditReport={goToStandaloneFullAuditReport}
            saveProfile={saveProfile}
            profilePhotoUrl={profilePhotoUrl}
            latestAuditRef={latestAuditRef}
          /></div>)}
          {mainAppTab === "practice" && (<div className="tab-enter"><PracticeTab
            openVoiceWithNewChat={openVoiceWithNewChat}
            openVoiceFromScreen={openVoiceFromScreen}
            profilePhotoUrl={profilePhotoUrl}
            latestAuditRef={latestAuditRef}
          /></div>)}

          {(mainAppTab === "voice" || voiceOverlayOpen) && (
            <div
              className={cn(
                "flex flex-col overflow-hidden min-h-0",
                mainAppTab !== "voice" && voiceOverlayOpen && "absolute left-[-9999px] w-[1px] h-[1px] overflow-hidden invisible"
              )}
              style={mainAppTab === "voice" || !voiceOverlayOpen ? { height: "calc(100vh - 5.5rem)" } : undefined}
              aria-hidden={mainAppTab !== "voice" && voiceOverlayOpen}
            >
            <ErrorBoundary clearVoiceDataEmail={user?.email ?? undefined}>
            <>
            <VoiceTab
              theme={theme}
              profilePhotoUrl={profilePhotoUrl}
              openVoiceWithNewChat={openVoiceWithNewChat}
              endVoiceMockInterviewByUser={endVoiceMockInterviewByUser}
              voiceStarterSuggestions={voiceStarterSuggestions}
              voiceScoresForChat={voiceScoresForChat}
              buildVoiceContext={buildVoiceContext}
              mergeVoiceAutoSavedDeadlines={mergeVoiceAutoSavedDeadlines}
              saveProfile={saveProfile}
              voiceSendRef={voiceSendRef}
              voiceOverlayActionsRef={voiceOverlayActionsRef}
              latestVoiceConvIdRef={latestVoiceConvIdRef}
              voiceEndRef={voiceEndRef}
            />
            </>
            </ErrorBoundary>
            </div>
          )}

          {mainAppTab === "resources" && (<div className="tab-enter">
            <ResourcesTab
              openVoiceWithNewChat={openVoiceWithNewChat}
              openVoiceFromScreen={openVoiceFromScreen}
              profilePhotoUrl={profilePhotoUrl}
              latestAuditRef={latestAuditRef}
              habits={habits}
              proactiveNudges={proactiveNudges}
            />
          </div>)}

          {mainAppTab === "calendar" && (<div className="tab-enter">
            <CalendarTab
              saveProfile={saveProfile}
              openVoiceWithNewChat={openVoiceWithNewChat}
              profilePhotoUrl={profilePhotoUrl}
              latestAuditRef={latestAuditRef}
            />
          </div>)}

          {/* Sticker sheet modal */}
          {stickerSheetOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
              <div className="absolute inset-0 bg-black/50" onClick={() => setStickerSheetOpen(false)} aria-hidden />
              <div
                className="relative w-full max-w-[375px] max-h-[85vh] overflow-y-auto m-rounded-sheet px-5 pt-4 pb-8 sticker-sheet-pop-in shadow-xl"
                style={{ backgroundColor: "#0f172a" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-4 mb-4">
                  <h2 className="text-lg font-bold text-white tracking-tight">Achievements collection</h2>
                  <button type="button" onClick={() => setStickerSheetOpen(false)} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors" aria-label="Close">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                {(() => {
                  const stickerIds = getStickerSheetIds(achievements);
                  const earnedCount = stickerIds.filter((id) => isUnlocked(id, achievements)).length;
                  return (
                    <>
                <p className="text-white/70 text-sm mb-5">
                  {earnedCount} of {stickerIds.length} earned. Tap unlocked achievements to add to share cards and your recruiter profile (up to 3).
                </p>
                <div className="grid grid-cols-4 gap-4">
                  {stickerIds.map((id) => {
                    const unlocked = isUnlocked(id, achievements);
                    const def = ACHIEVEMENT_DEFINITIONS[id];
                    const borderColor = ACHIEVEMENT_BORDER_COLORS[id];
                    const glyphPath = getAchievementGlyphPath(id);
                    const isDimensionSlot = id.endsWith("_smart") || id.endsWith("_grit") || id.endsWith("_build");
                    const stableKey = isDimensionSlot ? `dim-${id.split("_")[1]}` : id;
                    return (
                      <div key={stableKey} className="flex flex-col items-center">
                        {unlocked ? (
                          <>
                            <button type="button" onClick={() => toggleStickerShareCard(id)} className="rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-[#0f172a] flex items-center justify-center w-16 h-16 shrink-0 bg-white" style={{ borderWidth: 4, borderStyle: "solid", borderColor }}>
                              {glyphPath ? (<img src={glyphPath} alt="" className="w-10 h-10 object-contain" />) : (<span className="text-2xl" aria-hidden>{def.emoji}</span>)}
                            </button>
                            {def && (<p className="mt-0.5 text-[10px] text-center text-white/60 leading-tight max-w-[72px]">{def.name}</p>)}
                          </>
                        ) : (
                          <>
                            <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/40 shrink-0" aria-hidden />
                            {id.endsWith("_smart") || id.endsWith("_grit") || id.endsWith("_build") ? (
                              <p className="mt-0.5 text-[10px] text-center text-white/40 leading-tight max-w-[72px]">
                                {id.endsWith("_smart") ? "Smart" : id.endsWith("_grit") ? "Grit" : "Build"}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          <div style={{ display: mainAppTab === "rank" ? "block" : "none" }}><div className="tab-enter">
            <RankTab />
          </div></div>

          {user?.subscribed && (
            <VoiceOverlay
              open={voiceOverlayOpen}
              onClose={() => {
                voiceAuditReportIdRef.current = null;
                voiceCertLandingRef.current = null;
                setVoiceOverlayOpen(false);
              }}
              value={voiceInput}
              onChange={setVoiceInput}
              onSend={(t) => voiceSendRef.current?.(t)}
              isLoading={voiceLoading}
              messages={voiceMessages}
              streamingText={voiceStreamingText}
              followUpSuggestions={voiceFollowUpSuggestions}
              voiceAvatarIndex={voiceAvatarIndex}
              themePrimary={theme.primary}
              onNewChat={() => voiceOverlayActionsRef.current?.startNewChat()}
              tabs={openVoiceConvIds.map((id) => voiceConvos.find((c) => c.id === id)).filter(Boolean).map((c) => ({ id: c!.id, title: c!.title }))}
              activeTabId={activeVoiceConvId}
              onTabSelect={(id) => voiceOverlayActionsRef.current?.openChat(id)}
              onCloseTab={(id) => voiceOverlayActionsRef.current?.closeTab(id)}
              onHelpDillyKnowYou={() => { openVoiceWithNewChat(RESUME_DEEP_DIVE_PROMPT); }}
              starterSuggestions={voiceStarterSuggestions}
              chats={voiceConvos.map((c) => ({ id: c.id, title: c.title, messages: c.messages, updatedAt: c.updatedAt }))}
              onDeleteChat={(id) => voiceOverlayActionsRef.current?.deleteChat(id)}
              onRenameChat={(id, newTitle) => setVoiceConvos((prev) => prev.map((c) => c.id === id ? { ...c, title: newTitle } : c))}
              voiceScoresForChat={voiceScoresForChat}
              emptyChatGreeting={getDillyVoiceEmptyGreeting(user?.email ?? null, appProfile?.name?.split(" ")[0] ?? null)}
              mockInterviewBanner={
                voiceMockInterviewSession
                  ? { questionNumber: voiceMockInterviewSession.questionIndex + 1, total: voiceMockInterviewSession.totalQuestions, onEnd: endVoiceMockInterviewByUser }
                  : null
              }
            />
          )}

          <div style={{ display: mainAppTab === "score" ? "block" : "none" }}>
            <div className="tab-enter">
              <ScoreTab onBack={() => setMainAppTab("center")} subscribed={user?.subscribed ?? false} />
            </div>
          </div>

          {mainAppTab === "memory" && (
            <div className="tab-enter">
              <MemoryTab
                onBack={() => setMainAppTab("center")}
                onNavigate={(target) => {
                  if (target.startsWith("ready_check:")) { setReadyCheckCompany(target.replace("ready_check:", "")); setMainAppTab("ready_check"); }
                  else if (target === "certifications") setMainAppTab("certifications");
                  else if (target === "resources") setMainAppTab("resources");
                  else if (target === "calendar") setMainAppTab("calendar");
                  else if (target === "voice") setMainAppTab("voice");
                }}
              />
            </div>
          )}

          {mainAppTab === "actions" && (<div className="tab-enter"><ActionsTab onBack={() => setMainAppTab("center")} /></div>)}
          {mainAppTab === "voice_history" && (<div className="tab-enter"><VoiceHistoryTab onBack={() => setMainAppTab("voice")} /></div>)}
          {mainAppTab === "certifications" && (<div className="tab-enter"><CertificationsTab onBack={() => setMainAppTab("resources")} userId={user?.email ?? ""} /></div>)}
          {mainAppTab === "career_playbook" && (<div className="tab-enter"><CareerPlaybookTab onBack={() => setMainAppTab("resources")} onOpenDilly={() => setMainAppTab("voice")} /></div>)}
          {mainAppTab === "settings" && (<div className="tab-enter"><SettingsPage onBack={() => setMainAppTab("center")} /></div>)}
          {mainAppTab === "profile_details" && (<div className="tab-enter"><ProfileDetailsPage onBack={() => setMainAppTab("center")} onOpenSettings={() => setMainAppTab("settings")} /></div>)}
          {mainAppTab === "ready_check" && (<div className="tab-enter"><ReadyCheckTab onBack={() => setMainAppTab("resources")} initialCompany={readyCheckCompany} /></div>)}

          <div style={{ display: mainAppTab === "edit" ? "block" : "none" }}>
            {(audit ?? savedAuditForCenter) ? (
              <div className="tab-enter"><ResumeEditPage onBack={() => setMainAppTab("center")} initialAudit={audit ?? savedAuditForCenter} /></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: "12px" }}>
                <p style={{ color: "var(--t2)", fontSize: "13px" }}>Loading your resume\u2026</p>
              </div>
            )}
          </div>

          <BottomNav
            dockTop={
              user?.subscribed &&
              (mainAppTab === "center" || mainAppTab === "calendar" || mainAppTab === "practice" ||
                (mainAppTab === "hiring" && (reviewSubView === "home" || reviewSubView === "upload"))) ? (
                <CareerCenterMinibar
                  docked
                  active={mainAppTab === "calendar" ? "calendar" : mainAppTab === "practice" ? "practice" : mainAppTab === "hiring" && reviewSubView === "upload" ? "new-audit" : mainAppTab === "hiring" && reviewSubView === "home" ? "score" : undefined}
                  embedded={{
                    onScore: () => { hapticLight(); setMainAppTab("score"); },
                    onNewAudit: () => { setMainAppTab("hiring"); setReviewSubView("upload"); setWantsNewAudit(true); setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0); },
                    onCalendar: () => { setMainAppTab("calendar"); },
                  }}
                />
              ) : undefined
            }
            activeTab={
              (["score","memory","actions","voice_history","settings","profile_details","edit"].includes(mainAppTab)
                ? "center"
                : mainAppTab === "certifications" || mainAppTab === "career_playbook" || mainAppTab === "ready_check"
                ? "resources"
                : mainAppTab) as MainAppTabKey
            }
            voiceOverlayOpen={voiceOverlayOpen}
            onTabSelect={(key: MainAppTabKey) => {
              hapticLight();
              const prevTab = mainAppTab;
              if (key === "voice") {
                voiceMemoryLengthAtVoiceEnterRef.current = voiceMemory.length;
                const _ts = auditHistory[0]?.ts ?? null;
                if (_ts !== null) setLastAuditTsOnVoiceEnter(_ts);
                openVoiceResumeRecentChat();
                return;
              }
              if (key === "rank") { setMainAppTab("rank"); return; }
              const wasVoiceActive = prevTab === "voice" || voiceOverlayOpen;
              if (wasVoiceActive) {
                voiceAuditReportIdRef.current = null;
                voiceCertLandingRef.current = null;
                setVoiceOverlayOpen(false);
              }
              setMainAppTab(key);
              if (wasVoiceActive) {
                const dw7 = appProfile?.deadlines?.filter((d) => !d.completedAt && (() => { try { return (new Date(d.date).getTime() - Date.now()) / 86400000 <= 7; } catch { return false; } })()).length ?? 0;
                setVoiceBadgeLastSeen({ deadlinesWithin7: dw7, auditTs: auditHistory[0]?.ts ?? null });
                setVoiceFollowUpSuggestions([]);
                setVoiceMessageQueue([]);
              }
            }}
            items={[
              { key: "center", label: "Career Center", icon: <CareerCenterTabIcon /> },
              { key: "rank", label: "Rank", icon: <RankTabIcon /> },
              { key: "voice", label: "Dilly AI", badge: (() => {
                const deadlinesWithin7 = appProfile?.deadlines?.filter((d) => !d.completedAt && (() => { try { return (new Date(d.date).getTime() - Date.now()) / 86400000 <= 7; } catch { return false; } })()).length ?? 0;
                const hasUrgent = deadlinesWithin7 > 0;
                const _latestTs = auditHistory[0]?.ts ?? null;
                const hasFresh = _latestTs !== null && lastAuditTsOnVoiceEnter !== null && _latestTs > lastAuditTsOnVoiceEnter;
                const condition = hasUrgent || hasFresh;
                if (!condition) return false;
                if (!voiceBadgeLastSeen) return true;
                return voiceBadgeLastSeen.deadlinesWithin7 !== deadlinesWithin7 || voiceBadgeLastSeen.auditTs !== _latestTs;
              })(), icon: getVoiceAvatarUrl(voiceAvatarIndex) ? (
                <img src={getVoiceAvatarUrl(voiceAvatarIndex)!} alt="" className="w-full h-full object-contain" style={{ filter: "brightness(1.15) contrast(1.1)" }} />
              ) : (
                <svg className="w-[14px] h-[14px] text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              )},
              { key: "resources", label: "Get Hired", icon: <JobsTabIcon /> },
            ]}
          />
        </>
    </div>
    </>
  );
}
