"use client";

import { cn } from "@/lib/utils";
import { VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

const STEPS = ["Research", "Stories", "Practice", "Review"] as const;

export function VoiceInterviewAgendaVisual({
  highlightStep,
  className,
}: {
  highlightStep: number | null;
  className?: string;
}) {
  const hi = highlightStep == null ? null : Math.min(3, Math.max(0, highlightStep));

  return (
    <VoiceVisualShell
      className={cn(
        "rounded-xl border border-white/[0.1] bg-white/[0.04] px-2 py-2.5",
        className
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2 px-0.5">
        Interview prep
      </p>
      <div className="grid grid-cols-4 gap-1 w-full min-w-0">
        {STEPS.map((label, i) => {
          const active = hi === i;
          return (
            <div
              key={label}
              className={cn(
                "voice-viz-stagger-item rounded-lg border px-0.5 py-1.5 text-center transition-colors flex flex-col items-stretch justify-end min-h-[3.25rem]",
                active
                  ? "border-amber-400/50 bg-amber-500/15 ring-1 ring-amber-400/30"
                  : "border-white/[0.08] bg-black/20"
              )}
              style={{ animationDelay: `${80 + i * 70}ms` }}
            >
              <div
                className={cn(
                  "mx-auto mb-1 w-full max-w-[2rem] h-0.5 rounded-full voice-viz-agenda-line shrink-0",
                  active ? "bg-amber-400/80" : "bg-white/20"
                )}
                style={{ animationDelay: `${100 + i * 70}ms` }}
              />
              <span
                className={cn(
                  "text-[8px] font-bold uppercase tracking-wide leading-none block hyphens-none",
                  label.includes(" ") ? "whitespace-normal break-words" : "whitespace-nowrap",
                  active ? "text-amber-200" : "text-slate-400"
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </VoiceVisualShell>
  );
}
