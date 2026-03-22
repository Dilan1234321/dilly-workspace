"use client";

import { DillyAvatar } from "@/components/ats/DillyAvatar";

const DISMISS_KEY = "dilly_notification_prompt_dismissed_at";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldShowNotificationPrePrompt(): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted" || Notification.permission === "denied") return false;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return true;
    const t = parseInt(raw, 10);
    if (Number.isNaN(t)) return true;
    return Date.now() - t > SEVEN_DAYS_MS;
  } catch {
    return true;
  }
}

export function NotificationPrePrompt({ onClose }: { onClose: () => void }) {
  const ok = () => {
    void Notification.requestPermission();
    onClose();
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-5"
      style={{ background: "rgba(10,10,11,0.92)" }}
    >
      <div
        className="w-full max-w-[280px] rounded-[20px] px-6 py-6"
        style={{ background: "var(--s2)" }}
      >
        <div className="mb-[14px] flex justify-center">
          <DillyAvatar size={32} />
        </div>
        <p className="mb-2 text-center text-[16px] font-bold" style={{ color: "var(--t1)" }}>
          Stay on top of your score
        </p>
        <p className="mb-5 text-center text-[12px] leading-[1.6]" style={{ color: "var(--t2)" }}>
          When your score changes or a deadline is close, Dilly will tell you. One message a day, max. Never spam.
        </p>
        <button
          type="button"
          className="mb-3 w-full rounded-[13px] py-[13px] text-[13px] font-bold"
          style={{ background: "var(--gold)", color: "#1a1400" }}
          onClick={ok}
        >
          OK, notify me
        </button>
        <button
          type="button"
          className="w-full text-center text-[11px] font-medium"
          style={{ color: "var(--t3)" }}
          onClick={dismiss}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
