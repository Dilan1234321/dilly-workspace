import type { CardStripContext, CardStripType } from "./types";

export async function generateCardStrip(
  card_type: CardStripType,
  _uid: string,
  context: CardStripContext,
): Promise<string | null> {
  const user_prompt = JSON.stringify(context, null, 0);
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("/api/dilly-presence/card-strip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card_type, user_prompt }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = (await res.json()) as { strip?: string | null };
    const strip = data.strip?.trim();
    if (!strip || strip.toUpperCase() === "NULL") return null;
    return strip;
  } catch {
    return null;
  }
}
