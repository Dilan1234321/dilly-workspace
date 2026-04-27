/**
 * spotlight.ts - index Dilly content into iOS Spotlight (Core Spotlight)
 * via expo-spotlight, so the user pulling down on Home and typing
 * "Goldman Sachs" or "Python" gets Dilly results inline with system
 * results.
 *
 * Two indexing surfaces:
 *   1. Saved jobs - title + company. Tapping deep-links to /jobs.
 *   2. Skills the user is on. Tapping deep-links to /skills.
 *   3. App sections (Interview Practice, Resume Generate, AI Arena,
 *      My Dilly Card). Static set indexed once on first run; updated
 *      only if labels change.
 *
 * One tap handler at app shell deep-links via expo-router.
 *
 * Lazy-load: expo-spotlight is dynamically imported so the module
 * remains safe on Expo Go / simulators where the native bridge is
 * absent. All public functions silently no-op in that case.
 */

import { Platform } from 'react-native';

let _Spotlight: any = null;
async function loadSpotlight(): Promise<any> {
  if (_Spotlight) return _Spotlight;
  try {
    _Spotlight = await import('expo-spotlight');
    return _Spotlight;
  } catch {
    return null;
  }
}

const DOMAIN_JOBS = 'com.dilly.app.jobs';
const DOMAIN_SKILLS = 'com.dilly.app.skills';
const DOMAIN_SECTIONS = 'com.dilly.app.sections';

interface JobLite {
  id: string;
  title: string;
  company?: string;
  city?: string;
}

interface SkillLite {
  id: string;
  title: string;
  description?: string;
}

/** Index a batch of saved jobs into Spotlight. Each item carries the
 *  job id in its identifier so the tap handler can route to the right
 *  job card. Caller owns the cadence - typically called after the user
 *  saves/unsaves, or once on app cold start with the cached list. */
export async function indexSavedJobs(jobs: JobLite[]): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const S = await loadSpotlight();
  if (!S) return;
  try {
    await S.clearDomain?.(DOMAIN_JOBS);
    if (!jobs.length) return;
    const items = jobs.slice(0, 100).map(j => ({
      id: `dilly_job_${j.id}`,
      title: j.title || 'Job',
      domainIdentifier: DOMAIN_JOBS,
      description: [j.company, j.city].filter(Boolean).join(' - '),
      metadata: {
        keywords: [
          'dilly', 'job', 'role', 'apply', 'application',
          ...(j.company ? [j.company.toLowerCase()] : []),
          ...(j.title ? j.title.toLowerCase().split(/\s+/).slice(0, 6) : []),
        ],
        contentType: 'public.text',
        url: `dilly:///(app)/jobs?jobId=${encodeURIComponent(j.id)}`,
      },
    }));
    await S.indexItems(items);
  } catch {
    // Best-effort. Spotlight indexing failure is invisible to the user;
    // the search just won't surface Dilly results.
  }
}

/** Index a batch of skills the user is on. */
export async function indexSkills(skills: SkillLite[]): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const S = await loadSpotlight();
  if (!S) return;
  try {
    await S.clearDomain?.(DOMAIN_SKILLS);
    if (!skills.length) return;
    const items = skills.slice(0, 100).map(s => ({
      id: `dilly_skill_${s.id}`,
      title: s.title || 'Skill',
      domainIdentifier: DOMAIN_SKILLS,
      description: s.description,
      metadata: {
        keywords: [
          'dilly', 'skill', 'learn', 'course',
          ...(s.title ? s.title.toLowerCase().split(/\s+/).slice(0, 6) : []),
        ],
        contentType: 'public.text',
        url: `dilly:///(app)/skills/video/${encodeURIComponent(s.id)}`,
      },
    }));
    await S.indexItems(items);
  } catch {}
}

/** Index core app sections. Idempotent - tapping a section result
 *  always lands the user on that screen. Run once on cold start. */
