"use client";

import { cn } from "@/lib/utils";
import { VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

export function VoiceStepsVisual({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  if (!items.length) return null;

  return (
    <VoiceVisualShell
      className={cn(
        "rounded-xl border border-white/[0.1] bg-white/[0.04] px-2.5 py-2.5",
        className
      )}
    >
      <ol className="space-y-2 list-none m-0 p-0">
        {items.map((step, i) => (
          <li
            key={i}
            className="voice-viz-stagger-item flex gap-2 min-w-0"
            style={{ animationDelay: `${80 + i * 80}ms` }}
          >
            <span className="shrink-0 w-5 h-5 rounded-md bg-white/10 border border-white/10 text-[10px] font-bold flex items-center justify-center text-slate-200 tabular-nums">
              {i + 1}
            </span>
            <span className="text-[11px] text-slate-200 leading-snug pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
    </VoiceVisualShell>
  );
}
