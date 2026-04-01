"use client";

import { dilly } from "@/lib/dilly";

/**
 * Persist latest push token to profile.
 * Token format supports optional platform prefix:
 * - "fcm:<token>"
 * - "apns:<token>"
 */
export async function registerPushToken(pushToken: string | null): Promise<boolean> {
  try {
    const res = await dilly.fetch("/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ push_token: pushToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

