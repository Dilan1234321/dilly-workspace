"use client";

import type { ReactNode } from "react";
import type { VoiceMockTurnDisplay } from "@/types/dilly";

const cardClass =
  "rounded-2xl border border-white/12 bg-[linear-gradient(165deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_100%)] shadow-[0_12px_40px_rgba(0,0,0,0.35)] overflow-hidden";

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/70">
      {children}
    </span>
  );
}

export function VoiceMockInterviewBanner({
  active,
  questionNumber,
  total,
  onEnd,
}: {
  active: boolean;
  questionNumber: number;
  total: number;
  onEnd: () => void;
}) {
  if (!active) return null;
  return (
    <div className="mb-3 flex shrink-0 items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-200/90">
          Mock interview
        </span>
        <span className="truncate text-xs text-white/70">
          Question {questionNumber} of {total}
        </span>
      </div>
      <button
        type="button"
        onClick={onEnd}
        className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/85 transition hover:bg-white/10 active:scale-[0.98]"
      >
        End
      </button>
    </div>
  );
}

export function VoiceMockInterviewTurn({ turn }: { turn: VoiceMockTurnDisplay }) {
  if (turn.kind === "question") {
    return (
      <div className={`${cardClass} p-4`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge>Question</Badge>
          <span className="text-xs text-white/50">
            {turn.number} / {turn.total}
          </span>
        </div>
        <p className="text-[15px] leading-relaxed text-white/95">{turn.text}</p>
        <p className="mt-3 text-[11px] text-white/45">
          Answer in the box below. Use STAR if it helps — situation, task, action, result.
        </p>
      </div>
    );
  }

  if (turn.kind === "feedback") {
    return (
      <div className="space-y-3">
        <div className={`${cardClass} p-4`}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>Feedback</Badge>
            {turn.score != null && (
              <span className="text-xs font-semibold text-emerald-200/90">
                Score {turn.score}/10
                {turn.label ? ` · ${turn.label}` : ""}
              </span>
            )}
          </div>
          {turn.feedback ? (
            <p className="text-sm leading-relaxed text-white/88">{turn.feedback}</p>
          ) : null}
          {turn.strengths?.length ? (
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/80">
                Strengths
              </p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-white/75">
                {turn.strengths.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {turn.improvements?.length ? (
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
                Improve
              </p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-white/75">
                {turn.improvements.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {turn.isFinal && turn.sessionScore != null ? (
            <p className="mt-3 border-t border-white/10 pt-3 text-sm font-medium text-white/90">
              Session score: {turn.sessionScore}/5
            </p>
          ) : null}
        </div>
        {turn.nextQuestion ? (
          <div className={`${cardClass} p-4`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge>Next question</Badge>
              <span className="text-xs text-white/50">
                {turn.questionNumber + 1} / {turn.total}
              </span>
            </div>
            <p className="text-[15px] leading-relaxed text-white/95">{turn.nextQuestion}</p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`${cardClass} p-4`}>
      <div className="mb-2">
        <Badge>Session complete</Badge>
      </div>
      {turn.sessionScore != null ? (
        <p className="mb-2 text-sm font-semibold text-emerald-200/90">
          Overall: {turn.sessionScore}/5
        </p>
      ) : null}
      {turn.summaryLines.length ? (
        <ul className="list-disc space-y-1 pl-4 text-sm text-white/80">
          {turn.summaryLines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-white/70">Great work. Ask anytime if you want another round.</p>
      )}
    </div>
  );
}
