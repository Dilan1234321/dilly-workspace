/**
 * Haptics — shared haptic feedback utilities.
 * Lazy-loads expo-haptics to prevent crash if not linked.
 *
 * Usage:
 *   import { lightHaptic, mediumHaptic, successHaptic } from '../lib/haptics';
 *   lightHaptic();  // button taps
 *   mediumHaptic(); // pull-to-refresh, toggle switches
 *   successHaptic(); // score animations, completed actions
 */

let _haptics: any = null;
try { _haptics = require('expo-haptics'); } catch {}

/** Light tap — for button presses */
export function lightHaptic() {
  try { _haptics?.impactAsync?.(_haptics.ImpactFeedbackStyle?.Light); } catch {}
}

/** Medium tap — for pull-to-refresh, toggles, tab switches */
export function mediumHaptic() {
  try { _haptics?.impactAsync?.(_haptics.ImpactFeedbackStyle?.Medium); } catch {}
}

/** Heavy tap — for destructive actions, errors */
export function heavyHaptic() {
  try { _haptics?.impactAsync?.(_haptics.ImpactFeedbackStyle?.Heavy); } catch {}
}

/** Success notification — for completed actions, score animations */
export function successHaptic() {
  try { _haptics?.notificationAsync?.(_haptics.NotificationFeedbackType?.Success); } catch {}
}

/** Warning notification — for alerts, validation errors */
export function warningHaptic() {
  try { _haptics?.notificationAsync?.(_haptics.NotificationFeedbackType?.Warning); } catch {}
}

/** Selection tick — for picker changes, scroll snaps */
export function selectionHaptic() {
  try { _haptics?.selectionAsync?.(); } catch {}
}