export async function indexAppSections(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const S = await loadSpotlight();
  if (!S) return;
  try {
    const items = [
      {
        id: 'dilly_section_interview',
        title: 'Interview practice',
        domainIdentifier: DOMAIN_SECTIONS,
        description: 'Rehearse for upcoming interviews with Dilly.',
        metadata: {
          keywords: ['dilly', 'interview', 'practice', 'rehearse', 'prep'],
          url: 'dilly:///(app)/interview-practice',
        },
      },
      {
        id: 'dilly_section_resume',
        title: 'Generate a resume',
        domainIdentifier: DOMAIN_SECTIONS,
        description: 'Build a tailored resume for a specific role.',
        metadata: {
          keywords: ['dilly', 'resume', 'cv', 'application', 'pdf'],
          url: 'dilly:///(app)/resume-generate',
        },
      },
      {
        id: 'dilly_section_jobs',
        title: 'Find a job',
        domainIdentifier: DOMAIN_SECTIONS,
        description: 'Browse Dilly job matches.',
        metadata: {
          keywords: ['dilly', 'jobs', 'role', 'internship', 'apply'],
          url: 'dilly:///(app)/jobs',
        },
      },
      {
        id: 'dilly_section_arena',
        title: 'AI Arena',
        domainIdentifier: DOMAIN_SECTIONS,
        description: 'Threats and opportunities AI poses to your role.',
        metadata: {
          keywords: ['dilly', 'ai', 'arena', 'threats', 'role', 'mirror'],
          url: 'dilly:///(app)/ai-arena',
        },
      },
      {
        id: 'dilly_section_skills',
        title: 'Skills library',
        domainIdentifier: DOMAIN_SECTIONS,
        description: 'Curated skill videos picked for your trajectory.',
        metadata: {
          keywords: ['dilly', 'skills', 'learn', 'video', 'library'],
          url: 'dilly:///(app)/skills',
        },
      },
      {
        id: 'dilly_section_chapter',
        title: "This week's Chapter",
        domainIdentifier: DOMAIN_SECTIONS,
        description: 'Open your weekly Chapter session with Dilly.',
        metadata: {
          keywords: ['dilly', 'chapter', 'session', 'weekly'],
          url: 'dilly:///(app)/chapter',
        },
      },
      {
        id: 'dilly_section_card',
        title: 'My Dilly Card',
        domainIdentifier: DOMAIN_SECTIONS,
        description: 'Open your Dilly business card to share at events.',
        metadata: {
          keywords: ['dilly', 'card', 'business card', 'qr', 'share'],
          url: 'dilly:///(app)/my-dilly-profile?openQr=1',
        },
      },
    ];
    await S.indexItems(items);
  } catch {}
}

/** Subscribe to "user tapped a Dilly Spotlight result" events. The
 *  callback receives the deep-link URL string we stored under
 *  metadata.url. Returns an unsubscribe function. */
export async function onSpotlightTap(handler: (url: string) => void): Promise<() => void> {
  if (Platform.OS !== 'ios') return () => {};
  const S = await loadSpotlight();
  if (!S?.addSpotlightItemTappedListener) return () => {};
  try {
    const sub = S.addSpotlightItemTappedListener((event: any) => {
      // The library returns the item id, not the metadata. We baked
      // the deep-link URL into the id-derived structure - decode by
      // looking up the URL we stored when indexing. Simplest path:
      // map the well-known id prefixes back to a route.
      const id: string = String(event?.id || '');
      const url = idToUrl(id);
      if (url) handler(url);
    });
    return () => { try { sub?.remove?.(); } catch {} };
  } catch {
    return () => {};
  }
}

/** Map a Spotlight item id back to its deep-link URL. Mirrors the
 *  id format used by the index*() functions above. Kept private. */
function idToUrl(id: string): string | null {
  if (id.startsWith('dilly_job_')) {
    const jid = id.replace('dilly_job_', '');
    return `dilly:///(app)/jobs?jobId=${encodeURIComponent(jid)}`;
  }
  if (id.startsWith('dilly_skill_')) {
    const sid = id.replace('dilly_skill_', '');
    return `dilly:///(app)/skills/video/${encodeURIComponent(sid)}`;
  }
  if (id === 'dilly_section_interview')   return 'dilly:///(app)/interview-practice';
  if (id === 'dilly_section_resume')      return 'dilly:///(app)/resume-generate';
  if (id === 'dilly_section_jobs')        return 'dilly:///(app)/jobs';
  if (id === 'dilly_section_arena')       return 'dilly:///(app)/ai-arena';
  if (id === 'dilly_section_skills')      return 'dilly:///(app)/skills';
  if (id === 'dilly_section_chapter')     return 'dilly:///(app)/chapter';
  if (id === 'dilly_section_card')        return 'dilly:///(app)/my-dilly-profile?openQr=1';
  return null;
}
