"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { useVoice } from "@/contexts/VoiceContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useAppContext } from "@/context/AppContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeartFavorite } from "@/components/ui/heart-favorite";
import { ThumbsDown } from "lucide-react";
import { VoiceInputWithMic } from "@/components/VoiceInputWithMic";
import { VoiceAssistantRichReply } from "@/components/VoiceAssistantRichReply";
import { VoiceVisualDedupProvider, VoiceDedupScrollRoot } from "@/components/VoiceChatVisualDedup";
import { LoaderOne } from "@/components/ui/loader-one";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import { MascotAvatar, getMascotMood } from "@/components/MascotAvatar";
import { VoiceMockInterviewBanner, VoiceMockInterviewTurn } from "@/components/voice/VoiceMockInterviewUI";
import { ProfilePhotoWithFrame } from "@/components/ProfilePhotoWithFrame";
import { AppProfileHeader } from "@/components/career-center";
import { getProfileFrame } from "@/lib/profileFrame";
import { getVoiceAvatarUrl } from "@/lib/voiceAvatars";
import { dilly } from "@/lib/dilly";
import { sanitizeVoiceAssistantReply } from "@/lib/voiceReplySanitize";
import {
  voiceStorageKey,
  getDillyVoiceEmptyGreeting,
  markDillyVoiceIntroSeen,
  safeUuid,
  computeScoreTrajectory,
  LOW_SCORE_THRESHOLD,
} from "@/lib/dillyUtils";
import {
  wantsMockInterview,
  wantsEndMockInterview,
  VOICE_MOCK_INTERVIEW_TOTAL,
  buildMockInterviewSessionContext,
} from "@/lib/voiceMockInterview";
import { getEffectiveCohortLabel } from "@/lib/trackDefinitions";
import { playSound } from "@/lib/sounds";
import { hapticLight } from "@/lib/haptics";
import type { SchoolTheme } from "@/lib/schools";
import type { TransitionSource } from "@/lib/dillyPresence";
import type { DillyDeadline, VoiceConvo } from "@/types/dilly";

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
  voiceScoresForChat: Record<string, unknown> | null;
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
  voiceStarterSuggestions,
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
    voiceConvos, setVoiceConvos, openVoiceConvIds, setOpenVoiceConvIds,
    activeVoiceConvId, setActiveVoiceConvId, voiceChatListOpen, setVoiceChatListOpen,
    voiceAvatarIndex, setVoiceAvatarPickerOpen,
    renamingVoiceConvId, setRenamingVoiceConvId, renameValue, setRenameValue,
    voiceMessages, setVoiceMessages, voiceMockInterviewSession, setVoiceMockInterviewSession,
    voiceMessageQueue, setVoiceMessageQueue, voiceInput, setVoiceInput,
    voiceLoading, setVoiceLoading, voiceStreamingText, setVoiceStreamingText,
    voiceFollowUpSuggestions, setVoiceFollowUpSuggestions,
    lastAuditTsOnVoiceEnter,
    memoryItems,
    voiceApplicationsPreview,
    bulletRewriterOpen, setBulletRewriterOpen, bulletInput, setBulletInput,
    bulletRewritten, setBulletRewritten, bulletLoading, setBulletLoading,
    bulletHistory, setBulletHistory,
    voiceRememberOpen, setVoiceRememberOpen, voiceRememberNote, setVoiceRememberNote,
    voiceActionItems, setVoiceActionItems, actionItemsPanelOpen, setActionItemsPanelOpen,
    voiceCompany, setVoiceCompany, voiceCompanyInput, setVoiceCompanyInput,
    voiceCompanyPanelOpen, setVoiceCompanyPanelOpen,
    firmDeadlines, setFirmDeadlines, voiceMemory, setVoiceMemory,
    voiceFeedback, setVoiceFeedback,
    voiceOverlayOpen,
    voiceScreenContext, setVoiceScreenContext,
    pendingVoicePrompt, setPendingVoicePrompt,
  } = useVoice();

  // ── Local refs ──────────────────────────────────────────────────────────────

  const voiceLastLikedRef = useRef(false);
  const voiceChatScrollRef = useRef<HTMLDivElement>(null);
  const voiceCompanyInputRef = useRef<HTMLInputElement>(null);
  const voiceRenameInputRef = useRef<HTMLInputElement>(null);

  // ── Focus effects (migrated from page.tsx) ─────────────────────────────────

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

  const voiceConvosByRecent = useMemo(
    () =>
      [...voiceConvos].sort(
        (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
      ),
    [voiceConvos],
  );

  // ── Helper: save current convo messages back to list ───────────────────────

  const saveCurrentConvo = (prevList: VoiceConvo[]): VoiceConvo[] => {
    if (!activeVoiceConvId || voiceMessages.length === 0) return prevList;
    return prevList.map((c) =>
      c.id === activeVoiceConvId ? { ...c, messages: voiceMessages, updatedAt: Date.now() } : c,
    );
  };

  // ── Chat management functions ──────────────────────────────────────────────

  const startNewChat = () => {
    setVoiceConvos(saveCurrentConvo);
    const newConvo: VoiceConvo = {
      id: safeUuid(),
      title: "New Chat",
      messages: [],
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
    setVoiceConvos((prev) => [...saveCurrentConvo(prev), newConvo]);
    setOpenVoiceConvIds((prev) => [newConvo.id, ...prev.filter((x) => x !== newConvo.id)]);
    setActiveVoiceConvId(newConvo.id);
    setVoiceMessages([]);
    setVoiceInput("");
    setVoiceFollowUpSuggestions([]);
    setVoiceStreamingText("");
    setBulletRewriterOpen(false);
    setVoiceChatListOpen(false);
  };

  const openChat = (id: string) => {
    setVoiceConvos(saveCurrentConvo);
    const convo = voiceConvos.find((c) => c.id === id);
    if (!convo) return;
    setOpenVoiceConvIds((prev) => (prev.includes(id) ? prev : [id, ...prev]));
    setActiveVoiceConvId(id);
    setVoiceMessages(convo.messages ?? []);
    setVoiceMessageQueue([]);
    setVoiceFollowUpSuggestions([]);
    setVoiceInput("");
    setVoiceStreamingText("");
    setBulletRewriterOpen(false);
    setVoiceChatListOpen(false);
  };

  const closeTab = (id: string) => {
    setOpenVoiceConvIds((prev) => prev.filter((x) => x !== id));
    if (activeVoiceConvId === id) {
      const remaining = openVoiceConvIds.filter((x) => x !== id);
      const next = remaining[0] ?? null;
      if (next) {
        const convo = voiceConvos.find((c) => c.id === next);
        if (convo) {
          setActiveVoiceConvId(next);
          setVoiceMessages(convo.messages ?? []);
          setVoiceMessageQueue([]);
        }
      } else {
        setActiveVoiceConvId(null);
        setVoiceMessages([]);
        setVoiceMessageQueue([]);
      }
    }
  };

  const backToList = () => {
    setVoiceConvos(saveCurrentConvo);
    setActiveVoiceConvId(null);
    setVoiceFollowUpSuggestions([]);
    setVoiceInput("");
    setVoiceStreamingText("");
    setBulletRewriterOpen(false);
  };

  const deleteChat = (id: string) => {
    setVoiceConvos((prev) => prev.filter((c) => c.id !== id));
    setOpenVoiceConvIds((prev) => prev.filter((x) => x !== id));
    if (activeVoiceConvId === id) {
      setActiveVoiceConvId(null);
      setVoiceMessages([]);
      setVoiceMessageQueue([]);
    }
  };

  // Expose actions for VoiceOverlay
  voiceOverlayActionsRef.current = { startNewChat, openChat, deleteChat, closeTab };

  const startRename = (id: string) => {
    const convo = voiceConvos.find((c) => c.id === id);
    setRenamingVoiceConvId(id);
    setRenameValue(convo?.title || "");
  };

  const commitRename = () => {
    if (!renamingVoiceConvId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      setVoiceConvos((prev) =>
        prev.map((c) => (c.id === renamingVoiceConvId ? { ...c, title: trimmed } : c)),
      );
    }
    setRenamingVoiceConvId(null);
    setRenameValue("");
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
      setOpenVoiceConvIds((prev) => [newConvo.id, ...prev.filter((x) => x !== newConvo.id)]);
      setActiveVoiceConvId(newConvo.id);
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

    if (voiceMockInterviewSession?.awaitingAnswer) {
      const sess = voiceMockInterviewSession;
      if (!localStorage.getItem("dilly_auth_token")) {
        toast("Sign in to continue.", "error");
        mockVoiceFinally();
        return;
      }
      if (!user?.subscribed) {
        toast("Subscription required for mock interviews.", "error");
        setVoiceMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "Mock interviews need an active subscription. You can still use Dilly AI for general interview prep in chat.",
            ts: Date.now(),
          },
        ]);
        mockVoiceFinally();
        return;
      }
      try {
        const newHistory = [...sess.history, { q: sess.currentQuestion, a: text }];
        const newIndex = sess.questionIndex + 1;
        const res = await dilly.fetch(`/voice/mock-interview`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question_index: newIndex,
            answer: text,
            session_context: sess.sessionContext,
            total_questions: sess.totalQuestions,
            history: newHistory.slice(-4).map((h) => ({ q: h.q, a: h.a })),
          }),
        });
        if (latestVoiceConvIdRef.current !== convIdForMock) return;
        if (res.status === 401) {
          try {
            localStorage.removeItem("dilly_auth_token");
          } catch {
            /* ignore */
          }
          setUser(null);
          toast("Session expired \u2014 sign in again.", "error");
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setVoiceMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                typeof (err as { error?: string }).error === "string"
                  ? (err as { error: string }).error
                  : "Could not score that answer. Check your connection and try again.",
              ts: Date.now(),
            },
          ]);
          return;
        }
        const data = (await res.json()) as Record<string, unknown>;
        if (latestVoiceConvIdRef.current !== convIdForMock) return;
        const scoreRaw = data.score;
        const score =
          typeof scoreRaw === "number"
            ? scoreRaw
            : scoreRaw != null && !Number.isNaN(Number(scoreRaw))
              ? Number(scoreRaw)
              : null;
        const sessionRaw = data.session_score;
        const sessionScore =
          typeof sessionRaw === "number"
            ? sessionRaw
            : sessionRaw != null && !Number.isNaN(Number(sessionRaw))
              ? Number(sessionRaw)
              : null;
        const strengths = Array.isArray(data.strengths) ? data.strengths.map(String) : [];
        const improvements = Array.isArray(data.improvements) ? data.improvements.map(String) : [];
        const nextQ = data.next_question != null ? String(data.next_question).trim() : "";
        const isFinal = Boolean(data.is_final);
        const feedbackText =
          typeof data.feedback === "string" && data.feedback.trim()
            ? data.feedback.trim()
            : "Here's feedback on your answer.";

        const feedbackTurn = {
          kind: "feedback" as const,
          questionNumber: newIndex,
          total: sess.totalQuestions,
          score: score != null && Number.isFinite(score) ? score : null,
          label: typeof data.label === "string" ? data.label : null,
          feedback: typeof data.feedback === "string" ? data.feedback : null,
          strengths,
          improvements,
          nextQuestion: nextQ && !isFinal ? nextQ : null,
          isFinal,
          sessionScore: sessionScore != null && Number.isFinite(sessionScore) ? sessionScore : null,
        };

        setVoiceMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: feedbackText,
            ts: Date.now(),
            mockTurn: feedbackTurn,
          },
        ]);

        if (isFinal) {
          setVoiceMockInterviewSession(null);
        } else if (!nextQ) {
          setVoiceMockInterviewSession(null);
          setVoiceMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                "Mock interview paused (no next question returned). Ask me to start a mock interview again when you're ready.",
              ts: Date.now(),
            },
          ]);
        } else {
          setVoiceMockInterviewSession({
            ...sess,
            questionIndex: newIndex,
            history: newHistory,
            currentQuestion: nextQ,
            awaitingAnswer: true,
          });
        }
      } catch {
        if (latestVoiceConvIdRef.current === convIdForMock) {
          setVoiceMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                "Dilly couldn't reach the mock interview service. Check your connection and try again.",
              ts: Date.now(),
            },
          ]);
        }
      } finally {
        mockVoiceFinally();
      }
      return;
    }

    if (!voiceMockInterviewSession && wantsMockInterview(text)) {
      if (!localStorage.getItem("dilly_auth_token")) {
        toast("Sign in to continue.", "error");
        mockVoiceFinally();
        return;
      }
      if (!user?.subscribed) {
        toast("Subscription required for mock interviews.", "error");
        setVoiceMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "Mock interviews need an active subscription. You can still ask me to help you prep for interviews in chat.",
            ts: Date.now(),
          },
        ]);
        mockVoiceFinally();
        return;
      }
      const ctx = buildMockInterviewSessionContext(
        displayAudit ?? null,
        displayAudit?.detected_track ?? undefined,
        appProfile?.application_target_label ?? undefined,
      );
      try {
        const res = await dilly.fetch(`/voice/mock-interview`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question_index: 0,
            answer: null,
            session_context: ctx,
            total_questions: VOICE_MOCK_INTERVIEW_TOTAL,
            history: [],
          }),
        });
        if (latestVoiceConvIdRef.current !== convIdForMock) return;
        if (res.status === 401) {
          try {
            localStorage.removeItem("dilly_auth_token");
          } catch {
            /* ignore */
          }
          setUser(null);
          toast("Session expired \u2014 sign in again.", "error");
          return;
        }
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setVoiceMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                typeof (err as { error?: string }).error === "string"
                  ? (err as { error: string }).error
                  : "Couldn't start the mock interview. Try again in a moment.",
              ts: Date.now(),
            },
          ]);
          return;
        }
        const data = (await res.json()) as Record<string, unknown>;
        if (latestVoiceConvIdRef.current !== convIdForMock) return;
        const firstQ = data.next_question != null ? String(data.next_question).trim() : "";
        if (!firstQ) {
          setVoiceMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: "I couldn't generate a first question. Try starting the mock interview again.",
              ts: Date.now(),
            },
          ]);
          return;
        }
        setVoiceMockInterviewSession({
          sessionContext: ctx,
          questionIndex: 0,
          history: [],
          currentQuestion: firstQ,
          totalQuestions: VOICE_MOCK_INTERVIEW_TOTAL,
          awaitingAnswer: true,
        });
        if (convIdForMock) {
          setVoiceConvos((prev) =>
            prev.map((c) =>
              c.id === convIdForMock
                ? { ...c, title: "Mock interview", updatedAt: Date.now() }
                : c,
            ),
          );
        }
        setVoiceMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: firstQ,
            ts: Date.now(),
            mockTurn: {
              kind: "question" as const,
              number: 1,
              total: VOICE_MOCK_INTERVIEW_TOTAL,
              text: firstQ,
            },
          },
        ]);
      } catch {
        if (latestVoiceConvIdRef.current === convIdForMock) {
          setVoiceMessages((m) => [
            ...m,
            {
              role: "assistant",
              content:
                "Dilly couldn't start the mock interview. Check your connection and try again.",
              ts: Date.now(),
            },
          ]);
        }
      } finally {
        mockVoiceFinally();
      }
      return;
    }

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
      // Stream reading
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let streamedText = "";
      let assistantReplyCommitted = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const lines = accumulated.split("\n");
        accumulated = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw);
            if (typeof evt.t === "string" && evt.t.length > 0) {
              streamedText += evt.t;
              const forDisplay = streamedText.replace(/\n\s*SUGGESTIONS:\s*[\s\S]*$/i, "").trim();
              setVoiceStreamingText(forDisplay);
            }
            if (evt.done === true) {
              setVoiceStreamingText("");
              const cleaned = (streamedText || "")
                .replace(/\n\s*SUGGESTIONS:\s*[\s\S]*$/i, "")
                .trim();
              const finalMsg =
                sanitizeVoiceAssistantReply(cleaned) || cleaned || "Dilly had trouble responding.";
              if (!assistantReplyCommitted) {
                assistantReplyCommitted = true;
                setVoiceMessages((m) => [
                  ...m,
                  { role: "assistant", content: finalMsg, ts: Date.now() },
                ]);
                const summary = `[${new Date().toLocaleDateString()}] You asked: "${text.slice(0, 80)}". Dilly said: "${finalMsg.slice(0, 120)}"`;
                setVoiceMemory((prev) => [...prev.slice(-9), summary]);
              }
              streamedText = "";
              const baseSuggestions = Array.isArray(evt.suggestions) ? evt.suggestions : [];
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
                suggestionsToSet.length > 0
                  ? suggestionsToSet
                  : prev.length > 0
                    ? prev
                    : suggestionsToSet,
              );
              if (evt.title && typeof evt.title === "string" && convId) {
                setVoiceConvos((prev) =>
                  prev.map((c) =>
                    c.id === convId
                      ? { ...c, title: (evt.title as string).slice(0, 60), updatedAt: Date.now() }
                      : c,
                  ),
                );
              }
              if (
                Array.isArray(evt.deadlines_auto_saved) &&
                evt.deadlines_auto_saved.length > 0
              ) {
                mergeVoiceAutoSavedDeadlines(evt.deadlines_auto_saved as DillyDeadline[]);
              }
              if (Array.isArray(evt.action_items) && evt.action_items.length > 0) {
                const count = (evt.action_items as string[]).length;
                setVoiceActionItems((prev) => {
                  if (prev.length >= 8) return prev;
                  const existingTexts = prev.map((i) => i.text.toLowerCase());
                  const stopWords = new Set([
                    "a",
                    "an",
                    "the",
                    "and",
                    "or",
                    "to",
                    "in",
                    "on",
                    "of",
                    "for",
                    "your",
                    "you",
                    "with",
                    "by",
                    "at",
                    "is",
                    "are",
                    "it",
                    "this",
                    "that",
                    "be",
                    "as",
                    "up",
                    "so",
                    "if",
                    "its",
                  ]);
                  const keywordsOf = (s: string) =>
                    s
                      .toLowerCase()
                      .split(/\W+/)
                      .filter((w) => w.length > 3 && !stopWords.has(w));
                  const isDuplicate = (incoming: string) =>
                    existingTexts.some((existing) => {
                      const kIn = keywordsOf(incoming);
                      const kEx = keywordsOf(existing);
                      const overlap = kIn.filter((w) => kEx.includes(w)).length;
                      return overlap >= 3 || (kIn.length <= 3 && overlap >= 2);
                    });
                  const deduped = (evt.action_items as string[]).filter((t) => !isDuplicate(t));
                  if (deduped.length === 0) return prev;
                  const space = 8 - prev.length;
                  if (space <= 0) return prev;
                  const newItems = deduped
                    .slice(0, space)
                    .map((t) => ({ id: safeUuid(), text: t, done: false, convId }));
                  return [...prev, ...newItems];
                });
                setVoiceMessages((m) => [
                  ...m,
                  {
                    role: "assistant",
                    content: `I added ${count} task${count !== 1 ? "s" : ""} to your tasks.`,
                    ts: Date.now(),
                  },
                ]);
              }
              if (
                evt.voice_onboarding_complete ||
                (evt.profile_updates && typeof evt.profile_updates === "object")
              ) {
                const updates = (evt.profile_updates || {}) as Record<string, unknown>;
                if (Object.keys(updates).length > 0) {
                  setAppProfile((prev) => (prev ? { ...prev, ...updates } : prev));
                  if (Array.isArray(updates.voice_memory)) {
                    setVoiceMemory(updates.voice_memory as string[]);
                  }
                }
                if (evt.voice_onboarding_complete && activeVoiceConvId) {
                  setVoiceConvos((prev) =>
                    prev.map((c) =>
                      c.id === activeVoiceConvId ? { ...c, title: "Onboarding complete" } : c,
                    ),
                  );
                }
              }
              if (
                evt.deadline_added &&
                typeof evt.deadline_added === "object" &&
                evt.deadline_added.label &&
                evt.deadline_added.date
              ) {
                const current = appProfile?.deadlines || [];
                const newDl: DillyDeadline = {
                  id: safeUuid(),
                  label: (evt.deadline_added as { label: string }).label,
                  date: (evt.deadline_added as { date: string }).date,
                };
                if (!current.some((d) => d.label === newDl.label && d.date === newDl.date)) {
                  saveProfile({ deadlines: [...current, newDl] });
                }
              }
              if (
                evt.action_item_added &&
                typeof evt.action_item_added === "object" &&
                (evt.action_item_added as { text?: string }).text
              ) {
                const itemText = (evt.action_item_added as { text: string }).text.trim();
                if (itemText) {
                  setVoiceActionItems((prev) => {
                    if (prev.length >= 8) return prev;
                    const existingTexts = prev.map((i) => i.text.toLowerCase());
                    if (existingTexts.includes(itemText.toLowerCase())) return prev;
                    return [
                      ...prev,
                      { id: safeUuid(), text: itemText, done: false, convId: convId ?? undefined },
                    ];
                  });
                  setVoiceMessages((m) => [
                    ...m,
                    {
                      role: "assistant",
                      content: "I added 1 task to your tasks.",
                      ts: Date.now(),
                    },
                  ]);
                }
              }
            }
          } catch {
            /* bad JSON chunk - skip */
          }
        }
      }
      // Edge case: stream ended without done event
      if (!assistantReplyCommitted && streamedText.trim()) {
        assistantReplyCommitted = true;
        setVoiceStreamingText("");
        const cleaned = streamedText.replace(/\n\s*SUGGESTIONS:\s*[\s\S]*$/i, "").trim();
        const finalMsg =
          sanitizeVoiceAssistantReply(cleaned) || cleaned || "Dilly had trouble responding.";
        setVoiceMessages((m) => [
          ...m,
          { role: "assistant", content: finalMsg, ts: Date.now() },
        ]);
        const summary = `[${new Date().toLocaleDateString()}] You asked: "${text.slice(0, 80)}". Dilly said: "${finalMsg.slice(0, 120)}"`;
        setVoiceMemory((prev) => [...prev.slice(-9), summary]);
      }
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

  // ── Bullet rewriter ────────────────────────────────────────────────────────

  const handleBulletRewrite = async (instruction?: string) => {
    if (!bulletInput.trim() || bulletLoading) return;
    setBulletLoading(true);
    try {
      const res = await dilly.fetch(`/voice/rewrite-bullet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bullet: bulletInput.trim(),
          instruction: instruction || undefined,
          context: buildVoiceContext(),
        }),
      });
      const data = res.ok ? await res.json() : null;
      const rewritten = (data?.rewritten || "Could not rewrite. Try Again.") as string;
      setBulletRewritten(rewritten);
      setBulletHistory((h) => {
        if (!h.original) return { original: bulletInput.trim(), versions: [rewritten] };
        return { ...h, versions: [...h.versions, rewritten] };
      });
    } catch {
      setBulletRewritten("Could not reach Dilly. Check your connection.");
    } finally {
      setBulletLoading(false);
    }
  };

  // ── Feedback ───────────────────────────────────────────────────────────────

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

  // ── Company target ─────────────────────────────────────────────────────────

  const handleCompanySet = async (company: string) => {
    setVoiceCompany(company.trim());
    setVoiceCompanyInput("");
    setVoiceCompanyPanelOpen(false);
    if (!company.trim()) {
      setFirmDeadlines([]);
      return;
    }
    try {
      const res = await dilly.fetch(`/voice/firm-deadlines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firm: company.trim(),
          application_target: appProfile?.application_target || "",
        }),
      });
      const data = res.ok ? await res.json() : null;
      if (data) {
        const savedItems = (data.saved || []).map(
          (d: { label: string; date?: string }) => ({
            label: d.label,
            date: d.date,
            note: d.date ? `In your calendar \u00b7 ${d.date}` : "In your calendar",
            source: "calendar" as const,
          }),
        );
        const disclaimer = data.suggested?.[0]?.disclaimer || "";
        const suggestedItems = (data.suggested || []).map(
          (d: { label: string; typical_date?: string; notes?: string }) => ({
            label: d.label,
            date: d.typical_date,
            note: d.notes || "",
            source: "estimate" as const,
            disclaimer,
          }),
        );
        setFirmDeadlines([...savedItems, ...suggestedItems]);
      } else {
        setFirmDeadlines([]);
      }
    } catch {
      setFirmDeadlines([]);
    }
  };

  // ── Score trajectory ───────────────────────────────────────────────────────

  const scoreTrajectory = (() => {
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

  // ── Smart suggestions ──────────────────────────────────────────────────────

  const voiceSuggestions = (() => {
    const s: string[] = [];
    if (isFreshAudit && displayAudit?.scores) {
      s.push("How do I interpret my new audit scores?");
    }
    if (displayAudit?.scores) {
      const dims = [
        { k: "smart", v: displayAudit.scores.smart, label: "Smart" },
        { k: "grit", v: displayAudit.scores.grit, label: "Grit" },
        { k: "build", v: displayAudit.scores.build, label: "Build" },
      ] as const;
      const lowest = dims.reduce((a, b) => (b.v < a.v ? b : a));
      if (lowest.v < LOW_SCORE_THRESHOLD) {
        s.push(`Why is my ${lowest.label} score low and what's the fastest way to improve it?`);
      }
      s.push(
        `My ${lowest.label} score is ${Math.round(lowest.v)}. What exactly should I do to raise it?`,
      );
    }
    const justMissedForChip = appProfile?.deadlines?.find(
      (d) =>
        !d.completedAt &&
        (() => {
          try {
            const daysSincePassed = (Date.now() - new Date(d.date).getTime()) / 86400000;
            return daysSincePassed > 0 && daysSincePassed <= 1;
          } catch {
            return false;
          }
        })(),
    );
    if (justMissedForChip) {
      s.push(`I missed my deadline for "${justMissedForChip.label}". What should I do now?`);
    } else {
      const soonestDeadline = appProfile?.deadlines?.find(
        (d) =>
          !d.completedAt &&
          (() => {
            try {
              const days = (new Date(d.date).getTime() - Date.now()) / 86400000;
              return days >= 0 && days < 14;
            } catch {
              return false;
            }
          })(),
      );
      if (soonestDeadline) {
        s.push(`I have "${soonestDeadline.label}" coming up. What should I do right now?`);
      } else {
        s.push("What should I do this week to stand out to recruiters?");
      }
    }
    const topFinding = displayAudit?.audit_findings?.[0];
    if (topFinding && topFinding.length < 100) {
      s.push(`How do I fix: "${topFinding.slice(0, 60)}..."?`);
    } else {
      const effTrack = getEffectiveCohortLabel(
        displayAudit?.detected_track,
        appProfile?.track,
      );
      if (effTrack) s.push(`What do ${effTrack} recruiters actually look for?`);
    }
    s.push("How can I rewrite my weakest bullet to sound more impactful?");
    if (prevAuditScores && displayAudit?.scores) {
      const deltaGrit = displayAudit.scores.grit - prevAuditScores.grit;
      const dir = deltaGrit >= 0 ? "up" : "down";
      s.push(`My Grit score went ${dir} since my last audit. Why?`);
    }
    return s.slice(0, 5);
  })();

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

  // ── Layout data ────────────────────────────────────────────────────────────

  const activeConvo = activeVoiceConvId
    ? voiceConvos.find((c) => c.id === activeVoiceConvId)
    : null;
  const openConvos = voiceConvos.filter((c) => openVoiceConvIds.includes(c.id));
  const effectiveActiveId =
    activeVoiceConvId && openVoiceConvIds.includes(activeVoiceConvId)
      ? activeVoiceConvId
      : openConvos[0]?.id ?? "";

  // ── Empty state (no convos) ────────────────────────────────────────────────

  if (voiceConvos.length === 0) {
    return (
      <section
        className="max-w-[375px] mx-auto pb-40 px-4 sm:px-0 animate-fade-up"
        aria-label="Dilly AI"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <header className="te-page-hero text-left py-0 mb-2">
              <h2 className="te-hero-title text-xl">Dilly AI</h2>
              <p className="te-hero-sub text-sm mt-0.5 mb-0">
                Tell me anything career-related. I remember it all.
              </p>
            </header>
            {memoryItems.length > 0 ? (
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
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setVoiceAvatarPickerOpen(true)}
            className="shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center cursor-pointer bg-white p-1"
            title={getVoiceAvatarUrl(voiceAvatarIndex) ? "Change avatar" : "Choose avatar"}
          >
            {getVoiceAvatarUrl(voiceAvatarIndex) ? (
              <img
                src={getVoiceAvatarUrl(voiceAvatarIndex)!}
                alt="Your avatar"
                className="w-full h-full object-contain"
              />
            ) : (
              <svg
                className="w-5 h-5 text-black"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            )}
          </button>
        </div>
        <div className="voice-chat-container voice-empty p-10 text-center">
          <button
            type="button"
            onClick={() => setVoiceAvatarPickerOpen(true)}
            className="voice-avatar w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden bg-white p-1.5 cursor-pointer"
          >
            {getVoiceAvatarUrl(voiceAvatarIndex) ? (
              <img
                src={getVoiceAvatarUrl(voiceAvatarIndex)!}
                alt="Your avatar"
                className="w-full h-full object-contain"
              />
            ) : (
              <svg
                className="w-7 h-7 text-black"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
            )}
          </button>
          <p className="text-slate-200 font-semibold text-lg mb-1">Start a conversation</p>
          <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto mb-4">
            {voiceGreeting}
          </p>
          <button
            type="button"
            onClick={startNewChat}
            className="voice-send-btn text-sm font-medium px-6 py-2.5 inline-flex items-center gap-2 mb-3"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Start your first chat
          </button>
          <button
            type="button"
            onClick={() => openVoiceWithNewChat(RESUME_DEEP_DIVE_PROMPT)}
            className="cc-btn text-xs px-4 py-2 rounded-xl"
          >
            Help Dilly know you better
          </button>
        </div>
      </section>
    );
  }

  // ── List view (has convos but no open tabs) ────────────────────────────────

  if (openConvos.length === 0) {
    return (
      <section
        className="max-w-[375px] mx-auto pb-40 px-4 sm:px-0 animate-fade-up"
        aria-label="Dilly AI"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <header className="te-page-hero text-left py-0 mb-2">
              <h2 className="te-hero-title text-xl">Dilly AI</h2>
              <p className="te-hero-sub text-sm mt-0.5 mb-0">Your chats. Click to open.</p>
            </header>
            {memoryItems.length > 0 ? (
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
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVoiceAvatarPickerOpen(true)}
              className="shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center cursor-pointer bg-white p-1"
              title={getVoiceAvatarUrl(voiceAvatarIndex) ? "Change avatar" : "Choose avatar"}
            >
              {getVoiceAvatarUrl(voiceAvatarIndex) ? (
                <img
                  src={getVoiceAvatarUrl(voiceAvatarIndex)!}
                  alt="Your avatar"
                  className="w-full h-full object-contain"
                />
              ) : (
                <svg
                  className="w-5 h-5 text-black"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                  />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={startNewChat}
              className="voice-send-btn text-sm font-medium px-4 py-2 inline-flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              New chat
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {voiceConvosByRecent.map((convo) => (
            <div
              key={convo.id}
              className="voice-convo-card flex items-center justify-between gap-3 p-4"
            >
              <button
                type="button"
                onClick={() => openChat(convo.id)}
                className="min-w-0 flex-1 text-left cursor-pointer rounded-lg -m-2 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              >
                <p className="text-slate-200 font-medium truncate">{convo.title}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {convo.messages?.length
                    ? `${convo.messages.length} messages`
                    : "No messages yet"}
                  {convo.updatedAt && ` \u00b7 ${fmtTs(convo.updatedAt)}`}
                </p>
              </button>
              <button
                type="button"
                onClick={() => deleteChat(convo.id)}
                className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Delete chat"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </section>
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
        track={getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track)}
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
        <div className="absolute inset-x-0 top-0 bottom-20 z-50 bg-[var(--m-bg)] m-rounded-card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-slate-800/60 shrink-0">
            <h3 className="text-base font-semibold text-slate-100">All chats</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVoiceAvatarPickerOpen(true)}
                className="shrink-0 w-9 h-9 rounded-full overflow-hidden flex items-center justify-center cursor-pointer bg-white p-0.5"
                title={
                  getVoiceAvatarUrl(voiceAvatarIndex) ? "Change avatar" : "Choose avatar"
                }
              >
                {getVoiceAvatarUrl(voiceAvatarIndex) ? (
                  <img
                    src={getVoiceAvatarUrl(voiceAvatarIndex)!}
                    alt="Your avatar"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <svg
                    className="w-4 h-4 text-black"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                    />
                  </svg>
                )}
              </button>
              {voiceConvos.length === 0 && (
                <button
                  type="button"
                  onClick={startNewChat}
                  className="voice-send-btn text-white text-sm font-medium px-4 py-2 inline-flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  New chat
                </button>
              )}
            </div>
          </div>
          <div
            className={`flex-1 overflow-y-auto p-3 space-y-1.5 ${voiceConvos.length > 0 ? "pb-16" : ""}`}
          >
            {voiceConvos.map((convo) => (
              <div
                key={convo.id}
                className={`voice-convo-card flex items-center justify-between gap-2 py-2.5 px-3 rounded-lg min-h-0 ${openVoiceConvIds.includes(convo.id) ? "ring-1 ring-slate-600/50" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    openChat(convo.id);
                    setVoiceChatListOpen(false);
                  }}
                  className="min-w-0 flex-1 text-left cursor-pointer rounded -my-2 py-2 -mx-2 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                >
                  <p className="text-slate-200 font-medium text-sm truncate">{convo.title}</p>
                  <p className="text-slate-500 text-[11px] mt-0.5 truncate">
                    {convo.messages?.length
                      ? `${convo.messages.length} messages`
                      : "No messages yet"}
                    {convo.updatedAt && ` \u00b7 ${fmtTs(convo.updatedAt)}`}
                  </p>
                </button>
                {openVoiceConvIds.includes(convo.id) && (
                  <span className="text-[10px] text-slate-500 shrink-0">Open</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    deleteChat(convo.id);
                  }}
                  className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  aria-label="Delete chat"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          {voiceConvos.length > 0 && (
            <div
              className="absolute bottom-0 left-0 right-0 p-4 pt-8 bg-gradient-to-t from-[var(--m-bg)] via-[var(--m-bg)]/95 to-transparent pointer-events-none"
              aria-hidden
            />
          )}
          {voiceConvos.length > 0 && (
            <div className="absolute bottom-4 left-4 right-4 flex justify-center pointer-events-auto">
              <button
                type="button"
                onClick={startNewChat}
                className="voice-send-btn text-white text-sm font-medium px-5 py-2.5 inline-flex items-center gap-2 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
                style={{
                  boxShadow:
                    "0 4px 14px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.15)",
                }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                New chat
              </button>
            </div>
          )}
        </div>
      )}
      <Tabs
        value={effectiveActiveId}
        onValueChange={(id) => {
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
                    <div className="voice-chat-container mb-3 p-3.5 cal-drawer">
                      <p className="text-slate-400 text-xs font-semibold mb-2">
                        Target company / firm
                      </p>
                      <p className="text-slate-600 text-[11px] mb-2.5">
                        Dilly will tailor all advice to this company&apos;s hiring culture and
                        what they value.
                      </p>
                      <div className="flex gap-2">
                        <input
                          ref={voiceCompanyInputRef}
                          type="text"
                          value={voiceCompanyInput}
                          onChange={(e) => setVoiceCompanyInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCompanySet(voiceCompanyInput);
                            if (e.key === "Escape") setVoiceCompanyPanelOpen(false);
                          }}
                          placeholder="E.g. Goldman Sachs, Google, McKinsey\u2026"
                          className="voice-input-field flex-1 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                        />
                        <button
                          type="button"
                          onClick={() => handleCompanySet(voiceCompanyInput)}
                          className="voice-send-btn text-white text-xs font-medium px-4 py-2"
                        >
                          Set
                        </button>
                        {voiceCompany && (
                          <button
                            type="button"
                            onClick={() => handleCompanySet("")}
                            className="text-slate-600 hover:text-red-400 text-xs px-2 transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {firmDeadlines.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest">
                            Known deadlines
                          </p>
                          {firmDeadlines.map((fd, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              {fd.source === "calendar" ? (
                                <svg
                                  className="w-3 h-3 mt-0.5 shrink-0 text-emerald-500"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="w-3 h-3 mt-0.5 shrink-0 text-yellow-500"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                                  />
                                </svg>
                              )}
                              <div>
                                <p className="text-slate-300">
                                  {fd.label}
                                  {fd.date ? (
                                    <span className="text-slate-500 ml-1">
                                      \u00b7 {fd.date}
                                    </span>
                                  ) : null}
                                </p>
                                {fd.note && <p className="text-slate-600">{fd.note}</p>}
                                {fd.source === "estimate" &&
                                  fd.disclaimer &&
                                  i ===
                                    firmDeadlines.findIndex(
                                      (x) => x.source === "estimate",
                                    ) && (
                                    <p className="text-slate-700 italic mt-1">
                                      {fd.disclaimer}
                                    </p>
                                  )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action items panel */}
                  {actionItemsPanelOpen && voiceActionItems.length > 0 && (
                    <div className="voice-chat-container mb-3 p-3.5 cal-drawer">
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="voice-avatar w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                            <span
                              className="text-[9px] font-bold"
                              style={{ color: theme.primary }}
                            >
                              M
                            </span>
                          </div>
                          <p className="text-slate-200 text-xs font-semibold">
                            Action items from Dilly
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActionItemsPanelOpen(false)}
                          className="text-slate-600 hover:text-slate-300 p-1 transition-colors"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {voiceActionItems
                          .slice()
                          .reverse()
                          .map((item) => (
                            <div key={item.id} className="flex items-start gap-2.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setVoiceActionItems((prev) =>
                                    prev.map((i) =>
                                      i.id === item.id ? { ...i, done: !i.done } : i,
                                    ),
                                  )
                                }
                                className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${item.done ? "border-transparent" : "border-slate-600 hover:border-slate-400"}`}
                                style={
                                  item.done
                                    ? {
                                        background: theme.primary,
                                        borderColor: theme.primary,
                                      }
                                    : {}
                                }
                              >
                                {item.done && (
                                  <svg
                                    className="w-2.5 h-2.5 text-white"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M4.5 12.75l6 6 9-13.5"
                                    />
                                  </svg>
                                )}
                              </button>
                              <p
                                className={`text-xs leading-relaxed flex-1 ${item.done ? "line-through text-slate-600" : "text-slate-300"}`}
                              >
                                {item.text}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  setVoiceActionItems((prev) =>
                                    prev.filter((i) => i.id !== item.id),
                                  )
                                }
                                className="text-slate-700 hover:text-red-400 p-0.5 transition-colors shrink-0"
                              >
                                <svg
                                  className="w-3 h-3"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </button>
                            </div>
                          ))}
                      </div>
                      {voiceActionItems.some((i) => i.done) && (
                        <button
                          type="button"
                          onClick={() =>
                            setVoiceActionItems((prev) => prev.filter((i) => !i.done))
                          }
                          className="mt-2.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                        >
                          Clear Completed
                        </button>
                      )}
                    </div>
                  )}

                  {/* Fresh audit banner */}
                  {isFreshAudit && voiceMessages.length === 0 && (
                    <div
                      className="mb-3 px-4 py-2.5 m-rounded-card flex items-center gap-2.5 text-sm font-medium text-white"
                      style={{
                        background: `linear-gradient(135deg, ${theme.primary}22, ${theme.primary}11)`,
                        border: `1px solid ${theme.primary}44`,
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0 voice-glow-pulse"
                        style={{ backgroundColor: theme.primary }}
                      />
                      <span className="text-slate-300">
                        New audit results are ready. Ask me what to do next.
                      </span>
                    </div>
                  )}

                  {/* Bullet rewriter panel */}
                  {bulletRewriterOpen && (
                    <div className="voice-chat-container mb-3 p-4 sm:p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="voice-avatar w-7 h-7 rounded-full flex items-center justify-center shrink-0">
                            <span
                              className="text-[10px] font-bold"
                              style={{ color: theme.primary }}
                            >
                              M
                            </span>
                          </div>
                          <p className="text-slate-200 text-sm font-semibold">Bullet Rewriter</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setBulletRewriterOpen(false);
                            setBulletRewritten("");
                            setBulletHistory({ original: "", versions: [] });
                          }}
                          className="text-slate-600 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-white/5"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                      <p className="text-slate-500 text-[12px] mb-3 leading-relaxed">
                        Paste a resume bullet. Dilly will rewrite it based on your audit, without
                        changing the facts.
                      </p>
                      <textarea
                        value={bulletInput}
                        onChange={(e) => setBulletInput(e.target.value)}
                        placeholder="Paste Your Resume Bullet Here\u2026"
                        rows={3}
                        className="voice-input-field w-full px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 resize-none mb-3"
                      />
                      {bulletRewritten && (
                        <div className="mb-3">
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 mb-1.5">
                                Before
                              </p>
                              <div
                                className="px-3 py-2.5 m-rounded-card text-slate-500 text-xs leading-relaxed"
                                style={{
                                  background: "rgba(239,68,68,0.06)",
                                  border: "1px solid rgba(239,68,68,0.12)",
                                }}
                              >
                                {bulletHistory.original || bulletInput}
                              </div>
                            </div>
                            <div>
                              <p
                                className="text-[9px] font-semibold uppercase tracking-widest mb-1.5"
                                style={{ color: theme.primary }}
                              >
                                After
                              </p>
                              <div
                                className="px-3 py-2.5 m-rounded-card text-slate-200 text-xs leading-relaxed select-all"
                                style={{
                                  background: `rgba(200,16,46,0.08)`,
                                  border: `1px solid rgba(200,16,46,0.2)`,
                                }}
                              >
                                {bulletRewritten}
                              </div>
                            </div>
                          </div>
                          {(() => {
                            const dimKey = displayAudit?.recommendations?.find(
                              (r) =>
                                typeof r === "object" &&
                                r !== null &&
                                (
                                  (r as { current_line?: string | null }).current_line || ""
                                )
                                  .toLowerCase()
                                  .includes(bulletInput.slice(0, 30).toLowerCase()),
                            )?.score_target;
                            if (!dimKey) return null;
                            return (
                              <p className="text-[11px] mb-2" style={{ color: theme.primary }}>
                                This strengthens your{" "}
                                {(dimKey as string).charAt(0).toUpperCase() +
                                  (dimKey as string).slice(1)}{" "}
                                signal.
                              </p>
                            );
                          })()}
                          {bulletHistory.versions.length > 1 && (
                            <div className="mb-2">
                              <p className="text-slate-600 text-[10px] font-medium uppercase tracking-widest mb-1.5">
                                Previous versions
                              </p>
                              <div className="space-y-1.5">
                                {bulletHistory.versions.slice(0, -1).map((v, i) => (
                                  <div
                                    key={i}
                                    className="px-3 py-2 rounded-lg text-slate-500 text-[12px] leading-relaxed"
                                    style={{ background: "rgba(255,255,255,0.03)" }}
                                  >
                                    {v}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              "Make it shorter",
                              "Add more numbers",
                              "Stronger action verb",
                              "Less jargon",
                            ].map((inst) => (
                              <button
                                key={inst}
                                type="button"
                                onClick={() => handleBulletRewrite(inst)}
                                disabled={bulletLoading}
                                className="voice-suggestion-chip text-[11.5px] px-3 py-1 text-slate-400 hover:text-slate-200"
                              >
                                {inst}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleBulletRewrite()}
                        disabled={bulletLoading || !bulletInput.trim()}
                        className="voice-send-btn text-white text-sm font-medium px-5 py-2 w-full flex items-center justify-center gap-2"
                      >
                        {bulletLoading ? (
                          <LoaderOne color="white" size={8} />
                        ) : (
                          <>{bulletRewritten ? "Rewrite again" : "Rewrite this bullet"}</>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Tab bar */}
                  <div className="flex items-center gap-2 mb-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setVoiceChatListOpen((v) => !v)}
                      className={`shrink-0 p-2 rounded-lg transition-colors ${voiceChatListOpen ? "text-white bg-slate-700/50" : "text-slate-500 hover:text-slate-200 hover:bg-slate-700/50"}`}
                      aria-label="All chats"
                      title="All chats"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
                        />
                      </svg>
                    </button>
                    <TabsList className="flex-1 justify-start h-auto p-1 m-rounded-card bg-slate-800/60 text-slate-400 overflow-x-auto flex-nowrap">
                      {openConvos.map((c) => (
                        <TabsTrigger
                          key={c.id}
                          value={c.id}
                          className="group/tab rounded-lg pl-3 pr-1.5 py-1.5 text-xs font-medium data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 shrink-0 max-w-[140px] flex items-center gap-1"
                        >
                          {renamingVoiceConvId === c.id ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                commitRename();
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                ref={voiceRenameInputRef}
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    setRenamingVoiceConvId(null);
                                    setRenameValue("");
                                  }
                                }}
                                className="voice-input-field w-24 px-2 py-0.5 text-xs text-slate-100 bg-transparent border-b border-slate-500"
                              />
                            </form>
                          ) : (
                            <>
                              <span
                                className="truncate flex-1 min-w-0"
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  startRename(c.id);
                                }}
                                title="Double-click to rename"
                              >
                                {c.title}
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label="Close tab"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  closeTab(c.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    closeTab(c.id);
                                  }
                                }}
                                className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-slate-600/50 transition-colors touch-manipulation cursor-pointer"
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M6 18L18 6M6 6l12 12"
                                  />
                                </svg>
                              </span>
                            </>
                          )}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <button
                      type="button"
                      onClick={startNewChat}
                      className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
                      aria-label="New chat"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        hapticLight();
                        setMainAppTab("settings");
                      }}
                      className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
                      aria-label="Dilly settings"
                      title="Dilly settings"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Chat container */}
                  <div className="voice-chat-container overflow-hidden flex flex-col flex-1 min-h-0 min-w-0 max-w-full">
                    <VoiceVisualDedupProvider>
                      <VoiceDedupScrollRoot
                        scrollRef={voiceChatScrollRef}
                        className="flex-1 min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-5 space-y-4"
                      >
                        {voiceMockInterviewSession ? (
                          <VoiceMockInterviewBanner
                            active
                            questionNumber={voiceMockInterviewSession.questionIndex + 1}
                            total={voiceMockInterviewSession.totalQuestions}
                            onEnd={endVoiceMockInterviewByUser}
                          />
                        ) : null}
                        {voiceMessages.length === 0 && !voiceLoading && (
                          <div className="voice-empty flex flex-col items-center justify-center text-center py-12 px-4">
                            <button
                              type="button"
                              onClick={() => setVoiceAvatarPickerOpen(true)}
                              className="cursor-pointer mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--dilly-primary)] focus:ring-offset-2 focus:ring-offset-[var(--m-bg)] rounded-full"
                              aria-label="Change avatar"
                            >
                              <MascotAvatar
                                voiceAvatarIndex={voiceAvatarIndex}
                                mood={getMascotMood(displayAudit, lastAudit)}
                                size="lg"
                              />
                            </button>
                            <p className="text-slate-300 text-sm leading-relaxed max-w-full mb-4">
                              {voiceGreeting}
                            </p>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-2">
                              Tell Dilly AI anything
                            </p>
                            <ul className="text-slate-400 text-xs text-left space-y-1 max-w-xs mb-4">
                              <li>
                                People you met, rejections, interviews--I remember it all
                              </li>
                              <li>Explain your scores and how to improve them</li>
                              <li>Rewrite resume bullets for stronger impact</li>
                              <li>Prep you for interviews using your evidence</li>
                              <li>Run gap scans for target firms</li>
                            </ul>
                            <button
                              type="button"
                              onClick={() =>
                                openVoiceWithNewChat(RESUME_DEEP_DIVE_PROMPT)
                              }
                              className="voice-chip text-xs px-3 py-2 rounded-xl border border-[var(--m-border)] text-slate-300 hover:text-slate-100 hover:border-[var(--dilly-primary)] hover:bg-[var(--dilly-primary)]/10 transition-colors"
                            >
                              Help Dilly know you better
                            </button>
                          </div>
                        )}
                        {(voiceMessages ?? []).map((msg, i) => (
                          <div
                            key={i}
                            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} ${msg.role === "user" ? "voice-msg-user" : "voice-msg-ai"}`}
                            style={{
                              animationDelay: `${Math.min(i * 30, 150)}ms`,
                            }}
                          >
                            <div
                              className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                            >
                              {msg.role === "user" && (
                                <div className="mb-0.5 shrink-0">
                                  <ProfilePhotoWithFrame
                                    photoUrl={profilePhotoUrl}
                                    frame={getProfileFrame(
                                      displayAudit?.peer_percentiles,
                                    )}
                                    size="sm"
                                    fallbackLetter={
                                      appProfile?.name || user?.email || "?"
                                    }
                                    variant="voice"
                                  />
                                </div>
                              )}
                              {msg.role === "assistant" && (
                                <div className="mb-0.5 shrink-0">
                                  <MascotAvatar
                                    voiceAvatarIndex={voiceAvatarIndex}
                                    mood={getMascotMood(displayAudit, lastAudit)}
                                    size="sm"
                                  />
                                </div>
                              )}
                              <div className="max-w-[85%] min-w-0 w-full overflow-hidden">
                                {msg.role === "assistant" ? (
                                  <div className="voice-bubble-ai text-[13.5px] px-4 py-2.5 leading-relaxed break-words text-slate-200">
                                    {msg.mockTurn ? (
                                      <VoiceMockInterviewTurn turn={msg.mockTurn} />
                                    ) : (
                                      <VoiceAssistantRichReply
                                        rawContent={msg.content}
                                        voiceScores={voiceScoresForChat}
                                        priorUserContent={
                                          i > 0 &&
                                          voiceMessages[i - 1]?.role === "user"
                                            ? voiceMessages[i - 1]!.content
                                            : null
                                        }
                                        useTypewriter={false}
                                        cursorColor={theme.primary}
                                        messageListIndex={i}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[13.5px] px-4 py-2.5 leading-relaxed break-words voice-bubble-user text-slate-100">
                                    {msg.content}
                                  </p>
                                )}
                              </div>
                            </div>
                            {msg.role === "assistant" && !msg.mockTurn && (
                              <div className="flex items-center gap-0.5 ml-9 mt-0.5">
                                <HeartFavorite
                                  size="compact"
                                  isLiked={voiceFeedback[i] === "up"}
                                  onToggle={() => sendVoiceFeedback(i, "up")}
                                />
                                <button
                                  type="button"
                                  onClick={() => sendVoiceFeedback(i, "down")}
                                  className="rounded-full p-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
                                  title="Downvote"
                                  aria-label="Downvote"
                                >
                                  <ThumbsDown
                                    className={`h-3.5 w-3.5 transition-colors ${
                                      voiceFeedback[i] === "down"
                                        ? "fill-slate-500 text-slate-500"
                                        : "text-slate-600 hover:text-slate-400"
                                    }`}
                                  />
                                </button>
                              </div>
                            )}
                            {msg.ts && (
                              <p
                                className={`text-[10px] text-slate-600 mt-0.5 ${msg.role === "user" ? "mr-1" : "ml-9"}`}
                              >
                                {fmtTs(msg.ts)}
                              </p>
                            )}
                          </div>
                        ))}
                        {voiceMessageQueue.map((text, i) => (
                          <div
                            key={`queued-${i}`}
                            className="flex flex-col items-end voice-msg-user"
                          >
                            <div className="flex items-end gap-2 flex-row-reverse">
                              <div className="mb-0.5 shrink-0">
                                <ProfilePhotoWithFrame
                                  photoUrl={profilePhotoUrl}
                                  frame={getProfileFrame(displayAudit?.peer_percentiles)}
                                  size="sm"
                                  fallbackLetter={
                                    appProfile?.name || user?.email || "?"
                                  }
                                  variant="voice"
                                />
                              </div>
                              <div className="max-w-[85%] min-w-0 overflow-hidden">
                                <p className="voice-bubble-queued text-[13.5px] px-4 py-2.5 leading-relaxed break-words text-slate-400">
                                  {text}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {/* Streaming bubble */}
                        {voiceLoading && (
                          <div className="flex flex-col items-start voice-msg-ai">
                            <div className="flex items-end gap-2">
                              <div className="mb-0.5 shrink-0">
                                <MascotAvatar
                                  voiceAvatarIndex={voiceAvatarIndex}
                                  mood={getMascotMood(displayAudit, lastAudit)}
                                  size="sm"
                                />
                              </div>
                              <div className="max-w-[85%] min-w-0 overflow-hidden">
                                {voiceStreamingText ? (
                                  <div className="voice-bubble-ai text-[13.5px] px-4 py-2.5 leading-relaxed break-words text-slate-200">
                                    <VoiceAssistantRichReply
                                      rawContent={voiceStreamingText}
                                      voiceScores={voiceScoresForChat}
                                      priorUserContent={
                                        [...voiceMessages]
                                          .reverse()
                                          .find((m) => m.role === "user")?.content ?? null
                                      }
                                      useTypewriter={false}
                                      cursorColor={theme.primary}
                                      messageListIndex={voiceMessages.length}
                                    />
                                    <span
                                      className="inline-block w-0.5 h-[1em] ml-0.5 voice-cursor-blink"
                                      style={{
                                        backgroundColor: theme.primary,
                                        verticalAlign: "text-bottom",
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <div className="voice-bubble-ai px-4 py-3 flex items-center">
                                    <LoaderOne color={theme.primary} size={10} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={voiceEndRef} />
                      </VoiceDedupScrollRoot>
                    </VoiceVisualDedupProvider>
                  </div>
                </div>
              ) : null}
            </TabsContent>
          ))}
        </div>

        {/* Sticky bottom bar: suggestions + input */}
        <div className="sticky bottom-0 shrink-0 pt-2 pb-40 bg-[var(--m-bg)]/95 backdrop-blur-sm border-t border-slate-800/60 -mx-4 px-4 sm:-mx-0 sm:px-0 min-w-0 max-w-full">
          {/* Follow-up suggestions */}
          {!voiceLoading &&
            !voiceMockInterviewSession &&
            voiceFollowUpSuggestions.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-2">
                  Suggested follow-ups
                </p>
                <div className="flex flex-wrap gap-2">
                  {voiceFollowUpSuggestions.slice(0, 5).map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setVoiceFollowUpSuggestions((prev) =>
                          prev.filter((_, j) => j !== i),
                        );
                        sendVoice(s);
                      }}
                      className="voice-chip text-left text-xs px-3 py-2 rounded-xl border border-[var(--m-border)] text-slate-300 hover:text-slate-100 hover:border-[var(--dilly-primary)] hover:bg-[var(--dilly-primary)]/10 transition-colors max-w-full break-words line-clamp-2"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          {voiceRememberOpen && (
            <div
              className="mb-2 p-3 m-rounded-card flex gap-2"
              style={{
                backgroundColor: "var(--m-surface-2)",
                border: "1px solid var(--m-border)",
              }}
            >
              <Input
                value={voiceRememberNote}
                onChange={(e) => setVoiceRememberNote(e.target.value)}
                placeholder="Notes for Dilly to remember (e.g. I'm targeting consulting)"
                className="flex-1 text-sm bg-slate-800/70 border-[var(--ut-border)] text-slate-100"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const note = voiceRememberNote.trim();
                  if (!note) return;
                  if (!localStorage.getItem("dilly_auth_token")) return;
                  const notes = [
                    ...((appProfile as { voice_notes?: string[] })?.voice_notes ?? []),
                    note,
                  ].slice(-20);
                  dilly
                    .fetch(`/profile`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ voice_notes: notes }),
                    })
                    .then((res) => {
                      if (res.ok) return res.json();
                      throw new Error("Save failed");
                    })
                    .then((p) => {
                      setAppProfile((prev) =>
                        prev ? { ...prev, voice_notes: p.voice_notes ?? [] } : prev,
                      );
                      setVoiceRememberNote("");
                      setVoiceRememberOpen(false);
                      toast("Saved. Dilly will remember.", "success");
                    })
                    .catch(() => toast("Could not save", "error"));
                }}
              />
              <Button
                size="sm"
                onClick={async () => {
                  const note = voiceRememberNote.trim();
                  if (!note) return;
                  if (!localStorage.getItem("dilly_auth_token")) return;
                  const notes = [
                    ...((appProfile as { voice_notes?: string[] })?.voice_notes ?? []),
                    note,
                  ].slice(-20);
                  try {
                    const res = await dilly.fetch(`/profile`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ voice_notes: notes }),
                    });
                    if (res.ok) {
                      const p = await res.json();
                      setAppProfile((prev) =>
                        prev ? { ...prev, voice_notes: p.voice_notes ?? [] } : prev,
                      );
                      setVoiceRememberNote("");
                      setVoiceRememberOpen(false);
                      toast("Saved. Dilly will remember.", "success");
                    }
                  } catch {
                    toast("Could not save", "error");
                  }
                }}
                disabled={!voiceRememberNote.trim()}
              >
                Add
              </Button>
              <button
                type="button"
                onClick={() => {
                  setVoiceRememberOpen(false);
                  setVoiceRememberNote("");
                }}
                className="text-slate-500 hover:text-slate-300 p-1"
                aria-label="Close"
              >
                \u00d7
              </button>
            </div>
          )}
          <div className="voice-input-area">
            <VoiceInputWithMic
              value={voiceInput}
              onChange={setVoiceInput}
              onSend={sendVoice}
              isLoading={voiceLoading}
              disabled={false}
              autoFocus={
                mainAppTab === "voice" &&
                !voiceOverlayOpen &&
                !voiceChatListOpen &&
                !voiceRememberOpen &&
                !bulletRewriterOpen
              }
              placeholder="Tell Dilly AI anything\u2026"
              rotatingExamples={[
                "I had coffee with Sarah from Goldman",
                "I just got rejected from McKinsey",
                "I'm stressed about my interview tomorrow",
                "I bombed the behavioral question",
                "I got an offer from Goldman",
                "I'm switching from consulting to tech",
              ]}
            />
          </div>
        </div>
      </Tabs>
    </section>
  );
}
