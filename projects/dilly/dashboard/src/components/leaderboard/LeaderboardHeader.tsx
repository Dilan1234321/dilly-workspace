"use client";

import { lbScoreColor, rankSuffix } from "./leaderboardTokens";
import type { LeaderboardData } from "@/types/leaderboardPage";

type Props = {
  data: LeaderboardData;
  showUpdated?: boolean;
  updatedOpacity?: number;
};

export function LeaderboardHeader({ data, showUpdated, updatedOpacity = 1 }: Props) {
  const r = data.student_rank;
  const suf = rankSuffix(r);
  const rankColor = lbScoreColor(data.student_score);
  const rc = data.rank_change;

  let context = "";
  if (rc < 0) {
    context = `${Math.abs(rc)} people moved past you since Monday.`;
  } else if (rc > 0) {
    context = `You moved up ${rc} spot${rc === 1 ? "" : "s"} this week.`;
  } else if (data.peer_count <= 0) {
    context =
      data.track.trim().toLowerCase() === "all cohorts"
        ? "Run an audit to join the global leaderboard."
        : "Run an audit to join your track board — scores will show here.";
  } else {
    context = `Recruiting season is live — ${data.peer_count} student${data.peer_count === 1 ? "" : "s"} on this board this week.`;
  }

  return (
    <header className="flex-shrink-0 px-5 pt-11 pb-2.5" style={{ padding: "44px 20px 10px" }}>
      <p
        className="uppercase font-bold mb-1"
        style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--t3)" }}
      >
        {data.track}
        {data.school_short ? ` · ${data.school_short}` : ""}
      </p>
      <h1 className="font-bold mb-0.5" style={{ fontSize: 18, letterSpacing: "-0.02em", color: "var(--t1)" }}>
        You&apos;re{" "}
        <span className="tabular-nums" style={{ color: rankColor }}>
          {r}
          {suf}
        </span>{" "}
        this week.
      </h1>
      <p className="text-xs leading-normal" style={{ color: "var(--t2)", lineHeight: 1.5 }}>
        {context}
      </p>
      {showUpdated ? (
        <p
          className="mt-1 text-[9px] transition-opacity duration-500"
          style={{ color: "var(--t3)", opacity: updatedOpacity }}
        >
          Updated just now
        </p>
      ) : null}
    </header>
  );
}
