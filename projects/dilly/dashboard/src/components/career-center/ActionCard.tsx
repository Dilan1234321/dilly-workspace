"use client";

import type { TopActionItem } from "@/lib/dillyUtils";
import { ChevronRight } from "lucide-react";

type ActionCardProps = {
  action: TopActionItem;
  index: number;
  onClick?: () => void;
};

/** Icon cell: green (plus), amber (lock), or indigo (info/chevron) */
function ActionIcon({ type, index }: { type: TopActionItem["type"]; index: number }) {
  const config =
    type === "red_flag"
      ? { color: "var(--amber)", Icon: LockIcon }
      : type === "line_edit"
        ? { color: "var(--green)", Icon: PlusIcon }
        : { color: "var(--indigo)", Icon: index === 2 ? ChevronIcon : InfoIcon };

  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: config.color + "20" }}
    >
      <config.Icon color={config.color} />
    </div>
  );
}

function PlusIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function InfoIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ color }: { color: string }) {
  return (
    <ChevronRight size={18} style={{ color }} strokeWidth={2} />
  );
}

export function ActionCard({ action, index, onClick }: ActionCardProps) {
  const tag =
    action.type === "red_flag"
      ? "Urgent"
      : action.type === "line_edit"
        ? "High impact"
        : undefined;

  const showChevron = index === 2 && action.type !== "red_flag" && action.type !== "line_edit";

  /** Title + tag no longer share one row — tag sits under copy so 375px widths don’t truncate with ellipsis. */
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex gap-3 py-3 px-3 text-left items-start min-w-0 active:opacity-80 transition-opacity"
    >
      <ActionIcon type={action.type} index={index} />
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <p
          className="text-[13px] sm:text-[14px] font-medium leading-snug"
          style={{ color: "var(--t1)", overflowWrap: "anywhere", wordBreak: "break-word" }}
        >
          {action.title}
        </p>
        {action.detail && (
          <p
            className="text-[11px] sm:text-[12px] leading-relaxed"
            style={{ color: "var(--t3)", overflowWrap: "anywhere", wordBreak: "break-word" }}
          >
            {action.detail}
          </p>
        )}
        {tag && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider self-start mt-0.5"
            style={{
              color: action.type === "red_flag" ? "var(--amber)" : "var(--green)",
            }}
          >
            {tag}
          </span>
        )}
      </div>
      {showChevron && (
        <ChevronRight size={18} style={{ color: "var(--t3)" }} className="shrink-0 mt-0.5" aria-hidden />
      )}
    </button>
  );
}
