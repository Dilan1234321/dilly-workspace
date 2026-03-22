"use client";

import { DillyAvatar } from "@/components/ats/DillyAvatar";

type Props = { text: string };

export function JobDillyStrip({ text }: Props) {
  return (
    <div
      className="flex flex-row gap-2 items-start border-t"
      style={{
        margin: "8px -14px -11px -14px",
        background: "var(--s3)",
        borderTop: "1px solid var(--b1)",
        padding: "9px 12px",
        gap: 8,
      }}
    >
      <DillyAvatar size={16} />
      <p className="flex-1 min-w-0" style={{ fontSize: 10, color: "var(--t2)", lineHeight: 1.55 }}>
        {text}
      </p>
    </div>
  );
}
