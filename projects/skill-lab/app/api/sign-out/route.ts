import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, serverSignOut } from "@/lib/api";

export async function POST(req: Request) {
  // Invalidate server-side first so the token can't be replayed after sign-out.
  await serverSignOut().catch(() => null);
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(new URL("/", origin), { status: 303 });
}
