"use client";

import { useMemo } from "react";
import type { AuditV2, MemoryItem, SessionCapture } from "@/types/dilly";
import { estimateScoreImpact } from "@/lib/estimateScoreImpact";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";

export function SessionCaptureCard({
  capture,
  latestAudit,
  voiceAvatarIndex,
  onOpenMemory,
  onDismiss,
}: {
  capture: SessionCapture | null;
  latestAudit: AuditV2 | null;
  voiceAvatarIndex?: number | null;
  onOpenMemory: () => void;
  onDismiss: () => void;
}) {
  const items = useMemo(() => ((capture?.items ?? []) as MemoryItem[]), [capture]);
  const impact = useMemo(() => estimateScoreImpact(items, latestAudit), [items, latestAudit]);
  if (!capture || items.length === 0) return null;

  const impactColor =
    impact?.dimension === "Grit"
      ? "var(--amber)"
      : impact?.dimension === "Smart"
        ? "var(--blue)"
        : "var(--indigo)";

  return (
    <div
      className="mx-4 mb-5 rounded-[20px] border p-4"
      style={{ background: "var(--s2)", borderColor: "var(--bbdr)" }}
    >
      <div className="flex items-start gap-3">
        <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex ?? null} size="md" className="shrink-0" />
        <p className="text-[14px] font-semibold leading-5" style={{ color: "var(--t1)" }}>
          I learned {items.length} new {items.length === 1 ? "thing" : "things"} about you today.
        </p>
      </div>
      <div className="mt-3 space-y-1.5">
        {items.slice(0, 4).map((item) => (
          <p key={item.id} className="text-[12px] leading-4" style={{ color: "var(--t2)" }}>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>+ </span>
            {item.label}
          </p>
        ))}
      </div>
      {impact ? (
        <p className="mt-3 text-[12px] font-semibold" style={{ color: impactColor }}>
          Score impact if you act on these: +{impact.pts} pts {impact.dimension}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={onOpenMemory} className="text-[12px] font-semibold" style={{ color: "var(--blue)" }}>
          See what Dilly AI knows →
        </button>
        <button type="button" onClick={onDismiss} className="text-[12px]" style={{ color: "var(--t3)" }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

