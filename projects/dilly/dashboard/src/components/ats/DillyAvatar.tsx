"use client";

import { VoiceAvatar } from "@/components/VoiceAvatarButton";

export function DillyAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-full p-[2px] inline-flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, var(--blue), var(--indigo))" }}
    >
      <div
        className="rounded-full overflow-hidden"
        style={{ width: size, height: size, background: "var(--s2)" }}
      >
        <VoiceAvatar voiceAvatarIndex={0} size={size <= 24 ? "xs" : size <= 32 ? "sm" : "md"} />
      </div>
    </div>
  );
}

