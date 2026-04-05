"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppProfileHeader } from "@/components/career-center";
import { AddMemorySheet } from "@/components/memory/AddMemorySheet";
import { MemoryPanel } from "@/components/memory/MemoryPanel";
import { getCareerCenterReturnPath } from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import type { MemoryCategory, MemoryItem } from "@/types/dilly";

type MemoryResponse = {
  narrative: string | null;
  narrative_updated_at: string | null;
  narrative_updated_relative?: string;
  items: MemoryItem[];
};

function goForMemoryAction(router: ReturnType<typeof useRouter>, item: MemoryItem) {
  if (item.category === "target_company") {
    const company = encodeURIComponent(item.value || item.label);
    router.push(`/ready-check/new?company=${company}`);
    return;
  }
  if (item.category === "concern") {
    router.push("/?tab=resources");
    return;
  }
  if (item.category === "person_to_follow_up") {
    router.push("/templates");
    return;
  }
  if (item.category === "deadline") {
    router.push("/?tab=center&view=calendar");
    return;
  }
  if (item.category === "weakness") {
    router.push("/?tab=voice");
    return;
  }
  if (item.category === "mentioned_but_not_done") {
    switch (item.action_type) {
      case "open_certifications":
        router.push("/certifications");
        break;
      case "open_bullet_practice":
        router.push("/?tab=voice&prompt=bullet_practice");
        break;
      default:
        router.push("/?tab=voice");
    }
  }
}

export default function MemoryPage() {
  const router = useRouter();
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
      // ignore errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
     
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
    try {
      if (editingItem) {
        const data = await dilly.patch<{ item: MemoryItem }>(`/memory/items/${editingItem.id}`, { label, value });
        const row = data?.item as MemoryItem;
        setItems((prev) => prev.map((x) => (x.id === row.id ? row : x)));
      } else {
        const data = await dilly.post<{ item: MemoryItem }>("/memory/items", { category: sheetCategory, label, value });
        const row = data?.item as MemoryItem;
        setItems((prev) => [row, ...prev]);
      }
    } catch {
      // ignore errors
    }
    setSheetOpen(false);
  };

  const deleteItem = async (item: MemoryItem) => {
    try {
      await dilly.delete(`/memory/items/${item.id}`);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch {
      // ignore errors
    }
  };

  return (
    <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="w-full max-w-[390px] mx-auto pb-36 min-w-0">
        <div className="px-4">
          <AppProfileHeader back={getCareerCenterReturnPath()} />
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
            onTapAction={(item) => goForMemoryAction(router, item)}
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
