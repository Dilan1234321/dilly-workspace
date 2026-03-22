/**
 * Sound effects using Web Audio API. No external files needed.
 * Respects user preference from localStorage dilly_sound_enabled.
 */

const SOUND_ENABLED_KEY = "dilly_sound_enabled";

export function isSoundEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const v = localStorage.getItem(SOUND_ENABLED_KEY);
    if (v === "0" || v === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.15): void {
  if (!isSoundEnabled()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    /* ignore */
  }
}

export function playSound(id: "audit_done" | "message_sent" | "badge_unlock" | "celebration"): void {
  switch (id) {
    case "audit_done":
      playTone(880, 0.15, "sine", 0.12);
      setTimeout(() => playTone(1100, 0.12, "sine", 0.1), 80);
      break;
    case "message_sent":
      playTone(600, 0.08, "sine", 0.08);
      break;
    case "badge_unlock":
      playTone(784, 0.12, "sine", 0.1);
      setTimeout(() => playTone(1047, 0.15, "sine", 0.1), 100);
      break;
    case "celebration":
      playTone(523, 0.1, "sine", 0.12);
      setTimeout(() => playTone(659, 0.1, "sine", 0.1), 80);
      setTimeout(() => playTone(784, 0.1, "sine", 0.1), 160);
      setTimeout(() => playTone(1047, 0.2, "sine", 0.12), 240);
      break;
    default:
      break;
  }
}
