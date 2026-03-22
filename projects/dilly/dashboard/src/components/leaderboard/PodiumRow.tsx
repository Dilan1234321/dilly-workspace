"use client";

import { lbScoreColor } from "./leaderboardTokens";
import type { LeaderboardPodiumSlot } from "@/types/leaderboardPage";

const MEDAL: Record<number, { label: string; border: string; emoji: string }> = {
  1: { label: "1st", border: "rgba(255,215,0,0.4)", emoji: "🥇" },
  2: { label: "2nd", border: "rgba(192,192,192,0.4)", emoji: "🥈" },
  3: { label: "3rd", border: "rgba(205,127,50,0.4)", emoji: "🥉" },
};

type Props = { slots: LeaderboardPodiumSlot[]; studentFirstName: string };

export function PodiumRow({ slots, studentFirstName }: Props) {
  const top = slots.slice(0, 3);
  while (top.length < 3) {
    top.push({
      rank: top.length + 1,
      initials: "—",
      display_name: "—",
      score: 0,
      is_student: false,
      medal: top.length + 1,
    });
  }

  return (
    <div className="flex flex-row gap-1.5 mx-5 mb-2.5" style={{ margin: "12px 20px 10px", gap: 6 }}>
      {top.map((slot) => {
        const m = MEDAL[slot.medal] ?? MEDAL[1];
        const sc = slot.score;
        const scoreCol = sc >= 80 ? "var(--green)" : "var(--amber)";
        const student = slot.is_student;
        const bg = student ? "var(--adim)" : "var(--s2)";
        const name = student ? (studentFirstName || slot.display_name) : slot.display_name;

        return (
          <div
            key={slot.rank}
            className="flex-1 text-center rounded-xl px-2 py-2.5"
            style={{
              background: bg,
              borderRadius: 12,
              padding: "10px 8px",
              ...(student
                ? {
                    border: "1px solid var(--abdr)",
                    boxShadow: `inset 0 2px 0 0 ${lbScoreColor(sc)}`,
                  }
                : { borderTop: `2px solid ${m.border}` }),
            }}
          >
            <p className="font-bold mb-1" style={{ fontSize: 9, color: m.border, marginBottom: 4 }}>
              {m.emoji} {m.label}
            </p>
            <p className="font-bold truncate" style={{ fontSize: 11, color: "var(--t1)" }}>
              {name}
            </p>
            {slot.cohort_track ? (
              <p
                className="truncate font-semibold uppercase tracking-wide mt-0.5"
                style={{ fontSize: 8, letterSpacing: "0.06em", color: "var(--t3)" }}
              >
                {slot.cohort_track}
              </p>
            ) : null}
            <p className="font-light tabular-nums mt-0.5" style={{ fontSize: 16, color: scoreCol }}>
              {slot.score}
            </p>
          </div>
        );
      })}
    </div>
  );
}
