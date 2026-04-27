/**
 * siriDonations.ts - donate NSUserActivity instances to iOS so Siri
 * learns which Dilly screens the user reaches for and can suggest them
 * proactively (lock screen suggestion strip, Spotlight, Shortcuts app).
 *
 * Approach: every screen with a recurring purpose calls
 * donateActivity({ type, title, ... }) on focus. iOS uses the donation
 * frequency + recency to decide what to suggest. We don't define App
 * Intents (which would require a separate native target) - just plain
 * NSUserActivity, which expo-activity-feed wraps.
 *
 * Activity type follows reverse-DNS convention: com.dilly.app.<name>
 * matching the Info.plist NSUserActivityTypes array entries that the
 * Expo plugin auto-generates when we declare them in app.json.
 *
 * No-op when expo-spotlight or react-native-siri-shortcut is not
 * installed; donations are best-effort polish, not load-bearing.
 */

import { Platform } from 'react-native';

// Lazy-load expo-spotlight (we'd add it later) or react-native-siri-shortcut.
// For now we ship a stub that records donations to a local in-memory log
// so the flow is wired and shows up in any future native module addition.
let _Spotlight: any = null;
let _SiriShortcut: any = null;
async function loadSiri(): Promise<{ Spotlight: any; SiriShortcut: any }> {
  if (_Spotlight !== null || _SiriShortcut !== null) return { Spotlight: _Spotlight, SiriShortcut: _SiriShortcut };
  try { _Spotlight = await import('expo-spotlight'); } catch { _Spotlight = null; }
  try { _SiriShortcut = await import('react-native-siri-shortcut'); } catch { _SiriShortcut = null; }
  return { Spotlight: _Spotlight, SiriShortcut: _SiriShortcut };
}

export interface DonationActivity {
  /** Reverse-DNS unique id, e.g. "com.dilly.app.briefing". */
  type: string;
  /** Human-readable title shown by Siri/Spotlight ("Today's Dilly brief"). */
  title: string;
  /** Optional short description shown in Spotlight previews. */
  description?: string;
  /** Optional keywords to widen Spotlight matches. */
  keywords?: string[];
  /** Deep-link URL to be invoked when the user taps the suggestion. */
  url?: string;
}

/** Donate an activity to iOS so it learns the user's habits with Dilly.
 *  Safe to call repeatedly - iOS dedupes per type+id. Best called inside
 *  a useFocusEffect so each focus increases the recency signal. */
export async function donateActivity(activity: DonationActivity): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const { Spotlight, SiriShortcut } = await loadSiri();
    if (Spotlight?.donateAsync) {
      await Spotlight.donateAsync({
        userActivityType: activity.type,
        title: activity.title,
        contentDescription: activity.description,
        keywords: activity.keywords,
        url: activity.url,
      });
      return;
    }
    if (SiriShortcut?.donateShortcut) {
      await SiriShortcut.donateShortcut({
        activityType: activity.type,
        title: activity.title,
        userInfo: activity.url ? { url: activity.url } : undefined,
        keywords: activity.keywords,
        persistentIdentifier: activity.type,
        isEligibleForSearch: true,
        isEligibleForPrediction: true,
      });
      return;
    }
    // No native module loaded - ship the donation as a no-op. The call
    // sites still wire the right behavior so adding the module later
    // turns it on app-wide without further code changes.
  } catch {
    // Best-effort; never crash because of a donation.
  }
}

// ── Predefined activity descriptors ─────────────────────────────────
// Centralized so call sites read intent ("the user is on the Brief
// screen") rather than the raw NSUserActivity contract.

export const ACTIVITY_BRIEF: DonationActivity = {
  type: 'com.dilly.app.brief',
  title: "Today's Dilly brief",
  description: 'Your weekly career update from Dilly.',
  keywords: ['dilly', 'career', 'brief', 'jobs', 'update'],
  url: 'dilly:///(app)',
};

export const ACTIVITY_JOBS: DonationActivity = {
  type: 'com.dilly.app.jobs',
  title: 'Find me a job',
  description: 'Open Dilly Jobs.',
  keywords: ['dilly', 'jobs', 'internship', 'apply', 'role'],
  url: 'dilly:///(app)/jobs',
};

export const ACTIVITY_INTERVIEW_PRACTICE: DonationActivity = {
  type: 'com.dilly.app.interview-practice',
  title: 'Practice interview',
  description: 'Open Dilly interview practice.',
  keywords: ['dilly', 'interview', 'practice', 'prep', 'rehearse'],
  url: 'dilly:///(app)/interview-practice',
};

export const ACTIVITY_SKILLS: DonationActivity = {
  type: 'com.dilly.app.skills',
  title: 'What skills should I learn',
  description: 'Open the Dilly Skills library.',
  keywords: ['dilly', 'skills', 'learn', 'course', 'video'],
  url: 'dilly:///(app)/skills',
};

export const ACTIVITY_DILLY_CARD: DonationActivity = {
  type: 'com.dilly.app.card',
  title: 'Open my Dilly Card',
  description: 'Show your Dilly business card.',
  keywords: ['dilly', 'card', 'business card', 'qr', 'share'],
  url: 'dilly:///(app)/my-dilly-profile?openQr=1',
};

export const ACTIVITY_CHAPTER: DonationActivity = {
  type: 'com.dilly.app.chapter',
  title: 'Open this week\'s Chapter',
  description: 'Read your Dilly Chapter.',
  keywords: ['dilly', 'chapter', 'session', 'weekly'],
  url: 'dilly:///(app)/chapter',
};

export const ACTIVITY_AI_ARENA: DonationActivity = {
  type: 'com.dilly.app.arena',
  title: 'Open AI Arena',
  description: 'Check the AI threats and opportunities for your role.',
  keywords: ['dilly', 'ai', 'arena', 'threats', 'role'],
  url: 'dilly:///(app)/ai-arena',
};
