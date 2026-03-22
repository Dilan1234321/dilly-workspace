/**
 * In-chat mock interview: intent detection + shared constants.
 * API: POST /voice/mock-interview (see projects/dilly/api/routers/voice.py).
 */

import type { AuditV2 } from "@/types/dilly";

export const VOICE_MOCK_INTERVIEW_TOTAL = 5;

export function buildMockInterviewSessionContext(
  audit: AuditV2 | null,
  track: string | null | undefined,
  targetLabel: string | null | undefined,
): string {
  const parts: string[] = [];
  if (targetLabel?.trim()) parts.push(`Target role: ${targetLabel.trim()}`);
  if (track?.trim()) parts.push(`Track: ${track.trim()}`);
  if (audit?.candidate_name && audit.candidate_name !== "Unknown") {
    parts.push(`Candidate: ${audit.candidate_name}`);
  }
  if (audit?.structured_text) {
    parts.push(`Resume excerpt:\n${audit.structured_text.slice(0, 800)}`);
  }
  return parts.join("\n");
}

export type MockInterviewHistoryItem = { q: string; a: string };

export type MockInterviewApiResponse = {
  next_question?: string | null;
  score?: number | null;
  label?: string | null;
  feedback?: string | null;
  strengths?: string[] | null;
  improvements?: string[] | null;
  is_final?: boolean | null;
  session_score?: number | null;
  message?: string | null;
};

export function wantsMockInterview(text: string): boolean {
  const s = text.trim().toLowerCase();
  if (!s) return false;
  if (s === "/mockinterview" || s === "/mock-interview") return true;
  return /\b(mock|behavioral)\s+interview\b|\bpractice\s+interview\b|\binterview\s+practice\b|\bstart\s+(?:a\s+)?mock\b|\brun\s+(?:a\s+)?mock\s+interview\b|\bcan\s+we\s+do\s+(?:a\s+)?mock\b|\blet'?s\s+do\s+(?:a\s+)?mock\b|\bprep(?:are)?\s+(?:for\s+)?(?:an?\s+)?interview\b/i.test(
    s,
  );
}

export function wantsEndMockInterview(text: string): boolean {
  const s = text.trim().toLowerCase();
  if (!s) return false;
  return /\b(end|stop|cancel|quit|exit)\s+(?:the\s+)?(?:mock\s+)?interview\b|\b(?:end|stop)\s+mock\b|^done\s+with\s+interview$/i.test(
    s,
  );
}
