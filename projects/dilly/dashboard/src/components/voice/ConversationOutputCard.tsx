"use client";

import { useRouter } from "next/navigation";
import type { ConversationOutput } from "@/types/dilly";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";

const DIM_COLORS: Record<string, string> = {
  smart: "var(--blue)",
  grit: "var(--amber)",
  build: "var(--indigo)",
};

export function ConversationOutputCard({
  output,
  voiceAvatarIndex,
  onDismiss,
}: {
  output: ConversationOutput;
  voiceAvatarIndex?: number | null;
  onDismiss: () => void;
}) {
  const router = useRouter();
  if (!output.summary_lines?.length) return null;

  const impact = output.score_impact;
  const topDim =
    impact?.dimension_breakdown
      ? (Object.entries(impact.dimension_breakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || "grit")
      : "grit";

  return (
    <div
      className="mx-4 mb-2 rounded-[20px] border p-4"
      style={{ background: "var(--s2)", borderColor: "var(--gbdr)" }}
    >
      <div className="flex items-start gap-3 mb-3">
        <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex ?? null} size="md" className="shrink-0" />
        <p className="text-[14px] font-semibold leading-5" style={{ color: "var(--t1)" }}>
          From today&apos;s conversation
        </p>
      </div>
      <div className="space-y-1.5">
        {output.summary_lines.map((line, i) => (
          <button
            key={i}
            type="button"
            className="flex items-start gap-2 text-left w-full"
            disabled={!line.action_type}
            onClick={() => {
              if (line.action_payload?.route) router.push(line.action_payload.route);
            }}
          >
            <span className="text-[14px] font-bold leading-4 shrink-0" style={{ color: line.icon_color }}>+</span>
            <span className="text-[12px] font-medium leading-4" style={{ color: "var(--t2)" }}>{line.text}</span>
          </button>
        ))}
      </div>
      {impact && impact.total_pts > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold" style={{ color: DIM_COLORS[topDim] || "var(--blue)" }}>
            Score impact if you act: +{impact.total_pts} pts {topDim.charAt(0).toUpperCase() + topDim.slice(1)}
          </p>
          {impact.confidence === "low" && (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>{impact.qualifying_note}</p>
          )}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          className="text-[12px] font-semibold"
          style={{ color: "var(--green)" }}
          onClick={() => router.push("/actions")}
        >
          See action items →
        </button>
        <button
          type="button"
          className="text-[12px]"
          style={{ color: "var(--t3)" }}
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
