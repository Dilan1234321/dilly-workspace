import { useRef, useEffect, useMemo, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useClientSearchParams } from "@/lib/clientSearchParams";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useDillyVoiceNotification } from "@/context/DillyVoiceNotificationContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { useToast } from "@/hooks/useToast";
import { dilly } from "@/lib/dilly";
import { getEffectiveCohortLabel } from "@/lib/trackDefinitions";
import {
  PENDING_VOICE_KEY,
  DILLY_PLAYBOOK_VOICE_PROMPT_KEY,
  DILLY_SCORE_GAP_VOICE_PROMPT_KEY,
  DILLY_JOB_GAP_VOICE_PROMPT_KEY,
  DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY,
  DILLY_LEADERBOARD_VOICE_PROMPT_KEY,
  DILLY_OPEN_OVERLAY_KEY,
  VOICE_FROM_AUDIT_ID_KEY,
  VOICE_FROM_CERT_HANDOFF_KEY,
  LOW_SCORE_THRESHOLD,
  PROFILE_CACHE_KEY_BASE,
  safeUuid,
  voiceStorageKey,
  getDillyVoiceEmptyGreeting,
  hasCompletedDillyVoiceIntro,
  markDillyVoiceIntroSeen,
  gapToNextLevel,
  computeScoreTrajectory,
  getTopThreeActions,
  toNaturalSuggestion,
} from "@/lib/dillyUtils";
import { DEFAULT_VOICE_AVATAR_INDEX, VOICE_AVATAR_OPTIONS } from "@/lib/voiceAvatars";
import { dillyPresenceManager } from "@/lib/dillyPresence";
import {
  computeVoiceSessionRecap,
  persistVoiceSessionRecap,
  readVoiceSessionRecap,
} from "@/lib/voiceSessionRecap";
import { checkMidnightEasterEgg } from "@/lib/easterEggs";
import { playSound } from "@/lib/sounds";
import type { VoiceConvo, SessionCapture, ConversationOutput } from "@/types/dilly";
import type { TransitionSource } from "@/lib/dillyPresence";

interface UseVoiceLifecycleParams {
  latestAuditRef: React.MutableRefObject<import("@/types/dilly").AuditV2 | null>;
  voiceEndRef: React.RefObject<HTMLDivElement | null>;
  voiceSendRef: React.MutableRefObject<((text?: string) => void) | null>;
  latestVoiceConvIdRef: React.MutableRefObject<string | null>;
  openVoiceWithNewChatRef: React.MutableRefObject<(prompt?: string, title?: string, opts?: { initialAssistantMessage?: string; transitionSource?: TransitionSource }) => void>;
  allowAutoSendPendingRef: React.MutableRefObject<boolean>;
  voiceAuditReportIdRef: React.MutableRefObject<string | null>;
  voiceCertLandingRef: React.MutableRefObject<{ cert_id: string; name?: string; provider?: string; source?: string } | null>;
  proactiveNudges: {
    app_funnel?: { applied: number; responses: number; interviews: number; silent_2_weeks: number };
    relationship_nudges?: { person: string; weeks_ago: number }[];
    deadline_urgent?: { label: string; days: number };
    score_nudge?: { dimension: string; gain: number };
    seasonal?: { label: string };
  } | null;
}

