/**
 * widgetContent.ts - computes the content for each of the 5 home-screen
 * widgets and writes it to App Group UserDefaults via widgetData.
 *
 * Five sources of data:
 *   1. Today's Question      - rotating from a curated static list,
 *                              keyed on day-of-year so it's stable
 *                              for 24h and never repeats within a
 *                              ~1-month window.
 *   2. Your One Move         - pulled from the latest chapter recap's
 *                              "one_move" slot (or the AI Arena 90-day
 *                              plan top entry if no recap yet).
 *   3. Tonight's 15 Minutes  - the most actionable next-step Dilly
 *                              has for the user, derived in priority
 *                              order: imminent interview, imminent
 *                              deadline, weakest skill, default to
 *                              "open Dilly to chat".
 *   4. Honest Mirror         - the latest "noticed" line from chapter
 *                              recap, otherwise the AI Arena verdict.
 *   5. Moment of Truth       - rotating from a curated static list.
 *
 * All sources gracefully fall through to undefined; the widget shows
 * an empty hint instead of crashing.
 *
 * Called on app cold start and after each Chapter session ends so the
 * widgets pick up the freshest content the next time iOS asks for a
 * timeline. The widget timeline policy refreshes every 30 min on its
 * own.
 */

import { dilly } from './dilly';
import { writeWidgetData, type WidgetData } from './widgetData';

// ── Curated rotating content ────────────────────────────────────────

const DAILY_QUESTIONS = [
  "What would you do this week if you stopped caring what your parents think?",
  "If your resume was a story someone read aloud, what's the line they'd remember?",
  "Three months from now, what do you wish you'd started today?",
  "Who in your inbox have you been avoiding emailing? Why?",
  "What's the version of your career you're scared to admit you actually want?",
  "If a hiring manager interviewed you tomorrow, what's the question you'd hope they don't ask?",
  "What's one skill you've been pretending you have? What would it cost to actually have it?",
  "If you could only send 3 cold emails this week, who would you pick?",
  "What's the last thing you said yes to out of habit, not desire?",
  "Whose career are you secretly comparing yourself to? What does that comparison teach you?",
  "If your future self watched a recording of how you spent today, would they be proud?",
  "What's the smallest brave thing you could do this week?",
  "What story are you telling about why you haven't done the thing yet?",
  "If you wrote your obituary today, what's missing that you'd want to be there?",
  "What would it look like to take yourself seriously for one week?",
  "What's the difference between what you want and what you're allowed to want?",
  "What's the question you keep refusing to ask Dilly?",
  "When was the last time your work scared you in a good way?",
  "What's the gift no one's hired you for yet?",
  "Who do you need to forgive to start moving again?",
  "If money were solved, what would you still want to be good at?",
  "What's the one truth on your resume that's actually a lie?",
  "What would change if you stopped explaining yourself?",
];

const DAILY_TRUTHS = [
  "Did you reach out to someone new this week?",
  "Did you do something hard today?",
  "Did you put real time into the thing you said matters?",
  "Did you finish what you started yesterday?",
  "Did you sit with a hard question instead of skipping it?",
  "Did you get rejected by someone you care about this week?",
  "Did you say no to something easy that wasn't right?",
  "Did you ask for help today?",
  "Did you tell someone the real reason you're applying?",
  "Did you do one thing today that future-you will thank you for?",
  "Did you ship something - any size?",
  "Did you read something hard today?",
];

function dayOfYear(d: Date = new Date()): number {
  const start = new Date(d.getFullYear(), 0, 0).getTime();
  return Math.floor((d.getTime() - start) / 86400000);
}

function pickDaily<T>(arr: T[], offset = 0): T {
  if (arr.length === 0) return undefined as any;
  const idx = (dayOfYear() + offset) % arr.length;
  return arr[idx];
}

// ── Source resolvers ────────────────────────────────────────────────

async function resolveOneMove(): Promise<{
  title?: string;
  body?: string;
  deepLink?: string;
}> {
  try {
    const cur = await dilly.get('/chapters/current').catch(() => null);
    const screens: any[] = (cur as any)?.latest?.screens || [];
    const oneMove = screens.find(s => s?.slot === 'one_move');
    if (oneMove?.body) {
      return {
        title: stripFormatting(String(oneMove.body)).slice(0, 160),
        body: undefined,
        deepLink: 'dilly:///(app)/chapter',
      };
    }
  } catch {}
  // Fallback: AI Arena weekly bet
  try {
    const fi = await dilly.get('/arena/field-intel').catch(() => null);
    const plan: any[] = (fi as any)?.sections?.ninety_day_plan?.weekly_bets
      || (fi as any)?.plan?.weekly_bets
      || [];
    if (Array.isArray(plan) && plan[0]?.headline) {
      return {
        title: String(plan[0].headline).slice(0, 160),
        body: plan[0].why ? String(plan[0].why).slice(0, 200) : undefined,
        deepLink: 'dilly:///(app)/ai-arena',
      };
    }
  } catch {}
  return {};
}

