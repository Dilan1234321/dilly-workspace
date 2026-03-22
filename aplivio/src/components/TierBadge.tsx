import type { ListTier } from "@/types/college";
import { cn } from "@/lib/cn";

const styles: Record<ListTier, string> = {
  reach: "bg-red-500/15 text-red-300 border-red-500/30",
  match: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  safety: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
};

export function TierBadge({ tier, label }: { tier: ListTier; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
        styles[tier],
      )}
    >
      {label ?? tier}
    </span>
  );
}
