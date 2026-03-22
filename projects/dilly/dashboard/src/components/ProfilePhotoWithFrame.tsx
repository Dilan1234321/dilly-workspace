"use client";

import { getProfileFrame, getProfileFrameLabel, type ProfileFrame } from "@/lib/profileFrame";

type Props = {
  photoUrl: string | null;
  frame: ProfileFrame;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Fallback when no photo: first letter of name */
  fallbackLetter?: string;
  /** Use voice-avatar styling (for Voice chat bubbles) */
  variant?: "default" | "voice";
};

const sizes = { sm: "w-7 h-7", md: "w-14 h-14", lg: "w-36 h-36" };
const fallbackSizes = { sm: "text-[10px]", md: "text-sm", lg: "text-3xl" };

const frameStyles: Record<NonNullable<ProfileFrame>, string> = {
  top5: "ring-[3px] ring-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]",
  top10: "ring-[3px] ring-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.35)]",
  top25: "ring-[3px] ring-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.3)]",
};

/** Badge colors matching the frame: integrated LinkedIn-style band at bottom */
const badgeStyles: Record<NonNullable<ProfileFrame>, string> = {
  top5: "bg-amber-500 text-amber-950 ring-amber-400/60",
  top10: "bg-emerald-500 text-emerald-950 ring-emerald-400/60",
  top25: "bg-sky-500 text-sky-950 ring-sky-400/60",
};

const badgeSizes = {
  md: "text-[8px] px-1.5 py-0.5 min-w-[2.25rem]",
  lg: "text-[10px] px-2.5 py-1 min-w-[3.25rem]",
};

export function ProfilePhotoWithFrame({
  photoUrl,
  frame,
  size = "md",
  className = "",
  fallbackLetter = "?",
  variant = "default",
}: Props) {
  const hasFrame = frame && frameStyles[frame];
  const bgClass = variant === "voice" ? "voice-avatar" : "bg-slate-700/50";
  const ringClass = hasFrame ? frameStyles[frame] : "ring-0";
  const borderClass = !hasFrame ? "border border-[var(--ut-border)]" : "";

  return (
    <div className={`relative shrink-0 min-w-0 ${sizes[size]} ${className}`}>
      <div
        className={`relative rounded-full overflow-visible ${ringClass} ${borderClass} w-full h-full`}
      >
        <div className={`rounded-full overflow-hidden flex items-center justify-center w-full h-full ${bgClass}`}>
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-full h-full object-cover object-center" />
          ) : (
            <span className={`text-slate-400 font-bold ${fallbackSizes[size]}`}>
              {fallbackLetter[0]?.toUpperCase() || "?"}
            </span>
          )}
        </div>
        {hasFrame && size !== "sm" && (
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[55%] flex items-center justify-center z-10"
            title={getProfileFrameLabel(frame)}
          >
            <span
              className={`
                inline-flex items-center justify-center font-semibold tracking-tight
                rounded-full shadow-lg ring-2
                ${badgeStyles[frame]} ${badgeSizes[size]}
              `}
            >
              {getProfileFrameLabel(frame)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
