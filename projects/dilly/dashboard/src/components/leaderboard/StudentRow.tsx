"use client";

import { lbScoreColor, rankSuffix } from "./leaderboardTokens";
import type { LeaderboardEntry } from "@/types/leaderboardPage";

type Props = {
  entry: LeaderboardEntry;
  studentRank: number;
  ptsToNextRank: number;
};

export function StudentRow({ entry, studentRank, ptsToNextRank }: Props) {
  const rankAbove = studentRank - 1;
  const sub =
    studentRank <= 1
      ? "You're leading this week."
      : `${ptsToNextRank} pts from ${rankAbove}${rankSuffix(rankAbove)} place`;
  const sc = entry.score;

  return (
    <div
      className="flex flex-row items-center gap-2.5 rounded-[11px] px-3 py-2.5"
      style={{
        background: "var(--adim)",
        border: "1px solid var(--abdr)",
        borderRadius: 11,
        padding: "10px 12px",
        gap: 10,
      }}
    >
      <span className="font-bold tabular-nums shrink-0 w-6 text-[11px]" style={{ color: "var(--t3)" }}>
        {entry.rank}
      </span>
      <span
        className="shrink-0 flex items-center justify-center rounded-full text-[9px]"
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--amber)",
          color: "#1a0a00",
          fontWeight: 800,
        }}
      >
        {entry.initials}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold truncate" style={{ color: "var(--t1)" }}>
          {entry.display_name}
        </p>
        <p className="text-[9px] font-bold" style={{ color: "var(--amber)" }}>
          {sub}
        </p>
      </div>
      <span className="text-sm tabular-nums shrink-0 font-semibold" style={{ color: "var(--amber)" }}>
        {sc}
      </span>
    </div>
  );
}

type StandardProps = {
  entry: LeaderboardEntry;
  track: string;
  belowStyle: "blur" | "dim" | "none";
};

export function StandardLeaderboardRow({ entry, track, belowStyle }: StandardProps) {
  const improved = (entry.score_change_this_week ?? 0) > 0;
  const delta = entry.score_change_this_week ?? 0;
  const rowBlur =
    belowStyle === "blur"
      ? { filter: "blur(1.5px)" as const, opacity: 0.45, pointerEvents: "none" as const }
      : {};
  const rowDim = belowStyle === "dim" ? { opacity: 0.55 } : {};
  const sc = entry.score;

  return (
    <div
      className="flex flex-row items-center gap-2.5 rounded-[11px] px-3 py-2.5"
      style={{
        background: "var(--s2)",
        borderRadius: 11,
        padding: "10px 12px",
        gap: 10,
        ...rowBlur,
        ...rowDim,
      }}
    >
      <span className="font-bold tabular-nums shrink-0 w-6 text-[11px]" style={{ color: "var(--t3)" }}>
        {entry.rank}
      </span>
      <span
        className="shrink-0 flex items-center justify-center rounded-full font-bold text-[9px]"
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--s3)",
          color: "var(--t2)",
        }}
      >
        {entry.initials}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold truncate" style={{ color: "var(--t1)" }}>
          {entry.display_name}
        </p>
        {improved ? (
          <p className="text-[9px]" style={{ color: "var(--green)" }}>
            ↑ +{delta} this week
            {entry.cohort_track ? (
              <span style={{ color: "var(--t3)" }}>{` · ${entry.cohort_track}`}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-[9px]" style={{ color: "var(--t3)" }}>
            {entry.cohort_track ?? track}
            {entry.year ? ` · ${entry.year}` : ""}
          </p>
        )}
      </div>
      <span className="text-sm font-light tabular-nums shrink-0" style={{ color: lbScoreColor(sc) }}>
        {sc}
      </span>
    </div>
  );
}
