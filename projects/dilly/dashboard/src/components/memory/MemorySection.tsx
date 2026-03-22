"use client";

import type { MemoryCategory, MemoryItem } from "@/types/dilly";
import { MemoryItemRow } from "@/components/memory/MemoryItemRow";

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  target_company: "Target Companies",
  concern: "Concerns",
  mentioned_but_not_done: "Mentioned But Not Done",
  person_to_follow_up: "People To Follow Up",
  deadline: "Upcoming Deadlines",
  achievement: "Recent Wins",
  preference: "Preferences",
  goal: "Goals",
  rejection: "Rejections",
  interview: "Interviews",
  strength: "Strengths",
  weakness: "Weaknesses",
};

const CATEGORY_ADD_LABEL: Record<MemoryCategory, string> = {
  target_company: "target company",
  concern: "concern",
  mentioned_but_not_done: "follow-up",
  person_to_follow_up: "person to follow up",
  deadline: "deadline",
  achievement: "win",
  preference: "preference",
  goal: "goal",
  rejection: "rejection",
  interview: "interview memory",
  strength: "strength",
  weakness: "weakness",
};

export function MemorySection({
  category,
  items,
  onTapAction,
  onEdit,
  onDelete,
  onAdd,
}: {
  category: MemoryCategory;
  items: MemoryItem[];
  onTapAction: (item: MemoryItem) => void;
  onEdit: (item: MemoryItem) => void;
  onDelete: (item: MemoryItem) => void;
  onAdd: (category: MemoryCategory) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="pt-4">
      <p
        className="px-5 pb-2 text-[10px] font-bold uppercase tracking-[0.12em]"
        style={{ color: "var(--t3)" }}
      >
        {CATEGORY_LABELS[category]}
      </p>
      <div className="px-4 space-y-2">
        {items.map((item) => (
          <MemoryItemRow
            key={item.id}
            item={item}
            onTapAction={onTapAction}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
        <button
          type="button"
          onClick={() => onAdd(category)}
          className="w-full rounded-[12px] px-3 py-2 text-left text-[11px] font-semibold border"
          style={{ color: "var(--t3)", borderColor: "var(--bbdr)", background: "transparent" }}
        >
          + Add {CATEGORY_ADD_LABEL[category]}
        </button>
      </div>
    </section>
  );
}

