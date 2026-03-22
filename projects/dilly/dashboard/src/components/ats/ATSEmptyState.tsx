"use client";

import { useATSResult } from "@/hooks/useATSResult";

export function ATSEmptyState({ title = "No ATS scan yet" }: { title?: string }) {
  const { atsLoading, runScan } = useATSResult();
  return (
    <section className="rounded-xl border p-4" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
      <h3 className="text-[14px] font-semibold" style={{ color: "var(--t1)" }}>{title}</h3>
      <p className="text-[12px] mt-1.5" style={{ color: "var(--t2)" }}>
        Run your ATS scan first to unlock this screen.
      </p>
      <button
        type="button"
        onClick={() => { void runScan({ force: true }); }}
        disabled={atsLoading}
        className="mt-3 min-h-[40px] px-3 rounded-lg text-[12px] font-semibold disabled:opacity-70"
        style={{ background: "var(--blue)", color: "#fff" }}
      >
        {atsLoading ? "Scanning..." : "Run ATS scan"}
      </button>
    </section>
  );
}

