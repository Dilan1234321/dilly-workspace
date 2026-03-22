"use client";

import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

export function VoiceCalendarSavedVisual({
  summary,
  className,
}: {
  /** Optional one-line detail (e.g. meeting title); omit for generic card only */
  summary?: string | null;
  className?: string;
}) {
  const detail = summary?.trim() || null;

  return (
    <VoiceVisualShell
      className={cn(
        "rounded-xl border border-emerald-500/35 bg-emerald-500/[0.07] px-3 py-2.5 voice-viz-stagger-item",
        className
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="shrink-0 w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center">
          <CalendarCheck className="w-5 h-5 text-emerald-300" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[11px] font-semibold text-emerald-100 leading-snug">Saved to your calendar</p>
          {detail ? (
            <p className="text-[11px] text-slate-300/95 mt-1 leading-snug line-clamp-3">{detail}</p>
          ) : (
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">Visible in your deadlines & calendar in the app.</p>
          )}
        </div>
      </div>
    </VoiceVisualShell>
  );
}
