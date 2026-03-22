"use client";

import Link from "next/link";
import type { WeeklyEvent } from "@/types/leaderboardPage";

const DOT: Record<WeeklyEvent["dot_color"], string> = {
  green: "var(--green)",
  amber: "var(--amber)",
  blue: "var(--blue)",
};

type Props = { track: string; events: WeeklyEvent[] };

export function WeeklyFeed({ track, events }: Props) {
  const sparse = events.length < 3;

  return (
    <section className="mx-5 mb-3.5 rounded-[14px] px-3.5 py-3" style={{ margin: "0 20px 14px", background: "var(--s2)", borderRadius: 14, padding: "13px 14px" }}>
      <h2
        className="font-cinzel font-semibold mb-2.5 leading-[1.15]"
        style={{
          fontSize: 26,
          color: "var(--gold)",
          letterSpacing: "0.03em",
          marginBottom: 10,
        }}
      >
        This week in {track}
      </h2>
      {sparse ? (
        <div className="space-y-3">
          <p className="text-[12px] leading-snug" style={{ color: "var(--t2)", lineHeight: 1.55 }}>
            Few moves logged yet—perfect time to jump the board. Your rank uses your latest audit that matches{" "}
            <span style={{ color: "var(--t1)", fontWeight: 600 }}>{track}</span>. Add a project or role, then run Dilly
            again; a few points often means several spots when the pool is small.
          </p>
          <Link
            href="/?tab=upload"
            className="flex min-h-[44px] w-full items-center justify-center rounded-xl text-sm font-semibold font-cinzel transition-opacity active:opacity-90"
            style={{ background: "var(--gold)", color: "var(--goldText)" }}
          >
            Run a new audit
          </Link>
        </div>
      ) : (
        <ul className="list-none p-0 m-0">
          {events.map((ev, i) => (
            <li
              key={i}
              className="flex flex-row items-center gap-2 py-1.5"
              style={{
                padding: "6px 0",
                borderBottom: i < events.length - 1 ? "1px solid var(--b1)" : "none",
              }}
            >
              <span
                className="shrink-0 rounded-full"
                style={{ width: 6, height: 6, borderRadius: "50%", background: DOT[ev.dot_color] }}
              />
              <p
                className="text-[11px] flex-1 min-w-0 leading-snug"
                style={{
                  color: ev.is_student ? "var(--t1)" : "var(--t2)",
                  lineHeight: 1.5,
                  fontWeight: ev.is_student ? 600 : 400,
                }}
              >
                {ev.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
