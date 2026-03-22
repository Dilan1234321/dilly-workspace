"use client";

import Link from "next/link";
import { rankSuffix } from "./leaderboardTokens";
import type { LeaderboardData } from "@/types/leaderboardPage";

type Props = { data: LeaderboardData };

export function MoveUpCard({ data }: Props) {
  const r = data.student_rank;
  const pts = data.pts_to_next_rank;
  const above = r - 1;
  const goldman = data.goldman_application_days ?? 14;
  let headline = "";
  if (r <= 1) {
    headline = `You're at the top. Goldman applications open in ${goldman} days.`;
  } else if (r <= 3) {
    headline = `You're in the top 3. ${pts} pts from ${above}${rankSuffix(above)} place.`;
  } else {
    headline = `${pts} pts from ${above}${rankSuffix(above)} place.`;
  }

  const wk = (data.weakest_dimension || "grit").toLowerCase();
  const voiceHref = `/voice?context=leaderboard&target_rank=${encodeURIComponent(String(above))}&gap=${encodeURIComponent(String(pts))}&weakest_dim=${encodeURIComponent(wk)}&track=${encodeURIComponent(data.track)}`;

  return (
    <section className="mx-5 mb-3 rounded-[14px] px-3.5 py-3" style={{ margin: "10px 20px 12px", background: "var(--s2)", borderRadius: 14, padding: "13px 14px" }}>
      <p className="font-bold mb-1" style={{ fontSize: 12, color: "var(--t1)", marginBottom: 4 }}>
        {headline}
      </p>
      <p className="mb-2.5 leading-snug" style={{ fontSize: 11, color: "var(--t2)", lineHeight: 1.55, marginBottom: 10 }}>
        {data.move_up_insight}
      </p>
      {r > 1 ? (
        <Link
          href={voiceHref}
          className="flex items-center justify-center w-full font-bold border-0 text-center min-h-[44px]"
          style={{
            background: "var(--gold)",
            borderRadius: 10,
            padding: 10,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--goldText)",
          }}
        >
          Move up with Dilly →
        </Link>
      ) : null}
    </section>
  );
}
