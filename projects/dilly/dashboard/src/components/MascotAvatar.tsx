"use client";

import { getVoiceAvatarUrl } from "@/lib/voiceAvatars";
import type { AuditV2 } from "@/types/dilly";

export type MascotMood = "default" | "happy" | "encouraging" | "celebrating";

/** Derive mascot mood from audit state. Only used in Voice chat. */
export function getMascotMood(
  displayAudit: AuditV2 | null | undefined,
  lastAudit: AuditV2 | null | undefined
): MascotMood {
  if (!displayAudit) return "default";
  const pct = displayAudit.peer_percentiles ?? { smart: 50, grit: 50, build: 50 };
  const dims = ["smart", "grit", "build"] as const;
  const topPcts = dims.map((k) => Math.max(1, 100 - (pct[k] ?? 50)));
  const bestTopPct = Math.min(...topPcts);
  const anyTop25 = topPcts.some((t) => t <= 25);

  if (anyTop25) return "celebrating";
  if (lastAudit && displayAudit.id !== lastAudit.id) {
    const prevPct = lastAudit.peer_percentiles ?? { smart: 50, grit: 50, build: 50 };
    const improved = dims.some((k) => (100 - (pct[k] ?? 50)) > (100 - (prevPct[k] ?? 50)));
    if (improved) return "happy";
  }
  const closeToTop25 = topPcts.some((t) => t > 25 && t <= 35);
  if (closeToTop25) return "encouraging";
  return "default";
}

type Props = {
  voiceAvatarIndex: number | null;
  mood: MascotMood;
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
};

const sizes = { sm: "w-7 h-7", md: "w-12 h-12", lg: "w-14 h-14" };

export function MascotAvatar({
  voiceAvatarIndex,
  mood,
  size = "md",
  className = "",
  onClick,
}: Props) {
  const avatarUrl = getVoiceAvatarUrl(voiceAvatarIndex);
  const pad = size === "sm" ? "p-0.5" : size === "md" ? "p-1" : "p-1.5";
  const inner = (
    <div
      data-mood={mood}
      className={`mascot-avatar voice-avatar bg-white rounded-full overflow-hidden flex items-center justify-center shrink-0 ${pad} ${sizes[size]} ${className}`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-contain" />
      ) : (
        <span className="text-[10px] font-bold" style={{ color: "var(--dilly-primary, #c9a882)" }}>M</span>
      )}
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="cursor-pointer border-0 bg-transparent p-0 shrink-0">
        {inner}
      </button>
    );
  }
  return inner;
}
