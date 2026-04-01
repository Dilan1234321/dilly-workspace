"use client";

import { useCallback, useEffect, useState } from "react";
import { AppProfileHeader } from "@/components/career-center";
import { ActionItemsList } from "@/components/actions/ActionItemsList";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import { dilly } from "@/lib/dilly";
import type { ActionItem } from "@/types/dilly";

export function ActionsTab({ onBack }: { onBack: () => void }) {
  const [undone, setUndone] = useState<ActionItem[]>([]);
  const [completed, setCompleted] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await dilly.get<{ undone: ActionItem[]; completed: ActionItem[] }>("/actions");
      setUndone(data.undone || []);
      setCompleted(data.completed || []);
    } catch {
      // ignore load errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patchAction = useCallback(async (id: string, patch: Record<string, unknown>) => {
    await dilly.patch(`/actions/${id}`, patch);
    void load();
  }, [load]);

  const handleToggle = useCallback((id: string, done: boolean) => {
    void patchAction(id, { done, done_at: done ? new Date().toISOString() : null });
  }, [patchAction]);

  const handleActed = useCallback((id: string) => {
    void patchAction(id, { acted: true });
  }, [patchAction]);

  return (
    <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto w-full max-w-[390px] pb-32">
        <div className="px-4">
          <AppProfileHeader back={onBack} />
        </div>
        <header className="px-4 pb-3 pt-2">
          <h1 className="text-[18px] font-semibold" style={{ color: "var(--t1)" }}>Action items</h1>
          {!loading && <p className="text-[11px]" style={{ color: "var(--t3)" }}>{undone.length} to do</p>}
        </header>

        {loading && (
          <div className="px-4 py-12 text-center">
            <p className="text-[13px]" style={{ color: "var(--t3)" }}>Loading...</p>
          </div>
        )}

        {!loading && undone.length === 0 && completed.length === 0 && (
          <div className="px-4 py-12 text-center">
            <div className="flex justify-center mb-3">
              <VoiceAvatar voiceAvatarIndex={null} size="md" className="!w-14 !h-14" />
            </div>
            <p className="text-[16px] font-light" style={{ color: "var(--t1)" }}>All caught up.</p>
            <p className="text-[12px] mt-1" style={{ color: "var(--t2)" }}>
              Start a conversation with Dilly and she&apos;ll create your next actions.
            </p>
          </div>
        )}

        {undone.length > 0 && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest px-4 pb-2 pt-4" style={{ color: "var(--t3)" }}>To do</p>
            <ActionItemsList items={undone} onToggle={handleToggle} onActed={handleActed} />
          </>
        )}

        {completed.length > 0 && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest px-4 pb-2 pt-6" style={{ color: "var(--t3)" }}>Completed (last 14 days)</p>
            <ActionItemsList items={completed} onToggle={handleToggle} />
          </>
        )}
      </main>
    </div>
  );
}
