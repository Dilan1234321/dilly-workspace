/**
 * Build 76: Calendar integration via iCalendar (.ics) files.
 *
 * Rather than pull in a native calendar module (which would require
 * separate code paths for Apple Calendar and Google Calendar), we use
 * the universal `.ics` primitive that every calendar app on the planet
 * supports. The flow is:
 *
 *   1. Mobile builds a URL to the backend .ics endpoint with event
 *      fields as query params.
 *   2. Linking.openURL hands the URL to iOS.
 *   3. iOS downloads the file and displays its native "Add to Calendar"
 *      panel, with a picker for every calendar the user has connected
 *       -  Apple Calendar, Google Calendar (via account), iCloud, Outlook,
 *      Exchange, whatever.
 *
 * Two modes:
 *
 *   - openAddToCalendar(event)  -  one-shot add for a single event
 *   - openSubscribeToDillyCalendar()  -  subscribe to the user's full
 *     deadline feed so every future Dilly deadline auto-syncs
 */

import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from './dilly';
import { API_BASE } from './tokens';

// AsyncStorage flag: "user has tapped Subscribe to Dilly Calendar at
// least once on this device". When true, the Subscribe button on the
// Calendar page hides itself (user is already subscribed in iOS) and
// an Unsubscribe row surfaces in Settings. Clearing the flag brings
// the Subscribe button back. iOS owns the actual subscription — this
// flag is just a UX hint so we don't show a "Subscribe" CTA to a
// user who already subscribed.
const CAL_SUBSCRIBED_KEY = 'dilly_cal_subscribed_v1';

export async function isCalendarSubscribed(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(CAL_SUBSCRIBED_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function markCalendarSubscribed(): Promise<void> {
  try { await AsyncStorage.setItem(CAL_SUBSCRIBED_KEY, '1'); } catch {}
}

export async function clearCalendarSubscribed(): Promise<void> {
  try { await AsyncStorage.removeItem(CAL_SUBSCRIBED_KEY); } catch {}
}

export interface CalendarEventInput {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM-DD, optional  -  defaults to date+1 */
  end?: string;
  /** Free-text description shown on the event */
  description?: string;
  /** Location string */
  location?: string;
  /** Optional URL attached to the event */
  url?: string;
}

/**
 * Pads a query param and URI-encodes it. Returns an empty string if
 * the value is null/undefined so the caller can filter it out.
 */
function qp(key: string, value: string | undefined | null): string {
  if (value == null || value === '') return '';
  return `${key}=${encodeURIComponent(value)}`;
}

/**
 * Open iOS's native "Add to Calendar" panel for a single event.
 * User picks which calendar (Apple, Google, iCloud, etc) when prompted.
 */
export async function openAddToCalendar(event: CalendarEventInput): Promise<void> {
  if (!event.title || !event.date) {
    Alert.alert('Calendar', 'Missing event title or date.');
    return;
  }

  const parts = [
    qp('title', event.title),
    qp('date', event.date),
    qp('end', event.end),
    qp('desc', event.description),
    qp('loc', event.location),
    qp('url', event.url),
  ].filter(Boolean);

  const httpsUrl = `${API_BASE}/calendar/event.ics?${parts.join('&')}`;

  try {
    const canOpen = await Linking.canOpenURL(httpsUrl);
    if (!canOpen) {
      Alert.alert('Calendar', 'Could not open the calendar.');
      return;
    }
    await Linking.openURL(httpsUrl);
  } catch (e: any) {
    Alert.alert('Calendar', e?.message || 'Could not add to calendar.');
  }
}

/**
 * Subscribe the user to their personal Dilly deadline feed. Hits the
 * existing /calendar/generate-feed-token endpoint to get/create the
 * per-account token, then opens the webcal:// URL so iOS routes it to
 * the system calendar subscribe flow.
 *
 * Subscribed calendars auto-refresh periodically, so new deadlines
 * (added via the tracker, the applications endpoint, or manual entry)
 * appear on the user's calendar without them re-opening the app.
 */
export async function openSubscribeToDillyCalendar(): Promise<void> {
  try {
    const res = await dilly.fetch('/calendar/generate-feed-token', { method: 'POST' });
    if (!res.ok) {
      Alert.alert('Calendar', 'Could not create your subscription link.');
      return;
    }
    const data = await res.json();
    const token: string = data?.feed_token || '';
    if (!token) {
      Alert.alert('Calendar', 'No subscription token returned.');
      return;
    }

    // iOS's subscribe flow uses the webcal:// scheme. Converting from
    // https:// to webcal:// is exactly the handshake Apple expects.
    const httpsUrl = `${API_BASE}/calendar/feed/${token}.ics`;
    const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://');

    const canOpen = await Linking.canOpenURL(webcalUrl);
    if (!canOpen) {
      // Fall back to the https URL if webcal:// is unhandled for some reason
      await Linking.openURL(httpsUrl);
      await markCalendarSubscribed();
      return;
    }
    await Linking.openURL(webcalUrl);
    await markCalendarSubscribed();
  } catch (e: any) {
    Alert.alert('Calendar', e?.message || 'Could not subscribe.');
  }
}

/** Show the user how to unsubscribe from the Dilly Calendar feed in
 *  iOS Settings. iOS doesn't expose a programmatic "remove a subscribed
 *  calendar" API, so the correct path is: iOS Settings → Calendar →
 *  Accounts → Subscribed Calendars → Dilly → Delete Account.
 *
 *  Clears our local "subscribed" flag on confirm, which makes the
 *  Subscribe button reappear on the Calendar page (in case the user
 *  wants to re-subscribe later). */
export async function unsubscribeFromDillyCalendar(): Promise<void> {
  Alert.alert(
    'Unsubscribe from Dilly Calendar',
    "To remove the Dilly Calendar from your phone:\n\n" +
      "1. Open Settings on your phone\n" +
      "2. Tap Apps → Calendar → Accounts\n" +
      "3. Tap Subscribed Calendars\n" +
      "4. Select Dilly, then Delete Account\n\n" +
      "Tap \"Open Settings\" to jump there now.",
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open Settings',
        onPress: async () => {
          try { await Linking.openURL('app-settings:'); } catch {}
          await clearCalendarSubscribed();
        },
      },
      {
        text: "I've unsubscribed",
        onPress: async () => { await clearCalendarSubscribed(); },
      },
    ],
  );
}
