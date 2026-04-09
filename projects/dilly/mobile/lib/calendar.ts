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
import { dilly } from './dilly';
import { API_BASE } from './tokens';

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
      return;
    }
    await Linking.openURL(webcalUrl);
  } catch (e: any) {
    Alert.alert('Calendar', e?.message || 'Could not subscribe.');
  }
}
