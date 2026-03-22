"use client";

import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import type { VoiceSessionRecap } from "@/lib/voiceSessionRecap";

export function VoiceSessionRecapCard({
  recap,
  voiceAvatarIndex,
  onDismiss,
  onOpenVoice,
}: {
  recap: VoiceSessionRecap;
  voiceAvatarIndex?: number | null;
  onDismiss: () => void;
  onOpenVoice: () => void;
}) {
  if (!recap.bullets.length) return null;

  return (
    <div
      className="mx-4 mb-2 rounded-[20px] border p-4"
      style={{ background: "var(--s2)", borderColor: "var(--gbdr)" }}
    >
      <div className="flex items-start gap-3 mb-2">
        <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex ?? null} size="md" className="shrink-0" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold leading-5" style={{ color: "var(--t1)" }}>
            Last chat with Dilly
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>
            You asked about · {recap.exchangeCount} exchange{recap.exchangeCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <ul className="space-y-1.5 mb-3">
        {recap.bullets.map((b, i) => (
          <li key={i} className="text-[12px] leading-snug pl-2 border-l-2" style={{ color: "var(--t2)", borderColor: "var(--blue)" }}>
            {b}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-[12px] font-semibold min-h-[44px] px-2"
          style={{ color: "var(--green)" }}
          onClick={onOpenVoice}
        >
          Continue in Dilly AI →
        </button>
        <button type="button" className="text-[12px] min-h-[44px] px-2" style={{ color: "var(--t3)" }} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
