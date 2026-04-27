/**
 * dilly-activity — wraps the iOS Live Activity for Chapter sessions.
 *
 * The Live Activity widget UI lives in the widget extension
 * (mobile/targets/dilly-widget/DillyWidget.swift). This package is the
 * main-app side that spawns + updates + ends the activity via
 * ActivityKit. iOS 16.2+ only; lower-OS / Android / web no-op silently.
 *
 * Typical Chapter flow:
 *   await DillyActivity.startChapter(id, "Chapter 4 · Apr 27", 6);
 *   await DillyActivity.updateChapter(id, 2, "Surface");
 *   await DillyActivity.updateChapter(id, 3, "Synthesis");
 *   ...
 *   await DillyActivity.endChapter(id);
 */
import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

let _native: any = null;
function _mod(): any {
  if (Platform.OS !== 'ios') return null;
  if (_native) return _native;
  try {
    _native = requireNativeModule('DillyActivity');
    return _native;
  } catch {
    return null;
  }
}

export async function startChapter(
  chapterId: string,
  chapterTitle: string,
  totalScreens: number,
): Promise<string | null> {
  const m = _mod();
  if (!m?.startChapter) return null;
  try {
    return (await m.startChapter(chapterId, chapterTitle, totalScreens)) || null;
  } catch {
    return null;
  }
}

export async function updateChapter(
  chapterId: string,
  currentScreen: number,
  screenLabel: string,
): Promise<boolean> {
  const m = _mod();
  if (!m?.updateChapter) return false;
  try {
    return !!(await m.updateChapter(chapterId, currentScreen, screenLabel));
  } catch {
    return false;
  }
}

export async function endChapter(chapterId: string): Promise<boolean> {
  const m = _mod();
  if (!m?.endChapter) return false;
  try {
    return !!(await m.endChapter(chapterId));
  } catch {
    return false;
  }
}

export function areLiveActivitiesEnabled(): boolean {
  const m = _mod();
  if (!m?.areLiveActivitiesEnabled) return false;
  try {
    return !!m.areLiveActivitiesEnabled();
  } catch {
    return false;
  }
}

export default { startChapter, updateChapter, endChapter, areLiveActivitiesEnabled };
