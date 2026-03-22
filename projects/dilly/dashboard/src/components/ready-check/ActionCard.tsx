"use client";

import type { ReadyCheckAction } from "@/types/dilly";

export function ActionCard({
  action,
  onRun,
}: {
  action: ReadyCheckAction;
  onRun: (action: ReadyCheckAction) => void;
}) {
  const border =
    action.dimension === "smart"
      ? "var(--blue)"
      : action.dimension === "grit"
        ? "var(--amber)"
        : "var(--indigo)";
  return (
    <article
      className="rounded-[16px] p-[13px] pl-[14px]"
      style={{ background: "var(--s2)", borderLeft: `2px solid ${border}` }}
    >
      <div className="flex items-start gap-3">
        <p className="text-[18px] font-light leading-none mt-0.5" style={{ color: "var(--t3)" }}>
          {action.priority}
        </p>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold truncate" style={{ color: "var(--t1)" }}>
              {action.title}
            </p>
            <span className="text-[11px] font-semibold shrink-0" style={{ color: border }}>
              +{action.estimated_pts} pts
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-5" style={{ color: "var(--t2)" }}>
            {action.description}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] px-2 py-1 rounded-full border" style={{ color: "var(--t3)", borderColor: "var(--bbdr)" }}>
              {action.effort} effort
            </span>
            <button
              type="button"
              onClick={() => onRun(action)}
              className="text-[12px] font-semibold"
              style={{ color: "var(--blue)" }}
            >
              {action.completed ? "Completed" : "Do this →"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

