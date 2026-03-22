"use client";

import { useCallback, useEffect, useState } from "react";
import { AppProfileHeader } from "@/components/career-center";
import { ConversationHistoryList } from "@/components/voice/ConversationHistoryList";
import { API_BASE, AUTH_TOKEN_KEY } from "@/lib/dillyUtils";
import type { ConversationOutput } from "@/types/dilly";

export function VoiceHistoryTab({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ConversationOutput[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) return;
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (q) params.set("search", q);
      const res = await fetch(`${API_BASE}/voice/history?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(search); }, [load, search]);

  return (
    <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto w-full max-w-[390px] pb-32">
        <div className="px-4">
          <AppProfileHeader back={onBack} />
        </div>
        <header className="px-4 pb-3 pt-2">
          <h1 className="text-[18px] font-semibold" style={{ color: "var(--t1)" }}>Conversation history</h1>
        </header>
        <div className="px-4 pb-3">
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[12px] px-3 py-2.5 text-[13px]"
            style={{ background: "var(--s2)", color: "var(--t1)", border: "none", outline: "none" }}
          />
        </div>
        {loading ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[13px]" style={{ color: "var(--t3)" }}>Loading...</p>
          </div>
        ) : (
          <ConversationHistoryList items={items} />
        )}
      </main>
    </div>
  );
}
