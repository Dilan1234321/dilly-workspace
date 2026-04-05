/**
 * Fetches rich student context from the Python API for the AI coach.
 */

import { API_BASE } from "../tokens";

export interface RichContext {
  name: string;
  first_name: string;
  cohort: string;
  school: string;
  major: string;
  minor: string;
  pronouns: string;
  career_goal: string;
  industry_target: string;
  target_companies: string[];
  tagline: string;
  bio: string;
  linkedin: string;
  current_score: number | null;
  smart: number;
  grit: number;
  build: number;
  previous_score: number | null;
  score_delta: number | null;
  weakest_dimension: string | null;
  strongest_dimension: string | null;
  cohort_bar: number;
  reference_company: string;
  gap: number | null;
  cleared_bar: boolean;
  dilly_take: string;
  audit_count: number;
  days_since_audit: number | null;
  audit_history: Array<{
    score: number | null;
    scores: { smart?: number; grit?: number; build?: number };
    date: string | null;
    dilly_take: string;
  }>;
  app_counts: {
    saved: number;
    applied: number;
    interviewing: number;
    offer: number;
    rejected: number;
  };
  total_applications: number;
  interviewing_at: string[];
  applied_companies: string[];
  silent_apps: string[];
  upcoming_deadlines: Array<{
    label: string;
    date: string;
    days_until: number;
    type: string;
  }>;
  has_resume: boolean;
  has_editor_resume: boolean;
  resume_snippet: string;
  nudges: Array<{ priority: string; message: string }>;
  dilly_narrative?: string;
  beyond_resume?: Array<{ type?: string; text?: string }>;
  experience_expansion?: Array<{
    role_label?: string;
    organization?: string;
    skills?: string[];
    tools_used?: string[];
    omitted?: string[];
  }>;
  transcript_gpa?: number | string | null;
  transcript_courses?: string[];
  transcript_honors?: string[];
  job_locations?: string[];
  job_location_scope?: string;
  target_school?: string;
  voice_onboarding_answers?: string[];
  voice_biggest_concern?: string;
  achievements?: string[];
  preProfessional?: boolean | string;
  graduation_year?: string | number;
}

/** Fetch rich context server-side before calling streamText.
 *  Returns context with an optional `_contextError` field when the fetch fails
 *  so callers can inject a degraded-experience notice. */
export async function fetchRichContext(
  authToken: string,
): Promise<(RichContext & { _contextError?: string }) | null> {
  try {
    const res = await fetch(`${API_BASE}/ai/context`, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[context] /ai/context returned ${res.status}: ${await res.text().catch(() => "")}`);
      return { _contextError: `Context API returned ${res.status}` } as RichContext & { _contextError: string };
    }
    return (await res.json()) as RichContext;
  } catch (err) {
    console.error("[context] Failed to fetch rich context:", err);
    return { _contextError: String(err) } as RichContext & { _contextError: string };
  }
}

/** Execute a dilly_agent action via the Python API. */
export async function executeAction(
  authToken: string,
  action: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/voice/execute-action`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, data }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Action ${action} failed: ${text}`);
  }
  return res.json();
}