export function useVoiceLifecycle({
  latestAuditRef,
  voiceEndRef,
  voiceSendRef,
  latestVoiceConvIdRef,
  openVoiceWithNewChatRef,
  allowAutoSendPendingRef,
  voiceAuditReportIdRef,
  voiceCertLandingRef,
  proactiveNudges,
}: UseVoiceLifecycleParams) {
  const pathname = usePathname();
  const searchParams = useClientSearchParams();
  const { toast } = useToast();
  const {
    state: { mainAppTab },
  } = useNavigation();
  const { user, appProfile, setAppProfile } = useAppContext();
  const {
    audit,
    savedAuditForCenter,
    viewingAudit,
    auditHistory,
    centerRefreshKey,
  } = useAuditScore();
  const {
    voiceConvos, setVoiceConvos,
    openVoiceConvIds, setOpenVoiceConvIds,
    activeVoiceConvId, setActiveVoiceConvId,
    voiceAvatarIndex, setVoiceAvatarIndex,
    voiceMessages, setVoiceMessages,
    voiceMessageQueue, setVoiceMessageQueue,
    voiceMockInterviewSession, setVoiceMockInterviewSession,
    voiceInput, setVoiceInput,
    voiceLoading,
    voiceStreamingText, setVoiceStreamingText,
    voiceFollowUpSuggestions, setVoiceFollowUpSuggestions,
    lastAuditTsOnVoiceEnter, setLastAuditTsOnVoiceEnter,
    setPendingSessionCaptureCard,
    setLatestConversationOutput,
    voiceRecapNonce, setVoiceRecapNonce, setVoiceRecapForCard,
    voiceApplicationsPreview,
    voiceActionItems, setVoiceActionItems,
    voiceCompany, setVoiceCompany,
    voiceMemory, setVoiceMemory,
    voiceFeedback, setVoiceFeedback,
    voiceOverlayOpen, setVoiceOverlayOpen,
    setScoreCardDillyStrip,
    pendingVoicePrompt, setPendingVoicePrompt,
  } = useVoice();
  const { setNotificationVoiceAvatar, setNotificationTapHandler } = useDillyVoiceNotification();

  const voiceMessagesRef = useRef(voiceMessages);
  voiceMessagesRef.current = voiceMessages;
  const sessionCaptureShownRef = useRef<Set<string>>(new Set());
  const voiceMemoryLengthAtVoiceEnterRef = useRef(0);
  const prevVoiceActiveRef = useRef(false);
  const voiceOnboardingFetchedRef = useRef(false);

  // Suppress global pull-to-refresh while Voice is active
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

  // Dilly Presence: score card footnote
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

  // Session handoff from other shells
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
        } catch { /* ignore */ }
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
          } catch { /* ignore */ }
          if (!handledWelcome) {
            const fromAudit = sessionStorage.getItem(VOICE_FROM_AUDIT_ID_KEY);
            if (fromAudit) {
              sessionStorage.removeItem(VOICE_FROM_AUDIT_ID_KEY);
              voiceAuditReportIdRef.current = fromAudit.trim() || null;
              voiceCertLandingRef.current = null;
              queueMicrotask(() =>
                openVoiceWithNewChatRef.current(undefined, "Audit report", {
                  initialAssistantMessage:
                    "I've got your **audit report** on deck. Want to dig into **Smart**, **Grit**, or **Build** first—or tighten one line together?",
                }),
              );
            } else {
              voiceAuditReportIdRef.current = null;
              voiceCertLandingRef.current = null;
              let scoreGapPrompt: string | null = null;
              try {
                scoreGapPrompt = sessionStorage.getItem(DILLY_SCORE_GAP_VOICE_PROMPT_KEY);
                if (scoreGapPrompt) sessionStorage.removeItem(DILLY_SCORE_GAP_VOICE_PROMPT_KEY);
              } catch { /* ignore */ }
              const gapTrim = scoreGapPrompt?.trim();
              if (gapTrim) {
                queueMicrotask(() => openVoiceWithNewChatRef.current(gapTrim, "Score gap"));
              } else {
                let jobGapPrompt: string | null = null;
                try {
                  jobGapPrompt = sessionStorage.getItem(DILLY_JOB_GAP_VOICE_PROMPT_KEY);
                  if (jobGapPrompt) sessionStorage.removeItem(DILLY_JOB_GAP_VOICE_PROMPT_KEY);
                } catch { /* ignore */ }
                const jobGapTrim = jobGapPrompt?.trim();
                if (jobGapTrim) {
                  queueMicrotask(() => openVoiceWithNewChatRef.current(jobGapTrim, "Job gap"));
                } else {
                  let expandSearchPrompt: string | null = null;
                  try {
                    expandSearchPrompt = sessionStorage.getItem(DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY);
                    if (expandSearchPrompt) sessionStorage.removeItem(DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY);
                  } catch { /* ignore */ }
                  const expandTrim = expandSearchPrompt?.trim();
                  if (expandTrim) {
                    queueMicrotask(() => openVoiceWithNewChatRef.current(expandTrim, "More jobs"));
                  } else {
                    let leaderboardPrompt: string | null = null;
                    try {
                      leaderboardPrompt = sessionStorage.getItem(DILLY_LEADERBOARD_VOICE_PROMPT_KEY);
                      if (leaderboardPrompt) sessionStorage.removeItem(DILLY_LEADERBOARD_VOICE_PROMPT_KEY);
                    } catch { /* ignore */ }
                    const lbTrim = leaderboardPrompt?.trim();
                    if (lbTrim) {
                      queueMicrotask(() => openVoiceWithNewChatRef.current(lbTrim, "Leaderboard"));
                    } else {
                      let playbookPrompt: string | null = null;
                      try {
                        playbookPrompt = sessionStorage.getItem(DILLY_PLAYBOOK_VOICE_PROMPT_KEY);
                        if (playbookPrompt) sessionStorage.removeItem(DILLY_PLAYBOOK_VOICE_PROMPT_KEY);
                      } catch { /* ignore */ }
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

  // Voice tab URL handling
  useEffect(() => {
    if (searchParams.get("tab") !== "voice" || !user?.subscribed) return;
    // Handled by deep links — this just ensures we don't auto-open
  }, [searchParams, user?.subscribed]);

  // Notification avatar sync
  useEffect(() => {
    setNotificationVoiceAvatar(voiceAvatarIndex ?? DEFAULT_VOICE_AVATAR_INDEX);
  }, [voiceAvatarIndex, setNotificationVoiceAvatar]);

  // Tap banner -> open Voice overlay
  useEffect(() => {
    setNotificationTapHandler(() => setVoiceOverlayOpen(true));
    return () => setNotificationTapHandler(null);
  }, [setNotificationTapHandler, setVoiceOverlayOpen]);

  // Voice enter/leave session capture
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
        dilly.fetch(`/memory/session-capture/${encodeURIComponent(convId)}`)
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
        const dismissedKey = `conv_output_dismissed_${convId}`;
        if (typeof localStorage !== "undefined" && !localStorage.getItem(dismissedKey)) {
          dilly.fetch(`/voice/history/${encodeURIComponent(convId)}`)
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

  // When entering Voice, snapshot audit ts
  useEffect(() => {
    if (mainAppTab !== "voice" && !voiceOverlayOpen) return;
    const latest = auditHistory[0]?.ts ?? null;
    if (latest !== null && lastAuditTsOnVoiceEnter === null) {
      setLastAuditTsOnVoiceEnter(latest);
    }
    const egg = checkMidnightEasterEgg();
    if (egg) {
      if (egg.sound) playSound("badge_unlock");
      toast(egg.message, "success", 5000);
    }
  }, [mainAppTab, voiceOverlayOpen, auditHistory, lastAuditTsOnVoiceEnter]);

  // Mock interview reset on convo change
  useEffect(() => {
    setVoiceMockInterviewSession(null);
  }, [activeVoiceConvId]);

  // Voice onboarding fetch
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

  // Auto-send pending Voice prompt
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

  // Voice state cleanup on logout
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

  // Voice data hydration from localStorage
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

  // Voice intro mark-seen
  useEffect(() => {
    if (!user?.email) return;
    const onVoice = mainAppTab === "voice" || voiceOverlayOpen;
    if (!onVoice) return;
    const introAlreadyDone = hasCompletedDillyVoiceIntro(user.email);
    return () => {
      if (!introAlreadyDone) markDillyVoiceIntroSeen(user.email);
    };
  }, [user?.email, mainAppTab, voiceOverlayOpen]);

  // Sync messages back to convos
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

  // Persist convos to localStorage
  useEffect(() => {
    if (!user?.email) return;
    try { localStorage.setItem(voiceStorageKey("convos", user.email), JSON.stringify(voiceConvos.slice(-30))); } catch { /* ignore */ }
  }, [voiceConvos, user?.email]);

  // Persist open tab IDs
  useEffect(() => {
    if (!user?.email) return;
    try { localStorage.setItem(voiceStorageKey("open_tabs", user.email), JSON.stringify(openVoiceConvIds)); } catch { /* ignore */ }
  }, [openVoiceConvIds, user?.email]);

  // Persist voice action items
  useEffect(() => {
    if (!user?.email) return;
    try { localStorage.setItem(voiceStorageKey("action_items", user.email), JSON.stringify(voiceActionItems)); } catch {}
  }, [voiceActionItems, user?.email]);

  // Persist voice company
  useEffect(() => {
    if (!user?.email) return;
    try { localStorage.setItem(voiceStorageKey("company", user.email), voiceCompany); } catch {}
  }, [voiceCompany, user?.email]);

  // Persist voice avatar
  useEffect(() => {
    if (!user?.email) return;
    const idx = voiceAvatarIndex ?? DEFAULT_VOICE_AVATAR_INDEX;
    try { localStorage.setItem(voiceStorageKey("avatar", user.email), String(idx)); } catch {}
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_avatar_index: idx }),
      }).catch(() => { /* ignore */ });
    }
  }, [voiceAvatarIndex, user?.email]);

  // Persist voice memory
  useEffect(() => {
    if (!user?.email) return;
    try { localStorage.setItem(voiceStorageKey("memory", user.email), JSON.stringify(voiceMemory)); } catch {}
    const saveToProfile = (appProfile as { voice_save_to_profile?: boolean })?.voice_save_to_profile !== false;
    if (voiceMemory.length > 0 && saveToProfile) {
      dilly.fetch(`/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_memory: voiceMemory.slice(-10) }),
      }).catch(() => { /* ignore */ });
    }
  }, [voiceMemory, user?.email, (appProfile as { voice_save_to_profile?: boolean })?.voice_save_to_profile]);

  // Voice feedback load
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

  // Clean stale open tab IDs
  useEffect(() => {
    if (voiceConvos.length === 0 || openVoiceConvIds.length === 0) return;
    const validIds = new Set(voiceConvos.map((c) => c.id));
    const hasStale = openVoiceConvIds.some((id) => !validIds.has(id));
    if (hasStale) {
      setOpenVoiceConvIds((prev) => prev.filter((id) => validIds.has(id)));
    }
  }, [voiceConvos, openVoiceConvIds]);

  // Active convo fallback
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

  // Voice scroll to bottom
  useEffect(() => {
    if (mainAppTab !== "voice") return;
    const el = voiceEndRef.current;
    if (!el) return;
    const instant = Boolean(voiceStreamingText?.trim());
    el.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "end", inline: "nearest" });
  }, [mainAppTab, voiceMessages, voiceLoading, voiceStreamingText]);

  // Voice draft persistence: restore
  useEffect(() => {
    const voiceActive = mainAppTab === "voice" || voiceOverlayOpen;
    if (!voiceActive || !user?.email) return;
    try {
      const key = voiceStorageKey("draft", user.email);
      const saved = sessionStorage.getItem(key);
      if (saved != null && saved !== "" && !voiceInput) setVoiceInput(saved);
    } catch {}
  }, [mainAppTab, voiceOverlayOpen, user?.email]);

  // Voice draft persistence: save
  useEffect(() => {
    if (!user?.email || voiceInput === "") return;
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(voiceStorageKey("draft", user.email), voiceInput);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [voiceInput, user?.email]);

  // Voice recap hydration (for Center tab)
  useEffect(() => {
    if (mainAppTab !== "center" || !user?.subscribed) return;
    setVoiceRecapForCard(readVoiceSessionRecap());
  }, [mainAppTab, user?.subscribed, voiceRecapNonce, centerRefreshKey]);

  // voiceStarterSuggestions
  const voiceStarterSuggestions = useMemo(() => {
    const displayAudit = viewingAudit ?? audit ?? savedAuditForCenter;
    const activeDeadlines = (appProfile?.deadlines || []).filter((d) => d.date && d.label && !d.completedAt);
    const urgentBannerDeadline = activeDeadlines.find((d) => {
      try { const days = (new Date(d.date).getTime() - Date.now()) / 86400000; return days >= 0 && days <= 7; } catch { return false; }
    });
    const soonestDeadline = activeDeadlines.find((d) => {
      try { const days = (new Date(d.date).getTime() - Date.now()) / 86400000; return days >= 0 && days < 14; } catch { return false; }
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
      if (urgentBannerDeadline) candidates.push({ label: `How do I prepare for my ${urgentBannerDeadline.label}?`, priority: 9 });
      if (trajGains.length > 0) candidates.push({ label: "What's my score potential?", priority: 8 });
      if (lowestDim.v < LOW_SCORE_THRESHOLD) candidates.push({ label: `How can I help boost my ${lowestDim.label} score?`, priority: 7 });
      if (soonestDeadline && !urgentBannerDeadline) candidates.push({ label: `How do I prepare for my ${soonestDeadline.label}?`, priority: 6 });
      const appTarget = (appProfile?.application_target_label ?? appProfile?.application_target)?.trim();
      if (appTarget) candidates.push({ label: `How do I prepare for my ${appTarget}?`, priority: 5 });
      const careerGoal = appProfile?.career_goal?.trim();
      if (careerGoal) candidates.push({ label: `How do I work toward ${careerGoal}?`, priority: 4 });
      const track = getEffectiveCohortLabel(displayAudit.detected_track, appProfile?.track);
      if (track) candidates.push({ label: `What do ${track} recruiters look for in my resume?`, priority: 4 });
      if (topFinding && topFinding.length < 120) candidates.push({ label: "How can I help fix this?", priority: 3 });
    }
    candidates.push({ label: "How can I add metrics to my bullets?", priority: 2 });
    candidates.push({ label: "How do I prepare for my interview?", priority: 0 });
    candidates.push({ label: "I got rejected — help me reframe", priority: 5 });
    candidates.push({ label: "I'm nervous about my interview", priority: 5 });
    candidates.push({ label: "I got an offer — what should I do next?", priority: 4 });

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
    const beyondResume = (appProfile as { beyond_resume?: { type?: string; text?: string }[] })?.beyond_resume ?? [];
    const people = beyondResume.filter((b) => (b.type || "").toLowerCase() === "person").map((b) => (b.text || "").trim()).filter(Boolean);
    const companies = beyondResume.filter((b) => (b.type || "").toLowerCase() === "company").map((b) => (b.text || "").trim()).filter(Boolean);
    people.slice(0, 2).forEach((p) => {
      const short = p.length > 25 ? p.slice(0, 22) + "\u2026" : p;
      candidates.push({ label: `Prep for follow-up with ${short}`, priority: 7 });
    });
    companies.slice(0, 2).forEach((c) => {
      const short = c.length > 30 ? c.slice(0, 27) + "\u2026" : c;
      candidates.push({ label: `How do I follow up with ${short}?`, priority: 6 });
    });
    if (beyondResume.length < 3) candidates.push({ label: "How can I help Dilly know me better?", priority: 2 });

    return candidates
      .sort((a, b) => b.priority - a.priority)
      .filter((c, i, arr) => arr.findIndex((x) => x.label === c.label) === i)
      .slice(0, 3)
      .map((c) => c.label);
  }, [viewingAudit, audit, savedAuditForCenter, appProfile, proactiveNudges]);

  // voiceScoresForChat computation
  const voiceScoresForChat = useMemo(() => {
    const auditForVoiceChatScores = viewingAudit ?? audit ?? savedAuditForCenter;
    const isViewingLatestForVoicePrev =
      !viewingAudit ||
      (Boolean(viewingAudit.id) &&
        Boolean(auditHistory[0]?.id) &&
        viewingAudit.id === auditHistory[0]!.id);
    const prevScoresForVoice =
      isViewingLatestForVoicePrev && auditHistory.length >= 2 ? auditHistory[1]!.scores : null;

    if (!user?.subscribed) return null;
    if (auditForVoiceChatScores?.scores != null) {
      return {
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
      };
    }
    return {
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
    };
  }, [viewingAudit, audit, savedAuditForCenter, auditHistory, user?.subscribed, appProfile, voiceApplicationsPreview]);

  return {
    voiceStarterSuggestions,
    voiceScoresForChat,
    voiceMemoryLengthAtVoiceEnterRef,
  };
}
