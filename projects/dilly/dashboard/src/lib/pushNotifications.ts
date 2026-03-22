"use client";

import { API_BASE, AUTH_TOKEN_KEY } from "@/lib/dillyUtils";

/**
 * Persist latest push token to profile.
 * Token format supports optional platform prefix:
 * - "fcm:<token>"
 * - "apns:<token>"
 */
export async function registerPushToken(pushToken: string | null): Promise<boolean> {
  const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ push_token: pushToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

