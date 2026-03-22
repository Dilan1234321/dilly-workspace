"use client";

import { cn } from "@/lib/utils";
import { VoiceStagger, VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

export type StoryTimelineNode = { kind: string; text: string };

export function VoiceStoryTimelineVisual({ nodes, className }: { nodes: StoryTimelineNode[]; className?: string }) {
  const list = nodes.filter((n) => n.text?.trim()).slice(0, 6);
  if (!list.length) return null;

  return (
    <VoiceVisualShell className={cn("rounded-xl border border-violet-500/25 bg-violet-950/20 px-2.5 py-2.5", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/90 mb-2">Your story arc</p>
      <VoiceStagger baseDelayMs={70} stepMs={65}>
        {list.map((n, i) => (
          <div key={`${i}-${n.kind}`} className="flex gap-2 items-start py-1.5 border-b border-white/[0.06] last:border-0">
            <span className="text-[9px] font-bold uppercase tracking-wider text-violet-400/80 shrink-0 w-16">{n.kind}</span>
            <span className="text-[11px] text-slate-100 leading-snug min-w-0">{n.text}</span>
          </div>
        ))}
      </VoiceStagger>
    </VoiceVisualShell>
  );
}
