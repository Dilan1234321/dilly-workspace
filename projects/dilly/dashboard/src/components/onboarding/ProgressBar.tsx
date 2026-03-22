"use client";

export function ProgressBar({ total, current }: { total: number; current: number }) {
  return (
    <div
      className="w-full flex gap-[3px] box-border"
      style={{
        height: 2.5,
        padding: "0 22px",
        marginTop: 34,
      }}
    >
      {Array.from({ length: total }, (_, i) => {
        const idx = i;
        const done = idx < current - 1;
        const active = idx === current - 1;
        return (
          <div
            key={i}
            className="flex-1 rounded-[999px] min-w-0"
            style={{
              height: 2.5,
              background: done
                ? "var(--gold)"
                : active
                  ? "rgba(201, 168, 76, 0.4)"
                  : "rgba(255, 255, 255, 0.08)",
            }}
          />
        );
      })}
    </div>
  );
}
