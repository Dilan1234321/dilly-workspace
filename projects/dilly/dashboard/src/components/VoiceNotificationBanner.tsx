"use client";

import React from "react";
import { X } from "lucide-react";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import { cn } from "@/lib/utils";

type Props = {
  message: string;
  voiceAvatarIndex: number | null;
  onDismiss: () => void;
  onTap?: () => void;
  className?: string;
};

/** Simple white banner: avatar left (black outline), one-line message. For Dilly "I noted that" notifications. */
export function VoiceNotificationBanner({
  message,
  voiceAvatarIndex,
  onDismiss,
  onTap,
  className,
}: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-3 rounded-xl bg-white border border-slate-200 shadow-lg px-3 py-2.5 min-h-[48px]",
        onTap && "cursor-pointer active:opacity-90",
        className
      )}
      onClick={onTap}
    >
      <div className="flex-shrink-0 rounded-full overflow-hidden ring-2 ring-black p-0.5 w-9 h-9 flex items-center justify-center bg-white">
        <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="shrink-0" />
      </div>
      <p className="flex-1 min-w-0 text-sm text-slate-800 truncate">{message}</p>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="flex-shrink-0 p-1 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
