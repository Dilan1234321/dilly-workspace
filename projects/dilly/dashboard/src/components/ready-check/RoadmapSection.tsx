"use client";

import type { ReadyCheckAction } from "@/types/dilly";
import { ActionCard } from "@/components/ready-check/ActionCard";

export function RoadmapSection({
  actions,
  onRunAction,
}: {
  actions: ReadyCheckAction[];
  onRunAction: (action: ReadyCheckAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <section className="px-4 mt-4">
      <p className="text-[12px] font-semibold mb-2" style={{ color: "var(--t1)" }}>
        Your roadmap to ready
      </p>
      <div className="space-y-2">
        {actions.map((action) => (
          <ActionCard key={action.id} action={action} onRun={onRunAction} />
        ))}
      </div>
    </section>
  );
}

