"use client";

import { useRouter } from "next/navigation";
import { hapticLight } from "@/lib/haptics";
import type { JobMatchStub } from "@/types/jobsPage";

type Props = {
  lockedCount: number;
  stubs: JobMatchStub[];
};

export function JobsLockedOverlay({ lockedCount, stubs }: Props) {
  const router = useRouter();
  const blurRows =
    stubs.length >= 3
      ? stubs.slice(0, 3)
      : stubs.length > 0
        ? [...stubs, ...Array.from({ length: 3 - stubs.length }, () => stubs[stubs.length - 1])]
        : [
            { id: "s1", title: "Role title", company: "Company", readiness: "ready" as const },
            { id: "s2", title: "Role title", company: "Company", readiness: "ready" as const },
            { id: "s3", title: "Role title", company: "Company", readiness: "ready" as const },
          ];
  const preview = stubs
    .slice(0, 3)
    .map((s) => s.company)
    .filter(Boolean)
    .join(", ");
  const previewText = preview ? `${preview}${stubs.length > 3 ? "…" : ""}` : "Top firms";

  return (
    <div className="relative mt-1" style={{ minHeight: 180 }}>
      <div className="flex flex-col gap-2 pointer-events-none select-none" style={{ filter: "blur(5px)", opacity: 0.55 }}>
        {blurRows.map((s, i) => (
          <div
            key={`${s.id}-${i}`}
            className="rounded-[14px] px-3 py-3"
            style={{ background: "var(--s2)", margin: "0 20px 8px", border: "1px solid var(--b1)" }}
          >
            <p className="font-bold text-[13px]" style={{ color: "var(--t1)" }}>
              {s.title}
            </p>
            <p className="text-[11px]" style={{ color: "var(--t2)" }}>
              {s.company}
            </p>
          </div>
        ))}
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-4"
        style={{ gap: 10 }}
      >
        <p className="text-[13px] font-bold" style={{ color: "var(--t1)" }}>
          +{lockedCount} more matched jobs
        </p>
        <p className="text-[11px] max-w-[260px]" style={{ color: "var(--t2)" }}>
          {previewText}
        </p>
        <button
          type="button"
          onClick={() => {
            hapticLight();
            try {
              sessionStorage.setItem("dilly_paywall_source", "jobs_unlock");
            } catch {
              /* ignore */
            }
            router.push("/?source=jobs_unlock");
          }}
          className="border-0 font-bold text-white"
          style={{
            background: "var(--indigo)",
            borderRadius: 10,
            padding: "10px 22px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Unlock all → $9.99/mo
        </button>
      </div>
    </div>
  );
}
