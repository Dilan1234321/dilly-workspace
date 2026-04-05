"use client";

import React, { useRef, useEffect } from "react";
import { useVoice } from "@/contexts/VoiceContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useAppContext } from "@/context/AppContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { useToast } from "@/hooks/useToast";
import { useBulletRewriter } from "@/hooks/useBulletRewriter";
import { useCompanyDeadlines } from "@/hooks/useCompanyDeadlines";
import { useVoiceChatManagement } from "@/hooks/useVoiceChat";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import { AppProfileHeader } from "@/components/career-center";
import { dilly } from "@/lib/dilly";
import { sanitizeVoiceAssistantReply } from "@/lib/voiceReplySanitize";
import {
  voiceStorageKey,
  getDillyVoiceEmptyGreeting,
  markDillyVoiceIntroSeen,
  safeUuid,
  computeScoreTrajectory,
} from "@/lib/dillyUtils";
import { buildFollowUpSuggestions } from "@/lib/voiceUtils";
import {
  wantsEndMockInterview,
  wantsMockInterview,
} from "@/lib/voiceMockInterview";
import { getEffectiveCohortLabel } from "@/lib/trackDefinitions";
import { playSound } from "@/lib/sounds";
import { hapticLight } from "@/lib/haptics";
import type { SchoolTheme } from "@/lib/schools";
import type { TransitionSource } from "@/lib/dillyPresence";
import type { DillyDeadline, VoiceConvo } from "@/types/dilly";
import type { DillyVoiceChatScoresBundle } from "@/lib/voiceVisualTypes";

// Extracted components
import { ChatListDrawer } from "@/features/voice/ChatListDrawer";
import { VoiceEmptyState } from "@/features/voice/VoiceEmptyState";
import { CompanyPanel } from "@/features/voice/CompanyPanel";
import { ActionItemsPanel } from "@/features/voice/ActionItemsPanel";
import { VoiceMessageList } from "@/features/voice/VoiceMessageList";
import { BulletRewriterPanel } from "@/features/voice/BulletRewriterPanel";
import { VoiceTabBar } from "@/features/voice/VoiceTabBar";
import { VoiceInputBar } from "@/features/voice/VoiceInputBar";

// Extracted logic
import { handleMockInterviewAnswer, handleMockInterviewStart } from "@/features/voice/mockInterviewHandlers";
import { processVoiceStream } from "@/features/voice/processVoiceStream";

// ── Constants ────────────────────────────────────────────────────────────────

const RESUME_DEEP_DIVE_PROMPT =
  "I'd like to do a resume deep-dive. For each experience on my resume, ask me what skills I used, what tools or libraries I used, and what I had to leave off. Start with one experience and ask me 2\u20133 specific questions about it.";

// ── Props ────────────────────────────────────────────────────────────────────

