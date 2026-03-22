"use client";

import { StudentRow, StandardLeaderboardRow } from "./StudentRow";
import { LeaderboardLockOverlay } from "./LeaderboardLockOverlay";
import type { LeaderboardData } from "@/types/leaderboardPage";

type Props = {
  data: LeaderboardData;
};

export function RankingsList({ data }: Props) {
  const isFree = data.is_free_tier;
  const visible = data.entries;
  const sr = data.student_rank;
  const studentIx = visible.findIndex((e) => e.is_student);

  return (
    <div className="flex flex-col mx-5 gap-1.5" style={{ margin: "0 20px", gap: 5 }}>
      {visible.map((e, idx) => {
        const below = studentIx >= 0 && idx > studentIx;
        const belowStyle: "blur" | "dim" | "none" = below ? (isFree ? "blur" : "dim") : "none";
        if (e.is_student) {
          return <StudentRow key={`s-${e.rank}`} entry={e} studentRank={sr} ptsToNextRank={data.pts_to_next_rank} />;
        }
        return <StandardLeaderboardRow key={`r-${e.rank}`} entry={e} track={data.track} belowStyle={belowStyle} />;
      })}
      {isFree && data.locked_count > 0 ? (
        <LeaderboardLockOverlay track={data.track} lockedCount={data.locked_count} />
      ) : null}
    </div>
  );
}
