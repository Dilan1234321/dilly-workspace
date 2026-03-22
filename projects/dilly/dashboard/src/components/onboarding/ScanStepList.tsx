"use client";

const STEPS = [
  "Extracting your experience",
  "[track] track confirmed",
  "Measuring your Grit score",
  "Comparing to your peers",
  "Building your recommendations",
] as const;

export type ScanPhase = -1 | 0 | 1 | 2 | 3 | 4 | 5;

export function ScanStepList({ trackName, phase }: { trackName: string; phase: ScanPhase }) {
  const labels = STEPS.map((s, i) => (i === 1 ? s.replace("[track]", trackName) : s));

  return (
    <div className="w-full">
      {labels.map((label, i) => {
        const stepIdx = i;
        let status: "done" | "active" | "pending";
        if (phase > stepIdx) status = "done";
        else if (phase === stepIdx && phase >= 0) status = "active";
        else status = "pending";

        const dotBg =
          status === "done"
            ? "var(--green)"
            : status === "active"
              ? "var(--gold)"
              : "rgba(255,255,255,0.08)";
        const textColor =
          status === "done" ? "var(--t2)" : status === "active" ? "var(--t1)" : "var(--t3)";

        return (
          <div
            key={i}
            className="mb-[5px] flex gap-2 rounded-[9px] px-[10px] py-[7px] transition-colors duration-300"
            style={{
              background:
                status === "active" ? "rgba(201,168,76,0.08)" : "var(--s2)",
              border:
                status === "active" ? "1px solid rgba(201,168,76,0.15)" : "1px solid transparent",
            }}
          >
            <div
              className="mt-1.5 h-[6px] w-[6px] shrink-0 rounded-full transition-colors duration-300"
              style={{ background: dotBg }}
            />
            <p
              className="text-[11px] font-medium leading-snug transition-colors duration-300"
              style={{ color: textColor }}
            >
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
