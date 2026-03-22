/** Model emits this on its own line; the app strips it and renders charts from live audit data. */
export const SCORES_VISUAL_MARKER = "[[scores_visual]]";

const MARKER_RE = /\[\[scores_visual\]\]\s*/gi;

/** Remove the scores marker and any incomplete trailing `[[...` from streaming chunks. */
export function stripScoresVisualFromVoiceText(text: string): string {
  let t = text.replace(MARKER_RE, "");
  t = t.replace(/\[\[[^\]]*$/g, "");
  return t;
}

export function rawVoiceTextRequestsScoresVisual(text: string): boolean {
  return /\[\[scores_visual\]\]/i.test(text);
}

export function splitVoiceTextAroundScoresVisual(text: string): { before: string; after: string } | null {
  if (!rawVoiceTextRequestsScoresVisual(text)) return null;
  const parts = text.split(/\[\[scores_visual\]\]\s*/i);
  const before = parts[0] ?? "";
  const after = parts.slice(1).join("");
  return { before, after };
}

/**
 * When the model omits [[scores_visual]] but clearly explains Smart/Grit/Build, the client still shows the chart.
 * Conservative: avoids firing on casual one-word mentions.
 */
export function assistantMessageSuggestsScoreBreakdown(rawContent: string): boolean {
  const t = rawContent.trim();
  if (!t) return false;
  if (/\[\[scores_visual\]\]/i.test(t)) return false;

  const head = t.slice(0, 2500);

  // Streaming-safe: phrases that imply a Smart/Grit/Build overview (often < 40 chars early in the stream)
  if (/here\s+are\s+your\s+scores?\b/i.test(head)) return true;
  if (/\bhere\s+are\s+(the|your)\s+(three\s+)?scores?\b/i.test(head)) return true;
  if (/\blet\s+me\s+(pull\s+up|show|grab)\s+your\s+scores?\b/i.test(head)) return true;

  if (t.length < 40) return false;

  if (/scores?\s+are\s*,/i.test(head) || /current scores?\s+are\s*,/i.test(head)) return true;

  const hasDim = /\b(smart|grit|build)\b/i.test(head);
  const scoreNoun = /\bscores?\b/i.test(head);
  const explain =
    /\b(breakdown|explain|walk you through|here'?s where|where you stand|your numbers|those numbers|three numbers|each (score|dimension)|dilly (score|take))\b/i.test(
      head
    );

  if (hasDim && scoreNoun && explain) return true;

  // Assistant is clearly answering a "what are my scores / explain scores" style question
  if (
    scoreNoun &&
    hasDim &&
    /\b(here'?s|here is|here are|let me|quick(ly)?|break ?down|overview|summary of|those three)\b/i.test(head)
  ) {
    return true;
  }

  return false;
}
