"use client";

import { cn } from "@/lib/utils";
import { VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

export function VoiceDeadlineTimelineVisual({
  deadlines,
  className,
}: {
  deadlines: Array<{ label: string; date: string }>;
  className?: string;
}) {
  const rows = deadlines.slice(0, 8);
  if (!rows.length) return null;

  return (
    <VoiceVisualShell
      className={cn(
        "rounded-xl border border-white/[0.1] bg-white/[0.04] px-2.5 py-2.5",
        className
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Your timeline</p>
      <ul className="relative pl-3 space-y-2.5 before:absolute before:left-[3px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-white/15">
        {rows.map((d, i) => (
          <li key={i} className="relative flex gap-2.5 min-w-0">
            <span
              className="absolute -left-3 top-1 w-2 h-2 rounded-full bg-sky-400/90 ring-2 ring-black/40 voice-viz-stagger-item"
              style={{ animationDelay: `${90 + i * 72}ms` }}
            />
            <div
              className="flex-1 min-w-0 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5 voice-viz-stagger-item"
              style={{ animationDelay: `${110 + i * 72}ms` }}
            >
              <p className="text-[11px] font-medium text-slate-100 leading-snug line-clamp-2">{d.label}</p>
              <p className="text-[10px] text-slate-500 tabular-nums mt-0.5">{d.date}</p>
            </div>
          </li>
        ))}
      </ul>
    </VoiceVisualShell>
  );
}
