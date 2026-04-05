import { dilly } from "@/lib/dilly";
import {
  wantsMockInterview,
  VOICE_MOCK_INTERVIEW_TOTAL,
  buildMockInterviewSessionContext,
} from "@/lib/voiceMockInterview";
import type { VoiceMockInterviewSession } from "@/contexts/VoiceContext";
import type { ChatMessage, VoiceConvo } from "@/types/dilly";

// ── Shared types for handler args ────────────────────────────────────────────

export interface MockInterviewDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toast: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setUser: (u: any) => void;
  setVoiceMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setVoiceMockInterviewSession: (s: VoiceMockInterviewSession | null) => void;
  setVoiceConvos: React.Dispatch<React.SetStateAction<VoiceConvo[]>>;
  latestVoiceConvIdRef: React.MutableRefObject<string | null>;
  convIdForMock: string | undefined;
  userSubscribed: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  displayAudit: any;
  detectedTrack: string | undefined;
  applicationTargetLabel: string | undefined;
}

// ── Handle mock interview answer ─────────────────────────────────────────────

export async function handleMockInterviewAnswer(
  text: string,
  sess: VoiceMockInterviewSession,
  deps: MockInterviewDeps,
): Promise<void> {
  const {
    toast,
    setUser,
    setVoiceMessages,
    setVoiceMockInterviewSession,
    latestVoiceConvIdRef,
    convIdForMock,
    userSubscribed,
  } = deps;

  if (!localStorage.getItem("dilly_auth_token")) {
    toast("Sign in to continue.", "error");
    return;
  }
  if (!userSubscribed) {
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
  }
}

// ── Handle mock interview start ──────────────────────────────────────────────

export async function handleMockInterviewStart(
  deps: MockInterviewDeps,
): Promise<void> {
  const {
    toast,
    setUser,
    setVoiceMessages,
    setVoiceMockInterviewSession,
    setVoiceConvos,
    latestVoiceConvIdRef,
    convIdForMock,
    userSubscribed,
    displayAudit,
    detectedTrack,
    applicationTargetLabel,
  } = deps;

  if (!localStorage.getItem("dilly_auth_token")) {
    toast("Sign in to continue.", "error");
    return;
  }
  if (!userSubscribed) {
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
    return;
  }
  const ctx = buildMockInterviewSessionContext(
    displayAudit ?? null,
    detectedTrack,
    applicationTargetLabel,
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
  }
}

export { wantsMockInterview };
