"use client";

import Link from "next/link";
import type { ScorePageData } from "@/types/scorePage";

type Props = {
  data: ScorePageData;
};

export function ScoreInsight({ data }: Props) {
  const barS = data.dimension_bar_smart ?? data.nearest_company_bar;
  const barG = data.dimension_bar_grit ?? data.nearest_company_bar;
  const barB = data.dimension_bar_build ?? data.nearest_company_bar;
  const below =
    data.final_score < 80 || data.smart < barS || data.grit < barG || data.build < barB;
  const wk = data.weakest_dimension;
  const gapAmt = Math.max(0, data.nearest_company_gap);

  if (below) {
    return (
      <section className="mx-5 mb-3.5 rounded-[14px] px-3.5 py-3" style={{ background: "var(--s2)", margin: "0 20px 14px" }}>
        <p className="uppercase font-bold mb-1.5" style={{ fontSize: 9, color: "var(--amber)" }}>
          What&apos;s holding you back
        </p>
        <p className="text-[13px] mb-2 leading-relaxed" style={{ color: "var(--t1)", lineHeight: 1.6, marginBottom: 8 }}>
          {data.gap_insight}
        </p>
        <Link
          href={`/voice?context=score_gap&dimension=${encodeURIComponent(wk)}&gap=${encodeURIComponent(String(gapAmt))}`}
          className="block w-full text-center font-bold rounded-[10px] py-2.5 px-3.5 text-xs"
          style={{
            background: "var(--adim)",
            border: "1px solid var(--abdr)",
            color: "var(--amber)",
          }}
        >
          Fix these with Dilly →
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-5 mb-3.5 rounded-[14px] px-3.5 py-3" style={{ background: "var(--s2)", margin: "0 20px 14px" }}>
      <p className="uppercase font-bold mb-1.5" style={{ fontSize: 9, color: "var(--green)" }}>
        You&apos;re above the bar
      </p>
      <p className="text-[13px] mb-2 leading-relaxed" style={{ color: "var(--t1)", lineHeight: 1.6, marginBottom: 8 }}>
        You&apos;re competitive at {data.nearest_company}. Dilly says apply this week.
      </p>
      <Link
        href="/?tab=resources&view=jobs"
        className="block w-full text-center font-bold rounded-[10px] py-2.5 px-3.5 text-xs"
        style={{
          background: "var(--gdim)",
          border: "1px solid var(--gbdr)",
          color: "var(--green)",
        }}
      >
        See matched jobs →
      </Link>
    </section>
  );
}
