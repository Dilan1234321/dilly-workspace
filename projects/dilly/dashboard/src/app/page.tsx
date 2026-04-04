"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useClientSearchParams } from "@/lib/clientSearchParams";
import { ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { getSchoolFromEmail, getSchoolById, DILLY_BASE_THEME, type SchoolConfig } from "@/lib/schools";
import {
  deriveJobSearchChecklistStage,
  getJobSearchChecklistPhases,
  jobSearchChecklistStageSubtitle,
} from "@/lib/jobSearchChecklist";
import { getDefinitionsForTrack, getEffectiveCohortLabel, getPlaybookForTrack, getTrackTips, PRE_PROFESSIONAL_TRACKS } from "@/lib/trackDefinitions";
import { QUICK_TIPS } from "@/lib/quickTips";
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
import { DimensionBreakdown } from "@/components/DimensionBreakdown";
import { fireConfetti } from "@/components/ConfettiCelebration";
import { checkAuditEasterEggs, checkAvatarTapEasterEgg, checkMidnightEasterEgg } from "@/lib/easterEggs";
import { playSound } from "@/lib/sounds";
import { hapticLight, hapticMedium, hapticSuccess } from "@/lib/haptics";
import { fireConfettiSubmit } from "@/components/ui/confetti";
import { useToast } from "@/hooks/useToast";
import { useDillyVoiceNotification } from "@/context/DillyVoiceNotificationContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HeartFavorite } from "@/components/ui/heart-favorite";
import { ThumbsDown, MessageCircle, FileText, Lightbulb, RefreshCw, ChevronRight } from "lucide-react";
import { DillyVoicePrompt } from "@/components/ui/dilly-voice-prompt";
import { VoiceInputWithMic } from "@/components/VoiceInputWithMic";
import { VoiceOverlay } from "@/components/VoiceOverlay";
import { VoiceAssistantRichReply } from "@/components/VoiceAssistantRichReply";
import { VoiceVisualDedupProvider, VoiceDedupScrollRoot } from "@/components/VoiceChatVisualDedup";
import { SuccessIcon, DownloadDoneIcon } from "@/components/ui/animated-state-icons";
import { LoaderOne } from "@/components/ui/loader-one";
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
  getStrongestSignalSentence,
  getMilestoneNudge,
  scoresCrossedMilestones,
  readLastAtsScoreCache,
  writeLastAtsScoreCache,
} from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import { getProfileFrame } from "@/lib/profileFrame";
import { DEFAULT_VOICE_AVATAR_INDEX, VOICE_AVATAR_OPTIONS, getVoiceAvatarUrl } from "@/lib/voiceAvatars";
import { VoiceAvatar, VoiceAvatarButton } from "@/components/VoiceAvatarButton";
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
  ApplicationsSection,
  type MainAppTabKey,
} from "@/components/career-center";
import type { JobFilterKey } from "@/components/jobs/FilterRow";
import { JobsPanel } from "@/components/jobs/JobsPanel";
import { ScoreHomeRedirect } from "@/components/score/ScoreHomeRedirect";
import { DillyHomeInsight, DillyFeed } from "@/components/presence";
import { dillyPresenceManager, type HomeInsightContext, type TransitionSource, orderedFeedIds, type FeedOrderContext, type FeedCardType } from "@/lib/dillyPresence";
import { DILLY_PRESENCE_VOICE_ADDENDUM } from "@/lib/voice/presenceSystemPrompt";
import { NewAuditExperience } from "@/components/audit/NewAuditExperience";
import { mapHistoryToAuditRecords, mergeHistoryWithLatest } from "@/components/audit/mapAuditHistory";
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
import type { LeaderboardData, LeaderboardEntry, LeaderboardPodiumSlot } from "@/types/leaderboardPage";
import { GLOBAL_LEADERBOARD_CACHE_KEY, LEADERBOARD_CACHE_KEY, parseLeaderboardEntry, parsePodiumSlot } from "@/types/leaderboardPage";
import { coerceLeaderboardTrackForApi } from "@/lib/trackDefinitions";
import { LB_VARS } from "@/components/leaderboard/leaderboardTokens";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PodiumRow } from "@/components/leaderboard/PodiumRow";
import { RankingsList } from "@/components/leaderboard/RankingsList";
import { MoveUpCard } from "@/components/leaderboard/MoveUpCard";
import { WeeklyFeed } from "@/components/leaderboard/WeeklyFeed";
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
  }
}

