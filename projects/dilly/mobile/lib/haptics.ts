/**
 * Haptics - shared haptic feedback utilities.
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

/** Light tap - for button presses */
export function lightHaptic() {
  try { _haptics?.impactAsync?.(_haptics.ImpactFeedbackStyle?.Light); } catch {}
}

/** Medium tap - for pull-to-refresh, toggles, tab switches */
export function mediumHaptic() {
  try { _haptics?.impactAsync?.(_haptics.ImpactFeedbackStyle?.Medium); } catch {}
}

/** Heavy tap - for destructive actions, errors */
export function heavyHaptic() {
  try { _haptics?.impactAsync?.(_haptics.ImpactFeedbackStyle?.Heavy); } catch {}
}

/** Success notification - for completed actions, score animations */
export function successHaptic() {
  try { _haptics?.notificationAsync?.(_haptics.NotificationFeedbackType?.Success); } catch {}
}

/** Warning notification - for alerts, validation errors */
export function warningHaptic() {
  try { _haptics?.notificationAsync?.(_haptics.NotificationFeedbackType?.Warning); } catch {}
}

/** Selection tick - for picker changes, scroll snaps */
export function selectionHaptic() {
  try { _haptics?.selectionAsync?.(); } catch {}
}

// ── Higher-level patterns ───────────────────────────────────────────
// Patterns chained from the primitives above. They map to specific
// product moments so the call site reads as intent ("a job match
// arrived") rather than physics ("medium impact then warning"). Match
// the intensity to the significance of the action.

/** Single quick tick - for the readiness score updating in place. */
export function readinessTickHaptic() {
  lightHaptic();
}

/** Apple Watch ring-close pattern - escalating taps + success bell.
 *  For finishing a Skills path, completing onboarding, hitting a
 *  milestone. Stretched over ~500ms so the moment feels earned. */
export function celebrationHaptic() {
  try {
    lightHaptic();
    setTimeout(() => mediumHaptic(), 110);
    setTimeout(() => heavyHaptic(), 230);
    setTimeout(() => successHaptic(), 380);
  } catch {}
}

/** Subtle two-tap for "a new job match just arrived" - noticeable but
 *  not interruptive. */
export function newMatchHaptic() {
  try {
    lightHaptic();
    setTimeout(() => lightHaptic(), 90);
  } catch {}
}

/** Pulsing pattern intended to be called on a setInterval while a
 *  long-running generation (resume, audit, prep deck) is running.
 *  Caller is responsible for stopping the interval on completion. */
export function generationPulseHaptic() {
  selectionHaptic();
}

/** Soft confirmation tap for "shared" actions - airdrop sent, copied,
 *  email sent. Reads as "done" without being heavy. */
export function shareSentHaptic() {
  try {
    selectionHaptic();
    setTimeout(() => lightHaptic(), 60);
  } catch {}
}
