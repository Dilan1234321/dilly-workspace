/**
 * useSituationCopy — per-user_path copy for shared surfaces.
 *
 * The /profile response now carries a `situation_copy` object
 * populated server-side from dilly_core/situation_copy.py. This hook
 * reads it through sessionCache so shared screens can render tailored
 * greetings, eyebrows, CTAs, and empty states per user_path without
 * pushing every path onto its own Rung-3 bespoke home.
 *
 * Zero cost: no network call, no LLM, just a Map.get() from the
 * already-populated profile cache. Falls back to sensible defaults
 * when the profile hasn't loaded yet or the user is on a legacy path.
 */

import { getCached } from '../lib/sessionCache';

export interface SituationCopy {
  eyebrow:         string;
  greeting:        string;   // may include {first_name}
  subtext:         string;
  talk_cta:        string;
  empty_chat_seed: string;
  empty_jobs:      string;
  empty_facts:     string;
  accent:          string;
}

const DEFAULT_COPY: SituationCopy = {
  eyebrow:         'TODAY',
  greeting:        '{first_name}, let\'s take a look.',
  subtext:         'Here\'s what changed since last time.',
  talk_cta:        'Talk to Dilly',
  empty_chat_seed: 'What do you want to work on?',
  empty_jobs:      'Still loading the feed.',
  empty_facts:     'Tell Dilly more and this page gets sharper.',
  accent:          '#4F46E5',
};

export function useSituationCopy(firstName: string = ''): SituationCopy & {
  greetingResolved: string;   // greeting with {first_name} already substituted
} {
  const profile = getCached<any>('profile:full');
  const raw = (profile?.situation_copy as Partial<SituationCopy> | undefined) || {};
  const copy: SituationCopy = {
    eyebrow:         raw.eyebrow         || DEFAULT_COPY.eyebrow,
    greeting:        raw.greeting        || DEFAULT_COPY.greeting,
    subtext:         raw.subtext         || DEFAULT_COPY.subtext,
    talk_cta:        raw.talk_cta        || DEFAULT_COPY.talk_cta,
    empty_chat_seed: raw.empty_chat_seed || DEFAULT_COPY.empty_chat_seed,
    empty_jobs:      raw.empty_jobs      || DEFAULT_COPY.empty_jobs,
    empty_facts:     raw.empty_facts     || DEFAULT_COPY.empty_facts,
    accent:          raw.accent          || DEFAULT_COPY.accent,
  };
  const resolvedFirst = (firstName || 'there').trim() || 'there';
  const greetingResolved = copy.greeting.replace(/\{first_name\}/g, resolvedFirst);
  return { ...copy, greetingResolved };
}
