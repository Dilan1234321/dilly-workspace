import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizeProfile } from "@/lib/profileJson";
import { getCollegeById, getMatchResult } from "@/lib/match";
import { buildSchoolAnalysis } from "@/lib/schoolAnalysis";

export const runtime = "nodejs";

const COOKIE = "aplivio_session";

const bodySchema = z.object({ collegeId: z.string().min(1).max(64) }).strict();

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (!sid) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const session = await prisma.session.findUnique({ where: { id: sid } });
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const college = getCollegeById(parsed.data.collegeId);
  if (!college) {
    return NextResponse.json({ error: "Unknown school" }, { status: 404 });
  }

  const profile = normalizeProfile(session.profile);
  const match = getMatchResult(profile, college);
  const base = buildSchoolAnalysis(profile, college, match);

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ actionPlan: base.actionPlanFallback, source: "rules" as const });
  }

  const prompt = `You are a concise college admissions coach. Student applies to ${college.name}. Estimated tier: ${match.tier}. Strengths (bullets): ${base.strengths.map((s) => s.label + ": " + s.detail).join("; ")}. Gaps: ${base.areasToStrengthen.join("; ")}. Intended major: ${profile.intendedMajor}. Write ONE short paragraph (3–5 sentences) action plan: essay angle + one concrete next step for this school. No markdown, no bullet points.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: "Be specific and practical. No cliché openers." },
          { role: "user", content: prompt },
        ],
        temperature: 0.45,
        max_tokens: 400,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({
        actionPlan: base.actionPlanFallback,
        source: "rules" as const,
        note: `Model unavailable: ${err.slice(0, 120)}`,
      });
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      return NextResponse.json({ actionPlan: base.actionPlanFallback, source: "rules" as const });
    }

    return NextResponse.json({ actionPlan: text, source: "ai" as const });
  } catch {
    return NextResponse.json({ actionPlan: base.actionPlanFallback, source: "rules" as const });
  }
}
