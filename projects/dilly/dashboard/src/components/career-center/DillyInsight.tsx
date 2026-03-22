"use client";

import { VoiceAvatar } from "@/components/VoiceAvatarButton";

type DillyInsightProps = {
  /** dilly_take from audit */
  take: string;
  onViewRecommendation?: () => void;
  voiceAvatarIndex?: number | null;
};

export function DillyInsight({ take, onViewRecommendation, voiceAvatarIndex = null }: DillyInsightProps) {
  return (
    <div
      className="rounded-[18px] p-4 flex gap-3"
      style={{ background: "var(--s2)" }}
    >
      <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="sm" className="w-9 h-9 shrink-0 ring-2 ring-[var(--s3)]" />
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--t3)" }}>
          DILLY
        </span>
        <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--t2)" }}>
          {take}
        </p>
        {onViewRecommendation && (
          <button
            type="button"
            onClick={onViewRecommendation}
            className="mt-2 text-[13px] font-medium hover:underline"
            style={{ color: "var(--blue)" }}
          >
            View recommendation →
          </button>
        )}
      </div>
    </div>
  );
}
