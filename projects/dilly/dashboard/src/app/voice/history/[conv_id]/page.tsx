"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppProfileHeader } from "@/components/career-center";
import { ActionItemCard } from "@/components/actions/ActionItemCard";
import { API_BASE, AUTH_TOKEN_KEY } from "@/lib/dillyUtils";
import type { ConversationOutput } from "@/types/dilly";

const TOPIC_COLORS: Record<string, string> = {
  interview_prep: "var(--indigo)",
  resume_feedback: "var(--amber)",
  job_search: "var(--green)",
  company_research: "var(--teal)",
};

const DIM_COLORS: Record<string, string> = {
  smart: "var(--blue)",
  grit: "var(--amber)",
  build: "var(--indigo)",
};

export default function VoiceHistoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const convId = typeof params?.conv_id === "string" ? params.conv_id : "";
  const [output, setOutput] = useState<ConversationOutput | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token || !convId) return;
    try {
      const res = await fetch(`${API_BASE}/voice/history/${encodeURIComponent(convId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      setOutput(await res.json());
    } finally {
      setLoading(false);
    }
  }, [convId]);

  useEffect(() => { load(); }, [load]);

  const patchAction = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    if (!token) return;
    await fetch(`${API_BASE}/actions/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  }, [load]);

  const handleToggle = useCallback((id: string, done: boolean) => {
    patchAction(id, { done, done_at: done ? new Date().toISOString() : null });
  }, [patchAction]);

  const handleActed = useCallback((id: string) => {
    patchAction(id, { acted: true });
  }, [patchAction]);

  if (loading) {
    return (
      <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
        <main className="mx-auto w-full max-w-[390px] pb-32">
          <div className="px-4"><AppProfileHeader back="/voice/history" /></div>
          <div className="px-4 py-12 text-center"><p className="text-[13px]" style={{ color: "var(--t3)" }}>Loading...</p></div>
        </main>
      </div>
    );
  }

  if (!output) {
    return (
      <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
        <main className="mx-auto w-full max-w-[390px] pb-32">
          <div className="px-4"><AppProfileHeader back="/voice/history" /></div>
          <div className="px-4 py-12 text-center"><p className="text-[13px]" style={{ color: "var(--t3)" }}>Not found.</p></div>
        </main>
      </div>
    );
  }

  const impact = output.score_impact;
  const topDim = impact?.dimension_breakdown
    ? Object.entries(impact.dimension_breakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || "grit"
    : "grit";
  const topicColor = TOPIC_COLORS[output.session_topic] || "var(--s3)";

  return (
    <div className="career-center-talent min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto w-full max-w-[390px] pb-32">
        <div className="px-4"><AppProfileHeader back="/voice/history" /></div>
        <header className="px-4 pb-3 pt-2">
          <h1 className="text-[18px] font-semibold" style={{ color: "var(--t1)" }}>{output.session_title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px]" style={{ color: "var(--t3)" }}>
              {new Date(output.generated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <span
              className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: topicColor, color: "rgba(255,255,255,0.85)" }}
            >
              {output.session_topic.replace(/_/g, " ")}
            </span>
          </div>
        </header>

        {impact && impact.total_pts > 0 && (
          <div className="mx-4 mb-4 rounded-[16px] p-3" style={{ background: "var(--gdim)" }}>
            <p className="text-[13px] font-semibold" style={{ color: DIM_COLORS[topDim] || "var(--blue)" }}>
              +{impact.total_pts} pts potential
            </p>
            {impact.qualifying_note && (
              <p className="text-[11px] mt-0.5" style={{ color: "var(--t2)" }}>{impact.qualifying_note}</p>
            )}
          </div>
        )}

        {output.action_items_created.length > 0 && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest px-4 pb-2 pt-2" style={{ color: "var(--t3)" }}>Action items</p>
            <div className="flex flex-col gap-2.5 px-4">
              {output.action_items_created.map((item) => (
                <ActionItemCard key={item.id} item={item} onToggle={handleToggle} onActed={handleActed} />
              ))}
            </div>
          </>
        )}

        {output.deadlines_created.length > 0 && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest px-4 pb-2 pt-6" style={{ color: "var(--t3)" }}>Deadlines created</p>
            <div className="flex flex-col gap-2 px-4">
              {output.deadlines_created.map((dl) => (
                <div key={dl.id} className="rounded-[14px] p-3" style={{ background: "var(--s2)" }}>
                  <p className="text-[13px] font-semibold" style={{ color: "var(--t1)" }}>{dl.label}</p>
                  <p className="text-[11px]" style={{ color: "var(--t3)" }}>{dl.date}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {output.profile_updates.length > 0 && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest px-4 pb-2 pt-6" style={{ color: "var(--t3)" }}>Profile updates</p>
            <div className="flex flex-col gap-2 px-4">
              {output.profile_updates.map((pu) => (
                <div key={pu.id} className="rounded-[14px] p-3" style={{ background: "var(--s2)" }}>
                  <p className="text-[13px] font-semibold" style={{ color: "var(--t1)" }}>{pu.field}</p>
                  <p className="text-[11px]" style={{ color: "var(--t3)" }}>
                    {pu.confirmed ? "Confirmed" : "Suggested"}: {String(pu.new_value ?? "")}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="px-4 pt-6">
          <button
            type="button"
            className="w-full rounded-[12px] py-3 text-[13px] font-semibold"
            style={{ background: "var(--s2)", color: "var(--blue)" }}
            onClick={() => router.push(`/voice?context=history&conv_id=${convId}`)}
          >
            Ask Dilly about this →
          </button>
        </div>
      </main>
    </div>
  );
}
