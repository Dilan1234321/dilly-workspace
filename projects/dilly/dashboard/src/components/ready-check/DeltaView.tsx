"use client";

import type { ReadyCheck } from "@/types/dilly";

function fmtDelta(n: number) {
  if (n > 0) return `↑ +${n}`;
  if (n < 0) return `↓ ${n}`;
  return "→ 0";
}

function deltaColor(n: number) {
  if (n > 0) return "var(--green)";
  if (n < 0) return "var(--coral)";
  return "var(--t3)";
}

export function DeltaView({ thenCheck, nowCheck }: { thenCheck: ReadyCheck; nowCheck: ReadyCheck }) {
  const rows = [
    { label: "Smart", then: thenCheck.user_scores.smart, now: nowCheck.user_scores.smart },
    { label: "Grit", then: thenCheck.user_scores.grit, now: nowCheck.user_scores.grit },
    { label: "Build", then: thenCheck.user_scores.build, now: nowCheck.user_scores.build },
    { label: "Final", then: thenCheck.user_scores.final, now: nowCheck.user_scores.final },
  ];
  const verdictShift = `${thenCheck.verdict_label} → ${nowCheck.verdict_label}`;
  const biggest = rows.slice().sort((a, b) => (b.now - b.then) - (a.now - a.then))[0];
  return (
    <section className="mx-4 mt-4 rounded-[16px] p-3.5" style={{ background: "var(--s2)" }}>
      <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--t1)" }}>
        Since your last check
      </p>
      <div className="grid grid-cols-4 gap-y-1 text-[11px]" style={{ color: "var(--t2)" }}>
        <p>Dimension</p><p>Then</p><p>Now</p><p>Delta</p>
        {rows.map((row) => {
          const delta = row.now - row.then;
          return (
            <div key={row.label} className="contents">
              <p>{row.label}</p>
              <p>{row.then}</p>
              <p>{row.now}</p>
              <p style={{ color: deltaColor(delta) }}>{fmtDelta(delta)}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] font-semibold" style={{ color: "var(--t2)" }}>
        Verdict: {verdictShift}
      </p>
      <p className="mt-1 text-[11px]" style={{ color: "var(--t3)" }}>
        Biggest movement is {biggest.label}. Keep pressure there to shift the verdict again.
      </p>
    </section>
  );
}

