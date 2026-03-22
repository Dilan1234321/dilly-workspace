"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useATSResult } from "@/hooks/useATSResult";

const TABS = [
  { href: "/ats/overview", key: "overview", label: "Overview" },
  { href: "/ats/parser", key: "parser", label: "Parser" },
  { href: "/ats/checklist", key: "checklist", label: "Checklist" },
  { href: "/ats/issues", key: "issues", label: "Issues" },
  { href: "/ats/fixes", key: "fixes", label: "Fixes" },
  { href: "/ats/keywords", key: "keywords", label: "Keywords" },
  { href: "/ats/vendors", key: "vendors", label: "Vendors" },
] as const;

export function ATSTabs() {
  const pathname = usePathname();
  const { atsResult } = useATSResult();
  return (
    <div className="w-full min-w-0 max-w-full mb-3">
      <div className="rounded-xl p-2 border" style={{ backgroundColor: "var(--s2)", borderColor: "var(--b1)" }}>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            const suffix =
              tab.key === "issues" && atsResult ? ` (${atsResult.issues.length})` :
              tab.key === "fixes" && atsResult?.quick_fixes?.length ? ` (${atsResult.quick_fixes.length})` : "";
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className="min-h-[40px] px-3 rounded-[10px] text-xs font-semibold whitespace-nowrap transition-colors inline-flex items-center justify-center"
                style={{
                  background: active ? "var(--blue)" : "var(--s3)",
                  color: active ? "#fff" : "var(--t2)",
                }}
              >
                {tab.label}{suffix}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

