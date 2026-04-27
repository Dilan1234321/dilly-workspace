/**
 * mail.ts - opens the system Mail composer with an attachment + smart
 * draft. Three flows live here, all built on expo-mail-composer:
 *
 *   1. emailResume(opts)        - "Email this resume" with the resume
 *      PDF attached and a recipient + subject pre-filled when the job
 *      posting carries a contact email.
 *   2. emailFollowUp(opts)      - "Follow up on application" with a
 *      professional template and the resume re-attached.
 *   3. emailThankYouNote(opts)  - "Send thank you note" after an
 *      interview with the interviewer's name and key talking points
 *      from the prep deck inserted as draft body.
 *
 * Each function returns one of three statuses:
 *   - 'sent'       - user tapped Send. Surface a success toast.
 *   - 'cancelled'  - user closed the composer.
 *   - 'unavailable'- Mail not configured on device. Caller should
 *                    fall back to mailto: or surface a friendly toast.
 *
 * No fields are required - if the caller doesn't have an email or
 * subject, we draft what we can and let the user fill the rest.
 *
 * expo-mail-composer is lazy-loaded so the absence of the native
 * module on Expo Go / simulator doesn't crash startup.
 */

import { Linking, Platform } from 'react-native';

let _MailComposer: any = null;
async function loadMail(): Promise<any> {
  if (_MailComposer) return _MailComposer;
  try {
    _MailComposer = await import('expo-mail-composer');
    return _MailComposer;
  } catch {
    return null;
  }
}

export type MailResult = 'sent' | 'cancelled' | 'unavailable';

interface ResumeMailArgs {
  /** Recipient inferred from the job posting; left blank if unknown. */
  recipient?: string;
  company: string;
  role?: string;
  /** Local file:// or content:// URI of the generated resume PDF. */
  resumeUri?: string;
  userName?: string;
}

/** "Email this resume" - draft a short, neutral cover note with the
 *  resume PDF attached. Subject + body assume the user will tweak. */
export async function emailResume(args: ResumeMailArgs): Promise<MailResult> {
  const M = await loadMail();
  if (!M) return openMailtoFallback({
    to: args.recipient,
    subject: defaultResumeSubject(args.company, args.role),
    body: defaultResumeBody(args.company, args.role, args.userName),
  });
  try {
    const available = await M.isAvailableAsync?.();
    if (!available) {
      return openMailtoFallback({
        to: args.recipient,
        subject: defaultResumeSubject(args.company, args.role),
        body: defaultResumeBody(args.company, args.role, args.userName),
      });
    }
    const { status } = await M.composeAsync({
      recipients: args.recipient ? [args.recipient] : [],
      subject: defaultResumeSubject(args.company, args.role),
      body: defaultResumeBody(args.company, args.role, args.userName),
      attachments: args.resumeUri ? [args.resumeUri] : undefined,
      isHtml: false,
    });
    return statusFrom(status);
  } catch {
    return 'unavailable';
  }
}

interface FollowupMailArgs {
  recipient?: string;
  company: string;
  role?: string;
  appliedAtIso?: string;
  resumeUri?: string;
  userName?: string;
}

/** "Follow up on application" - draft a short follow-up with the
 *  resume re-attached and a professional template body. */
export async function emailFollowUp(args: FollowupMailArgs): Promise<MailResult> {
  const M = await loadMail();
  const subject = `Following up on my application - ${args.role ? args.role + ' at ' : ''}${args.company}`;
  const body = followupBody(args);
  if (!M) return openMailtoFallback({ to: args.recipient, subject, body });
  try {
    const available = await M.isAvailableAsync?.();
    if (!available) return openMailtoFallback({ to: args.recipient, subject, body });
    const { status } = await M.composeAsync({
      recipients: args.recipient ? [args.recipient] : [],
      subject,
      body,
      attachments: args.resumeUri ? [args.resumeUri] : undefined,
      isHtml: false,
    });
    return statusFrom(status);
  } catch {
    return 'unavailable';
  }
}

interface ThankYouMailArgs {
  recipient?: string;
  interviewerName?: string;
  company: string;
  role?: string;
  /** Brief talking points pulled from the interview prep deck, joined
   *  by newlines. Inserted as bullets in the body. */
  talkingPoints?: string[];
  userName?: string;
}

