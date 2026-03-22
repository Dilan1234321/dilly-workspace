export type DillyCelebrationId = "streak_7" | "first_audit" | "first_application";

type ToastFn = (message: string, type?: "success" | "error" | "info", duration?: number) => void;

const storageKey = (id: DillyCelebrationId) => `dilly_celebration_shown_${id}`;

const COPY: Record<DillyCelebrationId, string> = {
  streak_7: "7-day streak — you're building a real habit.",
  first_audit: "First resume audit done — your baseline is on the board.",
  first_application: "First application logged — momentum counts.",
};

/** One-time celebration toast per id (per device). */
export function tryFireMicroCelebration(id: DillyCelebrationId, toast: ToastFn): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(storageKey(id))) return;
    localStorage.setItem(storageKey(id), "1");
  } catch {
    return;
  }
  toast(COPY[id], "success", 4200);
}
