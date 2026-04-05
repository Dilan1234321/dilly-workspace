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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoaderOne } from "@/components/ui/loader-one";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import { VoiceInputWithMic } from "@/components/VoiceInputWithMic";
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
import type { DillyVoiceChatScoresBundle } from "@/lib/voiceVisualTypes";

// Extracted components
import { ChatListDrawer } from "@/features/voice/ChatListDrawer";
import { VoiceEmptyState } from "@/features/voice/VoiceEmptyState";
import { CompanyPanel } from "@/features/voice/CompanyPanel";
import { ActionItemsPanel } from "@/features/voice/ActionItemsPanel";
import { VoiceMessageList } from "@/features/voice/VoiceMessageList";

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
                    "a","an","the","and","or","to","in","on","of","for","your",
                    "you","with","by","at","is","are","it","this","that","be",
                    "as","up","so","if","its",
                  ]);
                  const keywordsOf = (s: string) =>
                    s.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !stopWords.has(w));
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
                // @ts-expect-error -- pre-existing: cva VariantProps not exposing size
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
                {"\u00d7"}
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
