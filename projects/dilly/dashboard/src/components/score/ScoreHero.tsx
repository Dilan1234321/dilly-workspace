"use client";

import { useCountUp } from "./useCountUp";
import { GapBar } from "./GapBar";
import { heroScoreColor } from "./scoreTokens";

type Props = {
  firstName: string;
  finalScore: number;
  track: string;
  schoolShort: string;
  finalPercentile: number;
  nearestCompany: string;
  nearestCompanyBar: number;
  nearestCompanyGap: number;
  playfairClassName: string;
};

export function ScoreHero({
  firstName,
  finalScore,
  track,
  schoolShort,
  finalPercentile,
  nearestCompany,
  nearestCompanyBar,
  nearestCompanyGap,
  playfairClassName,
}: Props) {
  const animated = useCountUp(finalScore, 1000, true);
  const color = heroScoreColor(finalScore);
  const companyShort = nearestCompany.split(/\s+/)[0] || nearestCompany;

  return (
    <section className="text-center px-5 pt-5 pb-4" style={{ margin: "0 20px" }}>
      <p
        className="uppercase font-bold mb-2"
        style={{
          fontSize: 9,
          letterSpacing: "0.14em",
          color: "var(--t3)",
        }}
      >
        {firstName}&apos;s Dilly score
      </p>
      <div
        className={`tabular-nums ${playfairClassName}`}
        style={{
          fontSize: 80,
          fontWeight: 300,
          letterSpacing: "-0.06em",
          lineHeight: 1,
          color,
        }}
      >
        {animated}
      </div>
      <p className="mt-1 text-[13px]" style={{ color: "var(--t2)" }}>
        Top {finalPercentile}% {track}
        {schoolShort ? ` · ${schoolShort}` : ""}
      </p>
      <GapBar
        score={finalScore}
        scoreColor={color}
        companyBar={nearestCompanyBar}
        gapPts={nearestCompanyGap}
        companyShort={companyShort}
      />
    </section>
  );
}
