"use client";

import { cn } from "@/lib/utils";
import { VoiceStagger, VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

export function VoiceBeforeAfterVisual({
  before,
  after,
  className,
}: {
  before: string;
  after: string;
  className?: string;
}) {
  return (
    <VoiceVisualShell
      className={cn(
        "rounded-xl border border-white/[0.1] bg-white/[0.04] px-2.5 py-2.5",
        className
      )}
    >
      <VoiceStagger baseDelayMs={70} stepMs={120}>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-rose-400/90 mb-1">Before</p>
          <p className="text-[11px] text-slate-300 leading-snug">{before}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-400/90 mb-1">After</p>
          <p className="text-[11px] text-slate-100 leading-snug font-medium">{after}</p>
        </div>
      </VoiceStagger>
    </VoiceVisualShell>
  );
}
