"use client";

import { ATSColorHeader, ATSEmptyState, ATSKeywordRow, ATSStagger, DillyStrip } from "@/components/ats";
import { useATSResult } from "@/hooks/useATSResult";

export default function ATSKeywordsPage() {
  const { atsResult } = useATSResult();
  if (!atsResult) {
    return (
      <ATSStagger>
        <ATSColorHeader
          eyebrow="Keywords"
          title="Keyword Match"
          subtitle="Track keyword placement and prioritize contextual usage over bare lists."
        />
        <ATSEmptyState title="No keyword insights yet" />
      </ATSStagger>
    );
  }
  return (
    <ATSStagger>
      <ATSColorHeader
        eyebrow="Keywords"
        title="Keyword Match"
        subtitle="Track keyword placement and prioritize contextual usage over bare lists."
      />
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-xl p-3" style={{ background: "var(--s2)" }}>
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>Total</p>
          <p className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--t1)" }}>{atsResult.keyword_stats.total}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: "var(--s2)" }}>
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>In context</p>
          <p className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--green)" }}>{atsResult.keyword_stats.in_context}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: "var(--s2)" }}>
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>Bare list</p>
          <p className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--amber)" }}>{atsResult.keyword_stats.bare_list}</p>
        </div>
      </section>
      <div className="rounded-xl border p-3" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
        <p className="text-[11px]" style={{ color: "var(--t3)" }}>Keyword placement score</p>
        <p className="text-[22px] font-semibold tabular-nums" style={{ color: "var(--t1)" }}>{atsResult.keyword_placement_pct}%</p>
      </div>
      {atsResult.keywords.length ? atsResult.keywords.map((kw) => (
        <ATSKeywordRow
          key={kw.keyword}
          keyword={kw.keyword}
          count={kw.count}
          inContext={kw.in_context}
          bareList={kw.bare_list}
        />
      )) : (
        <div className="rounded-xl border p-3 text-[12px]" style={{ background: "var(--s2)", borderColor: "var(--b1)", color: "var(--t3)" }}>
          No keyword stats available yet.
        </div>
      )}
      <DillyStrip text={atsResult.dilly_keyword_commentary} />
    </ATSStagger>
  );
}

