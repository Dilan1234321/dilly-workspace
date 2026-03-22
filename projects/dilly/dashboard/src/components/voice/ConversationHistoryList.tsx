"use client";

import { useRouter } from "next/navigation";
import type { ConversationOutput } from "@/types/dilly";

const TOPIC_COLORS: Record<string, string> = {
  interview_prep: "var(--indigo)",
  resume_feedback: "var(--amber)",
  job_search: "var(--green)",
  company_research: "var(--teal)",
};

function relativeOrAbsolute(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ConversationHistoryList({ items }: { items: ConversationOutput[] }) {
  const router = useRouter();
  if (!items.length) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-[16px] font-light" style={{ color: "var(--t1)" }}>No conversations yet.</p>
        <p className="text-[12px] mt-1" style={{ color: "var(--t2)" }}>Start a conversation with Dilly AI to see your history here.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5 px-4">
      {items.map((item) => {
        const actionCount = item.action_items_created?.length || 0;
        const topPts = item.score_impact?.total_pts || 0;
        const topDim = item.score_impact?.dimension_breakdown
          ? Object.entries(item.score_impact.dimension_breakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || ""
          : "";
        const stats = [
          actionCount > 0 ? `${actionCount} action${actionCount !== 1 ? "s" : ""}` : "",
          topPts > 0 ? `+${topPts} pts ${topDim.charAt(0).toUpperCase() + topDim.slice(1)} estimated` : "",
        ].filter(Boolean).join(" \u00b7 ");
        const topicColor = TOPIC_COLORS[item.session_topic] || "var(--s3)";
        return (
          <button
            key={item.conv_id}
            type="button"
            className="rounded-[14px] p-3 text-left w-full"
            style={{ background: "var(--s2)" }}
            onClick={() => router.push(`/voice/history/${item.conv_id}`)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px]" style={{ color: "var(--t3)" }}>{relativeOrAbsolute(item.generated_at)}</p>
                <p className="text-[13px] font-semibold leading-5 mt-0.5" style={{ color: "var(--t1)" }}>{item.session_title}</p>
                {stats && <p className="text-[11px] mt-0.5" style={{ color: "var(--t2)" }}>{stats}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0 mt-1">
                <span className="text-[12px] font-semibold" style={{ color: "var(--blue)" }}>View →</span>
                <span
                  className="text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ background: topicColor, color: "rgba(255,255,255,0.85)" }}
                >
                  {item.session_topic.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
