"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useClientSearchParams } from "@/lib/clientSearchParams";
import { getSchoolFromEmail, getSchoolById, DILLY_BASE_THEME, type SchoolConfig } from "@/lib/schools";
import { getDefinitionsForTrack, getEffectiveCohortLabel, getTrackTips, PRE_PROFESSIONAL_TRACKS } from "@/lib/trackDefinitions";
import { ProfilePhotoCrop } from "@/components/ProfilePhotoCrop";
import { ProfilePhotoWithFrame } from "@/components/ProfilePhotoWithFrame";
import { TranscriptSection } from "@/components/TranscriptSection";
import { AchievementSticker } from "@/components/AchievementSticker";
import { MajorMinorAutocomplete } from "@/components/MajorMinorAutocomplete";
import { CityChipsInput } from "@/components/CityChipsInput";
import { UT_MAJORS, UT_MINORS } from "@/lib/utMajorsMinors";
import { JOB_CITIES_LIST } from "@/lib/jobCities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fireConfetti } from "@/components/ConfettiCelebration";
import { checkAvatarTapEasterEgg, checkMidnightEasterEgg } from "@/lib/easterEggs";
import { playSound } from "@/lib/sounds";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { useToast } from "@/hooks/useToast";
import { useDillyVoiceNotification } from "@/context/DillyVoiceNotificationContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HeartFavorite } from "@/components/ui/heart-favorite";
import { ThumbsDown, FileText, Lightbulb, RefreshCw, ChevronRight } from "lucide-react";
import { DillyVoicePrompt } from "@/components/ui/dilly-voice-prompt";
import { VoiceInputWithMic } from "@/components/VoiceInputWithMic";
import { VoiceOverlay } from "@/components/VoiceOverlay";
import { VoiceAssistantRichReply } from "@/components/VoiceAssistantRichReply";
import { VoiceVisualDedupProvider, VoiceDedupScrollRoot } from "@/components/VoiceChatVisualDedup";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AUTH_USER_CACHE_KEY,
  AUTH_USER_CACHE_MAX_AGE_MS,
  PENDING_VOICE_KEY,
  DILLY_PLAYBOOK_VOICE_PROMPT_KEY,
  DILLY_SCORE_GAP_VOICE_PROMPT_KEY,
  DILLY_JOB_GAP_VOICE_PROMPT_KEY,
  DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY,
  DILLY_LEADERBOARD_REFRESH_KEY,
  DILLY_LEADERBOARD_VOICE_PROMPT_KEY,
  DILLY_OPEN_OVERLAY_KEY,
  VOICE_FROM_AUDIT_ID_KEY,
  VOICE_FROM_CERT_HANDOFF_KEY,
  DIMENSIONS,
  GOALS_ALL,
  LOW_SCORE_THRESHOLD,
  ONBOARDING_STEP_KEY,
  PROFILE_CACHE_KEY_BASE,
  SCHOOL_STORAGE_KEY,
  SCHOOL_NAME_KEY,
  VOICE_CONVOS_KEY,
  VOICE_MESSAGES_KEY,
  auditStorageKey,
  stashAuditForReportHandoff,
  copyTextSync,
  minimalAuditFromHistorySummary,
  type AuditHistorySummaryRow,
  voiceStorageKey,
  getDillyVoiceEmptyGreeting,
  hasCompletedDillyVoiceIntro,
  markDillyVoiceIntroSeen,
  profilePhotoCacheKey,
  setCareerCenterReturnPath,
  safeUuid,
  scoreColor,
  generateBadgeSvg,
  generateShareCardSvg,
  downloadSvg,
  svgToPngFile,
  topPercentileHeadline,
  oneLineSummary,
  gapToNextLevel,
  progressPercentTowardTop25Rank,
  computeScoreTrajectory,
  getTopThreeActions,
  toNaturalSuggestion,
  getMilestoneNudge,
  scoresCrossedMilestones,
  readLastAtsScoreCache,
  writeLastAtsScoreCache,
} from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import { getProfileFrame } from "@/lib/profileFrame";
import { DEFAULT_VOICE_AVATAR_INDEX, VOICE_AVATAR_OPTIONS, getVoiceAvatarUrl } from "@/lib/voiceAvatars";
import { SessionCaptureCard } from "@/components/memory/SessionCaptureCard";
import { ConversationOutputCard } from "@/components/voice/ConversationOutputCard";
import { VoiceSessionRecapCard } from "@/components/voice/VoiceSessionRecapCard";
import {
  computeVoiceSessionRecap,
  persistVoiceSessionRecap,
  readVoiceSessionRecap,
  clearVoiceSessionRecap,
  type VoiceSessionRecap,
} from "@/lib/voiceSessionRecap";
import { tryFireMicroCelebration } from "@/lib/dillyMicroCelebrations";
import {
  wantsMockInterview,
  wantsEndMockInterview,
  VOICE_MOCK_INTERVIEW_TOTAL,
  buildMockInterviewSessionContext,
} from "@/lib/voiceMockInterview";
import { VoiceMockInterviewBanner, VoiceMockInterviewTurn } from "@/components/voice/VoiceMockInterviewUI";
import { CohortPulseCard } from "@/components/cohort-pulse/CohortPulseCard";
import { MascotAvatar, getMascotMood } from "@/components/MascotAvatar";
import {
  ScoreCard,
  DillyInsight,
  ActionCard,
  BottomNav,
  AppProfileHeader,
  CareerCenterMinibar,
  JobsTabIcon,
  RankTabIcon,
  CareerCenterTabIcon,
  type MainAppTabKey,
} from "@/components/career-center";
import type { JobFilterKey } from "@/components/jobs/FilterRow";
import { DillyHomeInsight, DillyFeed } from "@/components/presence";
import { dillyPresenceManager, type HomeInsightContext, type TransitionSource, orderedFeedIds, type FeedOrderContext, type FeedCardType } from "@/lib/dillyPresence";
import { DILLY_PRESENCE_VOICE_ADDENDUM } from "@/lib/voice/presenceSystemPrompt";
import { getDillyNoticedCard, markNoticedSeen } from "@/lib/dillyNoticed";
import { TWENTY_X_MOMENTS, formatTwentyXCompact } from "@/lib/twentyXMoments";
import { cn } from "@/lib/utils";
import { useNavigation, type AppTab, type HiringSubView, type GetHiredSubTab } from "@/contexts/NavigationContext";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import { sanitizeVoiceAssistantReply } from "@/lib/voiceReplySanitize";
import html2canvas from "html2canvas";
import { PROFILE_THEMES, PROFILE_THEME_IDS, type ProfileThemeId } from "@/lib/profileThemes";
import type { ActionItem, AppProfile, AuditV2, CohortPulse, ConversationOutput, DimensionKey, DillyDeadline, DillySubDeadline, VoiceConvo, MemoryItem, SessionCapture, UserCohortPulse } from "@/types/dilly";
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_BORDER_COLORS,
  getAchievementGlyphPath,
  getAchievementsReferenceForVoice,
  isUnlocked,
  getBestDimensionTier,
  getStickerSheetIds,
  computeNewUnlocks,
  type AchievementId,
  type ProfileAchievements,
} from "@/lib/achievements";
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

/** Validate LinkedIn profile URL. Accepts linkedin.com/in/username format. */
function isValidLinkedInUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  return /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[\w\-]+\/?$/i.test(trimmed);
}

/** Desktop Chrome (and many browsers) report no file sharing or reject share({ files }) — avoid falling back to text-only share when we have a PNG. */
function navigatorCanSharePngFile(file: File): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;

/** First message for the "Help Dilly know you better" resume deep-dive flow. Backend uses conversation_topic: resume_deep_dive when this is sent. */
const RESUME_DEEP_DIVE_PROMPT =
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

export default function DashboardPage() {
  return <Dashboard />;
}

function Dashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    state: { mainAppTab, reviewSubView, getHiredSubTab, readyCheckCompany, jobsPanelInitialFilter },
    setMainAppTab, setReviewSubView, setGetHiredSubTab, setReadyCheckCompany, setJobsPanelInitialFilter,
  } = useNavigation();
  const {
    user, setUser,
    authLoading, setAuthLoading,
    allowMainApp, setAllowMainApp,
    onboardingNeeded, setOnboardingNeeded,
    profileFetchDone, setProfileFetchDone,
    appProfile, setAppProfile,
    school, setSchool,
  } = useAppContext();
  const {
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
  } = useAuditScore();
  const {
    voiceConvos, setVoiceConvos, openVoiceConvIds, setOpenVoiceConvIds,
    activeVoiceConvId, setActiveVoiceConvId, voiceChatListOpen, setVoiceChatListOpen,
    voiceAvatarIndex, setVoiceAvatarIndex, voiceAvatarPickerOpen, setVoiceAvatarPickerOpen,
    renamingVoiceConvId, setRenamingVoiceConvId, renameValue, setRenameValue,
    voiceMessages, setVoiceMessages, voiceMockInterviewSession, setVoiceMockInterviewSession,
    voiceMessageQueue, setVoiceMessageQueue, voiceInput, setVoiceInput,
    voiceLoading, setVoiceLoading, voiceStreamingText, setVoiceStreamingText,
    voiceFollowUpSuggestions, setVoiceFollowUpSuggestions, mascotTapCount, setMascotTapCount,
    lastAuditTsOnVoiceEnter, setLastAuditTsOnVoiceEnter,
    memoryItems, setMemoryItems, pendingSessionCaptureCard, setPendingSessionCaptureCard,
    latestConversationOutput, setLatestConversationOutput,
    voiceRecapNonce, setVoiceRecapNonce, voiceRecapForCard, setVoiceRecapForCard,
    voiceApplicationsPreview, setVoiceApplicationsPreview,
    bulletRewriterOpen, setBulletRewriterOpen, bulletInput, setBulletInput,
    bulletRewritten, setBulletRewritten, bulletLoading, setBulletLoading,
    bulletHistory, setBulletHistory,
    voiceRememberOpen, setVoiceRememberOpen, voiceRememberNote, setVoiceRememberNote,
    outcomeAskingConsent, setOutcomeAskingConsent,
    voiceActionItems, setVoiceActionItems, actionItemsPanelOpen, setActionItemsPanelOpen,
    voiceCompany, setVoiceCompany, voiceCompanyInput, setVoiceCompanyInput,
    voiceCompanyPanelOpen, setVoiceCompanyPanelOpen,
    firmDeadlines, setFirmDeadlines, voiceMemory, setVoiceMemory,
    voiceFeedback, setVoiceFeedback,
    voiceOverlayOpen, setVoiceOverlayOpen,
    voiceBadgeLastSeen, setVoiceBadgeLastSeen,
    voiceCalendarSyncKey, setVoiceCalendarSyncKey,
    voiceScreenContext, setVoiceScreenContext,
    pendingVoicePrompt, setPendingVoicePrompt,
    scoreCardDillyStrip, setScoreCardDillyStrip,
  } = useVoice();

  const [file, setFile] = useState<File | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");
  /** audit — now from AuditScoreContext */
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  /** lastAudit — now from AuditScoreContext */
  const [copyFeedback, setCopyFeedback] = useState<"one-line" | "suggested" | "report-link" | "top-pct" | "shared" | null>(null);
  const [reportShareUrl, setReportShareUrl] = useState<string | null>(null);
  const [progressExplainer, setProgressExplainer] = useState<string | null>(null);
  const [progressExplainerLoading, setProgressExplainerLoading] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<"snapshot" | "pdf" | null>(null);
  const hasRedirected = useRef(false);
  const voiceEndRef = useRef<HTMLDivElement>(null);
  const voiceSendRef = useRef<((text?: string) => void) | null>(null);
  /** Actions for Voice overlay header (startNewChat, openChat, deleteChat, closeTab) - assigned inside Voice block */
  const voiceOverlayActionsRef = useRef<{ startNewChat: () => void; openChat: (id: string) => void; deleteChat: (id: string) => void; closeTab: (id: string) => void } | null>(null);
  /** True only when pendingVoicePrompt was set by an explicit action (Open in Dilly AI, Jobs handoff). Prevents auto-send when user just opens Dilly from the tab bar. */
  const allowAutoSendPendingRef = useRef(false);
  /** When edit profile was opened from Settings (?from=settings), close should go back to /settings */
  const fromSettingsWhenEditingProfileRef = useRef(false);
  /** Main app shell: which tab is active — now from NavigationContext */
  /** After deep link `/?tab=resources&view=applications`, scroll once the Get Hired panel mounts. */
  const scrollApplicationsOnResourcesRef = useRef(false);
  /** Get Hired sub-tab + filter — now from NavigationContext */
  /** Profile loaded from API — now from AppContext */
  const [stickerSheetOpen, setStickerSheetOpen] = useState(false);
  const searchParams = useClientSearchParams();
  const pathname = usePathname();
  // Open sticker sheet when navigating from Settings (e.g. /?openStickerSheet=1)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (searchParams.get("openStickerSheet") === "1") {
      setStickerSheetOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("openStickerSheet");
      window.history.replaceState({}, "", url.pathname + url.search || "/");
    }
  }, [searchParams]);

  // Deep link from /jobs: ?tab=calendar|voice|resources|report|insights|upload|score and optional ?sub= for hiring
  // audit_refresh=1: after re-audit from resume editor — refresh audit history so Career Center shows the new audit
  // NOTE: tab=voice is handled in a separate effect (after profile loads) so returning users go to Career Center
  useEffect(() => {
    const tab = searchParams.get("tab");
    const sub = searchParams.get("sub");
    const auditRefresh = searchParams.get("audit_refresh") === "1";
    if (!tab && !sub && !auditRefresh) return;
    const url = new URL(typeof window !== "undefined" ? window.location.href : "http://localhost/");
    let applied = false;
    if (tab === "center") {
      setMainAppTab("center");
      applied = true;
    }
    if (tab === "explore") {
      setMainAppTab("center");
      applied = true;
    }
    if (tab === "calendar") {
      setMainAppTab("calendar");
      applied = true;
    } else if (tab === "practice") {
      setMainAppTab("practice");
      applied = true;
    } else if (tab === "voice") {
      // Handled in separate effect (after profile loads) — returning users go to Career Center
      applied = false;
    } else if (tab === "resources") {
      const view = searchParams.get("view");
      if (view === "certifications") {
        queueMicrotask(() => setMainAppTab("certifications"));
        applied = true;
      } else if (view === "playbook") {
        queueMicrotask(() => setMainAppTab("career_playbook"));
        applied = true;
      } else {
        if (view === "applications") {
          scrollApplicationsOnResourcesRef.current = true;
          setGetHiredSubTab("applications");
          setJobsPanelInitialFilter(null);
        } else if (view === "jobs") {
          setGetHiredSubTab("jobs");
          const type = (searchParams.get("type") || "").trim().toLowerCase();
          if (type === "internship") setJobsPanelInitialFilter("internship");
          else if (type === "job" || type === "full_time" || type === "full-time") setJobsPanelInitialFilter("full_time");
          else setJobsPanelInitialFilter(null);
        }
        setMainAppTab("resources");
        applied = true;
      }
    } else if (tab === "report" || sub === "report") {
      setMainAppTab("hiring");
      const viewAuditId = searchParams.get("viewAudit")?.trim();
      if (viewAuditId) {
        queueMicrotask(() => {
          try {
            const ur = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(AUTH_USER_CACHE_KEY) : null;
            if (ur) {
              const u = JSON.parse(ur) as { email?: string };
              if (u?.email) {
                const stored = localStorage.getItem(auditStorageKey(u.email));
                if (stored) {
                  const aud = JSON.parse(stored) as AuditV2;
                  if (String(aud?.id || "").trim() === viewAuditId && aud.scores) {
                    stashAuditForReportHandoff(aud);
                  }
                }
              }
            }
          } catch {
            /* ignore */
          }
          router.replace(`/audit/${encodeURIComponent(viewAuditId)}`);
        });
        setReviewSubView("home");
      } else {
        setReviewSubView("home");
      }
      applied = true;
    } else if (tab === "insights" || sub === "insights") {
      setMainAppTab("hiring");
      setReviewSubView("insights");
      applied = true;
    } else if (tab === "upload" || sub === "upload") {
      setMainAppTab("hiring");
      setReviewSubView("upload");
      setWantsNewAudit(true);
      if (searchParams.get("paste") === "1") {
        setPasteMode(true);
        setFile(null);
      }
      applied = true;
    } else if (tab === "score" || sub === "score") {
      queueMicrotask(() => setMainAppTab("score"));
      applied = true;
    } else if (tab === "edit") {
      setMainAppTab("edit");
      applied = true;
    }
    if (auditRefresh) {
      setCenterRefreshKey((k) => k + 1);
      applied = true;
    }
    if (applied && typeof window !== "undefined") {
      url.searchParams.delete("tab");
      url.searchParams.delete("sub");
      url.searchParams.delete("audit_refresh");
      url.searchParams.delete("paste");
      url.searchParams.delete("viewAudit");
      url.searchParams.delete("view");
      url.searchParams.delete("share");
      window.history.replaceState({}, "", url.pathname + url.search || "/");
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (mainAppTab !== "resources" || !scrollApplicationsOnResourcesRef.current) return;
    scrollApplicationsOnResourcesRef.current = false;
    const t = window.setTimeout(() => {
      document.getElementById("get-hired-applications")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => clearTimeout(t);
  }, [mainAppTab]);

  /** "Tailor This Audit For" - internship | full_time | exploring; defaults from profile or goals */
  const [applicationTarget, setApplicationTarget] = useState<string>("");
  /** auditHistory, auditHistoryLoading — now from AuditScoreContext */

  // tab=voice in URL: always land on Career Center (never auto-open Voice on login or from links)
  useEffect(() => {
    if (searchParams.get("tab") !== "voice" || !user?.subscribed) return;
    setMainAppTab("center");
    const url = new URL(typeof window !== "undefined" ? window.location.href : "http://localhost/");
    url.searchParams.delete("tab");
    if (typeof window !== "undefined") window.history.replaceState({}, "", url.pathname + url.search || "/");
  }, [searchParams, user?.subscribed]);
  /** atsScoreHistory, atsPeerPercentile, doorEligibility, savedAuditForCenter, viewingAudit — now from AuditScoreContext */
  /** User clicked + to run new audit from Review tab - show upload flow even when audit exists */
  const [wantsNewAudit, setWantsNewAudit] = useState(false);
  /** Explicit ref for "current" audit - never overwritten when viewing history; ensures Back shows current scores */
  const latestAuditRef = useRef<AuditV2 | null>(null);

  /** Prefer GET /ats-score/history; fall back to client cache from last scan (see writeLastAtsScoreCache). */
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

  /** Voice state — now from VoiceContext */
  const [currentCohortPulse, setCurrentCohortPulse] = useState<(UserCohortPulse & { cohort: CohortPulse }) | null>(null);
  const latestVoiceConvIdRef = useRef<string | null>(null);
  const voiceMessagesRef = useRef(voiceMessages);
  voiceMessagesRef.current = voiceMessages;
  const sessionCaptureShownRef = useRef<Set<string>>(new Set());
  const voiceMemoryLengthAtVoiceEnterRef = useRef(0);
  const prevVoiceActiveRef = useRef(false);
  /** Bullet rewriter, remember, outcome — now from VoiceContext */
  /** Calendar state */
  const prevTabForCalendarSnapRef = useRef<typeof mainAppTab | null>(null);
  /** Jobs for you - tailored to profile/resume */
  const [recommendedJobs, setRecommendedJobs] = useState<{ id: string; title: string; company: string; location: string; url: string; match_pct: number; why_bullets: string[] }[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  /** Mini calendar: which date is selected to show full deadline labels (popover) */
  /** voiceActionItems, actionItemsPanelOpen — now from VoiceContext */
  /** Evidence-based interview prep (POST /interview-prep): per-dimension question, strategy, script */
  const [interviewPrepEvidence, setInterviewPrepEvidence] = useState<{ dimensions: { name: string; question: string; strategy: string; script: string }[] } | null>(null);
  const [interviewPrepEvidenceLoading, setInterviewPrepEvidenceLoading] = useState(false);
  const [interviewPrepEvidenceOpen, setInterviewPrepEvidenceOpen] = useState(false);
  /** Gap scanner state */
  const [gapScanOpen, setGapScanOpen] = useState(false);
  const [gapScanResult, setGapScanResult] = useState<{ gaps: { gap: string; dimension: string; severity: string; fix: string; impact: string }[]; overall_readiness: string; readiness_summary: string } | null>(null);
  const [gapScanLoading, setGapScanLoading] = useState(false);
  /** Cover letter lines state (in-page panel) */
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);
  const [coverLetterResult, setCoverLetterResult] = useState<{ cover_openers: string[]; outreach_hooks: string[] } | null>(null);
  const [coverLetterLoading, setCoverLetterLoading] = useState(false);
  /** Am I Ready? (job-fit) state */
  /** Vs Your Peers: cohort stats from GET /peer-cohort-stats (Insights) */
  const [cohortStats, setCohortStats] = useState<{ track: string; cohort_n: number; use_fallback: boolean; avg: { smart: number; grit: number; build: number }; p25: { smart: number; grit: number; build: number }; p75: { smart: number; grit: number; build: number }; how_to_get_ahead: string } | null>(null);
  /** Review tab sub-view — now from NavigationContext */
  /** Job search checklist (persisted to localStorage key per user) */
  /** voiceCompany, firmDeadlines, voiceMemory, voiceFeedback — now from VoiceContext */
  /** Offline state for connection banner */
  const [isOffline, setIsOffline] = useState(false);
  /** Inline error when profile save fails (onboarding) */
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  /** Profile editing mode in Career Center - full Edit Portfolio */
  const [editingProfile, setEditingProfile] = useState(false);
  /** Dismissed "Dilly noticed" card this session so it hides immediately (persisted via markNoticedSeen). */
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
  const [primaryGoalSaving, setPrimaryGoalSaving] = useState(false);
  const [primaryGoalInput, setPrimaryGoalInput] = useState("");
  const [primaryGoalEditing, setPrimaryGoalEditing] = useState(false);
  const [appTargetLabelEditing, setAppTargetLabelEditing] = useState(false);
  const [appTargetLabelInput, setAppTargetLabelInput] = useState("");
  const [appTargetLabelSaving, setAppTargetLabelSaving] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [photoCropImageSrc, setPhotoCropImageSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  /** voiceBadgeLastSeen, voiceCalendarSyncKey, pendingVoicePrompt, voiceScreenContext, scoreCardDillyStrip, voiceOverlayOpen — now from VoiceContext */
  /** Career Center: collapsible "More" section (streamlining per cousin feedback) */
  const [centerMoreOpen, setCenterMoreOpen] = useState(false);
  /** When Voice opens from `/audit/[id]`, backend context can reference this audit id until overlay closes. */
  const voiceAuditReportIdRef = useRef<string | null>(null);
  /** When Voice opens from certifications “Make it land”, backend gets cert_landing in context until overlay closes. */
  const voiceCertLandingRef = useRef<{ cert_id: string; name?: string; provider?: string; source?: string } | null>(null);
  /** Proactive nudges from GET /voice/proactive-nudges (app funnel, relationships, seasonal, etc.) */
  const [proactiveLines, setProactiveLines] = useState<string[]>([]);
  /** Habit loops from GET /habits: streak, weekly review, rituals, milestones */
  const [habits, setHabits] = useState<{
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
  } | null>(null);
  const [proactiveNudges, setProactiveNudges] = useState<{
    app_funnel?: { applied: number; responses: number; interviews: number; silent_2_weeks: number };
    relationship_nudges?: { person: string; weeks_ago: number }[];
    deadline_urgent?: { label: string; days: number };
    score_nudge?: { dimension: string; gain: number };
    seasonal?: { label: string };
  } | null>(null);
  /** Start a new Voice chat. Use for all entry points to Dilly.
   * Creates a fresh convo and opens it. If prompt is provided, it auto-sends.
   * `initialAssistantMessage` seeds the thread as if Dilly already spoke (presence transitions). */
  const openVoiceWithNewChat = (
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
  };

  const openVoiceWithNewChatRef = useRef(openVoiceWithNewChat);
  openVoiceWithNewChatRef.current = openVoiceWithNewChat;

  /** Suppress global pull-to-refresh full reload while Voice overlay/tab is active or streaming (avoids “kicked out” mid-reply). */
  useEffect(() => {
    const busy =
      voiceOverlayOpen ||
      voiceLoading ||
      (mainAppTab === "voice" && (voiceLoading || Boolean(voiceStreamingText)));
    if (busy) document.body.dataset.dillyVoiceBusy = "1";
    else delete document.body.dataset.dillyVoiceBusy;
    return () => {
      delete document.body.dataset.dillyVoiceBusy;
    };
  }, [voiceOverlayOpen, voiceLoading, mainAppTab, voiceStreamingText]);

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
  }, [voiceConvos]);

  /** Dilly Presence: score card footnote when audit delta, staleness, or tier gap warrants it. */
  useEffect(() => {
    if (mainAppTab !== "center" || !user?.email) {
      setScoreCardDillyStrip(null);
      return;
    }
    const displayAuditLocal = latestAuditRef.current ?? audit ?? savedAuditForCenter;
    if (!displayAuditLocal?.scores) {
      setScoreCardDillyStrip(null);
      return;
    }
    const curr = auditHistory[0];
    const prev = auditHistory[1];
    const finalNow = Math.round(
      displayAuditLocal.final_score ??
        ((displayAuditLocal.scores.smart + displayAuditLocal.scores.grit + displayAuditLocal.scores.build) / 3),
    );
    const finalPrev = prev != null ? Math.round(prev.final_score ?? 0) : null;
    const delta = finalPrev != null ? finalNow - finalPrev : null;
    const daysSinceAudit = curr?.ts != null ? (Date.now() / 1000 - curr.ts) / 86400 : 999;
    const gaps = gapToNextLevel(displayAuditLocal);
    const ptsToTop25 = gaps[0]?.pointsToTop25 ?? 99;
    const nearTier = ptsToTop25 <= 5 && ptsToTop25 > 0;
    const firstAuditOnly = auditHistory.length <= 1;
    const notable =
      !firstAuditOnly &&
      ((delta != null && delta !== 0) ||
        (delta != null && delta < 0) ||
        daysSinceAudit >= 14 ||
        nearTier);
    if (!notable) {
      setScoreCardDillyStrip(null);
      return;
    }
    dillyPresenceManager.invalidateCardStrip("score", user.email);
    let cancelled = false;
    void (async () => {
      const strip = await dillyPresenceManager.getCardStrip("score", user.email, {
        delta,
        final: finalNow,
        stale_days: Math.floor(daysSinceAudit),
        near_tier: nearTier,
        points_to_top25: ptsToTop25,
      });
      if (!cancelled) setScoreCardDillyStrip(strip);
    })();
    return () => {
      cancelled = true;
    };
  }, [mainAppTab, user?.email, auditHistory, audit, savedAuditForCenter]);

  /** Standalone pages (e.g. sibling shells’ BottomNav → Dilly) set DILLY_OPEN_OVERLAY_KEY before navigating home. */
  useEffect(() => {
    if (pathname !== "/" || !user) return;
    try {
      if (sessionStorage.getItem(DILLY_OPEN_OVERLAY_KEY) === "1") {
        sessionStorage.removeItem(DILLY_OPEN_OVERLAY_KEY);
        let openedCert = false;
        try {
          const certRaw = sessionStorage.getItem(VOICE_FROM_CERT_HANDOFF_KEY);
          if (certRaw) {
            const p = JSON.parse(certRaw) as { cert_id?: string; name?: string; provider?: string };
            sessionStorage.removeItem(VOICE_FROM_CERT_HANDOFF_KEY);
            if (p?.cert_id) {
              voiceCertLandingRef.current = {
                cert_id: String(p.cert_id),
                name: p.name ? String(p.name) : undefined,
                provider: p.provider ? String(p.provider) : undefined,
                source: "cert_landing",
              };
              voiceAuditReportIdRef.current = null;
              const n = p.name ? String(p.name) : "";
              const initialAssistantMessage = n
                ? `Let's make **${n}** land on your resume — I'll help you place it and write a line recruiters recognize.`
                : `Let's add this certification to your resume with wording that reads strong on a quick scan.`;
              queueMicrotask(() =>
                openVoiceWithNewChatRef.current(undefined, "Certification", { initialAssistantMessage }),
              );
              openedCert = true;
            }
          }
        } catch {
          /* ignore */
        }
        if (!openedCert) {
          let handledWelcome = false;
          try {
            const welcome = sessionStorage.getItem(PENDING_VOICE_KEY);
            if (welcome) sessionStorage.removeItem(PENDING_VOICE_KEY);
            const welcomeTrim = welcome?.trim();
            if (welcomeTrim) {
              voiceAuditReportIdRef.current = null;
              voiceCertLandingRef.current = null;
              queueMicrotask(() => openVoiceWithNewChatRef.current(welcomeTrim, "Welcome"));
              handledWelcome = true;
            }
          } catch {
            /* ignore */
          }
          if (!handledWelcome) {
          const fromAudit = sessionStorage.getItem(VOICE_FROM_AUDIT_ID_KEY);
          if (fromAudit) {
            sessionStorage.removeItem(VOICE_FROM_AUDIT_ID_KEY);
            voiceAuditReportIdRef.current = fromAudit.trim() || null;
            voiceCertLandingRef.current = null;
            queueMicrotask(() =>
              openVoiceWithNewChatRef.current(undefined, "Audit report", {
                initialAssistantMessage:
                  "I’ve got your **audit report** on deck. Want to dig into **Smart**, **Grit**, or **Build** first—or tighten one line together?",
              }),
            );
          } else {
            voiceAuditReportIdRef.current = null;
            voiceCertLandingRef.current = null;
            let scoreGapPrompt: string | null = null;
            try {
              scoreGapPrompt = sessionStorage.getItem(DILLY_SCORE_GAP_VOICE_PROMPT_KEY);
              if (scoreGapPrompt) sessionStorage.removeItem(DILLY_SCORE_GAP_VOICE_PROMPT_KEY);
            } catch {
              /* ignore */
            }
            const gapTrim = scoreGapPrompt?.trim();
            if (gapTrim) {
              queueMicrotask(() => openVoiceWithNewChatRef.current(gapTrim, "Score gap"));
            } else {
              let jobGapPrompt: string | null = null;
              try {
                jobGapPrompt = sessionStorage.getItem(DILLY_JOB_GAP_VOICE_PROMPT_KEY);
                if (jobGapPrompt) sessionStorage.removeItem(DILLY_JOB_GAP_VOICE_PROMPT_KEY);
              } catch {
                /* ignore */
              }
              const jobGapTrim = jobGapPrompt?.trim();
              if (jobGapTrim) {
                queueMicrotask(() => openVoiceWithNewChatRef.current(jobGapTrim, "Job gap"));
              } else {
                let expandSearchPrompt: string | null = null;
                try {
                  expandSearchPrompt = sessionStorage.getItem(DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY);
                  if (expandSearchPrompt) sessionStorage.removeItem(DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY);
                } catch {
                  /* ignore */
                }
                const expandTrim = expandSearchPrompt?.trim();
                if (expandTrim) {
                  queueMicrotask(() => openVoiceWithNewChatRef.current(expandTrim, "More jobs"));
                } else {
                  let leaderboardPrompt: string | null = null;
                  try {
                    leaderboardPrompt = sessionStorage.getItem(DILLY_LEADERBOARD_VOICE_PROMPT_KEY);
                    if (leaderboardPrompt) sessionStorage.removeItem(DILLY_LEADERBOARD_VOICE_PROMPT_KEY);
                  } catch {
                    /* ignore */
                  }
                  const lbTrim = leaderboardPrompt?.trim();
                  if (lbTrim) {
                    queueMicrotask(() => openVoiceWithNewChatRef.current(lbTrim, "Leaderboard"));
                  } else {
                    let playbookPrompt: string | null = null;
                    try {
                      playbookPrompt = sessionStorage.getItem(DILLY_PLAYBOOK_VOICE_PROMPT_KEY);
                      if (playbookPrompt) sessionStorage.removeItem(DILLY_PLAYBOOK_VOICE_PROMPT_KEY);
                    } catch {
                      /* ignore */
                    }
                    const trimmed = playbookPrompt?.trim();
                    queueMicrotask(() => {
                      if (trimmed) {
                        openVoiceWithNewChatRef.current(trimmed, "Your playbook");
                      } else {
                        openVoiceWithNewChatRef.current();
                      }
                    });
                  }
                }
              }
            }
          }
          }
        }
      }
    } catch { /* ignore */ }
  }, [pathname, user, searchParams]);

  /** Build context for gap-scan, interview-prep, etc. Shared across Insights and Voice. */
  const buildVoiceContext = () => {
    const displayAudit = viewingAudit ?? audit ?? savedAuditForCenter;
    const prevAuditScores = auditHistory.length >= 2 ? auditHistory[1].scores : null;
    return {
      // Device-local calendar date (YYYY-MM-DD) so Voice deadline extraction resolves "on the 24th" correctly
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
      // Voice-captured permanent memory: send what's already been saved so Voice never forgets it
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
      // Resume deep-dive: list of role labels from last audit, so backend knows which experience we're on
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
  };

  /** Open Voice from a specific screen with optional prompt (Option C). Creates new chat and sends current_screen with the next message only. */
  const openVoiceFromScreen = (screenId: string, prompt?: string, convoTitle?: string) => {
    setVoiceScreenContext({ current_screen: screenId, prompt });
    openVoiceWithNewChat(prompt ?? "What does this screen mean?", convoTitle ?? "New Chat");
  };

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

  /** Evidence-based interview prep from audit: per-dimension question, strategy, script (POST /interview-prep). */
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
      toast("Run a resume audit first to unlock interview prep from your evidence.", "info");
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

  const { showVoiceNotification, setNotificationVoiceAvatar, setNotificationTapHandler } = useDillyVoiceNotification();

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
    [showVoiceNotification],
  );

  /** Stash full audit when available so `/audit/[id]` paints immediately (no skeleton). */
  const navigateToAuditReport = useCallback(
    (auditId: string, explicitFullAudit?: AuditV2 | null) => {
      const idStr = String(auditId || "").trim();
      if (!idStr) return;
      let toStash: AuditV2 | undefined;
      if (explicitFullAudit && String(explicitFullAudit.id || "").trim() === idStr && explicitFullAudit.scores) {
        toStash = explicitFullAudit;
      } else {
        const candidates = [viewingAudit, latestAuditRef.current, audit, savedAuditForCenter];
        const found = candidates.find((a) => a && String(a.id || "").trim() === idStr && a.scores);
        toStash = found ?? undefined;
      }
      if (toStash) stashAuditForReportHandoff(toStash);
      router.push(`/audit/${encodeURIComponent(idStr)}`);
    },
    [viewingAudit, audit, savedAuditForCenter, router],
  );

  const replaceToAuditReport = useCallback(
    (auditId: string, explicitFullAudit?: AuditV2 | null) => {
      const idStr = String(auditId || "").trim();
      if (!idStr) return;
      let toStash: AuditV2 | undefined;
      if (explicitFullAudit && String(explicitFullAudit.id || "").trim() === idStr && explicitFullAudit.scores) {
        toStash = explicitFullAudit;
      } else {
        const candidates = [viewingAudit, latestAuditRef.current, audit, savedAuditForCenter];
        const found = candidates.find((a) => a && String(a.id || "").trim() === idStr && a.scores);
        toStash = found ?? undefined;
      }
      if (toStash) stashAuditForReportHandoff(toStash);
      router.replace(`/audit/${encodeURIComponent(idStr)}`);
    },
    [viewingAudit, audit, savedAuditForCenter, router],
  );

  /** Full audit report lives at `/audit/[id]` — use everywhere we used to open the inline report. */
  const goToStandaloneFullAuditReport = useCallback(
    (explicitId?: string | null) => {
      const id = (
        explicitId?.trim() ||
        (() => {
          const da = viewingAudit ?? latestAuditRef.current ?? audit ?? savedAuditForCenter;
          return (da?.id || auditHistory[0]?.id || "").trim();
        })()
      );
      if (!id) {
        toast("No saved report on file yet.", "error");
        return;
      }
      hapticLight();
      navigateToAuditReport(id);
    },
    [viewingAudit, audit, savedAuditForCenter, auditHistory, navigateToAuditReport, toast],
  );

  /** Legacy `reviewSubView === "report"` → standalone page (safety net for old links/state). */
  useEffect(() => {
    if (mainAppTab !== "hiring" || reviewSubView !== "report") return;
    const da = viewingAudit ?? latestAuditRef.current ?? audit ?? savedAuditForCenter;
    const id = (da?.id || auditHistory[0]?.id || "").trim();
    setReviewSubView("home");
    if (id) replaceToAuditReport(id);
  }, [mainAppTab, reviewSubView, viewingAudit, audit, savedAuditForCenter, auditHistory, replaceToAuditReport]);

  useEffect(() => {
    try {
      const savedId = localStorage.getItem(SCHOOL_STORAGE_KEY);
      if (savedId) {
        const config = getSchoolById(savedId);
        if (config) {
          setSchool(config);
          setOnboardingNeeded(false);
        } else {
          setOnboardingNeeded(true);
        }
      } else {
        setOnboardingNeeded(true);
      }
    } catch {
      setOnboardingNeeded(true);
    }
  }, []);

  // Auth check — runs once on mount only
  useEffect(() => {
    if (hasRedirected.current) return;

    // URL token handoff from student app (?token=...) — consume before reading localStorage
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get("token");
      if (urlToken) {
        localStorage.setItem("dilly_auth_token", urlToken);
        window.history.replaceState({}, "", "/");
      }
    } catch { /* ignore */ }


    if (!localStorage.getItem("dilly_auth_token")) {
      hasRedirected.current = true;
      window.location.replace("http://localhost:3001/onboarding/welcome");
      return;
    }

    // Warm the UI from short-lived session cache while /auth/me is in flight
    try {
      const raw = sessionStorage.getItem(AUTH_USER_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { email: string; subscribed: boolean; ts: number };
        if (parsed?.email && typeof parsed.ts === "number" && Date.now() - parsed.ts < AUTH_USER_CACHE_MAX_AGE_MS) {
          setUser({ email: parsed.email, subscribed: true });
        }
      }
    } catch { /* ignore */ }

    // Token exists — validate it
    dilly.fetch(`/auth/me`)
      .then(async (res) => {
        if (res.status === 401) {
          // Expired — clear and redirect to re-auth
          localStorage.removeItem("dilly_auth_token");
          try { sessionStorage.removeItem(AUTH_USER_CACHE_KEY); } catch { /* ignore */ }
          hasRedirected.current = true;
          window.location.replace("http://localhost:3001/onboarding/verify?returning=true");
          return null;
        }
        if (!res.ok) {
          // Network / server error — show app with cached data, do NOT redirect
          setAllowMainApp(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          const u = { email: data.email ?? "", subscribed: true };
          setUser(u);
          try {
            sessionStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify({ ...u, ts: Date.now() }));
          } catch { /* ignore */ }
          setAllowMainApp(true);
        }
      })
      .catch(() => {
        // API down — show app anyway, do NOT redirect
        setAllowMainApp(true);
      })
      .finally(() => setAuthLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle redirects from standalone Jobs page (open tab only; never auto-open Voice on login)
  // Explicitly close Voice overlay on login — never auto-open Dilly (Voice) when user logs in
  useEffect(() => {
    if (typeof window === "undefined" || !user?.subscribed) return;
    let preserveLaunchVoice = false;
    try {
      preserveLaunchVoice = sessionStorage.getItem(DILLY_OPEN_OVERLAY_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (!preserveLaunchVoice) {
      voiceAuditReportIdRef.current = null;
      voiceCertLandingRef.current = null;
      setVoiceOverlayOpen(false);
    }
    try {
      sessionStorage.removeItem("dilly_pending_voice_prompt");
      if (!preserveLaunchVoice) sessionStorage.removeItem(PENDING_VOICE_KEY);
      if (typeof localStorage !== "undefined") localStorage.removeItem("dilly_pending_voice_prompt");
      const openTab = sessionStorage.getItem("dilly_open_tab");
      if (openTab === "hiring") {
        sessionStorage.removeItem("dilly_open_tab");
        setMainAppTab("hiring");
        setReviewSubView("home");
      }
    } catch { /* ignore */ }
  }, [user?.subscribed]);

  // Store referral code from ?ref= when user lands (for attribution at sign-up/subscribe)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim();
    if (ref && ref.length >= 4 && ref.length <= 16) {
      try {
        sessionStorage.setItem("dilly_ref", ref);
        const rest = [...params.entries()].filter(([k]) => k !== "ref");
        const qs = rest.length ? "?" + new URLSearchParams(rest).toString() : "";
        window.history.replaceState({}, "", window.location.pathname + qs);
      } catch { /* ignore */ }
    }
  }, []);

  // Stripe success redirect: clean URL (subscription no longer gates the app)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscription") !== "success") return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/auth/me`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUser({ email: data?.email ?? "", subscribed: true });
        try {
          localStorage.removeItem(ONBOARDING_STEP_KEY);
        } catch {
          /* ignore */
        }
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch(() => {});
  }, []);

  // Load profile for Career Center home
  useEffect(() => {
    if (!user?.email) {
      setAppProfile(null);
      setProfileFetchDone(true);
      return;
    }
    if (!localStorage.getItem("dilly_auth_token")) {
      setProfileFetchDone(true);
      return;
    }

    setProfileFetchDone(false);

    // Hydrate immediately from cache so data is visible before the API responds
    const cacheKey = `${PROFILE_CACHE_KEY_BASE}_${user.email}`;
    let loadedFromCache = false;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && typeof cached === "object") {
          const merged = { ...cached, onboarding_complete: cached.onboarding_complete === true };
          setAppProfile(merged);
          if (cached.application_target && ["internship", "full_time", "exploring"].includes(cached.application_target)) {
            setApplicationTarget(cached.application_target);
          }
          if (typeof cached.voice_avatar_index === "number" && cached.voice_avatar_index >= 0 && cached.voice_avatar_index < VOICE_AVATAR_OPTIONS.length) {
            setVoiceAvatarIndex(cached.voice_avatar_index);
          } else {
            setVoiceAvatarIndex(DEFAULT_VOICE_AVATAR_INDEX);
          }
          loadedFromCache = true;
        }
      }
      // Fallback: if no cache, try voice avatar localStorage (user chose before; survives before profile fetch)
      if (!loadedFromCache) {
        const avatarRaw = localStorage.getItem(voiceStorageKey("avatar", user.email));
        if (avatarRaw !== null) {
          const idx = parseInt(avatarRaw, 10);
          if (!isNaN(idx) && idx >= 0 && idx < VOICE_AVATAR_OPTIONS.length) {
            setVoiceAvatarIndex(idx);
          } else {
            setVoiceAvatarIndex(DEFAULT_VOICE_AVATAR_INDEX);
          }
        } else {
          setVoiceAvatarIndex(DEFAULT_VOICE_AVATAR_INDEX);
        }
      }
    } catch { /* ignore */ }

    const ac = new AbortController();
    dilly.fetch(`/profile`, { signal: ac.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data === "object") {
          const profile = {
            name: data.name ?? null,
            major: data.major ?? null,
            majors: Array.isArray(data.majors) ? data.majors : (data.major ? [data.major] : []),
            minors: Array.isArray(data.minors) ? data.minors : [],
            goals: Array.isArray(data.goals) ? data.goals : [],
            track: data.track ?? null,
            preProfessional: !!data.preProfessional,
            application_target: data.application_target ?? null,
            application_target_label: data.application_target_label ?? null,
            career_goal: data.career_goal ?? null,
            deadlines: Array.isArray(data.deadlines) ? data.deadlines : [],
            target_school: data.target_school ?? null,
            profile_slug: data.profile_slug ?? null,
            profile_background_color: data.profile_background_color ?? null,
            profile_tagline: data.profile_tagline ?? null,
            profile_theme: data.profile_theme ?? null,
            profile_bio: data.profile_bio ?? null,
            voice_memory: Array.isArray(data.voice_memory) ? data.voice_memory : [],
            job_locations: Array.isArray(data.job_locations) ? data.job_locations : [],
            job_location_scope: data.job_location_scope ?? null,
            voice_avatar_index: typeof data.voice_avatar_index === "number" ? data.voice_avatar_index : undefined,
            custom_tagline: data.custom_tagline ?? null,
            share_card_achievements: Array.isArray(data.share_card_achievements) ? data.share_card_achievements : [],
            share_card_metric: (data.share_card_metric === "smart" || data.share_card_metric === "grit" || data.share_card_metric === "build" || data.share_card_metric === "mts" || data.share_card_metric === "ats") ? data.share_card_metric : null,
            achievements: data.achievements && typeof data.achievements === "object" ? data.achievements : {},
            first_audit_snapshot: data.first_audit_snapshot ?? null,
            first_application_at: typeof data.first_application_at === "number" ? data.first_application_at : null,
            first_interview_at: typeof data.first_interview_at === "number" ? data.first_interview_at : null,
            got_interview_at: typeof data.got_interview_at === "number" ? data.got_interview_at : null,
            got_offer_at: typeof data.got_offer_at === "number" ? data.got_offer_at : null,
            outcome_story_consent: data.outcome_story_consent === true || data.outcome_story_consent === false ? data.outcome_story_consent : null,
            outcome_prompt_dismissed_at: typeof data.outcome_prompt_dismissed_at === "number" ? data.outcome_prompt_dismissed_at : null,
            voice_tone: data.voice_tone ?? null,
            voice_notes: Array.isArray(data.voice_notes) ? data.voice_notes : [],
            voice_onboarding_done: data.voice_onboarding_done === true,
            voice_onboarding_answers: Array.isArray(data.voice_onboarding_answers) ? data.voice_onboarding_answers : undefined,
            transcript_uploaded_at: data.transcript_uploaded_at ?? null,
            transcript_gpa: typeof data.transcript_gpa === "number" ? data.transcript_gpa : null,
            transcript_bcpm_gpa: typeof data.transcript_bcpm_gpa === "number" ? data.transcript_bcpm_gpa : null,
            transcript_courses: Array.isArray(data.transcript_courses) ? data.transcript_courses : [],
            transcript_honors: Array.isArray(data.transcript_honors) ? data.transcript_honors : [],
            transcript_major: data.transcript_major ?? null,
            transcript_minor: data.transcript_minor ?? null,
            transcript_warnings: Array.isArray(data.transcript_warnings) ? data.transcript_warnings : [],
            streak: data.streak && typeof data.streak === "object" ? data.streak : undefined,
            onboarding_complete: data.onboarding_complete === true,
          };
          setAppProfile(profile);
          if (Array.isArray(data.voice_memory) && data.voice_memory.length > 0) {
            setVoiceMemory(data.voice_memory);
          } else {
            try {
              const s = localStorage.getItem(voiceStorageKey("memory", user.email));
              if (s) {
                const p = JSON.parse(s);
                if (Array.isArray(p) && p.length > 0) setVoiceMemory(p);
              }
            } catch { /* ignore */ }
          }
          try { localStorage.setItem(cacheKey, JSON.stringify(profile)); } catch { /* ignore */ }
          if (profile.application_target && ["internship", "full_time", "exploring"].includes(profile.application_target)) {
            setApplicationTarget(profile.application_target);
          }
          // Auto check-in for streak (fire-and-forget — no blocking)
          dilly.fetch(`/streak/checkin`, {
            method: "POST",
          }).then((r) => r.ok ? r.json() : null).then((d) => {
            if (d) {
              setAppProfile((prev) => prev ? { ...prev, streak: { current_streak: d.streak, longest_streak: d.longest_streak, last_checkin: d.today } } : prev);
            }
          }).catch(() => {});
          // Voice avatar: backend takes precedence. If null/undefined, use default (man PNG).
          if (typeof data.voice_avatar_index === "number" && data.voice_avatar_index >= 0 && data.voice_avatar_index < VOICE_AVATAR_OPTIONS.length) {
            setVoiceAvatarIndex(data.voice_avatar_index);
          } else {
            setVoiceAvatarIndex(DEFAULT_VOICE_AVATAR_INDEX);
          }
        } else if (!loadedFromCache) {
          // Only clear if we have nothing cached; don't wipe local data on a transient API failure
          setAppProfile(null);
        }
      })
      .catch((err: unknown) => {
        if (err && typeof err === "object" && (err as { name?: string }).name === "AbortError") return;
        // API unreachable; keep cached data if we already hydrated from it
        if (!loadedFromCache) setAppProfile(null);
      })
      .finally(() => {
        setProfileFetchDone(true);
      });
    return () => ac.abort();
  }, [user?.email, centerRefreshKey, voiceCalendarSyncKey]);


  // Sync voice avatar to notification banner (so "I noted that" banners show user's chosen avatar)
  useEffect(() => {
    setNotificationVoiceAvatar(voiceAvatarIndex ?? DEFAULT_VOICE_AVATAR_INDEX);
  }, [voiceAvatarIndex, setNotificationVoiceAvatar]);

  // Tap banner → open Voice overlay
  useEffect(() => {
    setNotificationTapHandler(() => setVoiceOverlayOpen(true));
    return () => setNotificationTapHandler(null);
  }, [setNotificationTapHandler]);

  // Scroll to top when navigating to Insights (Hiring tab)
  useEffect(() => {
    if (mainAppTab === "hiring" && reviewSubView === "insights") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [mainAppTab, reviewSubView]);

  // When opening Calendar, jump to the month of the soonest active deadline if the current month has none (avoids "empty" grid)
  useEffect(() => {
    const prev = prevTabForCalendarSnapRef.current;
    prevTabForCalendarSnapRef.current = mainAppTab;
    if (mainAppTab !== "calendar" || prev === "calendar") return;
    const dls = (appProfile?.deadlines || []).filter((d) => d.date && d.label && !d.completedAt);
    if (!dls.length) return;
    setCalendarMonth((cm) => {
      const hasInMonth = dls.some((d) => {
        const parts = d.date.slice(0, 10).split("-");
        if (parts.length !== 3) return false;
        const y = Number(parts[0]);
        const mo = Number(parts[1]) - 1;
        return y === cm.year && mo === cm.month;
      });
      if (hasInMonth) return cm;
      const sorted = [...dls].sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0].date.slice(0, 10);
      const parts = first.split("-");
      if (parts.length !== 3) return cm;
      return { year: Number(parts[0]), month: Number(parts[1]) - 1 };
    });
  }, [mainAppTab, appProfile?.deadlines]);

  // Persist Career Center path so Back on child pages (ATS, Jobs, etc.) returns here instead of new audit
  useEffect(() => {
    if (mainAppTab === "hiring" && reviewSubView === "upload") return; // Skip upload (new audit) flow
    let path = "/?tab=center";
    if (mainAppTab === "hiring" && reviewSubView === "insights") path = "/?tab=insights";
    else if (mainAppTab === "hiring" && reviewSubView === "home") path = "/score";
    else if (mainAppTab === "calendar") path = "/?tab=calendar";
    else if (mainAppTab === "resources") {
      path = getHiredSubTab === "jobs" ? "/?tab=resources&view=jobs" : "/?tab=resources";
    }
    else if (mainAppTab === "practice") path = "/?tab=practice";
    setCareerCenterReturnPath(path);
  }, [mainAppTab, reviewSubView, getHiredSubTab]);

  // Clear stale pending Voice prompt on load unless a handoff is opening the overlay (e.g. launch splash gold CTA)
  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    try {
      if (sessionStorage.getItem(DILLY_OPEN_OVERLAY_KEY) === "1") return;
      sessionStorage.removeItem(PENDING_VOICE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // When entering Voice tab, snapshot audit ts so we can detect "fresh" audits later. Must be in useEffect, not during render.
  useEffect(() => {
    if (mainAppTab !== "voice" && !voiceOverlayOpen) return;
    const latest = auditHistory[0]?.ts ?? null;
    if (latest !== null && lastAuditTsOnVoiceEnter === null) {
      setLastAuditTsOnVoiceEnter(latest);
    }
    // Midnight easter egg
    const egg = checkMidnightEasterEgg();
    if (egg) {
      if (egg.sound) playSound("badge_unlock");
      toast(egg.message, "success", 5000);
    }
  }, [mainAppTab, voiceOverlayOpen, auditHistory, lastAuditTsOnVoiceEnter]);

  // When entering Voice, snapshot state; when leaving, check for captured memory from latest conversation.
  useEffect(() => {
    const voiceActive = mainAppTab === "voice" || voiceOverlayOpen;
    if (voiceActive && !prevVoiceActiveRef.current) {
      voiceMemoryLengthAtVoiceEnterRef.current = voiceMemory.length;
    }
    if (!voiceActive && prevVoiceActiveRef.current) {
      const recap = computeVoiceSessionRecap(voiceMessagesRef.current);
      if (recap) {
        persistVoiceSessionRecap(recap);
        setVoiceRecapNonce((n) => n + 1);
      }
      const convId = latestVoiceConvIdRef.current;
      if (convId) {
        dilly.fetch(`/memory/session-capture/${encodeURIComponent(convId)}`, {
          })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            const cap = d?.capture as SessionCapture | undefined;
            if (!cap || !Array.isArray(cap.items) || cap.items.length === 0) return;
            const hasUnseen = cap.items.some((item) => !item.shown_to_user);
            const captureId = typeof cap.id === "string" ? cap.id : convId;
            if (hasUnseen && !sessionCaptureShownRef.current.has(captureId)) {
              sessionCaptureShownRef.current.add(captureId);
              setPendingSessionCaptureCard(cap);
            }
          })
          .catch(() => null);
        // Fetch latest conversation output for the post-session card
        const dismissedKey = `conv_output_dismissed_${convId}`;
        if (typeof localStorage !== "undefined" && !localStorage.getItem(dismissedKey)) {
          dilly.fetch(`/voice/history/${encodeURIComponent(convId)}`, {
            })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d && Array.isArray(d.summary_lines) && d.summary_lines.length > 0) {
                setLatestConversationOutput(d as ConversationOutput);
              }
            })
            .catch(() => null);
        }
      }
    }
    prevVoiceActiveRef.current = voiceActive;
  }, [mainAppTab, voiceOverlayOpen, voiceMemory.length]);

  useEffect(() => {
    if (!user?.subscribed) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/memory`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setMemoryItems(Array.isArray(d?.items) ? (d.items as MemoryItem[]) : []);
      })
      .catch(() => {
        setMemoryItems([]);
      });
  }, [user?.subscribed, centerRefreshKey]);

  useEffect(() => {
    if (mainAppTab !== "center" || !user?.subscribed) return;
    setVoiceRecapForCard(readVoiceSessionRecap());
  }, [mainAppTab, user?.subscribed, voiceRecapNonce, centerRefreshKey]);

  const streakCelebrationInitRef = useRef(false);
  const prevStreakForCelebrationRef = useRef<number | undefined>(undefined);
  const auditCelebrationInitRef = useRef(false);
  const prevAuditCountForCelebrationRef = useRef(0);
  const appCelebrationInitRef = useRef(false);
  const prevAppCountForCelebrationRef = useRef(0);
  useEffect(() => {
    if (!user?.subscribed || habits?.streak == null) return;
    const s = habits.streak;
    if (!streakCelebrationInitRef.current) {
      streakCelebrationInitRef.current = true;
      prevStreakForCelebrationRef.current = s;
      return;
    }
    const prev = prevStreakForCelebrationRef.current;
    prevStreakForCelebrationRef.current = s;
    if (s >= 7 && (prev ?? 0) < 7) tryFireMicroCelebration("streak_7", toast);
  }, [habits?.streak, user?.subscribed, toast]);
  useEffect(() => {
    if (!user?.subscribed) return;
    const n = auditHistory.length;
    if (!auditCelebrationInitRef.current) {
      auditCelebrationInitRef.current = true;
      prevAuditCountForCelebrationRef.current = n;
      return;
    }
    const prev = prevAuditCountForCelebrationRef.current;
    if (prev === 0 && n === 1) tryFireMicroCelebration("first_audit", toast);
    prevAuditCountForCelebrationRef.current = n;
  }, [auditHistory.length, user?.subscribed, toast]);
  useEffect(() => {
    if (!user?.subscribed) return;
    const n = voiceApplicationsPreview.length;
    if (!appCelebrationInitRef.current) {
      appCelebrationInitRef.current = true;
      prevAppCountForCelebrationRef.current = n;
      return;
    }
    const prev = prevAppCountForCelebrationRef.current;
    if (prev === 0 && n === 1) tryFireMicroCelebration("first_application", toast);
    prevAppCountForCelebrationRef.current = n;
  }, [voiceApplicationsPreview.length, user?.subscribed, toast]);

  useEffect(() => {
    const needsPulse = mainAppTab === "center";
    if (!needsPulse || !user?.subscribed) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/cohort-pulse/current`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const row = d && typeof d === "object" ? (d as UserCohortPulse & { cohort: CohortPulse }) : null;
        setCurrentCohortPulse(row);
      })
      .catch(() => setCurrentCohortPulse(null));
  }, [mainAppTab, user?.subscribed, centerRefreshKey]);

  // Fetch proactive nudges and habits when Center or Voice is active
  useEffect(() => {
    const needsNudges = mainAppTab === "center" || mainAppTab === "voice" || voiceOverlayOpen;
    if (!needsNudges || !user?.subscribed) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/voice/proactive-nudges`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const lines = Array.isArray(d?.proactive_lines) ? d.proactive_lines : [];
        setProactiveLines(lines);
        const nudges = d?.proactive_nudges;
        setProactiveNudges(nudges && typeof nudges === "object" ? nudges : null);
      })
      .catch(() => {
        setProactiveLines([]);
        setProactiveNudges(null);
      });
    dilly.fetch(`/habits`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHabits(d && typeof d === "object" ? d : null))
      .catch(() => setHabits(null));
    dilly.fetch(`/applications`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const rows =
          d && typeof d === "object" && Array.isArray((d as { applications?: unknown }).applications)
            ? (d as { applications: Record<string, unknown>[] }).applications
            : [];
        setVoiceApplicationsPreview(
          rows
            .slice(0, 15)
            .map((a) => ({
              company: String(a.company ?? "").trim(),
              role: a.role ? String(a.role).trim() : undefined,
              status: a.status ? String(a.status).trim() : undefined,
              deadline:
                a.deadline != null && String(a.deadline).trim() ? String(a.deadline).trim() : null,
            }))
            .filter((a) => a.company),
        );
      })
      .catch(() => setVoiceApplicationsPreview([]));
  }, [mainAppTab, voiceOverlayOpen, user?.subscribed, centerRefreshKey]);

  // Auto-send pending Voice prompt only when it was set by "Open in Dilly AI" / handoff (not when user just opened Dilly from the tab bar)
  useEffect(() => {
    const voiceActive = mainAppTab === "voice" || voiceOverlayOpen;
    if (!voiceActive || !pendingVoicePrompt || !allowAutoSendPendingRef.current) return;
    const p = pendingVoicePrompt;
    const trySend = (attempt = 0) => {
      if (!allowAutoSendPendingRef.current) return;
      if (voiceSendRef.current) {
        allowAutoSendPendingRef.current = false;
        setPendingVoicePrompt(null);
        voiceSendRef.current(p);
      } else if (attempt < 20) {
        setTimeout(() => trySend(attempt + 1), 50);
      }
    };
    const t = setTimeout(() => trySend(), 150);
    return () => clearTimeout(t);
  }, [mainAppTab, voiceOverlayOpen, pendingVoicePrompt]);

  useEffect(() => {
    setVoiceMockInterviewSession(null);
  }, [activeVoiceConvId]);

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
  }, []);

  // Voice onboarding: when first opening Voice and onboarding not done, fetch initial question and show it as first message
  // Returning users with an empty convo see the normal empty state + starter suggestions (no auto-injected insight).
  const voiceOnboardingFetchedRef = useRef(false);
  useEffect(() => {
    const voiceActive = mainAppTab === "voice" || voiceOverlayOpen;
    const isReturningUser = appProfile?.voice_onboarding_done === true || auditHistory.length > 0;
    if (!voiceActive || !user?.email || !appProfile || isReturningUser || voiceMessages.length > 0) return;
    if (voiceOnboardingFetchedRef.current) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    voiceOnboardingFetchedRef.current = true;
    dilly.fetch(`/voice/onboarding-state`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const topic = typeof data?.conversation_topic === "string" ? data.conversation_topic : undefined;
        const title = topic === "voice_onboarding" ? "Getting to know you" : "New Chat";
        const msgs = Array.isArray(data?.initialMessages) ? data.initialMessages : (data?.initialMessage ? [data.initialMessage] : []);
        if (msgs.length === 0) return;

        // Single message only — no stagger. Wait for user response before Dilly says more.
        const content = msgs[0];
        const assistantMsg = { role: "assistant" as const, content, ts: Date.now() };
        setVoiceMessages([assistantMsg]);
        if (activeVoiceConvId) {
          setVoiceConvos((prev) => prev.map((c) => (c.id === activeVoiceConvId ? { ...c, title, messages: [assistantMsg], updatedAt: Date.now() } : c)));
        } else {
          const newConvo: VoiceConvo = { id: safeUuid(), title, messages: [assistantMsg], updatedAt: Date.now(), createdAt: Date.now() };
          setVoiceConvos((prev) => [...prev, newConvo]);
          setOpenVoiceConvIds((prev) => [newConvo.id, ...prev.filter((x) => x !== newConvo.id)]);
          setActiveVoiceConvId(newConvo.id);
        }
      });
  }, [mainAppTab, voiceOverlayOpen, user?.email, appProfile?.voice_onboarding_done, auditHistory.length, voiceMessages.length, activeVoiceConvId]);

  /** Profile-based starter suggestions for Voice overlay (new chat). Mirrors Career Center "Ask Dilly AI" logic. */
  const voiceStarterSuggestions = useMemo(() => {
    const displayAudit = viewingAudit ?? audit ?? savedAuditForCenter;
    const activeDeadlines = (appProfile?.deadlines || []).filter((d) => d.date && d.label && !d.completedAt);
    const urgentBannerDeadline = activeDeadlines.find((d) => {
      try {
        const days = (new Date(d.date).getTime() - Date.now()) / 86400000;
        return days >= 0 && days <= 7;
      } catch {
        return false;
      }
    });
    const soonestDeadline = activeDeadlines.find((d) => {
      try {
        const days = (new Date(d.date).getTime() - Date.now()) / 86400000;
        return days >= 0 && days < 14;
      } catch {
        return false;
      }
    });

    const candidates: { label: string; priority: number }[] = [];
    if (displayAudit) {
      const topThree = getTopThreeActions(displayAudit);
      const traj = computeScoreTrajectory(displayAudit);
      const trajGains = traj ? (["smart", "grit", "build"] as const).filter((k) => (traj[k] ?? 0) - (displayAudit.scores?.[k] ?? 0) >= 3) : [];
      const scores = displayAudit.scores ?? { smart: 0, grit: 0, build: 0 };
      const dims: { k: "smart" | "grit" | "build"; v: number; label: string }[] = [
        { k: "smart", v: scores.smart, label: "Smart" },
        { k: "grit", v: scores.grit, label: "Grit" },
        { k: "build", v: scores.build, label: "Build" },
      ];
      const lowestDim = dims.reduce((a, b) => (b.v < a.v ? b : a));
      const topFinding = displayAudit.audit_findings?.[0];

      if (topThree.length > 0) {
        const { label } = toNaturalSuggestion(topThree[0].title, topThree[0].type, topThree[0].suggestedLine);
        candidates.push({ label, priority: 10 });
      }
      if (urgentBannerDeadline) {
        candidates.push({ label: `How do I prepare for my ${urgentBannerDeadline.label}?`, priority: 9 });
      }
      if (trajGains.length > 0) {
        candidates.push({ label: "What's my score potential?", priority: 8 });
      }
      if (lowestDim.v < LOW_SCORE_THRESHOLD) {
        candidates.push({ label: `How can I help boost my ${lowestDim.label} score?`, priority: 7 });
      }
      if (soonestDeadline && !urgentBannerDeadline) {
        candidates.push({ label: `How do I prepare for my ${soonestDeadline.label}?`, priority: 6 });
      }
      const appTarget = (appProfile?.application_target_label ?? appProfile?.application_target)?.trim();
      if (appTarget) {
        candidates.push({ label: `How do I prepare for my ${appTarget}?`, priority: 5 });
      }
      const careerGoal = appProfile?.career_goal?.trim();
      if (careerGoal) {
        candidates.push({ label: `How do I work toward ${careerGoal}?`, priority: 4 });
      }
      const track = getEffectiveCohortLabel(displayAudit.detected_track, appProfile?.track);
      if (track) {
        candidates.push({ label: `What do ${track} recruiters look for in my resume?`, priority: 4 });
      }
      if (topFinding && topFinding.length < 120) {
        candidates.push({ label: "How can I help fix this?", priority: 3 });
      }
    }
    candidates.push({ label: "How can I add metrics to my bullets?", priority: 2 });
    candidates.push({ label: "How do I prepare for my interview?", priority: 0 });

    // Emotional support: invite sharing rejection, nerves, celebration
    candidates.push({ label: "I got rejected — help me reframe", priority: 5 });
    candidates.push({ label: "I'm nervous about my interview", priority: 5 });
    candidates.push({ label: "I got an offer — what should I do next?", priority: 4 });

    // Proactive nudges: visible prompts from app funnel, relationships, deadline
    const nudges = proactiveNudges;
    const app = nudges?.app_funnel as { applied?: number; interviews?: number; silent_2_weeks?: number } | undefined;
    if (app && ((app.applied ?? 0) + (app.interviews ?? 0)) > 0 && (app.silent_2_weeks ?? 0) > 0) {
      candidates.push({ label: `${app.silent_2_weeks} apps silent 2+ weeks — want follow-up templates?`, priority: 8 });
    }
    if (nudges?.relationship_nudges?.length) {
      const r = nudges.relationship_nudges[0];
      candidates.push({ label: `Check in with ${r.person}?`, priority: 7 });
    }
    if (nudges?.deadline_urgent) {
      candidates.push({ label: `${nudges.deadline_urgent.label} in ${nudges.deadline_urgent.days} days — prep?`, priority: 9 });
    }

    // Contextual recall: surface prompts from stored people/companies (beyond_resume)
    const beyondResume = (appProfile as { beyond_resume?: { type?: string; text?: string }[] })?.beyond_resume ?? [];
    const people = beyondResume.filter((b) => (b.type || "").toLowerCase() === "person").map((b) => (b.text || "").trim()).filter(Boolean);
    const companies = beyondResume.filter((b) => (b.type || "").toLowerCase() === "company").map((b) => (b.text || "").trim()).filter(Boolean);
    people.slice(0, 2).forEach((p) => {
      const short = p.length > 25 ? p.slice(0, 22) + "…" : p;
      candidates.push({ label: `Prep for follow-up with ${short}`, priority: 7 });
    });
    companies.slice(0, 2).forEach((c) => {
      const short = c.length > 30 ? c.slice(0, 27) + "…" : c;
      candidates.push({ label: `How do I follow up with ${short}?`, priority: 6 });
    });

    if (beyondResume.length < 3) {
      candidates.push({ label: "How can I help Dilly know me better?", priority: 2 });
    }

    return candidates
      .sort((a, b) => b.priority - a.priority)
      .filter((c, i, arr) => arr.findIndex((x) => x.label === c.label) === i)
      .slice(0, 3)
      .map((c) => c.label);
  }, [viewingAudit, audit, savedAuditForCenter, appProfile, proactiveNudges]);

  // Hydrate Career Center "Your numbers" from last saved audit (e.g. after refresh)
  useEffect(() => {
    if (!user?.email) return;
    try {
      const raw = localStorage.getItem(auditStorageKey(user?.email));
      if (raw) {
        const parsed = JSON.parse(raw) as AuditV2;
        if (parsed && typeof parsed.scores === "object" && parsed.final_score != null && !isNaN(Number(parsed.final_score))) {
          setSavedAuditForCenter(parsed);
          latestAuditRef.current = parsed;
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setSavedAuditForCenter(null);
  }, [user?.email]);

  // Clear voice state when user logs out (so next user doesn't see previous user's chats)
  useEffect(() => {
    if (!user?.email) {
      setVoiceConvos([]);
      setActiveVoiceConvId(null);
      setVoiceMessages([]);
      setVoiceMessageQueue([]);
      setVoiceInput("");
      setVoiceStreamingText("");
      setVoiceFollowUpSuggestions([]);
      setVoiceActionItems([]);
      setVoiceCompany("");
      setVoiceMemory([]);
      voiceOnboardingFetchedRef.current = false;
    }
  }, [user?.email]);

  // Offline detection
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);
    setIsOffline(!navigator.onLine);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // Sync primary goal input when profile loads (must run before any conditional returns to satisfy Rules of Hooks)
  useEffect(() => {
    const val = appProfile?.career_goal?.trim() || (appProfile?.goals?.length ? (GOALS_ALL.find((o) => o.key === appProfile!.goals![0])?.label ?? appProfile!.goals![0]) : "") || "";
    setPrimaryGoalInput(val);
  }, [appProfile?.career_goal, appProfile?.goals]);

  // Sync application target label input when profile loads
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
  }, [user?.subscribed, appProfile, school]);

  // Load voice data when user logs in (scoped per user so chats stay with the right person)
  useEffect(() => {
    if (!user?.email) return;
    const email = user.email;
    try {
      const convosKey = voiceStorageKey("convos", email);
      const stored = localStorage.getItem(convosKey);
      const parsed = stored ? JSON.parse(stored) : null;
      const convos = Array.isArray(parsed)
        ? parsed.filter((c: unknown) => c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string").map((c: { id: string; title?: string; messages?: unknown[]; updatedAt?: number; createdAt?: number }) => ({
            id: c.id,
            title: typeof c.title === "string" ? c.title : "Chat",
            messages: Array.isArray(c.messages) ? c.messages.filter((m): m is { role: "user" | "assistant"; content: string } => {
              const msg = m as Record<string, unknown>;
              return msg && typeof msg === "object" && (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string";
            }) : [],
            updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : Date.now(),
            createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
          }))
        : [];
      setVoiceConvos(convos);
      if (convos.some((c) => c.messages.length > 0)) {
        markDillyVoiceIntroSeen(email);
      }
    } catch { setVoiceConvos([]); }
    try {
      const openKey = voiceStorageKey("open_tabs", email);
      const openStored = localStorage.getItem(openKey);
      const openParsed = openStored ? JSON.parse(openStored) : null;
      const openIds = Array.isArray(openParsed) ? openParsed.filter((id: unknown) => typeof id === "string") : [];
      setOpenVoiceConvIds(openIds);
    } catch { setOpenVoiceConvIds([]); }
    try {
      const itemsKey = voiceStorageKey("action_items", email);
      const s = localStorage.getItem(itemsKey);
      if (s) { const p = JSON.parse(s); if (Array.isArray(p)) setVoiceActionItems(p); }
      else setVoiceActionItems([]);
    } catch { setVoiceActionItems([]); }
    try {
      const companyKey = voiceStorageKey("company", email);
      const v = localStorage.getItem(companyKey) || "";
      setVoiceCompany(v);
    } catch { setVoiceCompany(""); }
    try {
      const memoryKey = voiceStorageKey("memory", email);
      const s = localStorage.getItem(memoryKey);
      if (s) { const p = JSON.parse(s); if (Array.isArray(p)) setVoiceMemory(p); }
    } catch { /* voice memory loaded from profile or stays default */ }
    try {
      const avatarKey = voiceStorageKey("avatar", email);
      const v = localStorage.getItem(avatarKey);
      if (v !== null && v !== "") {
        const idx = parseInt(v, 10);
        if (Number.isInteger(idx) && idx >= 0) {
          const migrated = idx === 10 ? 9 : idx > 10 ? idx - 1 : idx;
          if (migrated < VOICE_AVATAR_OPTIONS.length) setVoiceAvatarIndex(migrated);
        }
      } else {
        setVoiceAvatarIndex(DEFAULT_VOICE_AVATAR_INDEX);
      }
    } catch { setVoiceAvatarIndex(DEFAULT_VOICE_AVATAR_INDEX); }
  }, [user?.email]);

  // First-time Dilly AI intro: mark complete when user leaves Voice tab or closes overlay (so the long copy stays for the whole first visit).
  useEffect(() => {
    if (!user?.email) return;
    const onVoice = mainAppTab === "voice" || voiceOverlayOpen;
    if (!onVoice) return;
    const introAlreadyDone = hasCompletedDillyVoiceIntro(user.email);
    return () => {
      if (!introAlreadyDone) markDillyVoiceIntroSeen(user.email);
    };
  }, [user?.email, mainAppTab, voiceOverlayOpen]);

  // Fetch profile photo when user is loaded. Persists across refreshes and sign-in via localStorage cache.
  // Uses priority: high to load faster when visible.
  useEffect(() => {
    if (!user?.email) {
      setProfilePhotoUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
      return;
    }
    // Hydrate immediately from cache (survives refresh and sign-in)
    try {
      const cached = localStorage.getItem(profilePhotoCacheKey(user.email));
      if (cached && cached.startsWith("data:image/")) {
        setProfilePhotoUrl(cached);
      }
    } catch { /* ignore */ }

    if (!localStorage.getItem("dilly_auth_token")) return;
    let revoked = false;
    dilly.fetch(`/profile/photo`, {
      cache: "no-store",
    })
      .then((res) => {
        if (revoked) return;
        if (!res.ok) {
          if (res.status === 404) {
            try { localStorage.removeItem(profilePhotoCacheKey(user.email)); } catch {}
          }
          setProfilePhotoUrl(null);
          return null;
        }
        return res.blob();
      })
      .then((blob) => {
        if (revoked || !blob) return;
        const objUrl = URL.createObjectURL(blob);
        setProfilePhotoUrl((prev) => {
          if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
          return objUrl;
        });
        // Cache thumbnail for next load (survives refresh and sign-in)
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const size = 128;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, size, size);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
              if (dataUrl.length < 100_000) localStorage.setItem(profilePhotoCacheKey(user.email), dataUrl);
            }
          } catch { /* ignore */ }
        };
        img.src = objUrl;
      })
      .catch(() => {
        if (!revoked) setProfilePhotoUrl(null);
      });
    return () => {
      revoked = true;
      setProfilePhotoUrl((u) => { if (u && u.startsWith("blob:")) URL.revokeObjectURL(u); return null; });
    };
  }, [user?.email]);

  // Sync appProfile to localStorage so deadlines, goals, and calendar data survive refreshes
  useEffect(() => {
    if (!user?.email || !appProfile) return;
    try {
      const cacheKey = `${PROFILE_CACHE_KEY_BASE}_${user.email}`;
      localStorage.setItem(cacheKey, JSON.stringify(appProfile));
    } catch { /* ignore */ }
  }, [appProfile, user?.email]);

  // Fetch audit history for Career Center
  useEffect(() => {
    if (!user?.email) {
      setAuditHistory([]);
      setAuditHistoryLoading(false);
      return;
    }
    if (!localStorage.getItem("dilly_auth_token")) {
      setAuditHistoryLoading(false);
      return;
    }
    setAuditHistoryLoading(true);
    dilly.fetch(`/audit/history`)
      .then((res) => (res.ok ? res.json() : { audits: [] }))
      .then((data) => {
        setAuditHistory(Array.isArray(data?.audits) ? data.audits : []);
        setAuditHistoryLoading(false);
      })
      .catch(() => {
        setAuditHistory([]);
        setAuditHistoryLoading(false);
      });
  }, [user?.email, centerRefreshKey]);

  // Fetch ATS score history + peer percentile for Career Center (refetch when opening Score tab so post-scan isn’t stale)
  useEffect(() => {
    if (!user?.email) {
      setAtsScoreHistory([]);
      setAtsPeerPercentile(null);
      return;
    }
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/ats-score/history`)
      .then((res) => (res.ok ? res.json() : { scores: [] }))
      .then((data) => {
        const scores = Array.isArray(data?.scores) ? data.scores : [];
        setAtsScoreHistory(scores);
        const pct = data?.ats_peer_percentile;
        setAtsPeerPercentile(typeof pct === "number" && pct >= 0 && pct <= 100 ? pct : null);
        if (scores.length > 0) {
          const s0 = scores[0] as { score?: unknown; ts?: unknown; audit_id?: unknown };
          const sc = Math.round(Number(s0.score));
          if (!Number.isNaN(sc)) {
            const tsSec = typeof s0.ts === "number" ? s0.ts : 0;
            writeLastAtsScoreCache({
              score: sc,
              ts: tsSec > 1e12 ? Math.round(tsSec) : Math.round(tsSec * 1000),
              audit_id: s0.audit_id != null && s0.audit_id !== "" ? String(s0.audit_id) : null,
            });
          }
        }
      })
      .catch(() => {
        setAtsScoreHistory([]);
        setAtsPeerPercentile(null);
      });
  }, [user?.email, centerRefreshKey, mainAppTab, reviewSubView]);

  // Door eligibility: one resume, one audit, many doors (for Career Center "Many doors" card)
  useEffect(() => {
    if (!user?.email || !user?.subscribed) {
      setDoorEligibility(null);
      return;
    }
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/door-eligibility`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.doors)) {
          setDoorEligibility({
            doors: data.doors,
            eligible_count: typeof data.eligible_count === "number" ? data.eligible_count : 0,
            next_door: data.next_door ?? null,
          });
        } else {
          setDoorEligibility(null);
        }
      })
      .catch(() => setDoorEligibility(null));
  }, [user?.email, user?.subscribed, centerRefreshKey]);

  // After login (or refresh): restore the latest audit. History list already includes scores — paint that first so we never hang on “Loading your previous audit…” if GET /audit/history/{id} is slow or stuck; then fetch full detail with a timeout.
  useEffect(() => {
    if (!user?.email || auditHistory.length === 0) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    const latest = auditHistory[0];
    const latestId = latest?.id?.trim();

    const rowUsable =
      latest &&
      typeof latest.scores === "object" &&
      latest.scores !== null &&
      (latest as { final_score?: unknown }).final_score != null &&
      !isNaN(Number((latest as { final_score?: unknown }).final_score));

    const applyMinimalFromHistory = () => {
      if (!rowUsable) return;
      const minimal = minimalAuditFromHistorySummary(latest as AuditHistorySummaryRow);
      setAudit(minimal);
      setSavedAuditForCenter(minimal);
      latestAuditRef.current = minimal;
    };

    const hydrateFromServer = () => {
      if (!latestId) return;
      dilly.fetch(`/audit/history/${encodeURIComponent(latestId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const full = data?.audit;
          if (full && typeof full === "object" && typeof full.scores === "object") {
            setAudit(full);
            setSavedAuditForCenter(full);
            latestAuditRef.current = full;
            try {
              localStorage.setItem(auditStorageKey(user?.email ?? ""), JSON.stringify(full));
            } catch { /* ignore */ }
          }
        })
        .catch(() => {});
    };

    const fromStorage = typeof localStorage !== "undefined" ? localStorage.getItem(auditStorageKey(user?.email ?? "")) : null;
    if (fromStorage) {
      try {
        const parsed = JSON.parse(fromStorage) as AuditV2;
        if (parsed && typeof parsed.scores === "object" && parsed.final_score != null && !isNaN(Number(parsed.final_score))) {
          const parsedId = parsed.id?.trim();
          if (latestId && parsedId && parsedId !== latestId) {
            applyMinimalFromHistory();
            hydrateFromServer();
            return;
          }
          setAudit(parsed);
          setSavedAuditForCenter(parsed);
          latestAuditRef.current = parsed;
          return;
        }
      } catch { /* ignore */ }
    }
    if (rowUsable) applyMinimalFromHistory();
    hydrateFromServer();
  }, [user?.email, auditHistory]);

  // Automatically update sticker sheet: compute new achievements from profile + audit history + ATS, then PATCH profile
  useEffect(() => {
    if (!user?.email || !appProfile) return;
    const audits = auditHistory.map((a) => ({
      id: a.id,
      ts: a.ts,
      scores: a.scores,
      final_score: a.final_score,
      detected_track: a.detected_track,
      peer_percentiles: a.peer_percentiles,
      page_count: a.page_count,
    }));
    const ctx = {
      profile: {
        achievements: appProfile.achievements ?? {},
        track: appProfile.track ?? null,
        first_application_at: (appProfile as { first_application_at?: number }).first_application_at ?? null,
        first_interview_at: (appProfile as { first_interview_at?: number }).first_interview_at ?? null,
        application_count: (appProfile as { application_count?: number }).application_count,
      },
      audits,
      streakDays: undefined,
      lastVisitDates: undefined,
    };
    const newUnlocks = computeNewUnlocks(ctx);
    if (Object.keys(newUnlocks).length === 0) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    const merged = Object.fromEntries(
      Object.entries({ ...(appProfile.achievements ?? {}), ...newUnlocks }).filter(([, v]) => v != null)
    ) as ProfileAchievements;
    dilly.fetch(`/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify({ achievements: merged }),
    })
      .then((res) => {
        if (res.ok) setAppProfile((prev) => (prev ? { ...prev, achievements: merged } : prev));
      })
      .catch(() => {});
  }, [user?.email, appProfile, auditHistory]);

  // Fetch recommended jobs when on Career Center or Get Hired tab (subscribed users)
  useEffect(() => {
    if (!user?.email || !user?.subscribed) return;
    if (mainAppTab !== "center" && mainAppTab !== "hiring") return;
    if (recommendedJobs.length > 0) return; // already loaded, don't refetch
    if (!localStorage.getItem("dilly_auth_token")) return;
    setJobsLoading(true);
    dilly.fetch(`/jobs/recommended?limit=15&offset=0`)
      .then((res) => (res.ok ? res.json() : { jobs: [] }))
      .then((data) => {
        const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
        setRecommendedJobs(jobs);
      })
      .catch(() => setRecommendedJobs([]))
      .finally(() => setJobsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, user?.subscribed, mainAppTab]);

  // Fetch Vs Your Peers cohort stats when on Review > Insights or Center (subscribed, have track)
  useEffect(() => {
    const onInsights = mainAppTab === "hiring" && reviewSubView === "insights";
    if (!user?.subscribed || (!onInsights && mainAppTab !== "center")) return;
    const auditT = savedAuditForCenter?.detected_track ?? audit?.detected_track;
    const track = getEffectiveCohortLabel(auditT, appProfile?.track);
    if (!track) return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/peer-cohort-stats?track=${encodeURIComponent(track)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.cohort_n === "number" && data.cohort_n > 0 && data.avg) setCohortStats(data as typeof cohortStats);
        else setCohortStats(null);
      })
      .catch(() => setCohortStats(null));
  }, [user?.subscribed, mainAppTab, reviewSubView, savedAuditForCenter?.detected_track, audit?.detected_track, appProfile?.track]);


  const shareCardRef = useRef<HTMLDivElement>(null);
  /** Last audit ts we fired milestone confetti for (so we only celebrate once per improvement). */
  const milestoneCelebratedForTsRef = useRef<number | null>(null);
  const [achievementPickerSlot, setAchievementPickerSlot] = useState<0 | 1 | 2 | null>(null);
  const [achievementPickerClosing, setAchievementPickerClosing] = useState(false);
  /** Slot currently playing pop-out animation so we remove after it finishes */
  const [shareCardDeselectingSlot, setShareCardDeselectingSlot] = useState<number | null>(null);
  /** Slot that just had a sticker added (play pop-in animation, then clear) */
  const [shareCardAddingSlot, setShareCardAddingSlot] = useState<number | null>(null);
  /** WebKit: share with files must run on a fresh user gesture — first tap renders PNG, second tap opens share sheet. */
  const [shareImageSheet, setShareImageSheet] = useState<{ file: File; shareText: string; title: string } | null>(null);
  const [shareImagePreparing, setShareImagePreparing] = useState(false);

  const captureShareCardAsPngFile = useCallback(async (): Promise<{ file: File; canvas: HTMLCanvasElement } | null> => {
    const el = shareCardRef.current;
    if (!el) return null;
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ebe9e6",
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png", 1));
      if (!blob) return null;
      const file = new File([blob], "dilly-score-card.png", { type: "image/png" });
      return { file, canvas };
    } catch {
      return null;
    }
  }, []);

  // Celebrate once when user crosses a score milestone (50/70/85) and lands on Center
  useEffect(() => {
    if (mainAppTab !== "center" || auditHistory.length < 2) return;
    const current = auditHistory[auditHistory.length - 1];
    const prev = auditHistory[auditHistory.length - 2];
    const ts = current?.ts;
    if (ts == null || milestoneCelebratedForTsRef.current === ts) return;
    const crossed = scoresCrossedMilestones(current, prev);
    if (crossed.length > 0) {
      milestoneCelebratedForTsRef.current = ts;
      fireConfetti();
      playSound("celebration");
    }
  }, [mainAppTab, auditHistory]);

  // Reset viewingAudit when returning to Career Center so it always shows the latest data
  useEffect(() => {
    if (mainAppTab === "center") setViewingAudit(null);
  }, [mainAppTab]);

  // Persist voice action items to localStorage (per user)
  useEffect(() => {
    if (!user?.email) return;
    try { localStorage.setItem(voiceStorageKey("action_items", user.email), JSON.stringify(voiceActionItems)); } catch {}
  }, [voiceActionItems, user?.email]);

  // Persist voice company target to localStorage (per user)
  useEffect(() => {
    if (!user?.email) return;
    try { localStorage.setItem(voiceStorageKey("company", user.email), voiceCompany); } catch {}
  }, [voiceCompany, user?.email]);

  // Persist voice avatar to localStorage, profile cache, and backend (survives refreshes and sign outs)
  useEffect(() => {
    if (!user?.email) return;
    const idx = voiceAvatarIndex ?? DEFAULT_VOICE_AVATAR_INDEX;
    try { localStorage.setItem(voiceStorageKey("avatar", user.email), String(idx)); } catch {}
    // Update in-memory profile and profile cache so next load (from cache) shows the chosen avatar
    setAppProfile((prev) => {
      if (!prev) return prev;
      const next = { ...prev, voice_avatar_index: idx };
      try {
        const cacheKey = `${PROFILE_CACHE_KEY_BASE}_${user.email}`;
        localStorage.setItem(cacheKey, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
    if (localStorage.getItem("dilly_auth_token")) {
      dilly.fetch(`/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({ voice_avatar_index: idx }),
      }).catch(() => { /* ignore */ });
    }
  }, [voiceAvatarIndex, user?.email]);

  // Persist voice memory to localStorage and backend (per user). Skip backend when voice_save_to_profile is false.
  useEffect(() => {
    if (!user?.email) return;
    try { localStorage.setItem(voiceStorageKey("memory", user.email), JSON.stringify(voiceMemory)); } catch {}
    const saveToProfile = (appProfile as { voice_save_to_profile?: boolean })?.voice_save_to_profile !== false;
    if (voiceMemory.length > 0 && saveToProfile) {
      dilly.fetch(`/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({ voice_memory: voiceMemory.slice(-10) }),
      }).catch(() => { /* ignore */ });
    }
  }, [voiceMemory, user?.email, (appProfile as { voice_save_to_profile?: boolean })?.voice_save_to_profile]);

  const signOut = async () => {
    try {
      if (localStorage.getItem("dilly_auth_token")) {
        await dilly.fetch(`/auth/logout`, {
          method: "POST",
        });
      }
    } catch {
      // API call failed — still log out client side
    }
    try {
      localStorage.removeItem("dilly_auth_token");
      localStorage.removeItem(VOICE_MESSAGES_KEY);
      localStorage.removeItem(VOICE_CONVOS_KEY);
      localStorage.removeItem(ONBOARDING_STEP_KEY);
      if (user?.email) {
        localStorage.removeItem(auditStorageKey(user.email));
        localStorage.removeItem(`${PROFILE_CACHE_KEY_BASE}_${user.email}`);
      }
    } catch { /* ignore */ }
    try {
      sessionStorage.clear();
    } catch { /* ignore */ }
    window.location.href = "http://localhost:3001";
  };

  // Sync active conversation messages back to voiceConvos (title is set by API from conversation content)
  useEffect(() => {
    if (!activeVoiceConvId || voiceMessages.length === 0) return;
    setVoiceConvos((prev) => {
      const idx = prev.findIndex((c) => c.id === activeVoiceConvId);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], messages: voiceMessages.slice(-40), updatedAt: Date.now() };
      return updated;
    });
  }, [voiceMessages, activeVoiceConvId]);

  // Persist conversations to localStorage (per user)
  useEffect(() => {
    if (!user?.email) return;
    try { localStorage.setItem(voiceStorageKey("convos", user.email), JSON.stringify(voiceConvos.slice(-30))); } catch { /* ignore */ }
  }, [voiceConvos, user?.email]);

  // Persist open tab IDs (per user)
  useEffect(() => {
    if (!user?.email) return;
    try { localStorage.setItem(voiceStorageKey("open_tabs", user.email), JSON.stringify(openVoiceConvIds)); } catch { /* ignore */ }
  }, [openVoiceConvIds, user?.email]);

  // Load persisted voice feedback (hearted/disliked) for the active conversation so it survives refresh and re-login
  useEffect(() => {
    if (!user?.email || !activeVoiceConvId) {
      setVoiceFeedback({});
      return;
    }
    try {
      const key = voiceStorageKey("voice_feedback", user.email);
      const raw = localStorage.getItem(key);
      const all: Record<string, Record<string, "up" | "down">> = raw ? JSON.parse(raw) : {};
      const forConvo = all[activeVoiceConvId] ?? {};
      const feedback: Record<number, "up" | "down"> = {};
      for (const k of Object.keys(forConvo)) {
        const n = parseInt(k, 10);
        if (!Number.isNaN(n) && (forConvo[k] === "up" || forConvo[k] === "down")) feedback[n] = forConvo[k];
      }
      setVoiceFeedback(feedback);
    } catch {
      setVoiceFeedback({});
    }
  }, [user?.email, activeVoiceConvId]);

  // Clean stale open tab IDs when convos change (e.g. convo was deleted elsewhere)
  useEffect(() => {
    if (voiceConvos.length === 0 || openVoiceConvIds.length === 0) return;
    const validIds = new Set(voiceConvos.map((c) => c.id));
    const hasStale = openVoiceConvIds.some((id) => !validIds.has(id));
    if (hasStale) {
      setOpenVoiceConvIds((prev) => prev.filter((id) => validIds.has(id)));
    }
  }, [voiceConvos, openVoiceConvIds]);

  // When we have convos but no valid active, pick first open tab or leave for list view
  useEffect(() => {
    const voiceActive = mainAppTab === "voice" || voiceOverlayOpen;
    if (!voiceActive || voiceConvos.length === 0) return;
    const valid = activeVoiceConvId && voiceConvos.some((c) => c.id === activeVoiceConvId);
    if (!valid && openVoiceConvIds.length > 0) {
      const firstOpen = openVoiceConvIds.find((id) => voiceConvos.some((c) => c.id === id));
      if (firstOpen) {
        const convo = voiceConvos.find((c) => c.id === firstOpen);
        if (convo) {
          setActiveVoiceConvId(firstOpen);
          setVoiceMessages(convo.messages ?? []);
          setVoiceMessageQueue([]);
        }
      }
    }
  }, [mainAppTab, voiceOverlayOpen, voiceConvos, activeVoiceConvId, openVoiceConvIds]);

  // Scroll to bottom of voice chat only when in full-page voice tab, not when overlay is open (would scroll the underlying page)
  useEffect(() => {
    if (mainAppTab !== "voice") return;
    const el = voiceEndRef.current;
    if (!el) return;
    const instant = Boolean(voiceStreamingText?.trim());
    el.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "end", inline: "nearest" });
  }, [mainAppTab, voiceMessages, voiceLoading, voiceStreamingText]);

  // Voice draft persistence: restore when opening Voice tab
  useEffect(() => {
    const voiceActive = mainAppTab === "voice" || voiceOverlayOpen;
    if (!voiceActive || !user?.email) return;
    try {
      const key = voiceStorageKey("draft", user.email);
      const saved = sessionStorage.getItem(key);
      if (saved != null && saved !== "" && !voiceInput) setVoiceInput(saved);
    } catch {}
  }, [mainAppTab, voiceOverlayOpen, user?.email]);

  // Voice draft persistence: save on change (debounce 300ms)
  useEffect(() => {
    if (!user?.email || voiceInput === "") return;
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(voiceStorageKey("draft", user.email), voiceInput);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [voiceInput, user?.email]);

  // When we have both last and current audit, fetch advisor-voice explainer for why scores changed
  useEffect(() => {
    if (!audit || !lastAudit) {
      setProgressExplainer(null);
      return;
    }
    setProgressExplainerLoading(true);
    setProgressExplainer(null);
    const explainHeaders: Record<string, string> = { "Content-Type": "application/json" };
    dilly.fetch(`/audit/explain-delta`, {
      method: "POST",
      headers: explainHeaders,
      body: JSON.stringify({ previous: lastAudit, current: audit }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => setProgressExplainer(data?.explainer || null))
      .catch(() => setProgressExplainer(null))
      .finally(() => setProgressExplainerLoading(false));
  }, [audit?.final_score, audit?.candidate_name, lastAudit?.final_score, lastAudit?.candidate_name]);



  const mainAppBlocked = !allowMainApp;

  if (!user) {
    if (authLoading) {
      return <LoadingScreen variant="career-center" message="Loading…" />;
    }
    return null;
  }

  if (mainAppBlocked) {
    return <LoadingScreen variant="career-center" message="Loading your career center…" />;
  }

  const saveProfile = async (data: Partial<Pick<AppProfile, "name" | "major" | "majors" | "minors" | "preProfessional" | "track" | "goals" | "career_goal" | "deadlines" | "target_school" | "profile_background_color" | "profile_tagline" | "profile_theme" | "profile_bio" | "linkedin_url" | "job_locations" | "job_location_scope" | "share_card_metric" | "got_interview_at" | "got_offer_at" | "outcome_story_consent" | "outcome_prompt_dismissed_at" | "application_target" | "application_target_label">>): Promise<boolean> => {
    setProfileSaveError(null);
    if (!localStorage.getItem("dilly_auth_token")) return false;
    try {
      const res = await dilly.fetch(`/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const msg = "We couldn't save that. Check your connection and try again.";
        setProfileSaveError(msg);
        toast(msg, "error");
        return false;
      }
      if ("career_goal" in data) {
        setAppProfile((prev) => ({ ...(prev ?? {}), career_goal: data.career_goal ?? null }));
      }
      if ("deadlines" in data) {
        setAppProfile((prev) => prev ? { ...prev, deadlines: data.deadlines || [] } : prev);
      }
      if ("target_school" in data) {
        setAppProfile((prev) => prev ? { ...prev, target_school: data.target_school ?? null } : prev);
      }
      if ("majors" in data) {
        setAppProfile((prev) => prev ? { ...prev, majors: data.majors ?? [] } : prev);
      }
      if ("minors" in data) {
        setAppProfile((prev) => prev ? { ...prev, minors: data.minors ?? [] } : prev);
      }
      if ("track" in data) {
        setAppProfile((prev) => prev ? { ...prev, track: data.track ?? null } : prev);
      }
      if ("preProfessional" in data) {
        setAppProfile((prev) => prev ? { ...prev, preProfessional: !!data.preProfessional } : prev);
      }
      if ("profile_background_color" in data) {
        setAppProfile((prev) => prev ? { ...prev, profile_background_color: data.profile_background_color ?? null } : prev);
      }
      if ("profile_tagline" in data) {
        setAppProfile((prev) => prev ? { ...prev, profile_tagline: data.profile_tagline ?? null } : prev);
      }
      if ("profile_theme" in data) {
        setAppProfile((prev) => prev ? { ...prev, profile_theme: data.profile_theme ?? null } : prev);
      }
      if ("profile_bio" in data) {
        setAppProfile((prev) => prev ? { ...prev, profile_bio: data.profile_bio ?? null } : prev);
      }
      if ("linkedin_url" in data) {
        setAppProfile((prev) => prev ? { ...prev, linkedin_url: data.linkedin_url ?? null } : prev);
      }
      if ("job_location_scope" in data) {
        setAppProfile((prev) => prev ? { ...prev, job_location_scope: data.job_location_scope ?? null } : prev);
      }
      if ("job_locations" in data) {
        setAppProfile((prev) => prev ? { ...prev, job_locations: data.job_locations ?? [] } : prev);
      }
      if ("got_interview_at" in data) {
        setAppProfile((prev) => prev ? { ...prev, got_interview_at: data.got_interview_at ?? null } : prev);
      }
      if ("got_offer_at" in data) {
        setAppProfile((prev) => prev ? { ...prev, got_offer_at: data.got_offer_at ?? null } : prev);
      }
      if ("outcome_story_consent" in data) {
        setAppProfile((prev) => prev ? { ...prev, outcome_story_consent: data.outcome_story_consent ?? null } : prev);
      }
      if ("outcome_prompt_dismissed_at" in data) {
        setAppProfile((prev) => prev ? { ...prev, outcome_prompt_dismissed_at: data.outcome_prompt_dismissed_at ?? null } : prev);
      }
      if ("share_card_metric" in data) {
        setAppProfile((prev) => prev ? { ...prev, share_card_metric: data.share_card_metric ?? null } : prev);
      }
      if ("application_target" in data) {
        setAppProfile((prev) => prev ? { ...prev, application_target: data.application_target ?? null } : prev);
      }
      return true;
    } catch {
      const msg = "We couldn't save that. Check your connection and try again.";
      setProfileSaveError(msg);
      toast(msg, "error");
      return false;
    }
  };

  const achievements = appProfile?.achievements ?? {};
  const shareCardAchievements = appProfile?.share_card_achievements ?? [];

  const toggleStickerShareCard = (id: string) => {
    if (!localStorage.getItem("dilly_auth_token") || !isUnlocked(id as AchievementId, achievements)) return;
    hapticLight();
    let next = [...shareCardAchievements];
    const idx = next.indexOf(id);
    if (idx >= 0) {
      next = next.filter((x) => x !== id);
    } else if (next.length < 3) {
      next = [...next, id];
    } else {
      next = [next[1], next[2], id];
    }
    dilly.fetch(`/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify({ share_card_achievements: next }),
    }).then(() => {
      setAppProfile((prev) => (prev ? { ...prev, share_card_achievements: next } : prev));
    });
  };

  const theme = school?.theme ?? DILLY_BASE_THEME;

  const auditForVoiceChatScores = viewingAudit ?? audit ?? savedAuditForCenter;
  const isViewingLatestForVoicePrev =
    !viewingAudit ||
    (Boolean(viewingAudit.id) &&
      Boolean(auditHistory[0]?.id) &&
      viewingAudit.id === auditHistory[0]!.id);
  const prevScoresForVoice =
    isViewingLatestForVoicePrev && auditHistory.length >= 2 ? auditHistory[1]!.scores : null;

  const voiceScoresForChat = user?.subscribed
    ? auditForVoiceChatScores?.scores != null
      ? {
          smart: auditForVoiceChatScores.scores.smart,
          grit: auditForVoiceChatScores.scores.grit,
          build: auditForVoiceChatScores.scores.build,
          scoresAuthoritative: true,
          final: auditForVoiceChatScores.final_score ?? null,
          prevScores: prevScoresForVoice,
          recommendations: auditForVoiceChatScores.recommendations?.slice(0, 5).map((r) => ({
            title: r.title,
            score_target: r.score_target ?? null,
            action: r.action,
          })),
          deadlines: (appProfile?.deadlines ?? [])
            .filter((d) => !d.completedAt && d.date && d.label)
            .slice(0, 10)
            .map((d) => ({ label: d.label, date: d.date })),
          applications_preview: voiceApplicationsPreview.length ? voiceApplicationsPreview : undefined,
          peer_percentiles: auditForVoiceChatScores.peer_percentiles ?? null,
          cohort_track: getEffectiveCohortLabel(auditForVoiceChatScores.detected_track, appProfile?.track).trim() || null,
        }
      : {
          smart: 0,
          grit: 0,
          build: 0,
          scoresAuthoritative: false,
          final: null,
          prevScores: null,
          recommendations: undefined,
          deadlines: (appProfile?.deadlines ?? [])
            .filter((d) => !d.completedAt && d.date && d.label)
            .slice(0, 10)
            .map((d) => ({ label: d.label, date: d.date })),
          applications_preview: voiceApplicationsPreview.length ? voiceApplicationsPreview : undefined,
          peer_percentiles: null,
          cohort_track: getEffectiveCohortLabel(undefined, appProfile?.track).trim() || null,
        }
    : null;

  return (
    <>
      {/* Hidden file input for profile photo - in DOM when on Career Center so we can trigger from header or edit */}
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
              const res = await dilly.fetch(`/profile/photo`, {
                method: "POST",
                body: fd,
              });
              if (res.ok) {
                const photoRes = await dilly.fetch(`/profile/photo`, { cache: "no-store" });
                if (photoRes.ok) {
                  const newBlob = await photoRes.blob();
                  const objUrl = URL.createObjectURL(newBlob);
                  setProfilePhotoUrl((old) => { if (old && old.startsWith("blob:")) URL.revokeObjectURL(old); return objUrl; });
                  // Update cache for refresh/sign-in persistence
                  const img = new Image();
                  img.onload = () => {
                    try {
                      const canvas = document.createElement("canvas");
                      const size = 128;
                      canvas.width = size;
                      canvas.height = size;
                      const ctx = canvas.getContext("2d");
                      if (ctx && user?.email) {
                        ctx.drawImage(img, 0, 0, size, size);
                        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
                        if (dataUrl.length < 100_000) localStorage.setItem(profilePhotoCacheKey(user.email), dataUrl);
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
      {/* Voice avatar picker modal - portal to body so it works from edit profile (center tab) and voice tab */}
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
              <button
                type="button"
                onClick={() => setVoiceAvatarPickerOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {VOICE_AVATAR_OPTIONS.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setVoiceAvatarIndex(idx);
                    setVoiceAvatarPickerOpen(false);
                  }}
                  style={{ animationDelay: `${idx * 25}ms` }}
                  className={`voice-avatar-picker-option w-12 h-12 rounded-full overflow-hidden flex items-center justify-center p-1 border-2 transition-colors bg-white ${
                    voiceAvatarIndex === idx
                      ? "border-white ring-2 ring-white/30"
                      : "border-transparent hover:border-slate-500"
                  }`}
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
      {/* ── Sticky glass header ── */}
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

          {/* Sticker sheet: centered modal, pop-in, white stickers with colored border + glyph */}
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
                  <button
                    type="button"
                    onClick={() => setStickerSheetOpen(false)}
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="Close"
                  >
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
                            <button
                              type="button"
                              onClick={() => toggleStickerShareCard(id)}
                              className="rounded-full p-1 focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-[#0f172a] flex items-center justify-center w-16 h-16 shrink-0 bg-white"
                              style={{
                                borderWidth: 4,
                                borderStyle: "solid",
                                borderColor,
                              }}
                            >
                              {glyphPath ? (
                                <img src={glyphPath} alt="" className="w-10 h-10 object-contain" />
                              ) : (
                                <span className="text-2xl" aria-hidden>{def.emoji}</span>
                              )}
                            </button>
                            {def && (
                              <p className="mt-0.5 text-[10px] text-center text-white/60 leading-tight max-w-[72px]">{def.name}</p>
                            )}
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

          {/* ── Rank / Leaderboard tab (inline — no route navigation) ── */}
          <div style={{ display: mainAppTab === "rank" ? "block" : "none" }}><div className="tab-enter">
            <RankTab />
          </div></div>

          {/* Gemini-style Dilly overlay: floating pill at bottom when user opens Dilly */}
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
              onHelpDillyKnowYou={() => {
                openVoiceWithNewChat(RESUME_DEEP_DIVE_PROMPT);
              }}
              starterSuggestions={voiceStarterSuggestions}
              chats={voiceConvos.map((c) => ({ id: c.id, title: c.title, messages: c.messages, updatedAt: c.updatedAt }))}
              onDeleteChat={(id) => voiceOverlayActionsRef.current?.deleteChat(id)}
              onRenameChat={(id, newTitle) => setVoiceConvos((prev) => prev.map((c) => c.id === id ? { ...c, title: newTitle } : c))}
              voiceScoresForChat={voiceScoresForChat}
              emptyChatGreeting={getDillyVoiceEmptyGreeting(
                user?.email ?? null,
                appProfile?.name?.split(" ")[0] ?? null
              )}
              mockInterviewBanner={
                voiceMockInterviewSession
                  ? {
                      questionNumber: voiceMockInterviewSession.questionIndex + 1,
                      total: voiceMockInterviewSession.totalQuestions,
                      onEnd: endVoiceMockInterviewByUser,
                    }
                  : null
              }
            />
          )}

          {/* ── Inline tab: Score ──────────────────────────────────────────── */}
          <div style={{ display: mainAppTab === "score" ? "block" : "none" }}>
            <div className="tab-enter">
              <ScoreTab
                onBack={() => setMainAppTab("center")}
                subscribed={user?.subscribed ?? false}
              />
            </div>
          </div>

          {/* ── Inline tab: Memory ─────────────────────────────────────────── */}
          {mainAppTab === "memory" && (
            <div className="tab-enter">
              <MemoryTab
                onBack={() => setMainAppTab("center")}
                onNavigate={(target) => {
                  if (target.startsWith("ready_check:")) {
                    setReadyCheckCompany(target.replace("ready_check:", ""));
                    setMainAppTab("ready_check");
                  } else if (target === "certifications") {
                    setMainAppTab("certifications");
                  } else if (target === "resources") {
                    setMainAppTab("resources");
                  } else if (target === "calendar") {
                    setMainAppTab("calendar");
                  } else if (target === "voice") {
                    setMainAppTab("voice");
                  }
                }}
              />
            </div>
          )}

          {/* ── Inline tab: Actions ────────────────────────────────────────── */}
          {mainAppTab === "actions" && (
            <div className="tab-enter">
              <ActionsTab onBack={() => setMainAppTab("center")} />
            </div>
          )}

          {/* ── Inline tab: Voice History ──────────────────────────────────── */}
          {mainAppTab === "voice_history" && (
            <div className="tab-enter">
              <VoiceHistoryTab onBack={() => setMainAppTab("voice")} />
            </div>
          )}

          {/* ── Inline tab: Certifications ─────────────────────────────────── */}
          {mainAppTab === "certifications" && (
            <div className="tab-enter">
              <CertificationsTab
                onBack={() => setMainAppTab("resources")}
                userId={user?.email ?? ""}
              />
            </div>
          )}

          {/* ── Inline tab: Career Playbook ────────────────────────────────── */}
          {mainAppTab === "career_playbook" && (
            <div className="tab-enter">
              <CareerPlaybookTab
                onBack={() => setMainAppTab("resources")}
                onOpenDilly={() => setMainAppTab("voice")}
              />
            </div>
          )}

          {/* ── Inline tab: Settings ───────────────────────────────────────── */}
          {mainAppTab === "settings" && (
            <div className="tab-enter">
              <SettingsPage onBack={() => setMainAppTab("center")} />
            </div>
          )}

          {/* ── Inline tab: Profile Details ────────────────────────────────── */}
          {mainAppTab === "profile_details" && (
            <div className="tab-enter">
              <ProfileDetailsPage
                onBack={() => setMainAppTab("center")}
                onOpenSettings={() => setMainAppTab("settings")}
              />
            </div>
          )}

          {/* ── Inline tab: Ready Check ────────────────────────────────────── */}
          {mainAppTab === "ready_check" && (
            <div className="tab-enter">
              <ReadyCheckTab
                onBack={() => setMainAppTab("resources")}
                initialCompany={readyCheckCompany}
              />
            </div>
          )}

          {/* ── Inline tab: Edit Resume ─────────────────────────────────────── */}
          <div style={{ display: mainAppTab === "edit" ? "block" : "none" }}>
            {(audit ?? savedAuditForCenter) ? (
              <div className="tab-enter">
                <ResumeEditPage
                  onBack={() => setMainAppTab("center")}
                  initialAudit={audit ?? savedAuditForCenter}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100dvh", gap: "12px" }}>
                <p style={{ color: "var(--t2)", fontSize: "13px" }}>Loading your resume…</p>
              </div>
            )}
          </div>

          <BottomNav
            dockTop={
              user?.subscribed &&
              (mainAppTab === "center" ||
                mainAppTab === "calendar" ||
                mainAppTab === "practice" ||
                (mainAppTab === "hiring" && (reviewSubView === "home" || reviewSubView === "upload"))) ? (
                <CareerCenterMinibar
                  docked
                  active={
                    mainAppTab === "calendar"
                      ? "calendar"
                      : mainAppTab === "practice"
                        ? "practice"
                        : mainAppTab === "hiring" && reviewSubView === "upload"
                          ? "new-audit"
                          : mainAppTab === "hiring" && reviewSubView === "home"
                            ? "score"
                            : undefined
                  }
                    embedded={{
                    onScore: () => {
                      hapticLight();
                      setMainAppTab("score");
                    },
                    onNewAudit: () => {
                      setMainAppTab("hiring");
                      setReviewSubView("upload");
                      setWantsNewAudit(true);
                      setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
                    },
                    onCalendar: () => {
                      setMainAppTab("calendar");
                    },
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
                    if (key === "rank") {
                      setMainAppTab("rank");
                      return;
                    }
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
                    if (prevTab === "calendar") {
                      const dw3 = appProfile?.deadlines?.filter((d) => !d.completedAt && (() => { try { return (new Date(d.date).getTime() - Date.now()) / 86400000 <= 3; } catch { return false; } })()).length ?? 0;
                      setCalendarBadgeLastSeen(dw3);
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
