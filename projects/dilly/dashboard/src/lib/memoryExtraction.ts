export type VoiceMessage = { role: "user" | "assistant"; content: string };

export type ExtractedMemoryItem = {
  category: string;
  label: string;
  value: string;
  confidence: "high" | "medium" | "low";
  action_type: string | null;
  action_payload: Record<string, string> | null;
};

export function parseExtractedMemoryJson(raw: string): ExtractedMemoryItem[] {
  try {
    const cleaned = raw.replace(/```json|```/gi, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? (parsed as ExtractedMemoryItem[]) : [];
  } catch {
    return [];
  }
}

