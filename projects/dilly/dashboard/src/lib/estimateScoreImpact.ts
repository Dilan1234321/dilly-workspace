import type { AuditV2, MemoryItem } from "@/types/dilly";

export function estimateScoreImpact(
  items: MemoryItem[],
  latestAudit: AuditV2 | null
): { pts: number; dimension: "Smart" | "Grit" | "Build" } | null {
  void latestAudit;
  let pts = 0;
  let dimension: "Smart" | "Grit" | "Build" | null = null;
  for (const item of items) {
    switch (item.action_type) {
      case "open_bullet_practice":
        pts += 6;
        dimension = "Grit";
        break;
      case "open_certifications":
        pts += 7;
        dimension = "Build";
        break;
      default:
        break;
    }
  }
  if (pts <= 0 || !dimension) return null;
  return { pts, dimension };
}

