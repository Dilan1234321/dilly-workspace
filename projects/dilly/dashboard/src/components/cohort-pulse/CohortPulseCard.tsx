"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dilly } from "@/lib/dilly";
import type { CohortPulse, UserCohortPulse } from "@/types/dilly";

type PulseWithCohort = UserCohortPulse & { cohort: CohortPulse };

function accentForDimension(dim: "smart" | "grit" | "build"): string {
  if (dim === "grit") return "var(--amber)";
  if (dim === "build") return "var(--indigo)";
  return "var(--blue)";
}

export function CohortPulseCard({ pulse, onHidden }: { pulse: PulseWithCohort; onHidden?: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement | null>(null);
  const [hidden, setHidden] = useState(false);
  const [seenSent, setSeenSent] = useState<boolean>(!!pulse.seen);
  const accent = accentForDimension(pulse.cohort.top_improvement_dimension);
  const trackLabel = (pulse.cohort.track || "your track").toUpperCase();
  const gap = Math.max(0, pulse.user_percentile - 25);

  const userRow = (() => {
    if (pulse.user_score_change > 2) {
      return {
        text: `+${Math.round(pulse.user_score_change)} pts this week`,
        color: "var(--green)",
      };
    }
    if (pulse.user_score_change < -1) {
      return {
        text: `${Math.round(pulse.user_score_change)} pts this week`,
        color: "var(--coral)",
      };
    }
    const dim = pulse.cohort.top_improvement_dimension;
    const dimScore =
      dim === "grit" ? pulse.user_grit : dim === "build" ? pulse.user_build : pulse.user_smart;
    return {
      text: `Flat at ${Math.round(dimScore)} ${dim[0].toUpperCase()}${dim.slice(1)} · 7 days`,
      color: "var(--t2)",
    };
  })();

  const patchSeen = useCallback(async () => {
    if (seenSent) return;
    try {
      await dilly.patch(`/cohort-pulse/${pulse.id}/seen`, {});
      setSeenSent(true);
    } catch {
      // ignore seen errors; card remains functional
    }
  }, [pulse.id, seenSent]);

  const patchActed = useCallback(async () => {
    try {
      await dilly.patch(`/cohort-pulse/${pulse.id}/acted`, {});
    } catch {
      // ignore acted errors
    }
  }, [pulse.id]);

  useEffect(() => {
    if (!ref.current || seenSent) return;
    let visibleTimer: number | null = null;
    const node = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((e) => e.isIntersecting);
        if (!isVisible) {
          if (visibleTimer) window.clearTimeout(visibleTimer);
          visibleTimer = null;
          return;
        }
        if (!visibleTimer) {
          visibleTimer = window.setTimeout(() => {
            void patchSeen();
          }, 2000);
        }
      },
      { threshold: 0.6 }
    );
    obs.observe(node);
    return () => {
      if (visibleTimer) window.clearTimeout(visibleTimer);
      obs.disconnect();
    };
  }, [patchSeen, seenSent]);

  if (hidden) return null;

  return (
    <div ref={ref} className="mb-4 overflow-hidden rounded-[20px]" style={{ background: "var(--s2)", margin: "0 16px" }}>
      <div className="relative flex h-8 items-center px-3" style={{ background: accent }}>
        <span className="text-[8px] font-extrabold uppercase tracking-[0.12em]" style={{ color: "rgba(0,0,0,0.55)" }}>
          THIS WEEK IN {trackLabel}
        </span>
        <button
          type="button"
          aria-label="Dismiss cohort pulse"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs leading-none"
          style={{ color: "var(--t3)" }}
          onClick={async () => {
            await patchSeen();
            setHidden(true);
            onHidden?.();
          }}
        >
          ×
        </button>
      </div>

      <div className="p-[14px]">
        <p className="text-[14px] font-semibold" style={{ color: "var(--t1)" }}>
          {pulse.cohort.headline}
        </p>
        <p className="mt-1 text-[12px]" style={{ color: "var(--t2)" }}>
          Average gain: <span style={{ color: accent, fontWeight: 700 }}>{pulse.cohort.top_improvement_avg_pts >= 0 ? "+" : ""}{Math.round(pulse.cohort.top_improvement_avg_pts)} pts</span>{" "}
          this week
        </p>
        <p className="mt-1 text-[12px] font-normal" style={{ color: "var(--t2)" }}>
          Most common fix: <span style={{ color: "var(--t1)", fontWeight: 600 }}>{pulse.cohort.top_improvement_pattern}</span>
        </p>

        <div className="my-[10px]" style={{ borderTop: "1px solid var(--b1)" }} />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-10 text-[10px] font-semibold uppercase" style={{ color: "var(--t3)" }}>You</span>
            <span className="text-[12px]" style={{ color: userRow.color }}>{userRow.text}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 text-[10px] font-semibold uppercase" style={{ color: "var(--t3)" }}>Gap</span>
            <span className="text-[12px]" style={{ color: pulse.user_percentile <= 25 ? "var(--green)" : "var(--t2)" }}>
              {pulse.user_percentile <= 25 ? "Top 25% · keep it" : `${gap} pts to Top 25%`}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="mt-3 w-full rounded-[12px] px-4 py-3 text-[13px] font-bold"
          style={{ background: accent, color: "rgba(0,0,0,0.75)" }}
          onClick={async () => {
            await patchActed();
            const route = pulse.cta_payload?.route || "/?tab=hiring&view=upload";
            router.push(route);
          }}
        >
          {pulse.cta_label}
        </button>
      </div>
    </div>
  );
}
