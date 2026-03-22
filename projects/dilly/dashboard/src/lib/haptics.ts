/**
 * Haptic feedback for Dilly. Uses Capacitor Haptics in the native app (App Store / Play Store)
 * and falls back to the Vibration API on web (e.g. Android Chrome). No-op when unsupported.
 * Respects the same "sound effects" setting so feedback can be turned off with sound.
 */

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isSoundEnabled } from "@/lib/sounds";

function shouldTrigger(): boolean {
  if (typeof window === "undefined") return false;
  return isSoundEnabled();
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Light tap — tab change, selection, toggle, picker. */
export function hapticLight(): void {
  if (!shouldTrigger()) return;
  if (isNative()) {
    void Haptics.impact({ style: ImpactStyle.Light });
    return;
  }
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
  } catch {
    /* ignore */
  }
}

/** Medium tap — primary button, submit, meaningful action. */
export function hapticMedium(): void {
  if (!shouldTrigger()) return;
  if (isNative()) {
    void Haptics.impact({ style: ImpactStyle.Medium });
    return;
  }
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(25);
    }
  } catch {
    /* ignore */
  }
}

/** Success — save, copy, share success, audit complete. */
export function hapticSuccess(): void {
  if (!shouldTrigger()) return;
  if (isNative()) {
    void Haptics.notification({ type: NotificationType.Success });
    return;
  }
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([15, 50, 15]);
    }
  } catch {
    /* ignore */
  }
}
