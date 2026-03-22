"use client";

import type { ReadyCheck } from "@/types/dilly";

const COLOR: Record<ReadyCheck["verdict"], string> = {
  ready: "var(--green)",
  almost: "var(--teal)",
  stretch: "var(--amber)",
  not_yet: "var(--coral)",
};

export function VerdictHeader({ check }: { check: ReadyCheck }) {
  return (
    <header
      className="h-16 px-4 flex flex-col items-start justify-center"
      style={{ background: COLOR[check.verdict] }}
    >
      <p className="text-[22px] font-extrabold leading-none" style={{ color: "rgba(0,0,0,0.75)" }}>
        {check.verdict_label || check.verdict}
      </p>
      <p className="text-[12px] font-semibold mt-1" style={{ color: "rgba(0,0,0,0.5)" }}>
        {check.company}
      </p>
    </header>
  );
}

