import type { AppProfile, MemoryItem } from "@/types/dilly";

export function buildNarrativeContext(profile: AppProfile | null, items: MemoryItem[]): string {
  const rows = items.slice(0, 20).map((item) => `[${item.category}] ${item.label}: ${item.value}`);
  return [
    `Name: ${profile?.name ?? "Student"}`,
    `Track: ${profile?.track ?? "Unknown"}`,
    `Career goal: ${profile?.career_goal ?? "Unknown"}`,
    "",
    ...rows,
  ].join("\n");
}

