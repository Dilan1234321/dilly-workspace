"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { heroScoreColor } from "./scoreTokens";
import type { ScorePageData } from "@/types/scorePage";

type Props = { data: ScorePageData };

export function PeerPreview({ data }: Props) {
  const router = useRouter();
  const rows = data.peer_preview;
  const final = data.final_score;
  const sc = heroScoreColor(final);

  const onLock = () => {
    try {
      sessionStorage.setItem("dilly_paywall_source", "leaderboard_tease");
    } catch {
      /* ignore */
    }
    router.push("/");
  };

  return (
    <section className="rounded-[14px] px-3.5 py-3 mx-5" style={{ background: "var(--s2)", margin: "0 20px 14px" }}>
      <p className="uppercase font-bold mb-0.5" style={{ fontSize: 9, color: "var(--t3)" }}>
        vs your {data.track} peers
      </p>
      <p className="text-[9px] mb-2.5" style={{ color: "var(--t3)" }}>
        {data.peer_count} {data.track} students at {data.school_short || "your school"}
      </p>
      <div>
        {rows.map((r, idx) => {
          const studentIx = rows.findIndex((x) => x.is_student);
          const blur = studentIx >= 0 && idx > studentIx && idx <= studentIx + 2;
          const rowStyle = blur ? { filter: "blur(1.5px)", opacity: 0.45 } : undefined;
          if (r.is_student) {
            return (
              <div
                key={`${r.rank}-stu`}
                className="flex items-center gap-2 py-1.5 rounded-lg px-1.5 mb-0.5"
                style={{
                  background: "var(--adim)",
                  border: "1px solid var(--abdr)",
                  ...rowStyle,
                }}
              >
                <span className="font-bold tabular-nums w-5 shrink-0 text-[11px]" style={{ color: "var(--t3)" }}>
                  {r.rank}
                </span>
                <span
                  className="shrink-0 flex items-center justify-center rounded-full font-bold text-[9px]"
                  style={{
                    width: 22,
                    height: 22,
                    background: "var(--amber)",
                    color: "#1a0a00",
                  }}
                >
                  {r.initials}
                </span>
                <span className="flex-1 min-w-0 text-[11px] font-semibold truncate" style={{ color: "var(--t1)" }}>
                  You
                </span>
                <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: sc }}>
                  {r.score}
                </span>
              </div>
            );
          }
          return (
            <div
              key={`${r.rank}-${r.initials}`}
              className="flex items-center gap-2 py-1.5 border-b"
              style={{ borderColor: "var(--b1)", ...rowStyle }}
            >
              <span className="font-bold tabular-nums w-5 shrink-0 text-[11px]" style={{ color: "var(--t3)" }}>
                {r.rank}
              </span>
              <span
                className="shrink-0 flex items-center justify-center rounded-full font-bold text-[9px]"
                style={{
                  width: 22,
                  height: 22,
                  background: "var(--s3)",
                  color: "var(--t1)",
                }}
              >
                {r.initials}
              </span>
              <span className="flex-1 min-w-0 text-[11px] font-semibold truncate" style={{ color: "var(--t1)" }}>
                Peer
              </span>
              <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: sc }}>
                {r.score}
              </span>
            </div>
          );
        })}
      </div>
      {data.is_free_tier ? (
        <button
          type="button"
          onClick={onLock}
          className="mt-2 flex items-center justify-center gap-2 w-full py-2 rounded-lg border-0 bg-transparent"
        >
          <Lock className="w-4 h-4 shrink-0" style={{ color: "var(--indigo)" }} aria-hidden />
          <span className="text-[11px] font-semibold" style={{ color: "var(--indigo)" }}>
            See all {data.peer_count} peers →
          </span>
        </button>
      ) : (
        <Link
          href={`/leaderboard?track=${encodeURIComponent(data.track)}`}
          className="mt-2 flex items-center justify-center gap-2 w-full py-2 rounded-lg"
          style={{ color: "var(--indigo)" }}
        >
          <span className="text-[11px] font-semibold">See full leaderboard →</span>
        </Link>
      )}
    </section>
  );
}
