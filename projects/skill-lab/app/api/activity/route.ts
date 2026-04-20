import { NextResponse } from "next/server";
import { bumpStreak, setLastWatched } from "@/lib/session-state";

/**
 * Client-fired beacon when a video page mounts. Server components can't
 * mutate cookies, so the streak bump and last-watched cookie live here.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const videoId = typeof body?.videoId === "string" ? body.videoId : "";
  const cohort = typeof body?.cohort === "string" ? body.cohort : "";
  if (!videoId || !cohort) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const streak = await bumpStreak();
  await setLastWatched({
    id: videoId,
    cohort,
    at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true, streak });
}
