/**
 * Dilly Reminders — stub module.
 *
 * expo-calendar was causing native crashes on app startup.
 * All functions are no-ops that return null until we re-add
 * the native module with proper entitlements.
 */

export interface DillyReminder {
  title: string;
  notes?: string;
  dueDate: string;
  alertMinutesBefore?: number;
}

export async function createReminder(_r: DillyReminder): Promise<string | null> { return null; }
export async function remindDeadline(_c: string, _r: string, _d: string): Promise<string | null> { return null; }
export async function remindInterview(_c: string, _r: string, _d: string): Promise<{ dayBefore: string | null; hoursBefore: string | null }> { return { dayBefore: null, hoursBefore: null }; }
export async function remindFollowUp(_c: string, _r: string, _d: string): Promise<string | null> { return null; }
export async function remindMeLater(_t: string, _n?: string, _h?: number): Promise<string | null> { return null; }
export async function remindReaudit(): Promise<string | null> { return null; }
