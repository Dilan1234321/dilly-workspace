/**
 * contacts.ts - save networking connections to the user's iOS Contacts
 * app via expo-contacts.
 *
 * Two flows:
 *   1. saveContact(opts)        - "Save to Contacts" with a "Met
 *      through Dilly" note attached so the connection's origin is
 *      preserved across the user's whole digital life.
 *   2. findContactsAtCompany(c) - reverse lookup. When generating a
 *      resume or prepping for an interview at Goldman, we ask "do
 *      you know anyone at Goldman in your phone?" and surface those
 *      contacts as warm-intro candidates. Read-only - we never modify
 *      a contact during reverse lookup.
 *
 * Permission: requested at the moment a save is attempted, never
 * pre-prompted on app launch. Returning false from getOrRequestPermission
 * is treated as "user said no, do nothing".
 *
 * Lazy-loaded so absence of native module on Expo Go doesn't crash.
 */

import { Platform } from 'react-native';

let _Contacts: any = null;
async function loadContacts(): Promise<any> {
  if (_Contacts) return _Contacts;
  try {
    _Contacts = await import('expo-contacts');
    return _Contacts;
  } catch {
    return null;
  }
}

async function getOrRequestPermission(): Promise<boolean> {
  const C = await loadContacts();
  if (!C) return false;
  try {
    const existing = await C.getPermissionsAsync();
    if (existing?.status === 'granted') return true;
    const requested = await C.requestPermissionsAsync();
    return requested?.status === 'granted';
  } catch {
    return false;
  }
}

export interface SaveContactArgs {
  name: string;
  email?: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  /** Free-text origin note. Defaults to "Met through Dilly" if absent. */
  origin?: string;
  /** Optional URL to attach (e.g. their Dilly web profile). */
  url?: string;
}

export interface SaveContactResult {
  status: 'saved' | 'permission_denied' | 'unavailable' | 'error';
  contactId?: string;
}

/** Save a new contact with all of Dilly's metadata baked in. The
 *  origin note ("Met through Dilly", "Connected at UT Career Fair")
 *  lives in the standard Contacts notes field so it travels with the
 *  contact across iCloud/macOS/Outlook syncs. */
export async function saveContact(args: SaveContactArgs): Promise<SaveContactResult> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return { status: 'unavailable' };
  const C = await loadContacts();
  if (!C) return { status: 'unavailable' };
  const ok = await getOrRequestPermission();
  if (!ok) return { status: 'permission_denied' };

  try {
    const parts = args.name.trim().split(/\s+/);
    const firstName = parts[0] || args.name;
    const lastName = parts.slice(1).join(' ');

    const contact: any = {
      [C.Fields?.FirstName || 'firstName']: firstName,
      [C.Fields?.LastName  || 'lastName']:  lastName || undefined,
      [C.Fields?.Company   || 'company']:   args.company || undefined,
      [C.Fields?.JobTitle  || 'jobTitle']:  args.jobTitle || undefined,
      contactType: C.ContactTypes?.Person || 'person',
      note: args.origin || 'Met through Dilly',
    };

    if (args.email) {
      contact[C.Fields?.Emails || 'emails'] = [{
        email: args.email,
        label: C.EmailLabels?.Work || 'work',
        isPrimary: true,
      }];
    }
    if (args.phone) {
      contact[C.Fields?.PhoneNumbers || 'phoneNumbers'] = [{
        number: args.phone,
        label: C.PhoneNumberLabels?.Mobile || 'mobile',
      }];
    }
    if (args.url) {
      contact[C.Fields?.UrlAddresses || 'urlAddresses'] = [{
        url: args.url,
        label: 'Dilly profile',
      }];
    }

    const id = await C.addContactAsync(contact);
    return { status: 'saved', contactId: id };
  } catch {
    return { status: 'error' };
  }
}

/** Reverse lookup: find existing contacts whose company matches
 *  (case-insensitive substring). Returns lightweight rows for UI
 *  rendering. Silently returns [] if permission is missing - we never
 *  prompt during reverse lookup; the prompt only happens on save. */
export async function findContactsAtCompany(company: string): Promise<Array<{
  id: string;
  name: string;
  email?: string;
  jobTitle?: string;
}>> {
  if (!company || company.length < 2) return [];
  const C = await loadContacts();
  if (!C) return [];
  try {
    // Don't request - only read if already granted. Reverse lookup is
    // a passive enrichment, not worth a prompt on its own.
    const existing = await C.getPermissionsAsync();
    if (existing?.status !== 'granted') return [];

    const { data } = await C.getContactsAsync({
      fields: [
        C.Fields?.FirstName || 'firstName',
        C.Fields?.LastName || 'lastName',
        C.Fields?.Company || 'company',
        C.Fields?.JobTitle || 'jobTitle',
        C.Fields?.Emails || 'emails',
      ],
    });
    const needle = company.toLowerCase();
    const rows = (data || [])
      .filter((c: any) => String(c?.company || '').toLowerCase().includes(needle))
      .slice(0, 8)
      .map((c: any) => ({
        id: String(c.id || ''),
        name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || 'Unknown',
        email: (c.emails || [])[0]?.email,
        jobTitle: c.jobTitle,
      }));
    return rows;
  } catch {
    return [];
  }
}