export interface VoiceTabProps {
  theme: SchoolTheme;
  profilePhotoUrl: string | null;
  openVoiceWithNewChat: (
    prompt?: string,
    title?: string,
    opts?: { initialAssistantMessage?: string; transitionSource?: TransitionSource },
  ) => void;
  endVoiceMockInterviewByUser: () => void;
  voiceStarterSuggestions: string[];
  voiceScoresForChat: DillyVoiceChatScoresBundle | null;
  buildVoiceContext: () => Record<string, unknown>;
  mergeVoiceAutoSavedDeadlines: (rows: DillyDeadline[]) => void;
  saveProfile: (data: Record<string, unknown>) => Promise<boolean>;
  /** Shared refs that page.tsx also reads */
  voiceSendRef: React.MutableRefObject<((text?: string) => void) | null>;
  voiceOverlayActionsRef: React.MutableRefObject<{
    startNewChat: () => void;
    openChat: (id: string) => void;
    deleteChat: (id: string) => void;
    closeTab: (id: string) => void;
  } | null>;
  latestVoiceConvIdRef: React.MutableRefObject<string | null>;
  voiceEndRef: React.RefObject<HTMLDivElement | null>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function VoiceTab({
  theme,
  profilePhotoUrl,
  openVoiceWithNewChat,
  endVoiceMockInterviewByUser,
  voiceStarterSuggestions: _voiceStarterSuggestions,
  voiceScoresForChat,
  buildVoiceContext,
  mergeVoiceAutoSavedDeadlines,
  saveProfile,
  voiceSendRef,
  voiceOverlayActionsRef,
  latestVoiceConvIdRef,
  voiceEndRef,
}: VoiceTabProps) {
  const { toast } = useToast();
  const {
    state: { mainAppTab },
    setMainAppTab,
  } = useNavigation();
  const { user, setUser, appProfile, setAppProfile, school } = useAppContext();
  const {
    audit,
    lastAudit,
    savedAuditForCenter,
    viewingAudit,
    auditHistory,
  } = useAuditScore();
  const {
    voiceAvatarIndex, setVoiceAvatarPickerOpen,
    voiceMockInterviewSession, setVoiceMockInterviewSession,
    voiceMessageQueue, setVoiceMessageQueue, voiceInput, setVoiceInput,
    voiceLoading, setVoiceLoading, voiceStreamingText, setVoiceStreamingText,
    voiceFollowUpSuggestions, setVoiceFollowUpSuggestions,
    lastAuditTsOnVoiceEnter,
    memoryItems,
    voiceRememberOpen, setVoiceRememberOpen, voiceRememberNote, setVoiceRememberNote,
    voiceActionItems, setVoiceActionItems, actionItemsPanelOpen, setActionItemsPanelOpen,
    voiceMemory: _voiceMemory, setVoiceMemory,
    voiceFeedback, setVoiceFeedback,
    voiceOverlayOpen,
    voiceScreenContext: _voiceScreenContext, setVoiceScreenContext,
    pendingVoicePrompt: _pendingVoicePrompt, setPendingVoicePrompt: _setPendingVoicePrompt,
  } = useVoice();

  // ── Extracted hooks ───────────────────────────────────────────────────────

  const {
    bulletInput, setBulletInput,
    bulletRewritten, setBulletRewritten,
    bulletLoading,
    bulletHistory, setBulletHistory,
    bulletRewriterOpen, setBulletRewriterOpen,
    handleBulletRewrite,
  } = useBulletRewriter(buildVoiceContext);

  const {
    voiceCompany,
    voiceCompanyInput, setVoiceCompanyInput,
    voiceCompanyPanelOpen, setVoiceCompanyPanelOpen,
    firmDeadlines,
    handleCompanySet,
  } = useCompanyDeadlines();

  const {
    voiceConvos, setVoiceConvos,
    openVoiceConvIds,
    activeVoiceConvId,
    voiceChatListOpen, setVoiceChatListOpen,
    voiceMessages, setVoiceMessages,
    renamingVoiceConvId, setRenamingVoiceConvId,
    renameValue, setRenameValue,
    saveCurrentConvo: _saveCurrentConvo,
    startNewChat, openChat, closeTab, backToList: _backToList, deleteChat,
    startRename, commitRename,
  } = useVoiceChatManagement();

  // ── Local refs ──────────────────────────────────────────────────────────────

  const voiceLastLikedRef = useRef(false);
  const voiceChatScrollRef = useRef<HTMLDivElement>(null);
  const voiceCompanyInputRef = useRef<HTMLInputElement>(null);
  const voiceRenameInputRef = useRef<HTMLInputElement>(null);

  // ── Focus effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (voiceCompanyPanelOpen && voiceCompanyInputRef.current) {
      const el = voiceCompanyInputRef.current;
      requestAnimationFrame(() => el.focus({ preventScroll: true }));
    }
  }, [voiceCompanyPanelOpen]);

  useEffect(() => {
    if (renamingVoiceConvId && voiceRenameInputRef.current) {
      const el = voiceRenameInputRef.current;
      requestAnimationFrame(() => el.focus({ preventScroll: true }));
    }
  }, [renamingVoiceConvId]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const displayAudit = audit ?? savedAuditForCenter;
  const prevAuditScores = auditHistory.length >= 2 ? auditHistory[1].scores : null;

  const latestAuditTs = auditHistory[0]?.ts ?? null;
  const isFreshAudit =
    latestAuditTs !== null &&
    lastAuditTsOnVoiceEnter !== null &&
    latestAuditTs > lastAuditTsOnVoiceEnter;

  // Expose actions for VoiceOverlay
  voiceOverlayActionsRef.current = { startNewChat, openChat, deleteChat, closeTab };

  // ── Feedback handler ──────────────────────────────────────────────────────

  const sendVoiceFeedback = async (msgIndex: number, rating: "up" | "down") => {
    setVoiceFeedback((prev) => {
      const next = { ...prev, [msgIndex]: rating };
      if (user?.email && activeVoiceConvId && typeof localStorage !== "undefined") {
        try {
          const key = voiceStorageKey("voice_feedback", user.email);
          const raw = localStorage.getItem(key);
          const all: Record<string, Record<string, "up" | "down">> = raw ? JSON.parse(raw) : {};
          const forConvo = all[activeVoiceConvId] ?? {};
          const updated: Record<string, "up" | "down"> = {
            ...forConvo,
            [String(msgIndex)]: rating,
          };
          all[activeVoiceConvId] = updated;
          localStorage.setItem(key, JSON.stringify(all));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
    if (rating === "up") voiceLastLikedRef.current = true;
    const msg = voiceMessages[msgIndex];
    const prevUserMsg = voiceMessages[msgIndex - 1];
    try {
      await dilly.fetch(`/voice/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          message_id: `${activeVoiceConvId ?? "unknown"}-${msgIndex}`,
          ai_text: msg?.content ?? "",
          user_text: prevUserMsg?.content ?? "",
          track:
            getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track) || "",
          scores: displayAudit?.scores ?? undefined,
          target_school: appProfile?.target_school ?? "",
        }),
      });
    } catch {
      /* fire and forget */
    }
  };

  // ── Score trajectory ───────────────────────────────────────────────────────

  const _scoreTrajectory = (() => {
    try {
      if (!displayAudit?.scores || !Array.isArray(displayAudit?.recommendations)) return null;
      const recs = displayAudit.recommendations;
      const s = displayAudit.scores;
      const current = {
        smart: typeof s.smart === "number" ? s.smart : 0,
        grit: typeof s.grit === "number" ? s.grit : 0,
        build: typeof s.build === "number" ? s.build : 0,
      };
      const impacts = { smart: 0, grit: 0, build: 0 };
      for (const rec of recs.slice(0, 5)) {
        if (!rec || typeof rec !== "object") continue;
        const dim = (rec.score_target || "").toLowerCase() as "smart" | "grit" | "build";
        if (dim in impacts) impacts[dim] += 4 + Math.random() * 3;
      }
      return {
        projected: {
          smart: Math.min(99, current.smart + impacts.smart),
          grit: Math.min(99, current.grit + impacts.grit),
          build: Math.min(99, current.build + impacts.build),
        },
        current,
        recCount: Math.min(recs.length, 5),
      };
    } catch {
      return null;
    }
  })();

  // ── Smart suggestions (via extracted utility) ─────────────────────────────

  const effectiveTrack = getEffectiveCohortLabel(
    displayAudit?.detected_track,
    appProfile?.track,
  );

  const _voiceSuggestions = buildFollowUpSuggestions({
    isFreshAudit,
    displayAudit,
    prevAuditScores,
    appProfile,
    effectiveTrack,
  });

  // ── Greeting ───────────────────────────────────────────────────────────────

  const voiceGreeting = getDillyVoiceEmptyGreeting(
    user?.email ?? null,
    appProfile?.name?.split(" ")[0] ?? null,
  );

  // ── Timestamp formatter ────────────────────────────────────────────────────

  const fmtTs = (ts?: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  // ── sendVoice ──────────────────────────────────────────────────────────────

  const sendVoice = async (overrideText?: string) => {
    let text = (typeof overrideText === "string" ? overrideText : (voiceInput ?? "")).trim();
    if (!text) return;
    try {
      markDillyVoiceIntroSeen(user?.email ?? null);
    } catch {
      /* ignore */
    }
    // Quick interactions: Slack-style slash commands
    if (text.startsWith("/ready ")) {
      text = `Am I ready for ${text.slice(7).trim()}?`;
    } else if (text === "/ready" || text === "/ready ") {
      text = "Am I ready? Which company or role should we check?";
    } else if (text.startsWith("/mock ")) {
      text = `Run a mock audit as if I'm applying to this role. Job description: ${text.slice(6).trim()}`;
    } else if (text === "/mock" || text === "/mock ") {
      text = "Run a mock audit. I'll paste the job description in my next message.";
    }
    if (voiceLoading) {
      setVoiceMessageQueue((q) => [...q, text]);
      setVoiceInput("");
      hapticLight();
      playSound("message_sent");
      return;
    }
    const now = Date.now();
    let convId = activeVoiceConvId;
    if (!convId) {
      const existingMessages = voiceMessages?.length ? voiceMessages : [];
      const newConvo: VoiceConvo = {
        id: safeUuid(),
        title: "New Chat",
        messages: existingMessages,
        updatedAt: now,
        createdAt: now,
      };
      setVoiceConvos((prev) => [...prev, newConvo]);
      setVoiceFollowUpSuggestions([]);
      convId = newConvo.id;
    }
    latestVoiceConvIdRef.current = convId ?? null;
    setVoiceInput("");
    try {
      sessionStorage.removeItem(voiceStorageKey("draft", user?.email ?? ""));
    } catch {}
    setVoiceMessages((m) => [...(m ?? []), { role: "user", content: text, ts: now }]);
    hapticLight();
    playSound("message_sent");
    setVoiceFollowUpSuggestions([]);
    setVoiceLoading(true);
    setVoiceStreamingText("");
    const convIdForMock = convId;
    const mockVoiceFinally = () => {
      setVoiceLoading(false);
      setVoiceMessageQueue((q) => {
        if (q.length === 0) return q;
        const [first, ...rest] = q;
        setTimeout(() => voiceSendRef.current?.(first), 0);
        return rest;
      });
    };

    if (voiceMockInterviewSession && wantsEndMockInterview(text)) {
      endVoiceMockInterviewByUser();
      mockVoiceFinally();
      return;
    }

    // ── Mock interview: answer flow ──────────────────────────────────────
    if (voiceMockInterviewSession?.awaitingAnswer) {
      const mockDeps = {
        toast,
        setUser,
        setVoiceMessages,
        setVoiceMockInterviewSession,
        setVoiceConvos,
        latestVoiceConvIdRef,
        convIdForMock,
        userSubscribed: !!user?.subscribed,
        displayAudit,
        detectedTrack: displayAudit?.detected_track as string | undefined,
        applicationTargetLabel: appProfile?.application_target_label as string | undefined,
      };
      try {
        await handleMockInterviewAnswer(text, voiceMockInterviewSession, mockDeps);
      } finally {
        mockVoiceFinally();
      }
      return;
    }

    // ── Mock interview: start flow ───────────────────────────────────────
    if (!voiceMockInterviewSession && wantsMockInterview(text)) {
      const mockDeps = {
        toast,
        setUser,
        setVoiceMessages,
        setVoiceMockInterviewSession,
        setVoiceConvos,
        latestVoiceConvIdRef,
        convIdForMock,
        userSubscribed: !!user?.subscribed,
        displayAudit,
        detectedTrack: displayAudit?.detected_track as string | undefined,
        applicationTargetLabel: appProfile?.application_target_label as string | undefined,
      };
      try {
        await handleMockInterviewStart(mockDeps);
      } finally {
        mockVoiceFinally();
      }
      return;
    }

    // ── Normal voice chat ────────────────────────────────────────────────
    const userLikedLast = voiceLastLikedRef.current;
    if (userLikedLast) voiceLastLikedRef.current = false;
    const activeConvo = convId ? voiceConvos.find((c) => c.id === convId) : null;
    const conversationTopic =
      activeConvo?.title && activeConvo.title !== "New chat" ? activeConvo.title : undefined;
    const isOnboardingConvo = activeConvo?.title === "Getting to know you";
    const onboardingStep = isOnboardingConvo
      ? voiceMessages.filter((m) => m.role === "user").length
      : undefined;
    const payload = {
      conv_id: convId,
      message: text,
      history: voiceMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      context: {
        ...buildVoiceContext(),
        user_liked_last_response: userLikedLast,
        ...(conversationTopic ? { conversation_topic: conversationTopic } : {}),
        ...(text === RESUME_DEEP_DIVE_PROMPT || activeConvo?.title === "Resume deep-dive"
          ? { conversation_topic: "resume_deep_dive" }
          : {}),
        ...(isOnboardingConvo
          ? { conversation_topic: "voice_onboarding", onboarding_step: onboardingStep }
          : {}),
        ...(text === RESUME_DEEP_DIVE_PROMPT || activeConvo?.title === "Resume deep-dive"
          ? {
              deep_dive_current_idx: Math.floor(
                Math.max(0, voiceMessages.filter((m) => m.role === "user").length) / 3,
              ),
            }
          : {}),
      },
    };
    setVoiceScreenContext(null);
    try {
      const res = await dilly.fetch(`/voice/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        try {
          localStorage.removeItem("dilly_auth_token");
        } catch {}
        setVoiceStreamingText("");
        setUser(null);
        toast("Session expired \u2014 sign in again to keep chatting.", "error");
        return;
      }
      if (!res.ok || !res.body) {
        // Fallback to non-streaming
        const fb = await dilly.fetch(`/voice/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = fb.ok ? await fb.json() : null;
        const replyRaw = (data?.reply ?? "Something Went Wrong. Try Again.") as string;
        const reply = sanitizeVoiceAssistantReply(replyRaw) || replyRaw;
        setVoiceMessages((m) => [...m, { role: "assistant", content: reply, ts: Date.now() }]);
        const baseSuggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
        const displayAuditForChip = viewingAudit ?? audit ?? savedAuditForCenter;
        let suggestionsToSet = baseSuggestions;
        if (displayAuditForChip?.scores) {
          const traj = computeScoreTrajectory(displayAuditForChip);
          const hasGain =
            traj &&
            (["smart", "grit", "build"] as const).some((dim) => {
              const delta = (traj[dim] ?? 0) - (displayAuditForChip.scores[dim] ?? 0);
              return delta >= 3;
            });
          if (hasGain && !baseSuggestions.includes("What's my score potential?")) {
            suggestionsToSet = [...baseSuggestions, "What's my score potential?"];
          }
        }
        setVoiceFollowUpSuggestions((prev) =>
          suggestionsToSet.length > 0 ? suggestionsToSet : prev.length > 0 ? prev : suggestionsToSet,
        );
        if (data?.profile_updates && typeof data.profile_updates === "object") {
          const updates = data.profile_updates as Record<string, unknown>;
          setAppProfile((prev) => (prev ? { ...prev, ...updates } : prev));
          if (Array.isArray(updates.voice_memory)) {
            setVoiceMemory(updates.voice_memory as string[]);
          }
        }
        if (data?.title && typeof data.title === "string" && convId) {
          setVoiceConvos((prev) =>
            prev.map((c) =>
              c.id === convId
                ? { ...c, title: (data.title as string).slice(0, 60), updatedAt: Date.now() }
                : c,
            ),
          );
        }
        if (Array.isArray(data?.deadlines_auto_saved) && data.deadlines_auto_saved.length > 0) {
          mergeVoiceAutoSavedDeadlines(data.deadlines_auto_saved as DillyDeadline[]);
        }
        return;
      }
      // Stream reading — extracted
      const reader = res.body.getReader();
      await processVoiceStream(reader, {
        convId,
        text,
        setVoiceStreamingText,
        setVoiceMessages,
        setVoiceFollowUpSuggestions,
        setVoiceConvos,
        setVoiceMemory,
        setAppProfile,
        setVoiceActionItems,
        mergeVoiceAutoSavedDeadlines,
        saveProfile,
        viewingAudit,
        audit,
        savedAuditForCenter,
        appProfile,
        activeVoiceConvId,
      });
    } catch {
      setVoiceStreamingText("");
      setVoiceMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Dilly couldn't respond right now. Check your connection and try again.",
          ts: Date.now(),
        },
      ]);
    } finally {
      setVoiceLoading(false);
      setVoiceMessageQueue((q) => {
        if (q.length === 0) return q;
        const [first, ...rest] = q;
        setTimeout(() => voiceSendRef.current?.(first), 0);
        return rest;
      });
    }
  };
  voiceSendRef.current = sendVoice;

  // ── Layout data ────────────────────────────────────────────────────────────

  const _activeConvo = activeVoiceConvId
    ? voiceConvos.find((c) => c.id === activeVoiceConvId)
    : null;
  const openConvos = voiceConvos.filter((c) => openVoiceConvIds.includes(c.id));
  const effectiveActiveId =
    activeVoiceConvId && openVoiceConvIds.includes(activeVoiceConvId)
      ? activeVoiceConvId
      : openConvos[0]?.id ?? "";

  // ── Empty state / list view (no open tabs) ─────────────────────────────────

  if (voiceConvos.length === 0 || openConvos.length === 0) {
    return (
      <VoiceEmptyState
        voiceConvos={voiceConvos}
        voiceAvatarIndex={voiceAvatarIndex}
        voiceGreeting={voiceGreeting}
        memoryItemsCount={memoryItems.length}
        setVoiceAvatarPickerOpen={setVoiceAvatarPickerOpen}
        setMainAppTab={setMainAppTab}
        startNewChat={startNewChat}
        openChat={openChat}
        deleteChat={deleteChat}
        openVoiceWithNewChat={openVoiceWithNewChat}
        resumeDeepDivePrompt={RESUME_DEEP_DIVE_PROMPT}
        fmtTs={fmtTs}
      />
    );
  }

  // ── Tab bar + chat view (has open tabs) ────────────────────────────────────

  return (
    <section
      className="max-w-[375px] w-full min-w-0 mx-auto px-4 sm:px-0 animate-fade-up flex flex-col flex-1 min-h-0 overflow-hidden relative"
      aria-label="Dilly AI"
    >
      <AppProfileHeader
        name={appProfile?.name ?? undefined}
        track={effectiveTrack}
        schoolName={school?.name ?? undefined}
        photoUrl={profilePhotoUrl ?? undefined}
      />
      {memoryItems.length > 0 ? (
        <div className="px-1 pb-2">
          <button
            type="button"
            onClick={() => {
              hapticLight();
              setMainAppTab("memory");
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border"
            style={{
              background: "var(--bdim)",
              borderColor: "var(--bbdr)",
              color: "var(--t2)",
            }}
          >
            <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" />
            <span className="text-[11px] font-semibold">
              {memoryItems.length} things Dilly AI knows
            </span>
          </button>
        </div>
      ) : null}

      {/* Chat list drawer */}
      {voiceChatListOpen && (
        <ChatListDrawer
          voiceConvos={voiceConvos}
          openVoiceConvIds={openVoiceConvIds}
          voiceAvatarIndex={voiceAvatarIndex}
          setVoiceAvatarPickerOpen={setVoiceAvatarPickerOpen}
          startNewChat={startNewChat}
          openChat={openChat}
          deleteChat={deleteChat}
          setVoiceChatListOpen={setVoiceChatListOpen}
          fmtTs={fmtTs}
        />
      )}

      <Tabs
        value={effectiveActiveId}
        onValueChange={(id: string) => {
          if (id) openChat(id);
        }}
        className="flex flex-col flex-1 min-h-0"
      >
        {/* Scrollable content - everything above the bottom bar */}
        <div className="voice-scroll-area flex-1 overflow-hidden min-h-0 pb-2 flex flex-col">
          {openConvos.map((convo) => (
            <TabsContent
              key={convo.id}
              value={convo.id}
              className="mt-0 flex flex-col flex-1 min-h-0"
            >
              {convo.id === effectiveActiveId ? (
                <div className="flex flex-col flex-1 min-h-0">
                  {/* Company target panel */}
                  {voiceCompanyPanelOpen && (
                    <CompanyPanel
                      voiceCompanyInput={voiceCompanyInput}
                      setVoiceCompanyInput={setVoiceCompanyInput}
                      voiceCompany={voiceCompany}
                      firmDeadlines={firmDeadlines}
                      handleCompanySet={handleCompanySet}
                      setVoiceCompanyPanelOpen={setVoiceCompanyPanelOpen}
                      voiceCompanyInputRef={voiceCompanyInputRef}
                    />
                  )}

                  {/* Action items panel */}
                  {actionItemsPanelOpen && voiceActionItems.length > 0 && (
                    <ActionItemsPanel
                      theme={theme}
                      voiceActionItems={voiceActionItems}
                      setVoiceActionItems={setVoiceActionItems}
                      setActionItemsPanelOpen={setActionItemsPanelOpen}
                    />
                  )}

                  {/* Bullet rewriter panel */}
                  {bulletRewriterOpen && (
                    <BulletRewriterPanel
                      theme={theme}
                      bulletInput={bulletInput}
                      setBulletInput={setBulletInput}
                      bulletRewritten={bulletRewritten}
                      setBulletRewritten={setBulletRewritten}
                      bulletLoading={bulletLoading}
                      bulletHistory={bulletHistory}
                      setBulletHistory={setBulletHistory}
                      setBulletRewriterOpen={setBulletRewriterOpen}
                      handleBulletRewrite={handleBulletRewrite}
                      displayAudit={displayAudit as Record<string, unknown> | null}
                    />
                  )}

                  {/* Tab bar */}
                  <VoiceTabBar
                    openConvos={openConvos}
                    effectiveActiveId={effectiveActiveId}
                    renamingVoiceConvId={renamingVoiceConvId}
                    renameValue={renameValue}
                    voiceChatListOpen={voiceChatListOpen}
                    voiceRenameInputRef={voiceRenameInputRef}
                    setVoiceChatListOpen={setVoiceChatListOpen}
                    setRenamingVoiceConvId={setRenamingVoiceConvId}
                    setRenameValue={setRenameValue}
                    openChat={openChat}
                    closeTab={closeTab}
                    startNewChat={startNewChat}
                    startRename={startRename}
                    commitRename={commitRename}
                    setMainAppTab={setMainAppTab}
                  />

                  {/* Chat messages */}
                  <VoiceMessageList
                    theme={theme}
                    profilePhotoUrl={profilePhotoUrl}
                    voiceAvatarIndex={voiceAvatarIndex}
                    voiceMessages={voiceMessages}
                    voiceMessageQueue={voiceMessageQueue}
                    voiceLoading={voiceLoading}
                    voiceStreamingText={voiceStreamingText}
                    voiceScoresForChat={voiceScoresForChat}
                    voiceFeedback={voiceFeedback}
                    voiceMockInterviewSession={voiceMockInterviewSession}
                    displayAudit={displayAudit as Record<string, unknown> | null}
                    lastAudit={lastAudit as Record<string, unknown> | null}
                    appProfile={appProfile as Record<string, unknown> | null}
                    user={user}
                    voiceGreeting={voiceGreeting}
                    isFreshAudit={isFreshAudit}
                    voiceChatScrollRef={voiceChatScrollRef}
                    voiceEndRef={voiceEndRef}
                    setVoiceAvatarPickerOpen={setVoiceAvatarPickerOpen}
                    endVoiceMockInterviewByUser={endVoiceMockInterviewByUser}
                    openVoiceWithNewChat={openVoiceWithNewChat}
                    sendVoiceFeedback={sendVoiceFeedback}
                    resumeDeepDivePrompt={RESUME_DEEP_DIVE_PROMPT}
                    fmtTs={fmtTs}
                  />
                </div>
              ) : null}
            </TabsContent>
          ))}
        </div>

        {/* Sticky bottom bar: suggestions + input */}
        <VoiceInputBar
          voiceInput={voiceInput}
          setVoiceInput={setVoiceInput}
          sendVoice={sendVoice}
          voiceLoading={voiceLoading}
          voiceMockInterviewSession={voiceMockInterviewSession}
          voiceFollowUpSuggestions={voiceFollowUpSuggestions}
          setVoiceFollowUpSuggestions={setVoiceFollowUpSuggestions}
          voiceRememberOpen={voiceRememberOpen}
          setVoiceRememberOpen={setVoiceRememberOpen}
          voiceRememberNote={voiceRememberNote}
          setVoiceRememberNote={setVoiceRememberNote}
          appProfile={appProfile}
          setAppProfile={setAppProfile}
          toast={toast}
          mainAppTab={mainAppTab}
          voiceOverlayOpen={voiceOverlayOpen}
          voiceChatListOpen={voiceChatListOpen}
          bulletRewriterOpen={bulletRewriterOpen}
        />
      </Tabs>
    </section>
  );
}
