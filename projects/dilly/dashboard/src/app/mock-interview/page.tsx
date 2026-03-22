"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { API_BASE, AUTH_TOKEN_KEY, auditStorageKey, getCareerCenterReturnPath } from "@/lib/dillyUtils";
import { AppProfileHeader } from "@/components/career-center";
import type { AuditV2 } from "@/types/dilly";

// ─── Types ────────────────────────────────────────────────────────────────────

type TurnResult = {
  score: number | null;
  label: string | null;
  feedback: string | null;
  strengths: string[];
  improvements: string[];
  next_question: string | null;
  is_final: boolean;
  session_score: number | null;
};

type HistoryTurn = {
  q: string;
  a: string;
  score: number | null;
  label: string | null;
  feedback: string | null;
  strengths: string[];
  improvements: string[];
};

type SessionState = "setup" | "question" | "answering" | "feedback" | "done";

const TOTAL_QUESTIONS = 5;

const SCORE_COLORS: Record<number, string> = {
  5: "#4ade80",
  4: "#86efac",
  3: "#c9a882",
  2: "#f97316",
  1: "#e07070",
};

const SCORE_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Strong",
  3: "Good",
  2: "Needs work",
  1: "Weak",
};

function scoreColor(score: number | null): string {
  if (!score) return "var(--m-text-3)";
  return SCORE_COLORS[score] ?? "var(--m-text-3)";
}