/** "Send thank you note" - same primitive, with a personalized body
 *  built from the interviewer's name + a few prep talking points. */
export async function emailThankYouNote(args: ThankYouMailArgs): Promise<MailResult> {
  const M = await loadMail();
  const subject = `Thank you - ${args.role ? args.role + ' at ' : ''}${args.company}`;
  const body = thankYouBody(args);
  if (!M) return openMailtoFallback({ to: args.recipient, subject, body });
  try {
    const available = await M.isAvailableAsync?.();
    if (!available) return openMailtoFallback({ to: args.recipient, subject, body });
    const { status } = await M.composeAsync({
      recipients: args.recipient ? [args.recipient] : [],
      subject,
      body,
      isHtml: false,
    });
    return statusFrom(status);
  } catch {
    return 'unavailable';
  }
}

// ── Templates ───────────────────────────────────────────────────────

function defaultResumeSubject(company: string, role?: string): string {
  return role ? `Resume for the ${role} role at ${company}` : `Resume - ${company}`;
}

function defaultResumeBody(company: string, role?: string, userName?: string): string {
  const opening = role ? `for the ${role} role at ${company}` : `for the role at ${company}`;
  const sig = userName ? `\n\nThanks,\n${userName}` : '\n\nThanks,';
  return `Hi,\n\nAttaching my resume ${opening}. Happy to share more if helpful, and grateful for any chance to chat.${sig}`;
}

function followupBody(args: FollowupMailArgs): string {
  const role = args.role ? ` for the ${args.role} role` : '';
  const when = args.appliedAtIso
    ? ` two weeks ago`
    : ` recently`;
  const sig = args.userName ? `\n\nThanks,\n${args.userName}` : '\n\nThanks,';
  return `Hi,\n\nI applied${when}${role} at ${args.company} and wanted to follow up briefly. I remain very interested and would welcome any update on the process or feedback on my materials.\n\nResume attached for convenience.${sig}`;
}

function thankYouBody(args: ThankYouMailArgs): string {
  const opener = args.interviewerName
    ? `Hi ${args.interviewerName.split(' ')[0]},`
    : 'Hi,';
  const role = args.role ? ` for the ${args.role} role` : '';
  const points = (args.talkingPoints || [])
    .filter(Boolean)
    .slice(0, 3)
    .map(p => `- ${p}`)
    .join('\n');
  const middle = points
    ? `A few things I'm taking with me from our conversation:\n\n${points}\n\n`
    : '';
  const sig = args.userName ? `\n\nThanks,\n${args.userName}` : '\n\nThanks,';
  return `${opener}\n\nThank you for the time today${role} at ${args.company}. ${middle}I'd love to keep the conversation going and look forward to next steps.${sig}`;
}

// ── Fallback ────────────────────────────────────────────────────────

interface MailtoArgs { to?: string; subject?: string; body?: string; }

/** When the native composer is unavailable (no Mail account configured,
 *  Android with no default mail handler, etc.), build a mailto: URL and
 *  hand it to the system. The system either opens whatever mail app
 *  IS configured or shows the user that nothing handles mailto:. */
async function openMailtoFallback(args: MailtoArgs): Promise<MailResult> {
  try {
    const params = new URLSearchParams();
    if (args.subject) params.set('subject', args.subject);
    if (args.body) params.set('body', args.body);
    const tail = params.toString();
    const url = `mailto:${encodeURIComponent(args.to || '')}${tail ? '?' + tail : ''}`;
    const can = await Linking.canOpenURL(url);
    if (!can) return 'unavailable';
    await Linking.openURL(url);
    // mailto: returns no completion handle - we treat the launch as
    // success-best-effort. Status reads as "sent" so the caller can
    // surface a positive UI even though we don't actually know if the
    // user pressed Send.
    return 'sent';
  } catch {
    return 'unavailable';
  }
}

function statusFrom(s: any): MailResult {
  if (s === 'sent') return 'sent';
  if (s === 'cancelled' || s === 'saved') return 'cancelled';
  return 'unavailable';
}

// Suppress unused-platform warning when this file is bundled for web.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _platform = Platform.OS;
