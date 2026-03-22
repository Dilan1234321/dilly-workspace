import { callAnthropic } from "../_anthropic";

const SYSTEM_BY_TYPE: Record<string, string> = {
  score: `Generate one sentence of Dilly commentary for a student's score card.
Rules:
- One sentence only
- Maximum 80 characters
- Must reference a specific number or fact from the context
- Observational, not instructional — describe what you see, 
  don't tell them what to do (the card already has CTAs)
- No exclamation marks
- If nothing is worth noting, return NULL exactly`,
  ats: `Generate one short sentence (max 80 chars) for an ATS card strip in a resume app.
Observational only. Reference a specific number or vendor from context. No questions. No exclamation marks. If nothing notable, return NULL.`,
  applications: `One sentence, max 80 chars, about application activity from context. Observational. No questions. NULL if nothing notable.`,
  deadlines: `One sentence, max 80 chars, about deadline urgency from context. Observational. NULL if nothing notable.`,
  action_items: `One sentence, max 80 chars, about aging action items from context. Observational. NULL if nothing notable.`,
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { card_type?: string; user_prompt?: string };
    const card_type = body.card_type ?? "score";
    const user_prompt = body.user_prompt?.trim();
    if (!user_prompt) return Response.json({ strip: null });

    const system = SYSTEM_BY_TYPE[card_type] ?? SYSTEM_BY_TYPE.score;
    const raw = await callAnthropic(system, user_prompt, 50);
    if (!raw || raw.toUpperCase() === "NULL" || raw === "NULL") {
      return Response.json({ strip: null });
    }
    const strip = raw.length > 80 ? raw.slice(0, 77) + "…" : raw;
    return Response.json({ strip });
  } catch {
    return Response.json({ strip: null });
  }
}
