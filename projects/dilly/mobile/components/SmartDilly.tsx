/**
 * SmartDilly - the opinionated auto-context wrapper around DillyFace.
 *
 * Instead of every onboarding + chat surface manually passing
 * `mood` and `accessory`, SmartDilly reads the current route (and
 * optional props like `isTyping`) and picks both for you.
 *
 * Rule of thumb: if you're inside /onboarding or the chat surface,
 * use <SmartDilly />. Everywhere else, use <DillyFace /> directly
 * with an explicit mood.
 *
 * Mood mapping is narrow on purpose - a face that flips expression
 * every route feels unhinged. Most routes resolve to `idle` (same
 * as today's DillyFace) so the behavior only changes where we want
 * it to.
 */

import { usePathname } from 'expo-router';
import { DillyFace, type DillyMood, type DillyAccessory } from './DillyFace';
import { useAccent } from '../hooks/useTheme';

interface SmartDillyProps {
  size: number;
  /** Override auto-detection. */
  mood?: DillyMood;
  /** Override auto-detection. */
  accessory?: DillyAccessory;
  /** True while an assistant response is streaming. Chat surface only. */
  isTyping?: boolean;
  /** True during a long-running process where Dilly is "working." */
  isWorking?: boolean;
}

/**
 * Derive mood + accessory from the current route.
 *
 * The matching is intentionally conservative: only the screens where
 * animated Dilly explicitly improves the moment. Everywhere else
 * returns idle/none which matches the original behavior.
 */
function deriveFromRoute(path: string): { mood: DillyMood; accessory: DillyAccessory } {
  // Onboarding flows
  if (path.includes('/onboarding/choose-situation')) return { mood: 'curious',     accessory: 'none' };
  if (path.includes('/onboarding/profile-holder'))   return { mood: 'writing',     accessory: 'pencil' };
  if (path.includes('/onboarding/profile-pro'))      return { mood: 'writing',     accessory: 'pencil' };
  if (path.includes('/onboarding/profile'))          return { mood: 'writing',     accessory: 'pencil' };
  if (path.includes('/onboarding/upload'))           return { mood: 'thinking',    accessory: 'magnifier' };
  if (path.includes('/onboarding/scanning'))         return { mood: 'thinking',    accessory: 'magnifier' };
  if (path.includes('/onboarding/verify'))           return { mood: 'curious',     accessory: 'none' };
  if (path.includes('/onboarding/results'))          return { mood: 'celebrating', accessory: 'none' };
  if (path.includes('/onboarding/tutorial'))         return { mood: 'happy',       accessory: 'none' };
  if (path.includes('/onboarding/mode-switch'))      return { mood: 'curious',     accessory: 'none' };

  // Customize studio - paintbrush. Mood stays idle so the face still drifts.
  if (path.includes('/customize'))                   return { mood: 'happy',       accessory: 'paintbrush' };

  return { mood: 'idle', accessory: 'none' };
}

export function SmartDilly({ size, mood, accessory, isTyping, isWorking }: SmartDillyProps) {
  const path = usePathname() || '';
  const accent = useAccent();
  const derived = deriveFromRoute(path);

  // Explicit props always win. Then the dynamic signals (typing /
  // working). Then the route-derived defaults.
  const finalMood: DillyMood =
    mood ||
    (isTyping ? 'writing' : null) ||
    (isWorking ? 'thinking' : null) ||
    derived.mood;

  const finalAccessory: DillyAccessory =
    accessory ||
    (isTyping ? 'pencil' : null) ||
    derived.accessory;

  // Paintbrush adopts the user's chosen accent so the preview feels
  // personal. Other accessories stay brand-ink.
  const accessoryColor = finalAccessory === 'paintbrush' ? accent : undefined;

  return (
    <DillyFace
      size={size}
      mood={finalMood}
      accessory={finalAccessory}
      accessoryColor={accessoryColor}
    />
  );
}

/** Explicit wrapper for the chat typing indicator. */
export function ChatDillyWriting({ size = 40 }: { size?: number }) {
  return <DillyFace size={size} mood="writing" accessory="pencil" />;
}
