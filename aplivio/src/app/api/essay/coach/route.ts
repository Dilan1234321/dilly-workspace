import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = { draft?: string };

export async function POST(req: Request) {
  const { draft } = (await req.json()) as Body;
  if (!draft || draft.trim().length < 40) {
    return NextResponse.json({ message: "Draft too short (min ~40 characters)." }, { status: 400 });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({
      message:
        "Set OPENAI_API_KEY in .env.local to enable AI coaching. Rubric scoring still works client-side.",
      bullets: [],
    });
  }

  const prompt = `You are an experienced college admissions essay coach. The student pasted a personal statement draft. Give 4–6 concise, actionable bullets: what to strengthen, what to cut, and how to show reflection without clichés. Do not rewrite the essay. Draft:\n\n${draft.slice(0, 12000)}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: "Output bullets only. No preamble. Each bullet one line starting with '- '." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ message: `OpenAI error: ${err}` }, { status: 502 });
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  const bullets = text
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);

  return NextResponse.json({ bullets });
}