// ── Leaderboard helpers (used by inline Rank tab) ────────────────────────────

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  /** lastAudit — now from AuditScoreContext */
  const [copyFeedback, setCopyFeedback] = useState<"one-line" | "suggested" | "report-link" | "top-pct" | "shared" | null>(null);
  const [reportShareUrl, setReportShareUrl] = useState<string | null>(null);
  const [progressExplainer, setProgressExplainer] = useState<string | null>(null);
  const [progressExplainerLoading, setProgressExplainerLoading] = useState(false);
  const [auditProgress, setAuditProgress] = useState(0);
  const [auditStep, setAuditStep] = useState("");
  const [takingLonger, setTakingLonger] = useState(false);
  const [auditSuccess, setAuditSuccess] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<"snapshot" | "pdf" | null>(null);
  // ── Rank / Leaderboard tab state ─────────────────────────────────────────
  const [lbData, setLbData] = useState<LeaderboardData | null>(null);
  const [lbErr, setLbErr] = useState<string | null>(null);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbShowUpdated, setLbShowUpdated] = useState(false);
  const [lbUpdatedFade, setLbUpdatedFade] = useState(1);
  const [lbViewMode, setLbViewMode] = useState<"track" | "all">("track");
  const [lbGlobalData, setLbGlobalData] = useState<LeaderboardData | null>(null);
  const [lbGlobalLoading, setLbGlobalLoading] = useState(false);
  const [lbGlobalErr, setLbGlobalErr] = useState<string | null>(null);
  const hasRedirected = useRef(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const takingLongerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const auditSuccessRef = useRef(false);
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
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const prevTabForCalendarSnapRef = useRef<typeof mainAppTab | null>(null);
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<string | null>(null);
  /** Jobs for you - tailored to profile/resume */
  const [recommendedJobs, setRecommendedJobs] = useState<{ id: string; title: string; company: string; location: string; url: string; match_pct: number; why_bullets: string[] }[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  /** Mini calendar: which date is selected to show full deadline labels (popover) */
  const [calAddLabel, setCalAddLabel] = useState("");
  const [calAddDate, setCalAddDate] = useState("");
  const [calAddSubLabel, setCalAddSubLabel] = useState("");
  const [calAddSubDate, setCalAddSubDate] = useState("");
  const [calAddParentId, setCalAddParentId] = useState<string | null>(null);
  const [calAddOpen, setCalAddOpen] = useState(false);
  const [calRenamingId, setCalRenamingId] = useState<string | null>(null);
  const [calRenameValue, setCalRenameValue] = useState("");
  const [calRenamingSubId, setCalRenamingSubId] = useState<{ parentId: string; subId: string } | null>(null);
  const [calRenameSubValue, setCalRenameSubValue] = useState("");
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
  const [readyCheckTarget, setReadyCheckTarget] = useState("");
  const [readyCheckResult, setReadyCheckResult] = useState<{ verdict: string; summary: string; gaps: string[] } | null>(null);
  const [readyCheckLoading, setReadyCheckLoading] = useState(false);
  /** Vs Your Peers: cohort stats from GET /peer-cohort-stats (Insights) */
  const [cohortStats, setCohortStats] = useState<{ track: string; cohort_n: number; use_fallback: boolean; avg: { smart: number; grit: number; build: number }; p25: { smart: number; grit: number; build: number }; p75: { smart: number; grit: number; build: number }; how_to_get_ahead: string } | null>(null);
  /** Review tab sub-view — now from NavigationContext */
  /** Job search checklist (persisted to localStorage key per user) */
  const [jobChecklist, setJobChecklist] = useState<Record<string, boolean>>({});
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
  const [calendarBadgeLastSeen, setCalendarBadgeLastSeen] = useState<number | null>(null);
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

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

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

  // ── Leaderboard load callbacks (used by inline Rank tab) ──────────────────
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

  // Load leaderboard when rank tab becomes active
  useEffect(() => {
    if (mainAppTab !== "rank") return;
    if (!appProfile?.track && auditHistory.length === 0) return;
    void loadLeaderboard();
  }, [mainAppTab, loadLeaderboard, appProfile?.track, auditHistory]);

  useEffect(() => {
    if (mainAppTab !== "rank" || lbViewMode !== "all") return;
    void loadGlobalLeaderboard();
  }, [mainAppTab, lbViewMode, loadGlobalLeaderboard]);

  const MAX_FILE_MB = 5;
  const TAKING_LONGER_MS = 60_000; // Show "taking longer" after 60s (API times out at 90s)

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
        headers: { "Content-Type": "application/json"},
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
      setCenterRefreshKey((k) => k + 1);
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
        // Slow ramp in the first 10%, then accelerate through 11-92%
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
      setCenterRefreshKey((k) => k + 1);
      setReportShareUrl(null);
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
          headers: { "Content-Type": "application/json"},
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

  /** Canonical latest audit for “Previous audits” — not viewingAudit (browsing old reports). */
  const latestForHistoryMerge = latestAuditRef.current ?? audit ?? savedAuditForCenter ?? undefined;
  const newAuditExperienceRecords = mapHistoryToAuditRecords(
    mergeHistoryWithLatest(auditHistory, latestForHistoryMerge)
  );

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
          {(mainAppTab === "hiring" && reviewSubView === "insights") && (() => {
            const displayAudit = latestAuditRef.current ?? audit ?? savedAuditForCenter;
            const trackForPlaybook = getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track) || null;
            const playbook = trackForPlaybook ? getPlaybookForTrack(trackForPlaybook) : null;
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
                  {/* Dilly's take — prominent dark card with theme accent */}
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
                              You&apos;re Top {g.topPct}% in {g.label}. {g.pointsToTop25 && g.pointsToTop25 > 0 ? `~${g.pointsToTop25} more points could get you to Top 25%.` : "Keep building. You&apos;re close."}
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
          })()}</div>) : null}
          {mainAppTab === "hiring" && (<div className="tab-enter">{(() => {
            const displayAudit = viewingAudit ?? latestAuditRef.current ?? audit ?? savedAuditForCenter;
            const showUpload = !displayAudit || wantsNewAudit;
            const showUploadView = reviewSubView === "upload" || (showUpload && reviewSubView !== "home" && reviewSubView !== "report" && reviewSubView !== "insights" && reviewSubView !== "dimensions");
            const showInsightsView = reviewSubView === "insights";

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

            if (showInsightsView) {
              return null;
            }

            /** Report requested but no audit: show placeholder so user sees something */
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
                toast("Couldn’t copy — try again", "error");
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
          })()}</div>)}

          {mainAppTab === "practice" && (<div className="tab-enter">{(() => {
            const VOICE_PRACTICE_ITEMS: { id: string; title: string; prompt: string; icon: React.ReactNode; description: string }[] = [
              {
                id: "bullet-practice",
                title: "Bullet practice",
                prompt: "I want to practice writing a resume bullet. I'll describe an experience and you help me turn it into a strong, quantified bullet. Give me prompts to fill in: what I did, for whom, with what tools, and what the outcome was.",
                icon: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--coral)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>,
                description: "Turn experiences into quantified bullets",
              },
              {
                id: "elevator-pitch",
                title: "60-second pitch",
                prompt: "I need to practice my 60-second elevator pitch. Ask me to record or type it, then give feedback: did I hit my strongest Smart, Grit, and Build evidence? What should I add or cut?",
                icon: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--coral)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>,
                description: "Tell me about yourself — get feedback",
              },
              {
                id: "common-questions",
                title: "Common questions",
                prompt: "Give me 3 common interview questions (e.g. Why this company? Biggest weakness? Tell me about a conflict). For each, I'll answer and you give feedback. Make it specific to my background.",
                icon: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--coral)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>,
                description: "Why this company? Weakness? Conflict?",
              },
              {
                id: "interview-prep",
                title: "Interview prep",
                prompt: "I have an interview coming up. Give me a short interview-day checklist and 3 questions they might ask, with suggested answers based on my resume.",
                icon: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--coral)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg>,
                description: "Checklist + 3 likely questions",
              },
            ];
            return (
              <div className="career-center-talent min-h-full w-full" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
              <section className="max-w-[390px] mx-auto pb-40 px-4 min-w-0 overflow-hidden animate-fade-up min-h-full" aria-label="Practice" style={{ background: "var(--bg)" }}>
                <AppProfileHeader
                  name={appProfile?.name ?? undefined}
                  track={getEffectiveCohortLabel((latestAuditRef.current ?? audit ?? savedAuditForCenter)?.detected_track, appProfile?.track)}
                  schoolName={school?.name ?? undefined}
                  photoUrl={profilePhotoUrl ?? undefined}
                  className="mb-4"
                />
                <header className="mb-6">
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Rehearsal</p>
                  <h1 className="text-[15px] font-semibold" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>Practice</h1>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>Rehearse before the real thing. Score-driven feedback on every answer.</p>
                </header>

                {/* Featured: Mock Interview */}
                <button
                    type="button"
                    onClick={() => {
                      hapticLight();
                      openVoiceWithNewChat("Start a mock interview.", "Mock interview");
                    }}
                  className="w-full rounded-[18px] p-5 mb-5 text-left overflow-hidden transition-opacity hover:opacity-90 active:opacity-80 group"
                  style={{ background: "var(--s2)", borderLeft: "4px solid var(--coral)" }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(255, 69, 58, 0.2)" }}>
                      <svg className="w-6 h-6" style={{ color: "var(--coral)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold mb-0.5" style={{ color: "var(--t1)" }}>Mock Interview</h2>
                      <p className="text-[11px] leading-relaxed mb-3" style={{ color: "var(--t3)" }}>5 behavioral questions · STAR format · Per-answer scoring</p>
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--coral)" }}>
                        Start in Dilly AI
                        <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      </span>
                    </div>
                  </div>
                </button>

                {/* More ways to practice */}
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t3)" }}>More ways to practice</p>
                <div className="space-y-4 mb-5">
                    {VOICE_PRACTICE_ITEMS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { hapticLight(); openVoiceWithNewChat(item.prompt); }}
                      className="w-full rounded-[18px] p-4 flex items-center gap-4 text-left min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80"
                      style={{ background: "var(--s2)", borderLeft: "4px solid var(--coral)" }}
                      >
                        {item.icon}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium block" style={{ color: "var(--t2)" }}>{item.title}</span>
                        <span className="text-[11px] leading-snug" style={{ color: "var(--t3)" }}>{item.description}</span>
                      </div>
                      <svg className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      </button>
                    ))}
                  </div>

                {/* Ask Dilly AI */}
                  <button
                    type="button"
                    onClick={() => openVoiceFromScreen("practice", "What should I practice first?")}
                  className="w-full rounded-[18px] p-3 flex items-center gap-3 text-left min-h-[48px] transition-opacity hover:opacity-90 active:opacity-80"
                  style={{ background: "var(--s2)" }}
                    title="Ask Dilly AI about this screen"
                  >
                    <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="sm" className="ring-0 shrink-0" />
                  <span className="text-sm font-medium" style={{ color: "var(--t2)" }}>Ask Dilly AI</span>
                  <span className="ml-auto text-xs" style={{ color: "var(--t3)" }}>What should I practice first?</span>
                  </button>
              </section>
              </div>
            );
          })()}</div>)}

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

          {mainAppTab === "resources" && (<div className="tab-enter">{(() => {
            const displayAudit = latestAuditRef.current ?? audit ?? savedAuditForCenter;
            const trackForPlaybook = getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track) || null;
            const playbook = trackForPlaybook ? getPlaybookForTrack(trackForPlaybook) : null;
            const jobSearchStage = deriveJobSearchChecklistStage({
              habits,
              proactiveNudges,
              displayAudit,
            });
            const JOB_SEARCH_CHECKLIST_PHASES = getJobSearchChecklistPhases(jobSearchStage);
            const jobChecklistAllIds = JOB_SEARCH_CHECKLIST_PHASES.flatMap((p) => p.items.map((i) => i.id));
            const jobChecklistDone = jobChecklistAllIds.filter((id) => jobChecklist[id]).length;
            const jobChecklistTotal = jobChecklistAllIds.length;
            const jobChecklistPct = jobChecklistTotal ? Math.round((jobChecklistDone / jobChecklistTotal) * 100) : 0;

            return (
              <div className="career-center-talent min-h-full w-full" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
              <section className="max-w-[390px] mx-auto pb-40 px-4 min-w-0 overflow-hidden animate-fade-up min-h-full" aria-label="Get Hired" style={{ background: "var(--bg)" }}>
                <AppProfileHeader
                  name={appProfile?.name ?? undefined}
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
                      onClick={() => {
                        hapticLight();
                        setGetHiredSubTab("applications");
                      }}
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
                      onClick={() => {
                        hapticLight();
                        setGetHiredSubTab("jobs");
                      }}
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
          })()}</div>)}

          {mainAppTab === "calendar" && (<div className="tab-enter">{(() => {
            const allDeadlines: DillyDeadline[] = (appProfile?.deadlines || []).filter((d) => d.date && d.label);
            const { year, month } = calendarMonth;
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);
            const startPad = firstDay.getDay(); // 0=Sun
            const totalCells = startPad + lastDay.getDate();
            const rows = Math.ceil(totalCells / 7);

            const todayStr = new Date().toISOString().slice(0, 10);
            const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

            // Build a map: dateStr -> { main: DillyDeadline[], sub: { dl: DillyDeadline, sub: DillySubDeadline }[] }
            const deadlineMap: Record<string, { main: DillyDeadline[]; sub: { dl: DillyDeadline; sub: DillySubDeadline }[] }> = {};
            for (const dl of allDeadlines) {
              if (!deadlineMap[dl.date]) deadlineMap[dl.date] = { main: [], sub: [] };
              deadlineMap[dl.date].main.push(dl);
              for (const sub of dl.subDeadlines || []) {
                if (!deadlineMap[sub.date]) deadlineMap[sub.date] = { main: [], sub: [] };
                deadlineMap[sub.date].sub.push({ dl, sub });
              }
            }

            const selectedEntry = calendarSelectedDay ? deadlineMap[calendarSelectedDay] : null;
            const selectedDayDeadlines = selectedEntry ? [...selectedEntry.main] : [];
            const selectedDaySubDeadlines = selectedEntry ? selectedEntry.sub : [];

            const handleDayClick = (dateStr: string) => {
              setCalendarSelectedDay((prev) => prev === dateStr ? null : dateStr);
              setCalAddOpen(false);
            };

            const handleAddDeadline = async (e: React.FormEvent) => {
              e.preventDefault();
              if (!calAddLabel.trim() || !calAddDate) return;
              const label = calAddLabel.trim();
              const newDl: DillyDeadline = {
                id: safeUuid(),
                label,
                date: calAddDate,
                createdBy: "user",
                subDeadlines: [],
              };
              const updated = [...allDeadlines, newDl];
              const ok = await saveProfile({ deadlines: updated });
              setCalAddLabel(""); setCalAddDate(""); setCalAddOpen(false);
              setCalendarSelectedDay(calAddDate);
              if (ok) showVoiceNotification(`I noted "${label}". Ask me to help you prep.`);
            };

            const handleAddSubDeadline = async (parentId: string) => {
              if (!calAddSubLabel.trim() || !calAddSubDate) return;
              const newSub: DillySubDeadline = { id: safeUuid(), label: calAddSubLabel.trim(), date: calAddSubDate };
              const updated = allDeadlines.map((dl) => dl.id === parentId ? { ...dl, subDeadlines: [...(dl.subDeadlines || []), newSub] } : dl);
              await saveProfile({ deadlines: updated });
              setCalAddSubLabel(""); setCalAddSubDate(""); setCalAddParentId(null);
            };

            const handleCompleteDeadline = async (id: string) => {
              const updated = allDeadlines.map((dl) => dl.id === id ? { ...dl, completedAt: Date.now() } : dl);
              await saveProfile({ deadlines: updated });
              showVoiceNotification("I noted you completed it. Ask me what's next.");
            };

            const handleDeleteDeadline = async (id: string) => {
              const updated = allDeadlines.filter((dl) => dl.id !== id);
              await saveProfile({ deadlines: updated });
              if (calendarSelectedDay && !updated.some((d) => d.date === calendarSelectedDay || d.subDeadlines?.some((s) => s.date === calendarSelectedDay))) {
                setCalendarSelectedDay(null);
              }
            };

            const handleDeleteSubDeadline = async (parentId: string, subId: string) => {
              const updated = allDeadlines.map((dl) => dl.id === parentId ? { ...dl, subDeadlines: (dl.subDeadlines || []).filter((s) => s.id !== subId) } : dl);
              await saveProfile({ deadlines: updated });
            };

            const commitRenameDeadline = async () => {
              if (!calRenamingId) return;
              const trimmed = calRenameValue.trim();
              if (trimmed) {
                const updated = allDeadlines.map((dl) => dl.id === calRenamingId ? { ...dl, label: trimmed } : dl);
                await saveProfile({ deadlines: updated });
              }
              setCalRenamingId(null);
              setCalRenameValue("");
            };

            const commitRenameSubDeadline = async () => {
              if (!calRenamingSubId) return;
              const trimmed = calRenameSubValue.trim();
              if (trimmed) {
                const updated = allDeadlines.map((dl) =>
                  dl.id === calRenamingSubId.parentId
                    ? { ...dl, subDeadlines: (dl.subDeadlines || []).map((s) => s.id === calRenamingSubId.subId ? { ...s, label: trimmed } : s) }
                    : dl
                );
                await saveProfile({ deadlines: updated });
              }
              setCalRenamingSubId(null);
              setCalRenameSubValue("");
            };

            const now = Date.now();
            const upcomingWithPrep = allDeadlines
              .filter((d) => d.date && new Date(d.date).getTime() > now)
              .map((d) => ({ ...d, daysUntil: Math.ceil((new Date(d.date).getTime() - now) / 86400000) }))
              .sort((a, b) => a.daysUntil - b.daysUntil);

            return (
              <div className="career-center-talent min-h-full w-full" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
              <section className="max-w-[375px] mx-auto pb-40 px-4 sm:px-0 animate-fade-up" aria-label="Calendar">
                <AppProfileHeader
                  name={appProfile?.name ?? undefined}
                  track={getEffectiveCohortLabel((latestAuditRef.current ?? audit ?? savedAuditForCenter)?.detected_track, appProfile?.track)}
                  schoolName={school?.name ?? undefined}
                  photoUrl={profilePhotoUrl ?? undefined}
                  className="mb-4"
                />
                <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-center sm:justify-between">
                  <header className="text-left py-0 mb-0">
                    <h2 className="text-xl font-semibold" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>Calendar</h2>
                    <p className="text-sm mt-0.5 mb-0" style={{ color: "var(--t3)" }}>Your deadlines, milestones, and goals.</p>
                  </header>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {allDeadlines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const events = allDeadlines.filter((d) => d.date && d.label);
                          const now = new Date();
                          const dtstamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
                          const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dilly//Career Deadlines//EN", "CALSCALE:GREGORIAN", ...events.flatMap((e, i) => {
                            const date = (e.date ?? "").slice(0, 10).replace(/-/g, "");
                            const uid = e.id ?? `deadline-${i}-${date}`;
                            return ["BEGIN:VEVENT", `UID:dilly-${uid}@trydilly.com`, `DTSTAMP:${dtstamp}`, `DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${date}`, `SUMMARY:${(e.label || "Deadline").replace(/\n/g, " ")}`, "END:VEVENT"];
                          }), "END:VCALENDAR"];
                          const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = "dilly-deadlines.ics";
                          a.click();
                          URL.revokeObjectURL(a.href);
                          hapticSuccess();
                          toast("Calendar file downloaded. Add to Google or Apple Calendar.", "success");
                        }}
                        className="text-xs font-medium px-3 py-2 rounded-[12px] flex items-center gap-1.5 transition-colors"
                        style={{ border: "1px solid var(--b1)", color: "var(--t2)", background: "var(--s2)" }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setCalAddOpen((v) => !v); setCalendarSelectedDay(null); }}
                      className="text-sm font-semibold px-4 py-2.5 flex items-center justify-center gap-1.5 rounded-[12px] transition-colors ml-auto sm:ml-0"
                      style={{ background: "var(--blue)", color: "#fff" }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      Add Deadline
                    </button>
                  </div>
                </div>

                {/* Pre-deadline prep hub */}
                {upcomingWithPrep.length > 0 && (
                  <div className="voice-chat-container p-4 mb-4 cal-confirm-card cal-drawer" style={{ borderLeft: "4px solid var(--blue)" }}>
                    <p className="font-semibold text-sm mb-2 flex items-center gap-2" style={{ color: "var(--t1)" }}>
                      <span className="text-lg" aria-hidden>📋</span>
                      Pre-deadline prep
                    </p>
                    <p className="text-xs mb-3" style={{ color: "var(--t3)" }}>Resume Review recommended 2 weeks before each deadline.</p>
                    <div className="space-y-2">
                      {upcomingWithPrep.slice(0, 3).map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-[12px]" style={{ background: "var(--s3)" }}>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate" style={{ color: "var(--t1)" }}>{d.label}</p>
                            <p className="text-[11px]" style={{ color: "var(--t3)" }}>
                              {d.daysUntil <= 14 ? `Resume review recommended now (${d.daysUntil}d left)` : `${d.daysUntil} days away. Review in ${Math.max(0, d.daysUntil - 14)}d`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openVoiceWithNewChat(`I have "${d.label}" in ${d.daysUntil} days. Help me prepare. What should I focus on for my resume and application?`)}
                            className="text-[11px] font-medium px-2.5 py-1 rounded-[12px] shrink-0 inline-flex items-center gap-1 transition-opacity hover:opacity-90"
                            style={{ background: "var(--blue)", color: "#fff" }}
                          >
                            <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="ring-2 ring-white/30" />
                            How can I help?
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Deadline form */}
                {calAddOpen && (
                  <div className="voice-chat-container p-4 mb-4 cal-confirm-card cal-drawer" style={{ borderLeft: "4px solid var(--blue)" }}>
                    <p className="font-semibold text-sm mb-3" style={{ color: "var(--t1)" }}>New Deadline</p>
                    <form onSubmit={handleAddDeadline} className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={calAddLabel}
                          onChange={(e) => setCalAddLabel(e.target.value)}
                          placeholder="E.g. Career Fair Prep"
                          className="flex-1 px-3.5 py-2 text-sm rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                          style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                        />
                        <input
                          type="date"
                          value={calAddDate}
                          onChange={(e) => setCalAddDate(e.target.value)}
                          className="px-3 py-2 text-sm rounded-[12px] w-36 focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                          style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={!calAddLabel.trim() || !calAddDate} className="text-sm font-semibold px-5 py-2 rounded-[12px] transition-opacity disabled:opacity-50" style={{ background: "var(--blue)", color: "#fff" }}>Add</button>
                        <button type="button" onClick={() => setCalAddOpen(false)} className="text-sm px-3 py-2 transition-colors" style={{ color: "var(--t3)" }}>Cancel</button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Month navigation */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => { const d = new Date(m.year, m.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                    className="p-2 rounded-[12px] transition-colors"
                    style={{ color: "var(--t3)" }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                  </button>
                  <h3 className="font-semibold text-base tracking-tight" style={{ color: "var(--t1)" }}>{MONTH_NAMES[month]} {year}</h3>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => { const d = new Date(m.year, m.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                    className="p-2 rounded-[12px] transition-colors"
                    style={{ color: "var(--t3)" }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  </button>
                </div>

                {/* Calendar grid */}
                <div className="voice-chat-container p-3 mb-4">
                  {/* Day labels */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAY_LABELS.map((d) => (
                      <div key={d} className="text-center text-[10px] font-semibold py-1" style={{ color: "var(--t3)" }}>{d}</div>
                    ))}
                  </div>
                  {/* Day cells */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {Array.from({ length: rows * 7 }).map((_, idx) => {
                      const dayNum = idx - startPad + 1;
                      const isCurrentMonth = dayNum >= 1 && dayNum <= lastDay.getDate();
                      const paddedMonth = String(month + 1).padStart(2, "0");
                      const paddedDay = String(dayNum).padStart(2, "0");
                      const dateStr = isCurrentMonth ? `${year}-${paddedMonth}-${paddedDay}` : "";
                      const isToday = dateStr === todayStr;
                      const isSelected = dateStr === calendarSelectedDay;
                      const entry = dateStr ? deadlineMap[dateStr] : undefined;
                      const hasDeadlines = !!(entry && (entry.main.length > 0 || entry.sub.length > 0));

                      return (
                        <div
                          key={idx}
                          onClick={() => { if (dateStr) handleDayClick(dateStr); }}
                          className={`cal-grid-cell p-1 flex flex-col gap-0.5 ${!isCurrentMonth ? "cal-other-month" : ""} ${isToday ? "cal-today" : ""} ${isSelected ? "cal-selected" : ""} ${!dateStr ? "pointer-events-none" : ""}`}
                        >
                          <span
                            className="text-[11px] font-medium self-end pr-0.5"
                            style={{ color: isToday ? "var(--coral)" : isCurrentMonth ? "var(--t2)" : "var(--t3)" }}
                          >
                            {isCurrentMonth ? dayNum : ""}
                          </span>
                          {hasDeadlines && (
                            <div className="space-y-0.5 overflow-hidden">
                              {(entry?.main || []).slice(0, 2).map((dl) => (
                                <span key={dl.id} className="cal-pill cal-pill-main truncate">{dl.label}</span>
                              ))}
                              {(entry?.sub || []).slice(0, 1).map(({ sub }, i) => (
                                <span key={i} className="cal-pill cal-pill-sub truncate">{sub.label}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Day detail drawer */}
                {calendarSelectedDay && (
                  <div className="cal-deadline-card p-4 mb-4 cal-drawer" style={{ borderLeft: "4px solid var(--blue)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-sm" style={{ color: "var(--t1)" }}>
                        {new Date(calendarSelectedDay + "T00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                      </p>
                      <button
                        type="button"
                        onClick={() => { setCalAddOpen(true); setCalAddDate(calendarSelectedDay); }}
                        className="text-xs px-2.5 py-1 rounded-[12px] flex items-center gap-1 transition-colors"
                        style={{ color: "var(--t3)" }}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        Add
                      </button>
                    </div>

                    {selectedDayDeadlines.length === 0 && selectedDaySubDeadlines.length === 0 ? (
                      <p className="text-sm" style={{ color: "var(--t3)" }}>No Deadlines on This Day.</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedDayDeadlines.map((dl) => {
                          const daysAway = Math.round((new Date(dl.date + "T00:00").getTime() - Date.now()) / 86400000);
                          const urgentColor = daysAway < 0 ? "var(--t3)" : daysAway <= 3 ? "var(--coral)" : daysAway <= 7 ? "var(--amber)" : "var(--t3)";
                          const isRenaming = calRenamingId === dl.id;
                          const isCompleted = !!dl.completedAt;
                          return (
                            <div key={dl.id}>
                              <div className={`cal-confirm-pill flex items-start justify-between gap-2 ${isCompleted ? "opacity-80" : ""}`}>
                                <div className="flex-1 min-w-0">
                                  {isRenaming ? (
                                    <form onSubmit={(e) => { e.preventDefault(); commitRenameDeadline(); }} className="flex items-center gap-1.5">
                                      <input
                                        autoFocus
                                        type="text"
                                        value={calRenameValue}
                                        onChange={(e) => setCalRenameValue(e.target.value)}
                                        onBlur={commitRenameDeadline}
                                        onKeyDown={(e) => { if (e.key === "Escape") { setCalRenamingId(null); setCalRenameValue(""); } }}
                                        className="flex-1 px-2.5 py-1 text-sm font-medium rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                                        style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                                      />
                                    </form>
                                  ) : (
                                    <>
                                      <p
                                        className={`text-sm font-medium truncate cursor-text transition-colors ${isCompleted ? "line-through" : ""}`}
                                        style={{ color: isCompleted ? "var(--t3)" : "var(--t1)" }}
                                        onClick={() => { setCalRenamingId(dl.id); setCalRenameValue(dl.label); }}
                                        title={isCompleted ? "Done (stays on calendar)" : "Click to rename"}
                                      >{dl.label}{isCompleted ? " ✓" : ""}</p>
                                      <p className="text-xs mt-0.5" style={{ color: isCompleted ? "var(--t3)" : urgentColor }}>
                                        {isCompleted ? "Done" : daysAway < 0 ? "Deadline passed" : daysAway === 0 ? "Less than a day away" : `${daysAway}d away`}
                                      </p>
                                    </>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {!isCompleted && (
                                    <button
                                      type="button"
                                      onClick={() => setCalAddParentId((v) => v === dl.id ? null : dl.id)}
                                      className="text-xs px-2 py-1 rounded-[12px] transition-colors"
                                      style={{ color: "var(--t3)" }}
                                      title="Add sub-deadline"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                    </button>
                                  )}
                                  {!isCompleted && (
                                    <button
                                      type="button"
                                      onClick={() => handleCompleteDeadline(dl.id)}
                                      className="p-1.5 rounded-[12px] transition-colors"
                                      style={{ color: "var(--t3)" }}
                                      title="Mark done (stays on calendar, Dilly remembers)"
                                      aria-label="Mark done"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDeadline(dl.id)}
                                    className="p-1.5 rounded-[12px] transition-colors"
                                    style={{ color: "var(--t3)" }}
                                    title="Delete from everywhere"
                                    aria-label="Delete deadline"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              </div>
                              {/* Sub-deadlines under this parent */}
                              {(dl.subDeadlines || []).map((sub) => {
                                const subDays = Math.round((new Date(sub.date + "T00:00").getTime() - Date.now()) / 86400000);
                                const isRenamingSub = calRenamingSubId?.parentId === dl.id && calRenamingSubId?.subId === sub.id;
                                return (
                                  <div key={sub.id} className="cal-sub-pill flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      {isRenamingSub ? (
                                        <form onSubmit={(e) => { e.preventDefault(); commitRenameSubDeadline(); }} className="flex items-center gap-1">
                                          <input
                                            autoFocus
                                            type="text"
                                            value={calRenameSubValue}
                                            onChange={(e) => setCalRenameSubValue(e.target.value)}
                                            onBlur={commitRenameSubDeadline}
                                            onKeyDown={(e) => { if (e.key === "Escape") { setCalRenamingSubId(null); setCalRenameSubValue(""); } }}
                                            className="flex-1 px-2 py-1 text-xs rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                                            style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                                          />
                                        </form>
                                      ) : (
                                        <>
                                          <p
                                            className="text-xs truncate cursor-text transition-colors"
                                            style={{ color: "var(--t2)" }}
                                            onClick={() => { setCalRenamingSubId({ parentId: dl.id, subId: sub.id }); setCalRenameSubValue(sub.label); }}
                                            title="Click to rename"
                                          >{sub.label}</p>
                                          <p className="text-[10px]" style={{ color: "var(--t3)" }}>{sub.date} &bull; {subDays >= 0 ? (subDays === 0 ? "Less than a day away" : `${subDays}d away`) : `${Math.abs(subDays)}d ago`}</p>
                                        </>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSubDeadline(dl.id, sub.id)}
                                      className="p-0.5 shrink-0 transition-colors"
                                      style={{ color: "var(--t3)" }}
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                  </div>
                                );
                              })}
                              {/* Sub-deadline shown because its date is on this day (parent on different day) */}
                              {/* Add sub-deadline inline form */}
                              {calAddParentId === dl.id && (
                                <div className="ml-4 mt-2 cal-sub-pill cal-drawer">
                                  <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>Add milestone under this</p>
                                  <div className="flex gap-2 flex-wrap">
                                    <input
                                      type="text"
                                      value={calAddSubLabel}
                                      onChange={(e) => setCalAddSubLabel(e.target.value)}
                                      placeholder="E.g. Career Fair"
                                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                                      style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                                    />
                                    <input
                                      type="date"
                                      value={calAddSubDate}
                                      onChange={(e) => setCalAddSubDate(e.target.value)}
                                      className="px-2 py-1.5 text-xs rounded-[12px] w-32 focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                                      style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleAddSubDeadline(dl.id)}
                                      disabled={!calAddSubLabel.trim() || !calAddSubDate}
                                      className="text-xs font-semibold px-3 py-1.5 rounded-[12px] transition-opacity disabled:opacity-50"
                                      style={{ background: "var(--blue)", color: "#fff" }}
                                    >Add</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {selectedDaySubDeadlines.map(({ dl, sub }) => (
                          <div key={sub.id} className="cal-sub-pill flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs truncate" style={{ color: "var(--t2)" }}>{sub.label}</p>
                              <p className="text-[10px]" style={{ color: "var(--t3)" }}>Part of: {dl.label}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* All upcoming deadlines list (active only; completed stay in calendar only) */}
                {allDeadlines.filter((d) => !d.completedAt).length > 0 && (
                  <div className="voice-chat-container p-4" style={{ borderLeft: "4px solid var(--blue)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t3)" }}>All deadlines</p>
                    <div className="space-y-3">
                      {[...allDeadlines].filter((d) => !d.completedAt).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((dl) => {
                        const daysAway = Math.round((new Date(dl.date + "T00:00").getTime() - Date.now()) / 86400000);
                        const urgentColor = daysAway < 0 ? "var(--t3)" : daysAway <= 3 ? "var(--coral)" : daysAway <= 7 ? "var(--amber)" : daysAway <= 14 ? "var(--amber)" : "var(--t3)";
                        const urgentBadge = daysAway >= 0 && (daysAway <= 3 ? "CRITICAL" : daysAway <= 7 ? "URGENT" : daysAway <= 14 ? "SOON" : null);
                        const isRenamingThis = calRenamingId === dl.id;
                        return (
                          <div key={dl.id} className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-[12px] flex items-center justify-center shrink-0 mt-0.5" style={{ background: "var(--bdim)", border: "1px solid var(--blue)" }}>
                              <svg className="w-4 h-4" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {isRenamingThis ? (
                                  <form onSubmit={(e) => { e.preventDefault(); commitRenameDeadline(); }} className="flex-1">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={calRenameValue}
                                      onChange={(e) => setCalRenameValue(e.target.value)}
                                      onBlur={commitRenameDeadline}
                                      onKeyDown={(e) => { if (e.key === "Escape") { setCalRenamingId(null); setCalRenameValue(""); } }}
                                      className="w-full px-2.5 py-1 text-sm font-medium rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                                      style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                                    />
                                  </form>
                                ) : (
                                  <>
                                    <p
                                      className="text-sm font-medium cursor-text transition-colors"
                                      style={{ color: "var(--t1)" }}
                                      onClick={() => { setCalRenamingId(dl.id); setCalRenameValue(dl.label); }}
                                      title="Click to rename"
                                    >{dl.label}</p>
                                    {urgentBadge && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[8px]" style={{ background: daysAway <= 3 ? "rgba(255,69,58,0.15)" : daysAway <= 7 ? "var(--adim)" : "var(--adim)", color: daysAway <= 3 ? "var(--coral)" : "var(--amber)" }}>{urgentBadge}</span>}
                                    {dl.createdBy === "dilly" && <span className="text-[10px] px-1.5 py-0.5 rounded-[8px]" style={{ color: "var(--t3)", background: "var(--s3)" }}>by Dilly</span>}
                                  </>
                                )}
                              </div>
                              <p className="text-xs mt-0.5" style={{ color: urgentColor }}>{dl.date} &bull; {daysAway < 0 ? "Deadline passed" : daysAway === 0 ? "Less than a day away" : `${daysAway}d away`}</p>
                              {(dl.subDeadlines || []).map((sub) => {
                                const subDays = Math.round((new Date(sub.date + "T00:00").getTime() - Date.now()) / 86400000);
                                const isRenamingThisSub = calRenamingSubId?.parentId === dl.id && calRenamingSubId?.subId === sub.id;
                                return (
                                  <div key={sub.id} className="mt-1.5 flex items-center gap-2 ml-3 pl-2" style={{ borderLeft: "2px solid var(--b1)" }}>
                                    <div className="flex-1 min-w-0">
                                      {isRenamingThisSub ? (
                                        <form onSubmit={(e) => { e.preventDefault(); commitRenameSubDeadline(); }}>
                                          <input
                                            autoFocus
                                            type="text"
                                            value={calRenameSubValue}
                                            onChange={(e) => setCalRenameSubValue(e.target.value)}
                                            onBlur={commitRenameSubDeadline}
                                            onKeyDown={(e) => { if (e.key === "Escape") { setCalRenamingSubId(null); setCalRenameSubValue(""); } }}
                                            className="w-full px-2 py-0.5 text-xs rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/50"
                                            style={{ background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t1)" }}
                                          />
                                        </form>
                                      ) : (
                                        <>
                                          <p
                                            className="text-xs truncate cursor-text transition-colors"
                                            style={{ color: "var(--t3)" }}
                                            onClick={() => { setCalRenamingSubId({ parentId: dl.id, subId: sub.id }); setCalRenameSubValue(sub.label); }}
                                            title="Click to rename"
                                          >{sub.label}</p>
                                          <p className="text-[10px]" style={{ color: "var(--t3)" }}>{sub.date} &bull; {subDays < 0 ? "Deadline passed" : subDays === 0 ? "Less than a day away" : `${subDays}d away`}</p>
                                        </>
                                      )}
                                    </div>
                                    <button type="button" onClick={() => handleDeleteSubDeadline(dl.id, sub.id)} className="p-0.5 shrink-0 transition-colors" style={{ color: "var(--t3)" }}>
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                              <button type="button" onClick={() => handleCompleteDeadline(dl.id)} className="p-1.5 rounded-[12px] transition-colors" style={{ color: "var(--t3)" }} title="Mark done (stays on calendar)"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                              <button type="button" onClick={() => handleDeleteDeadline(dl.id)} className="p-1.5 rounded-[12px] transition-colors" style={{ color: "var(--t3)" }} title="Delete from everywhere"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {allDeadlines.length === 0 && !calAddOpen && (
                  <div className="voice-chat-container p-10 text-center voice-empty" style={{ borderLeft: "4px solid var(--blue)" }}>
                    <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "var(--bdim)", border: "1px solid var(--blue)" }}>
                      <svg className="w-7 h-7" style={{ color: "var(--blue)" }} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                    </div>
                    <p className="font-semibold text-lg mb-1" style={{ color: "var(--t1)" }}>No deadlines yet</p>
                    <p className="text-sm max-w-xs mx-auto mb-5" style={{ color: "var(--t3)" }}>Add your application deadlines, interviews, and events. Dilly will use these to keep you on track.</p>
                    <button type="button" onClick={() => setCalAddOpen(true)} className="text-sm font-semibold px-6 py-2.5 inline-flex items-center gap-2 rounded-[12px] transition-opacity hover:opacity-90" style={{ background: "var(--blue)", color: "#fff" }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      Add your first deadline
                    </button>
                  </div>
                )}
              </section>
              </div>
            );
          })()}</div>)}

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
          <div style={{ display: mainAppTab === "rank" ? "block" : "none" }}><div className="tab-enter">{(() => {
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
          })()}</div></div>

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
