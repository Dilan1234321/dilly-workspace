"use client";

import { Check } from "lucide-react";

export function MicroWin({ firstName, visible }: { firstName: string; visible: boolean }) {
  return (
    <div
      className="overflow-hidden transition-[max-height] duration-300 ease-out"
      style={{ maxHeight: visible ? 40 : 0, opacity: visible ? 1 : 0 }}
    >
      <div className="flex items-center gap-2 pt-1">
        <div
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--green)" }}
        >
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </div>
        <p className="text-[11px] leading-snug" style={{ color: "var(--t2)" }}>
          Perfect, {firstName}. You&apos;re in the right place.
        </p>
      </div>
    </div>
  );
}
