"use client";

import type { AchievementId, AchievementDef } from "@/lib/achievements";
import { ACHIEVEMENT_DEFINITIONS, ACHIEVEMENT_BORDER_COLORS, getAchievementGlyphPath, getAchievementTierBackground } from "@/lib/achievements";
import { cn } from "@/lib/utils";

type Props = {
  achievementId: AchievementId;
  unlocked?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  showName?: boolean;
  /** "sticker" = warm paper/magazine style for achievements page */
  /** "sheet" = dark blue sticker sheet overlay: white outline, light text */
  variant?: "default" | "sticker" | "sheet";
};

const sizes = {
  sm: { circle: "w-12 h-12", emoji: "text-lg" },
  md: { circle: "w-16 h-16", emoji: "text-2xl" },
  lg: { circle: "w-20 h-20", emoji: "text-3xl" },
};

export function AchievementSticker({
  achievementId,
  unlocked = false,
  size = "md",
  className,
  showName = false,
  variant = "default",
}: Props) {
  const def: AchievementDef = ACHIEVEMENT_DEFINITIONS[achievementId] ?? {
    id: achievementId,
    name: achievementId,
    emoji: "?",
    description: "",
  };
  const s = sizes[size];
  const glyphPath = getAchievementGlyphPath(achievementId);
  const tierBg = getAchievementTierBackground(achievementId);
  const tierBorder = tierBg ? (ACHIEVEMENT_BORDER_COLORS[achievementId] ?? undefined) : undefined;
  const useTierStyle = unlocked && tierBg && tierBorder;

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-1",
        !unlocked && "opacity-50",
        className
      )}
    >
      <div
        className={cn(
          "rounded-full flex items-center justify-center shrink-0 overflow-hidden",
          "shadow-[0_2px_8px_rgba(0,0,0,0.15)]",
          "-rotate-[6deg]",
          s.circle,
          !useTierStyle && variant === "sticker"
            ? unlocked
              ? "bg-gradient-to-br from-amber-50 to-amber-100/90 border border-amber-200/80"
              : "bg-amber-50/60 border border-amber-200/40"
            : !useTierStyle && variant === "sheet"
              ? "bg-white/10 border-2 border-white/80"
              : !useTierStyle && unlocked
                ? "bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300/60"
                : !useTierStyle
                  ? "bg-slate-200/80 border border-slate-300/40"
                  : "border-2"
        )}
        style={
          useTierStyle
            ? { backgroundColor: tierBg, borderColor: tierBorder }
            : variant === "sticker"
              ? {
                  boxShadow: unlocked
                    ? "0 2px 8px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)"
                    : "0 1px 4px rgba(0,0,0,0.06)",
                }
              : variant === "sheet"
                ? { boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }
                : {
                    boxShadow: unlocked
                      ? "0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)"
                      : "0 1px 4px rgba(0,0,0,0.08)",
                  }
        }
      >
        {glyphPath ? (
          <img
            src={glyphPath}
            alt=""
            className={cn(
              "w-[55%] h-[55%] object-contain select-none",
              !unlocked && "grayscale opacity-70"
            )}
            aria-hidden
          />
        ) : (
          <span
            className={cn(
              s.emoji,
              !unlocked && "grayscale"
            )}
            aria-hidden
          >
            {def.emoji}
          </span>
        )}
      </div>
      {showName && (
        <span
          className={cn(
            "text-[10px] font-medium text-center max-w-[72px] leading-tight",
            variant === "sticker"
              ? unlocked ? "text-amber-900/90" : "text-amber-900/50"
              : variant === "sheet"
                ? "text-white/90"
                : unlocked ? "text-[var(--m-text-2)]" : "text-[var(--m-text-4)]"
          )}
        >
          {def.name}
        </span>
      )}
    </div>
  );
}
