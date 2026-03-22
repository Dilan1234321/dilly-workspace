"use client";

import { DillyAvatar } from "./DillyAvatar";

export function DillyStrip({ text }: { text: string }) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5 flex items-start gap-2.5"
      style={{ background: "var(--s2)", borderColor: "var(--b1)" }}
    >
      <DillyAvatar size={24} />
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--t2)" }}>{text}</p>
    </div>
  );
}

