// Thin route handler for client-side save/unsave toggles.
// Proxies to FastAPI so the session cookie stays httpOnly on the server side.

import { NextResponse } from "next/server";
import { saveVideo, unsaveVideo } from "@/lib/api";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await saveVideo(id);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await unsaveVideo(id);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
