"use client";

import type { ActionItem } from "@/types/dilly";
import { ActionItemCard } from "./ActionItemCard";

export function ActionItemsList({
  items,
  onToggle,
  onActed,
}: {
  items: ActionItem[];
  onToggle: (id: string, done: boolean) => void;
  onActed?: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2.5 px-4">
      {items.map((item) => (
        <ActionItemCard key={item.id} item={item} onToggle={onToggle} onActed={onActed} />
      ))}
    </div>
  );
}
