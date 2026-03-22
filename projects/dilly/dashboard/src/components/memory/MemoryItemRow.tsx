"use client";

import { useRef } from "react";
import type { MemoryItem } from "@/types/dilly";

export function memoryActionLabel(item: MemoryItem): string | null {
  switch (item.category) {
    case "target_company":
      return "Am I Ready? →";
    case "mentioned_but_not_done":
      return "Fix it →";
    case "concern":
      return "Practice →";
    case "person_to_follow_up":
      return "Templates →";
    case "deadline":
      return "Calendar →";
    case "weakness":
      return "Work on it →";
    default:
      return null;
  }
}

export function MemoryItemRow({
  item,
  onTapAction,
  onEdit,
  onDelete,
}: {
  item: MemoryItem;
  onTapAction: (item: MemoryItem) => void;
  onEdit: (item: MemoryItem) => void;
  onDelete: (item: MemoryItem) => void;
}) {
  const longPressRef = useRef<number | null>(null);
  const actionText = memoryActionLabel(item);
  const subtitle =
    item.category === "person_to_follow_up" || item.category === "deadline" ? item.value : "";

  const beginLongPress = () => {
    if (longPressRef.current != null) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => {
      const ok = window.confirm(`Delete "${item.label}" from memory?`);
      if (ok) onDelete(item);
    }, 480);
  };
  const endLongPress = () => {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  return (
    <div
      className="rounded-[14px] px-3.5 py-3 flex items-center gap-3 border"
      style={{ background: "var(--s2)", borderColor: "var(--bbdr)" }}
      onContextMenu={(e) => {
        e.preventDefault();
        const ok = window.confirm(`Delete "${item.label}" from memory?`);
        if (ok) onDelete(item);
      }}
      onTouchStart={beginLongPress}
      onTouchEnd={endLongPress}
      onTouchCancel={endLongPress}
    >
      <button
        type="button"
        onClick={() => onEdit(item)}
        className="min-w-0 flex-1 text-left"
        aria-label={`Edit ${item.label}`}
      >
        <div className="flex items-center gap-1.5">
          {item.confidence === "low" ? (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "var(--amber)" }}
              aria-hidden
            />
          ) : null}
          <p className="text-[13px] font-semibold truncate" style={{ color: "var(--t1)" }}>
            {item.label}
          </p>
        </div>
        {subtitle ? (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--t3)" }}>
            {subtitle}
          </p>
        ) : null}
      </button>
      {actionText ? (
        <button
          type="button"
          onClick={() => onTapAction(item)}
          className="text-[12px] font-semibold shrink-0"
          style={{ color: "var(--blue)" }}
        >
          {actionText}
        </button>
      ) : null}
    </div>
  );
}

