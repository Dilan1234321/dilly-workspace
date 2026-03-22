"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { MemoryCategory, MemoryItem } from "@/types/dilly";
import { MemoryNarrativeBlock } from "@/components/memory/MemoryNarrativeBlock";
import { MemorySection } from "@/components/memory/MemorySection";

const ORDER: MemoryCategory[] = [
  "target_company",
  "mentioned_but_not_done",
  "concern",
  "person_to_follow_up",
  "deadline",
  "achievement",
  "goal",
  "strength",
  "weakness",
  "interview",
  "rejection",
  "preference",
];

export function MemoryPanel({
  narrative,
  narrativeUpdated,
  items,
  onAddCategory,
  onTapAction,
  onEditItem,
  onDeleteItem,
}: {
  narrative: string | null;
  narrativeUpdated: string;
  items: MemoryItem[];
  onAddCategory: (category: MemoryCategory) => void;
  onTapAction: (item: MemoryItem) => void;
  onEditItem: (item: MemoryItem) => void;
  onDeleteItem: (item: MemoryItem) => void;
}) {
  const router = useRouter();
  const grouped = useMemo(() => {
    const out: Partial<Record<MemoryCategory, MemoryItem[]>> = {};
    for (const item of items) {
      const key = item.category as MemoryCategory;
      if (!out[key]) out[key] = [];
      out[key]?.push(item);
    }
    return out;
  }, [items]);

  if (items.length === 0) {
    return (
      <section className="px-6 pt-20 text-center">
        <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center border" style={{ borderColor: "var(--bbdr)", background: "var(--s2)" }}>
          <span style={{ color: "var(--t1)" }}>D</span>
        </div>
        <p className="mt-4 text-[14px]" style={{ color: "var(--t2)" }}>
          Start a conversation with Dilly and she&apos;ll start building your career story.
        </p>
        <button
          type="button"
          onClick={() => router.push("/?tab=voice")}
          className="mt-4 rounded-[12px] px-4 py-2 text-[13px] font-semibold"
          style={{ background: "var(--blue)", color: "#fff" }}
        >
          Talk to Dilly →
        </button>
      </section>
    );
  }

  return (
    <>
      <MemoryNarrativeBlock narrative={narrative} updatedLabel={narrativeUpdated} count={items.length} />
      {ORDER.map((category) => (
        <MemorySection
          key={category}
          category={category}
          items={grouped[category] ?? []}
          onTapAction={onTapAction}
          onEdit={onEditItem}
          onDelete={onDeleteItem}
          onAdd={onAddCategory}
        />
      ))}
      <div className="h-24" />
    </>
  );
}