function buildSessionContext(audit: AuditV2 | null, track: string | null, targetLabel: string | null): string {
  const parts: string[] = [];
  if (targetLabel) parts.push(`Target role: ${targetLabel}`);
  if (track) parts.push(`Track: ${track}`);
  if (audit?.candidate_name && audit.candidate_name !== "Unknown") parts.push(`Candidate: ${audit.candidate_name}`);
  if (audit?.structured_text) {
    // Include a short excerpt (first 800 chars)
    parts.push(`Resume excerpt:\n${audit.structured_text.slice(0, 800)}`);
  }
  return parts.join("\n");
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number | null }) {
  if (!score) return null;
  const pct = (score / 5) * 100;
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={48} height={48} className="shrink-0">
      <circle cx={24} cy={24} r={r} fill="none" stroke="var(--m-border)" strokeWidth={3.5} />
      <circle
        cx={24} cy={24} r={r} fill="none"
        stroke={scoreColor(score)} strokeWidth={3.5}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
      <text x={24} y={28} textAnchor="middle" fontSize={13} fontWeight={700} fill={scoreColor(score)}>
        {score}/5
      </text>
    </svg>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MockInterviewPage() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("setup");
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [history, setHistory] = useState<HistoryTurn[]>([]);
  const [currentResult, setCurrentResult] = useState<TurnResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionScore, setSessionScore] = useState<number | null>(null);
  const [sessionContext, setSessionContext] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [audit, setAudit] = useState<AuditV2 | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  // Load audit and profile context
  useEffect(() => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) { router.replace("/"); return; }
    // Fetch user email then load audit
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((user) => {
        if (!user?.email) return;
        const cached = localStorage.getItem(auditStorageKey(user.email));
        if (cached) {
          try { setAudit(JSON.parse(cached)); } catch {}
        }
        // Also try to get profile for target label
        fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.ok ? r.json() : null)
          .then((profile) => {
            if (profile?.application_target_label) setTargetRole(profile.application_target_label);
          }).catch(() => {});
      }).catch(() => {});
  }, [router]);

  const startSession = useCallback(async () => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) return;
    setLoading(true);
    setHistory([]);
    setQuestionIndex(0);
    setCurrentResult(null);
    setSessionScore(null);

    const ctx = buildSessionContext(audit, audit?.detected_track ?? null, targetRole || null);
    setSessionContext(ctx);

    try {
      const r = await fetch(`${API_BASE}/voice/mock-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question_index: 0,
          answer: null,
          session_context: ctx,
          total_questions: TOTAL_QUESTIONS,
          history: [],
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err.error || "Failed to start session. Try again.");
        setLoading(false);
        return;
      }
      const data: TurnResult = await r.json();
      setCurrentQuestion(data.next_question);
      setSessionState("question");
    } catch {
      alert("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [audit, targetRole]);

  const submitAnswer = useCallback(async () => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token || !answer.trim()) return;
    setLoading(true);
    setSessionState("answering");

    const newTurn: HistoryTurn = {
      q: currentQuestion ?? "",
      a: answer.trim(),
      score: null,
      label: null,
      feedback: null,
      strengths: [],
      improvements: [],
    };
    const newHistory = [...history, newTurn];
    const newIndex = questionIndex + 1;

    try {
      const r = await fetch(`${API_BASE}/voice/mock-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question_index: newIndex,
          answer: answer.trim(),
          session_context: sessionContext,
          total_questions: TOTAL_QUESTIONS,
          history: newHistory.slice(-4).map((h) => ({ q: h.q, a: h.a })),
        }),
      });
      if (!r.ok) {
        setLoading(false);
        setSessionState("question");
        return;
      }
      const data: TurnResult = await r.json();

      // Update history with scores
      const updatedTurn: HistoryTurn = {
        ...newTurn,
        score: data.score,
        label: data.label,
        feedback: data.feedback ?? null,
        strengths: data.strengths ?? [],
        improvements: data.improvements ?? [],
      };
      const updatedHistory = [...history, updatedTurn];
      setHistory(updatedHistory);
      setCurrentResult(data);
      setAnswer("");
      setQuestionIndex(newIndex);

      if (data.is_final) {
        setSessionScore(data.session_score);
        setSessionState("done");
      } else {
        setCurrentQuestion(data.next_question);
        setSessionState("feedback");
      }
    } catch {
      setSessionState("question");
    } finally {
      setLoading(false);
    }
  }, [answer, currentQuestion, history, questionIndex, sessionContext]);

  const continueToNext = () => {
    setCurrentResult(null);
    setSessionState("question");
    setTimeout(() => answerRef.current?.focus(), 100);
  };

  const avgScore = history.length > 0
    ? Math.round((history.reduce((s, h) => s + (h.score ?? 0), 0) / history.length) * 10) / 10
    : null;

  // ─── Setup screen ──────────────────────────────────────────────────────────

  if (sessionState === "setup") {
    return (
      <div className="app-talent career-center-talent min-h-screen">
        <div className="w-full max-w-[375px] mx-auto px-4 pt-0 pb-40">
          <AppProfileHeader back={getCareerCenterReturnPath()} className="mb-4" />
          <div className="flex items-center gap-3 mb-6">
            <button type="button" onClick={() => router.push(getCareerCenterReturnPath())} className="w-9 h-9 rounded-xl border border-[var(--m-border)] flex items-center justify-center text-[var(--m-text-3)] hover:text-[var(--m-text)] transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h1 className="text-[16px] font-bold text-[var(--m-text)] tracking-tight">Mock Interview</h1>
              <p className="text-[11px] text-[var(--m-text-3)]">Structured • STAR format • Per-answer scoring</p>
            </div>
          </div>

          {/* What to expect */}
          <div className="m-resume-section-card mb-5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[var(--m-accent-dim)] border border-[var(--m-border-accent)] flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-[var(--m-accent)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              </div>
              <h2 className="text-[13px] font-semibold text-[var(--m-text)]">What happens</h2>
            </div>
            <ul className="space-y-2">
              {[
                `${TOTAL_QUESTIONS} behavioral questions, one at a time`,
                "Type your answer in STAR format (Situation → Task → Action → Result)",
                "Get a score (1–5) + specific feedback after each",
                "Session summary with your top 2 improvements at the end",
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--m-text-2)]">
                  <span className="mt-0.5 w-4 h-4 rounded-full bg-[var(--m-accent-dim)] border border-[var(--m-border-accent)] flex items-center justify-center text-[9px] font-bold text-[var(--m-accent)] shrink-0">{i + 1}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Target role input */}
          <div className="m-resume-section-card mb-5 p-4">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--m-text-4)] mb-2">Target role (optional)</label>
            <input
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="E.g. Goldman Sachs, Summer Analyst"
              className="m-resume-field w-full text-[13px]"
              maxLength={100}
            />
            <p className="text-[10px] text-[var(--m-text-4)] mt-1.5">Questions will be tailored for this role.</p>
          </div>

          {/* Context badge */}
          {audit && (
            <div className="mb-5 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--m-border-accent)] text-[11px] text-[var(--m-accent)]" style={{ background: "var(--m-accent-faint)" }}>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Questions tailored to your resume • {audit.detected_track ?? "your track"}
            </div>
          )}

          <button
            type="button"
            onClick={startSession}
            disabled={loading}
            className="w-full py-4 rounded-xl text-[14px] font-bold transition-all disabled:opacity-50 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #c9a882 0%, #b8916b 100%)", color: "#1a1917", boxShadow: "0 4px 16px rgba(201,168,130,0.3)" }}
          >
            {loading ? "Starting…" : "Start Mock Interview"}
          </button>
        </div>
      </div>
    );
  }

  // ─── Done screen ───────────────────────────────────────────────────────────

  if (sessionState === "done") {
    const finalScore = sessionScore ?? avgScore ?? 0;
    const scoreLabel = finalScore >= 4.5 ? "Excellent" : finalScore >= 3.5 ? "Strong" : finalScore >= 2.5 ? "Good" : finalScore >= 1.5 ? "Needs work" : "Keep practicing";
    const allImprovements = history.flatMap((h) => h.improvements);
    const topImprovement = allImprovements[0] ?? null;
    const secondImprovement = allImprovements.find((s, i) => i > 0 && s !== topImprovement) ?? null;

    return (
      <div className="app-talent min-h-screen">
        <div className="w-full max-w-[375px] mx-auto px-4 pt-5 pb-40">
          <div className="flex items-center gap-3 mb-6">
            <button type="button" onClick={() => router.push(getCareerCenterReturnPath())} className="w-9 h-9 rounded-xl border border-[var(--m-border)] flex items-center justify-center text-[var(--m-text-3)] hover:text-[var(--m-text)] transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-[16px] font-bold text-[var(--m-text)]">Session Complete</h1>
          </div>

          {/* Session score */}
          <div className="m-resume-section-card mb-5 p-5 flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full flex items-center justify-center border-4 shrink-0" style={{ borderColor: scoreColor(Math.round(finalScore)), background: "var(--m-surface-2)" }}>
              <div className="text-center">
                <p className="text-2xl font-black leading-none" style={{ color: scoreColor(Math.round(finalScore)) }}>{finalScore.toFixed(1)}</p>
                <p className="text-[10px] text-[var(--m-text-3)] mt-0.5">/ 5.0</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-[15px] font-bold text-[var(--m-text)]">{scoreLabel}</p>
              <p className="text-[11px] text-[var(--m-text-3)] mt-0.5">{TOTAL_QUESTIONS} questions completed</p>
            </div>
          </div>

          {/* Top improvements */}
          {(topImprovement || secondImprovement) && (
            <div className="m-resume-section-card mb-5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--m-text-4)] mb-3">Your top 2 improvements</p>
              <div className="space-y-3">
                {[topImprovement, secondImprovement].filter(Boolean).map((imp, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-[rgba(249,115,22,0.12)] border border-[rgba(249,115,22,0.3)] flex items-center justify-center text-[9px] font-bold text-orange-400 shrink-0">{i + 1}</span>
                    <p className="text-[12px] text-[var(--m-text-2)] leading-snug">{imp}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-question breakdown */}
          <div className="m-resume-section-card mb-5">
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--m-text-4)]">Question breakdown</p>
            </div>
            {history.map((turn, i) => (
              <div key={i} className="px-4 py-3 border-t border-[var(--m-border)]">
                <div className="flex items-start gap-3">
                  <ScoreRing score={turn.score} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-[var(--m-text)] leading-snug mb-1">Q{i + 1}: {turn.q.length > 80 ? turn.q.slice(0, 80) + "…" : turn.q}</p>
                    {turn.feedback && <p className="text-[10px] text-[var(--m-text-3)] leading-snug">{turn.feedback}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setSessionState("setup"); setHistory([]); setCurrentQuestion(null); }} className="flex-1 py-3 rounded-xl border border-[var(--m-border-strong)] text-[13px] font-semibold text-[var(--m-text-2)] hover:bg-[var(--m-surface-2)] transition-colors">
              Try again
            </button>
            <button
              type="button"
              onClick={() => router.push(getCareerCenterReturnPath())}
              className="flex-[2] py-3 rounded-xl text-[13px] font-bold"
              style={{ background: "linear-gradient(135deg, #c9a882 0%, #b8916b 100%)", color: "#1a1917" }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Question / feedback screen ────────────────────────────────────────────

  return (
    <div className="app-talent career-center-talent min-h-screen">
      <div className="w-full max-w-[375px] mx-auto px-4 pt-0 pb-40">
        <AppProfileHeader back={() => { if (confirm("End this session?")) router.push(getCareerCenterReturnPath()); }} className="mb-4" />
        <div className="flex items-center gap-3 mb-5">
          <button type="button" onClick={() => { if (confirm("End this session?")) router.push(getCareerCenterReturnPath()); }} className="w-9 h-9 rounded-xl border border-[var(--m-border)] flex items-center justify-center text-[var(--m-text-3)] hover:text-[var(--m-text)] transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-semibold text-[var(--m-text-3)]">Question {Math.min(questionIndex + 1, TOTAL_QUESTIONS)} of {TOTAL_QUESTIONS}</p>
              {avgScore && <p className="text-[10px] font-medium" style={{ color: scoreColor(Math.round(avgScore)) }}>Avg {avgScore.toFixed(1)}/5</p>}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-[var(--m-border)]">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(questionIndex / TOTAL_QUESTIONS) * 100}%`, background: "var(--m-accent)" }} />
            </div>
          </div>
        </div>

        {/* Current question */}
        {currentQuestion && (
          <div className="m-resume-section-card mb-4 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-[var(--m-accent-dim)] border border-[var(--m-border-accent)] flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-[var(--m-accent)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--m-accent)]">Question</p>
            </div>
            <p className="text-[14px] font-medium text-[var(--m-text)] leading-relaxed">{currentQuestion}</p>
          </div>
        )}

        {/* STAR format hint */}
        {sessionState === "question" && (
          <div className="mb-4 px-3 py-2.5 rounded-xl border border-[var(--m-border)] bg-transparent">
            <p className="text-[10px] text-[var(--m-text-4)] leading-relaxed">
              <span className="font-semibold text-[var(--m-text-3)]">STAR format:</span> Situation → Task → Action → Result
            </p>
          </div>
        )}

        {/* Feedback from previous answer */}
        {sessionState === "feedback" && currentResult && (
          <div className="m-resume-section-card mb-4 p-4 animate-fade-up">
            <div className="flex items-start gap-3 mb-3">
              <ScoreRing score={currentResult.score} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold leading-snug mb-0.5" style={{ color: scoreColor(currentResult.score) }}>
                  {currentResult.label ?? SCORE_LABELS[currentResult.score ?? 0]}
                </p>
                {currentResult.feedback && (
                  <p className="text-[12px] text-[var(--m-text-2)] leading-snug">{currentResult.feedback}</p>
                )}
              </div>
            </div>
            {currentResult.strengths?.length > 0 && (
              <div className="mb-2">
                {currentResult.strengths.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5 mb-1">
                    <span className="mt-0.5 text-[#4ade80] text-xs shrink-0">✓</span>
                    <p className="text-[11px] text-[var(--m-text-2)]">{s}</p>
                  </div>
                ))}
              </div>
            )}
            {currentResult.improvements?.length > 0 && (
              <div>
                {currentResult.improvements.map((imp, i) => (
                  <div key={i} className="flex items-start gap-1.5 mb-1">
                    <span className="mt-0.5 text-orange-400 text-xs shrink-0">→</span>
                    <p className="text-[11px] text-[var(--m-text-2)]">{imp}</p>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={continueToNext}
              className="w-full mt-3 py-2.5 rounded-xl text-[12px] font-bold"
              style={{ background: "var(--m-accent)", color: "#1a1917" }}
            >
              Next question →
            </button>
          </div>
        )}

        {/* Answer input */}
        {sessionState === "question" && (
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--m-text-4)] mb-2">Your answer</label>
            <textarea
              ref={answerRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Start with the Situation. What was the context? Then walk through Task, Action, and what happened as a Result..."
              rows={6}
              className="w-full rounded-xl border border-[var(--m-border)] bg-[var(--m-surface)] text-[13px] text-[var(--m-text)] p-3.5 resize-none outline-none leading-relaxed transition-colors focus:border-[var(--m-accent)] focus:bg-[var(--m-accent-faint)]"
              style={{ minHeight: 140 }}
              autoFocus
            />
            <p className="text-[10px] text-[var(--m-text-4)] mt-1.5 text-right">{answer.length > 0 ? `${answer.split(/\s+/).filter(Boolean).length} words` : ""}</p>
          </div>
        )}
      </div>

      {/* Sticky bottom bar */}
      {sessionState === "question" && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--m-border)]" style={{ background: "rgba(26,25,23,0.97)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          <div className="max-w-[375px] mx-auto px-4 py-3">
            <button
              type="button"
              onClick={submitAnswer}
              disabled={loading || !answer.trim() || answer.trim().split(/\s+/).length < 10}
              className="w-full py-3.5 rounded-xl text-[14px] font-bold transition-all disabled:opacity-40 active:scale-[0.98]"
              style={{ background: loading ? "var(--m-surface-2)" : "linear-gradient(135deg, #c9a882 0%, #b8916b 100%)", color: loading ? "var(--m-text-3)" : "#1a1917", boxShadow: loading ? "none" : "0 4px 16px rgba(201,168,130,0.3)" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-[var(--m-text-3)] border-t-transparent animate-spin" />
                  Scoring your answer…
                </span>
              ) : (
                "Submit answer →"
              )}
            </button>
            {answer.trim() && answer.trim().split(/\s+/).length < 10 && (
              <p className="text-[10px] text-[var(--m-text-4)] text-center mt-1.5">Write at least 10 words for a meaningful score.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
