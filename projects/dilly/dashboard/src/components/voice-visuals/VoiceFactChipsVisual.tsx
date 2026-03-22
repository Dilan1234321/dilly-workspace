"use client";

import { cn } from "@/lib/utils";
import { VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

export function VoiceFactChipsVisual({
  chips,
  className,
}: {
  chips: { label: string; value: string }[];
  className?: string;
}) {
  if (!chips.length) return null;

  return (
    <VoiceVisualShell
      className={cn(
        "rounded-xl border border-white/[0.1] bg-white/[0.04] px-2.5 py-2.5",
        className
      )}
    >
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c, i) => (
          <div
            key={`${c.label}-${i}`}
            className="voice-viz-stagger-item inline-flex flex-col items-start rounded-lg border border-white/[0.1] bg-black/30 px-2 py-1.5 max-w-full"
            style={{ animationDelay: `${70 + i * 65}ms` }}
          >
            <span
              className={cn(
                "text-[9px] font-semibold uppercase tracking-wide text-slate-500 leading-tight hyphens-none",
                c.label.trim().includes(" ") ? "whitespace-normal break-words" : "whitespace-nowrap"
              )}
            >
              {c.label}
            </span>
            <span className="text-[11px] font-semibold text-slate-100 leading-tight break-words">{c.value}</span>
          </div>
        ))}
      </div>
    </VoiceVisualShell>
  );
}
