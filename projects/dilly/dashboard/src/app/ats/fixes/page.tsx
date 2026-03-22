"use client";

import { useState } from "react";
import { ATSColorHeader, ATSEmptyState, ATSFixCard, ATSStagger, DillyStrip } from "@/components/ats";
import { useATSResult } from "@/hooks/useATSResult";

export default function ATSFixesPage() {
  const { atsResult } = useATSResult();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  if (!atsResult) {
    return (
      <ATSStagger>
        <ATSColorHeader
          eyebrow="Fixes"
          title="Quick Fixes"
          subtitle="Copy Dilly rewrites and paste them directly into your resume."
        />
        <ATSEmptyState title="No quick fixes yet" />
      </ATSStagger>
    );
  }

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1000);
    } catch {}
  };

  return (
    <ATSStagger>
      <ATSColorHeader
        eyebrow="Fixes"
        title="Quick Fixes"
        subtitle="Copy Dilly rewrites and paste them directly into your resume."
      />
      {atsResult.quick_fixes.length ? atsResult.quick_fixes.map((fix) => (
        <div key={fix.id}>
          <ATSFixCard
            original={fix.original}
            rewritten={fix.rewritten}
            reason={fix.reason}
            onCopy={() => { void copyText(fix.id, fix.rewritten); }}
          />
          {copiedId === fix.id ? <p className="text-[11px] mt-1" style={{ color: "var(--green)" }}>Copied</p> : null}
        </div>
      )) : (
        <div className="rounded-xl border p-3 text-[12px]" style={{ background: "var(--s2)", borderColor: "var(--b1)", color: "var(--t3)" }}>
          No quick fixes available yet.
        </div>
      )}
      <DillyStrip text={atsResult.dilly_trend_commentary} />
    </ATSStagger>
  );
}

