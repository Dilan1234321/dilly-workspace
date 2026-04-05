"use client";

import { getVoiceAvatarUrl } from "@/lib/voiceAvatars";

type Props = {
  voiceAvatarIndex: number | null;
  size?: "xs" | "sm" | "md";
  onClick: (e?: React.MouseEvent) => void;
  label?: string;
  showLabel?: boolean;
  /** "rect" = rounded rectangle (e.g. rounded-xl); "pill" = default pill/circle */
  shape?: "pill" | "rect";
  className?: string;
};

const sizes = { xs: "w-6 h-6", sm: "w-8 h-8", md: "w-10 h-10" };
const iconSizes = { xs: "w-3 h-3", sm: "w-4 h-4", md: "w-5 h-5" };

/** Display-only avatar for use inside buttons or as decoration (no nested buttons) */
export function VoiceAvatar({
  voiceAvatarIndex,
  size = "sm",
  className = "",
}: {
  voiceAvatarIndex: number | null;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const avatarUrl = getVoiceAvatarUrl(voiceAvatarIndex);
  const pad = size === "xs" ? "p-0.5" : size === "sm" ? "p-1" : "p-1.5";
  return (
    <span className={`inline-flex rounded-full overflow-hidden flex-shrink-0 bg-white items-center justify-center ${pad} ${sizes[size]} ${className}`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-contain" />
      ) : (
        <span className={`${iconSizes[size]} text-black flex items-center justify-center w-full h-full`}>
          <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        </span>
      )}
    </span>
  );
}

export function VoiceAvatarButton({
  voiceAvatarIndex,
  size = "sm",
  onClick,
  label = "How can I help?",
  showLabel = false,
  shape = "pill",
  className = "",
}: Props) {
  const avatarUrl = getVoiceAvatarUrl(voiceAvatarIndex);
  const rounded = shape === "rect" ? "rounded-xl" : "rounded-full";
  const padding = shape === "rect" && showLabel ? "px-3 py-2.5" : showLabel ? "pl-0.5 pr-2 py-0.5" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 ${rounded} overflow-hidden flex-shrink-0 bg-white border-2 border-black text-black transition-all hover:opacity-90 active:scale-95 ${padding} ${showLabel ? "min-w-0" : sizes[size]} ${className}`}
      title={label}
      aria-label={label}
    >
      <span className={`rounded-full overflow-hidden bg-white shrink-0 ring-2 ring-black flex items-center justify-center ${size === "xs" ? "p-0.5" : size === "sm" ? "p-1" : "p-1.5"} ${sizes[size]}`}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <span className={`${iconSizes[size]} text-black flex items-center justify-center w-full h-full`}>
            <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </span>
        )}
      </span>
      {showLabel && (
        <span className="text-[11px] font-medium text-black truncate">{label}</span>
      )}
    </button>
  );
}
