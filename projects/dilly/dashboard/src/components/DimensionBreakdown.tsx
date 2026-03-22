"use client";

import { useState } from "react";
import type { AuditV2, DimensionKey } from "@/types/dilly";
import { DIMENSIONS, LOW_SCORE_THRESHOLD, findingForDimension } from "@/lib/dillyUtils";
import { Button } from "@/components/ui/button";
import { CopiedIcon } from "@/components/ui/animated-state-icons";

type Props = {
  audit: AuditV2;
  selectedDimension: DimensionKey;
};

function CopyableEvidence({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="relative group">
      <blockquote className="pl-4 border-l-2 text-slate-300 text-sm leading-relaxed italic pr-10" style={{ borderColor: "var(--ut-border)" }}>
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 not-italic block mb-1">Cited From Your Resume</span>
        &ldquo;{text}&rdquo;
      </blockquote>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={copy}
        title="Copy snippet"
        className="absolute top-0 right-0 opacity-70 hover:opacity-100"
      >
        <CopiedIcon size={14} state={copied} color="currentColor" />
      </Button>
    </div>
  );
}

export function DimensionBreakdown({ audit, selectedDimension }: Props) {
  const score = audit.scores?.[selectedDimension] ?? 0;
  const label = DIMENSIONS.find((d) => d.key === selectedDimension)?.label ?? selectedDimension;
  const evidenceQuote = audit.evidence_quotes?.[selectedDimension]?.trim() || null;
  const evidence = audit.evidence[selectedDimension]?.trim() || null;
  const findingText = findingForDimension(audit, selectedDimension);
  const recsForDim = audit.recommendations?.filter((r) => (r.score_target ?? "").toLowerCase() === selectedDimension) ?? [];
  const track = (audit.detected_track || "your field").trim();
  const isLow = score < LOW_SCORE_THRESHOLD;

  if (isLow) {
    return (
      <div className="space-y-4 text-sm">
        <p className="font-semibold text-slate-200">
          Your {label} score is {score.toFixed(0)}. That&apos;s below where we want it for {track}.
        </p>
        {findingText && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest mb-1 text-slate-500">Why It&apos;s Low</p>
            <p className="text-slate-300 leading-relaxed">{findingText}</p>
          </div>
        )}
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest mb-1 text-slate-500">What You&apos;re Doing Right</p>
          {(evidenceQuote || evidence) ? (
            <>
              <p className="text-slate-300 leading-relaxed mb-2">You do have some signal we picked up. We want to build on that.</p>
              <CopyableEvidence text={evidenceQuote || evidence || ""} />
            </>
          ) : (
            <p className="text-slate-300 leading-relaxed">
              You have a foundation. Your experience and education give us something to work with. The recommendations below will show you exactly how to turn that into a stronger {label} story.
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest mb-1 text-slate-500">How to Improve</p>
          {recsForDim.length > 0 ? (
            <ul className="list-disc list-inside space-y-1.5 text-slate-300 leading-relaxed">
              {recsForDim.slice(0, 3).map((r, i) => (
                <li key={i}>
                  <span className="font-medium text-slate-200">{r.title}</span>
                  {r.action && ` - ${r.action}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-300 leading-relaxed">
              See <strong>Strategic Recommendations</strong> below for concrete steps to raise your {label} score. Focus on adding quantifiable impact, clear outcomes, and evidence that matches what {track} recruiters look for.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="font-semibold text-slate-200">
        Your {label} score: {score.toFixed(0)}
        {score >= 65 && (
          <span className="block text-xs font-normal text-slate-400 mt-1">Strong signal for {track}.</span>
        )}
      </p>
      {(evidenceQuote || evidence) ? (
        <>
          <p className="text-slate-400 text-xs">What from your resume drove this score:</p>
          <CopyableEvidence text={evidenceQuote || evidence || ""} />
        </>
      ) : (
        <p className="text-slate-300 leading-relaxed">Here&apos;s what from your resume drove this score.</p>
      )}
    </div>
  );
}
