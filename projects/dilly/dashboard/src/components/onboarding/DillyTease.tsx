"use client";

import { DillyAvatar } from "@/components/ats/DillyAvatar";
import type { DimensionKey } from "@/types/dilly";

function dimWord(k: DimensionKey) {
  return k === "smart" ? "Smart" : k === "grit" ? "Grit" : "Build";
}

export function DillyTease({ weakKey, weakScore }: { weakKey: DimensionKey; weakScore: number }) {
  const d = dimWord(weakKey);
  return (
    <div
      className="mb-[14px] flex gap-2 rounded-[11px] border px-[11px] py-[9px]"
      style={{
        background: "var(--s2)",
        borderColor: "var(--bbdr)",
      }}
    >
      <div className="shrink-0 pt-0.5">
        <DillyAvatar size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="mb-0.5 text-[8px] font-bold uppercase tracking-[0.07em]"
          style={{ color: "var(--blue)" }}
        >
          DILLY
        </p>
        <p
          className="text-[10px] leading-[1.55] select-none"
          style={{
            color: "var(--t2)",
            filter: "blur(1.8px)",
          }}
        >
          I know exactly what&apos;s keeping your {d} at {Math.round(weakScore)} — and it&apos;s a 10-minute fix on two
          bullets.
        </p>
        <p className="mt-0.5 text-[9px]" style={{ color: "var(--t3)" }}>
          🔒 Unlock Dilly to hear this
        </p>
      </div>
    </div>
  );
}
