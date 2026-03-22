"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useATSResult } from "@/hooks/useATSResult";
import { ATSColorHeader, ATSParserSections, ATSScoreHero, ATSSkillsExtracted, ATSStagger, ATSTrendChart, DillyStrip } from "@/components/ats";

export default function ATSOverviewPage() {
  const router = useRouter();
  const { atsResult, atsLoading, runScan } = useATSResult();
  const [activeExplain, setActiveExplain] = useState<null | "change" | "gain">(null);

  const explainContent = useMemo(() => {
    if (!atsResult || !activeExplain) return null;
    if (activeExplain === "change") {
      const delta = atsResult.previous_score == null ? null : atsResult.score - atsResult.previous_score;
      const passed = atsResult.format_checks.passed;
      const total = atsResult.format_checks.total || 1;
      const passRate = Math.round((passed / total) * 100);
      const title = "ATS score change";
      if (delta == null) {
        return {
          title,
          body: "This is your first ATS scan, so there is no previous score to compare yet. Run another scan after edits to see exactly what changed.",
        };
      }
      if (delta > 0) {
        return {
          title,
          body: `You gained ${delta} points. The parser is recognizing more of your resume structure (${passRate}% format checks passing), and fewer blocking issues are hurting your parse confidence.`,
        };
      }
      if (delta < 0) {
        return {
          title,
          body: `You lost ${Math.abs(delta)} points. Usually this means new parser blockers were introduced: missing/unclear sections, weaker field extraction, or added critical issues that reduce ATS confidence.`,
        };
      }
      return {
        title,
        body: "Your score is flat. That usually means your latest edit did not change parser readability enough to move ATS confidence. Focus on critical issues and high-impact checklist misses.",
      };
    }
    const gain = atsResult.potential_gain;
    const hasIssues = atsResult.critical_issue_count > 0;
    const failedChecks = (atsResult.format_checks.total || 0) - (atsResult.format_checks.passed || 0);
    let example = "";
    if (hasIssues) {
      example = `You have ${atsResult.critical_issue_count} critical issue${atsResult.critical_issue_count > 1 ? "s" : ""} — fixing those alone could recover most of the +${gain} points.`;
    } else if (failedChecks > 0) {
      example = `${failedChecks} format check${failedChecks > 1 ? "s" : ""} didn't pass. Fixing section headings or layout issues is the fastest way to close this gap.`;
    } else {
      example = "Try adding missing fields (LinkedIn, GPA, certifications) or cleaning up bullet formatting to pick up the remaining points.";
    }
    return {
      title: "Potential gain",
      body: `+${gain} is the estimated upside if you resolve current issues and checklist misses. ${example}`,
      cta: hasIssues ? { label: "See issues", href: "/ats/issues" } : { label: "See quick fixes", href: "/ats/fixes" },
    };
  }, [activeExplain, atsResult]);

  if (!atsResult) {
    return (
      <ATSStagger>
        <ATSColorHeader
          eyebrow="ATS"
          title="Dilly ATS Score"
          subtitle="See exactly what recruiters' systems parse and fix the highest-impact issues first."
        />
        <div className="rounded-xl border p-4" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
          <p className="text-[13px]" style={{ color: "var(--t2)" }}>
            Run your ATS scan to unlock parser insights, checklist results, issues, and quick fixes.
          </p>
          <button
            type="button"
            onClick={() => { void runScan({ force: true }); }}
            disabled={atsLoading}
            className="mt-3 min-h-[42px] px-4 rounded-lg text-[13px] font-semibold disabled:opacity-70"
            style={{ background: "var(--blue)", color: "#fff" }}
          >
            {atsLoading ? "Scanning..." : "Run ATS scan"}
          </button>
        </div>
      </ATSStagger>
    );
  }

  return (
    <>
    <ATSStagger>
      <ATSColorHeader
        eyebrow="ATS"
        title="Dilly ATS Score"
        subtitle="Action-first ATS review with parser quality, issue impact, and vendor compatibility."
      />
      <ATSScoreHero onExplainChange={() => setActiveExplain("change")} />
      <DillyStrip text={atsResult.dilly_trend_commentary} />

      <section className="grid grid-cols-2 gap-2">
        <Link
          href="/ats/checklist"
          className="rounded-xl p-3 text-left transition-opacity hover:opacity-90 block no-underline"
          style={{ background: "var(--s2)" }}
        >
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>Format checks</p>
          <p className="text-[16px] font-semibold tabular-nums" style={{ color: "var(--t1)" }}>
            {atsResult.format_checks.passed}/{atsResult.format_checks.total}
          </p>
        </Link>
        <Link
          href="/ats/issues"
          className="rounded-xl p-3 text-left transition-opacity hover:opacity-90 block no-underline"
          style={{ background: "var(--s2)" }}
        >
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>Critical issues</p>
          <p className="text-[16px] font-semibold tabular-nums" style={{ color: "var(--t1)" }}>{atsResult.critical_issue_count}</p>
        </Link>
        <Link
          href="/ats/parser"
          className="rounded-xl p-3 text-left transition-opacity hover:opacity-90 block no-underline"
          style={{ background: "var(--s2)" }}
        >
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>Fields parsed</p>
          <p className="text-[16px] font-semibold tabular-nums" style={{ color: "var(--t1)" }}>
            {atsResult.fields_parsed.parsed}/{atsResult.fields_parsed.total}
          </p>
        </Link>
        <button
          type="button"
          onClick={() => setActiveExplain("gain")}
          className="rounded-xl p-3 text-left transition-opacity hover:opacity-90"
          style={{ background: "var(--s2)" }}
        >
          <p className="text-[10px]" style={{ color: "var(--t3)" }}>Potential gain</p>
          <p className="text-[16px] font-semibold tabular-nums" style={{ color: "var(--green)" }}>+{atsResult.potential_gain}</p>
        </button>
      </section>

      <ATSTrendChart />
      <ATSParserSections />
      <ATSSkillsExtracted />
    </ATSStagger>

    {explainContent ? (
      <div
        className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/55"
        onClick={() => setActiveExplain(null)}
      >
        <div
          className="w-full max-w-[390px] rounded-t-[20px] sm:rounded-[20px] border p-4 template-pop-in"
          style={{ background: "var(--s2)", borderColor: "var(--b1)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[14px] font-semibold" style={{ color: "var(--t1)" }}>{explainContent.title}</p>
            <button
              type="button"
              onClick={() => setActiveExplain(null)}
              aria-label="Close explanation"
              className="text-[16px] leading-none"
              style={{ color: "var(--t3)" }}
            >
              ×
            </button>
          </div>
          <p className="text-[12px] leading-5" style={{ color: "var(--t2)" }}>{explainContent.body}</p>
          {"cta" in explainContent && explainContent.cta ? (
            <button
              type="button"
              onClick={() => { setActiveExplain(null); router.push(explainContent.cta!.href); }}
              className="mt-3 w-full min-h-[38px] rounded-lg text-[12px] font-semibold"
              style={{ background: "var(--blue)", color: "#fff" }}
            >
              {explainContent.cta!.label}
            </button>
          ) : null}
        </div>
      </div>
    ) : null}
    </>
  );
}