async function resolveTonight(): Promise<{ title?: string; deepLink?: string }> {
  try {
    const cur = await dilly.get('/chapters/current').catch(() => null);
    const screens: any[] = (cur as any)?.latest?.screens || [];
    const pushOn = screens.find(s => s?.slot === 'push_on');
    if (pushOn?.body) {
      return {
        title: `Tonight: ${stripFormatting(String(pushOn.body)).slice(0, 110)}`,
        deepLink: 'dilly:///(app)/chapter',
      };
    }
  } catch {}
  // Fallback: skill suggestion from skills feed
  try {
    const feed = await dilly.get('/skill-lab/feed').catch(() => null);
    const hero = (feed as any)?.hero;
    if (hero?.id && hero?.title) {
      return {
        title: `Tonight: watch "${String(hero.title).slice(0, 80)}".`,
        deepLink: `dilly:///(app)/skills/video/${hero.id}`,
      };
    }
  } catch {}
  // Default: open interview practice
  return {
    title: 'Tonight: 15 minutes of interview practice. Pick one question and rehearse.',
    deepLink: 'dilly:///(app)/interview-practice',
  };
}

async function resolveMirror(): Promise<string | undefined> {
  try {
    const cur = await dilly.get('/chapters/current').catch(() => null);
    const screens: any[] = (cur as any)?.latest?.screens || [];
    const noticed = screens.find(s => s?.slot === 'noticed');
    if (noticed?.body) {
      // Take the first sentence so the widget can render it as a
      // pulled quote without overflow.
      const first = stripFormatting(String(noticed.body)).split(/(?<=[.!?])\s+/)[0];
      if (first && first.length >= 12) return first.slice(0, 180);
    }
  } catch {}
  // Fallback: AI Arena Honest Mirror verdict
  try {
    const fi = await dilly.get('/arena/field-intel').catch(() => null);
    const verdict =
      (fi as any)?.sections?.honest_mirror?.verdict
      || (fi as any)?.honest_mirror?.verdict;
    if (typeof verdict === 'string' && verdict.length >= 12) {
      return verdict.split(/(?<=[.!?])\s+/)[0].slice(0, 180);
    }
  } catch {}
  return undefined;
}

async function resolveTruthStreak(): Promise<number> {
  // Best-effort - reads a local AsyncStorage tally maintained by the
  // truth-answer queue drainer. If nothing yet, return 0.
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const raw = await AsyncStorage.getItem('dilly_truth_streak_days_v1');
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

function stripFormatting(s: string): string {
  return s
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,!?;:]|$)/g, '$1$2')
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=[\s).,!?;:]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

// ── Public ──────────────────────────────────────────────────────────

/** Recompute every widget's content and write the merged payload to
 *  App Group UserDefaults. Safe to call repeatedly - idempotent. The
 *  widget timeline picks up fresh data on its next refresh (max 30
 *  min) or whenever WidgetCenter.shared.reloadAllTimelines() is fired
 *  from the widget extension. */
export async function refreshAllWidgets(): Promise<void> {
  try {
    const [oneMove, tonight, mirror, streak] = await Promise.all([
      resolveOneMove(),
      resolveTonight(),
      resolveMirror(),
      resolveTruthStreak(),
    ]);

    // Day-rotation gates the question + truth so each calendar day
    // shows a stable item, even across multiple calls.
    const todayKey = `${new Date().getFullYear()}-${dayOfYear()}`;
    const question = pickDaily(DAILY_QUESTIONS);
    const truth = pickDaily(DAILY_TRUTHS, 7); // offset so question + truth differ

    const truthAnsweredToday = await readTruthAnsweredToday(todayKey);

    const payload: WidgetData = {
      todaysQuestion: question,
      oneMoveTitle: oneMove.title,
      oneMoveBody: oneMove.body,
      oneMoveDeepLink: oneMove.deepLink,
      tonightTitle: tonight.title,
      tonightDeepLink: tonight.deepLink,
      mirrorSentence: mirror,
      truthQuestion: truth,
      truthAnswered: truthAnsweredToday,
      truthStreakDays: streak,
    };
    await writeWidgetData(payload);
  } catch {
    // Best-effort. A failed refresh just leaves stale data; the
    // widget renders the previous values until next time.
  }
}

async function readTruthAnsweredToday(todayKey: string): Promise<boolean> {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const last = await AsyncStorage.getItem('dilly_truth_answered_day_v1');
    return last === todayKey;
  } catch {
    return false;
  }
}
