"use client";

import { VoiceAvatar } from "@/components/VoiceAvatarButton";

export function TimelineNote({ note }: { note: string }) {
  return (
    <section className="mx-4 mt-3 rounded-[16px] p-3.5" style={{ background: "var(--s2)" }}>
      <div className="flex items-start gap-2.5">
        <VoiceAvatar voiceAvatarIndex={null} size="sm" />
        <p className="text-[12px] leading-5" style={{ color: "var(--t2)" }}>
          {note}
        </p>
      </div>
    </section>
  );
}

