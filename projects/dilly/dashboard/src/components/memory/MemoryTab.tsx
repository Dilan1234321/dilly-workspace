"use client";

import { useEffect, useState } from "react";
import { AppProfileHeader } from "@/components/career-center";
import { AddMemorySheet } from "@/components/memory/AddMemorySheet";
import { MemoryPanel } from "@/components/memory/MemoryPanel";
import { dilly } from "@/lib/dilly";
import type { MemoryCategory, MemoryItem } from "@/types/dilly";

type MemoryResponse = {
  narrative: string | null;
  narrative_updated_at: string | null;
  narrative_updated_relative?: string;
  items: MemoryItem[];
};

export function MemoryTab({
  onBack,
  onNavigate,
}: {
  onBack: () => void;
  /** Called when a memory item action requires navigating to another tab. */
  onNavigate?: (tab: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeUpdated, setNarrativeUpdated] = useState("recently");
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetCategory, setSheetCategory] = useState<MemoryCategory>("goal");
  const [editingItem, setEditingItem] = useState<MemoryItem | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await dilly.get<MemoryResponse>("/memory");
      setNarrative(data.narrative ?? null);
      setNarrativeUpdated(data.narrative_updated_relative || "recently");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      // ignore load errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = (category: MemoryCategory) => {
    setEditingItem(null);
    setSheetCategory(category);
    setSheetOpen(true);
  };

  const openEdit = (item: MemoryItem) => {
    setEditingItem(item);
    setSheetCategory(item.category);
    setSheetOpen(true);
  };

  const submitSheet = async ({ label, value }: { label: string; value: string }) => {
    if (editingItem) {
      try {
        const data = await dilly.patch<{ item: MemoryItem }>(`/memory/items/${editingItem.id}`, { label, value });
        const row = data?.item as MemoryItem;
        setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
      } catch {
        // ignore patch errors
      }
    } else {
      try {
        const data = await dilly.post<{ item: MemoryItem }>("/memory/items", { category: sheetCategory, label, value });
        const row = data?.item as MemoryItem;
        setItems((prev) => [row, ...prev]);
      } catch {
        // ignore post errors
      }
    }
    setSheetOpen(false);
  };

  const deleteItem = async (item: MemoryItem) => {
    try {
      const res = await dilly.fetch(`/memory/items/${item.id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }
    } catch {
      // ignore delete errors
    }
  };

  const handleTapAction = (item: MemoryItem) => {
    if (!onNavigate) return;
    if (item.category === "target_company") {
      onNavigate(`ready_check:${item.value || item.label}`);
      return;
    }
    if (item.category === "concern") { onNavigate("resources"); return; }
    if (item.category === "deadline") { onNavigate("calendar"); return; }
    if (item.category === "weakness") { onNavigate("voice"); return; }
    if (item.category === "mentioned_but_not_done") {
      switch (item.action_type) {
        case "open_certifications": onNavigate("certifications"); break;
        case "open_bullet_practice": onNavigate("voice"); break;
        default: onNavigate("voice");
      }
    }
  };

  return (
    <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="w-full max-w-[390px] mx-auto pb-36 min-w-0">
        <div className="px-4">
          <AppProfileHeader back={onBack} />
        </div>
        <header className="px-5 pt-2 pb-1 text-center">
          <h1 className="text-[15px] font-semibold" style={{ color: "var(--t1)" }}>
            What Dilly knows
          </h1>
        </header>
        {loading ? (
          <div className="px-5 mt-4 text-[13px]" style={{ color: "var(--t3)" }}>
            Loading your memory...
          </div>
        ) : (
          <MemoryPanel
            narrative={narrative}
            narrativeUpdated={narrativeUpdated}
            items={items}
            onAddCategory={openAdd}
            onTapAction={handleTapAction}
            onEditItem={openEdit}
            onDeleteItem={deleteItem}
          />
        )}
      </main>
      <AddMemorySheet
        key={`${sheetOpen ? "open" : "closed"}:${editingItem?.id ?? `new-${sheetCategory}`}`}
        open={sheetOpen}
        title={editingItem ? "Edit memory item" : "Add memory item"}
        initialLabel={editingItem?.label ?? ""}
        initialValue={editingItem?.value ?? ""}
        onCancel={() => setSheetOpen(false)}
        onSave={submitSheet}
      />
    </div>
  );
}
