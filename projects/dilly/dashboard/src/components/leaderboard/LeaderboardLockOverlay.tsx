"use client";

import { useRouter } from "next/navigation";
import { hapticLight } from "@/lib/haptics";

type Props = { track: string; lockedCount: number };

export function LeaderboardLockOverlay({ track, lockedCount }: Props) {
  const router = useRouter();
  const total = lockedCount + 5;

  return (
    <div
      className="flex flex-col items-center gap-2.5 rounded-xl mt-1"
      style={{ background: "rgba(8,8,9,0.9)", padding: 16, gap: 10 }}
    >
      <p className="text-[13px] font-bold text-center px-1" style={{ color: "var(--t1)" }}>
        {track.trim().toLowerCase() === "all cohorts"
          ? `See all ${total} students across cohorts`
          : `See all ${total} ${track} students`}
      </p>
      <button
        type="button"
        onClick={() => {
          hapticLight();
          try {
            sessionStorage.setItem("dilly_paywall_source", "leaderboard_unlock");
          } catch {
            /* ignore */
          }
          router.push("/?source=leaderboard_unlock");
        }}
        className="border-0 w-full max-w-[280px] font-bold text-white"
        style={{
          background: "var(--indigo)",
          borderRadius: 10,
          padding: "9px 20px",
          fontSize: 12,
        }}
      >
        Unlock Dilly → $9.99/mo
      </button>
    </div>
  );
}
