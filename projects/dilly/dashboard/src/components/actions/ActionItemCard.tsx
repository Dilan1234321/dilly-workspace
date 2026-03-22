"use client";

import { useRouter } from "next/navigation";
import type { ActionItem } from "@/types/dilly";
import { ActionItemCheckbox } from "./ActionItemCheckbox";

const DIM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  smart: { bg: "var(--bdim)", text: "var(--blue)", border: "var(--bbdr)" },
  grit: { bg: "var(--adim)", text: "var(--amber)", border: "var(--abdr)" },
  build: { bg: "var(--idim)", text: "var(--indigo)", border: "var(--ibdr)" },
};

const EFFORT_COLORS: Record<string, string> = {
  low: "var(--green)",
  medium: "var(--amber)",
  high: "var(--coral)",
};

const CTA_LABELS: Record<string, string> = {
  open_bullet_practice: "Fix with Dilly \u2192",
  open_certifications: "Learn more \u2192",
  open_templates: "Open templates \u2192",
  open_ats: "Fix ATS \u2192",
  open_am_i_ready: "Check readiness \u2192",
  open_interview_prep: "Practice \u2192",
};

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ActionItemCard({
  item,
  onToggle,
  onActed,
}: {
  item: ActionItem;
  onToggle: (id: string, done: boolean) => void;
  onActed?: (id: string) => void;
}) {
  const router = useRouter();
  const dim = item.dimension || "grit";
  const colors = DIM_COLORS[dim] || DIM_COLORS.grit;
  const effortColor = EFFORT_COLORS[item.effort] || "var(--t3)";
  const ctaLabel = (item.action_type && CTA_LABELS[item.action_type]) || "Take action \u2192";
  const route = item.action_payload?.route || "/actions";

  return (
    <div
      className="rounded-[14px] p-3 flex gap-3"
      style={{
        background: "var(--s2)",
        opacity: item.done ? 0.45 : 1,
        transition: "opacity 0.3s",
      }}
    >
      <ActionItemCheckbox
        done={item.done}
        onToggle={() => onToggle(item.id, !item.done)}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-5" style={{ color: "var(--t1)" }}>
          {item.text}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {item.estimated_pts != null && item.estimated_pts > 0 && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
            >
              +{Math.round(item.estimated_pts)} pts {dim.charAt(0).toUpperCase() + dim.slice(1)}
            </span>
          )}
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
            style={{ color: effortColor }}
          >
            {item.effort.charAt(0).toUpperCase() + item.effort.slice(1)} effort
          </span>
          {item.done && item.done_at && (
            <span className="text-[11px]" style={{ color: "var(--t3)", marginLeft: "auto" }}>
              {relativeDate(item.done_at)}
            </span>
          )}
        </div>
        {!item.done && (
          <button
            type="button"
            className="mt-2 text-[12px] font-semibold"
            style={{ color: "var(--blue)" }}
            onClick={() => {
              onActed?.(item.id);
              router.push(route);
            }}
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
