/**
 * Parse Dilly Voice assistant text for [[visual markers]] and small structured blocks.
 * Model instructions: voice_helpers.py (VOICE_INLINE_VISUALS_BLOCK).
 */

import { assistantMessageSuggestsScoreBreakdown } from "@/lib/voiceScoreVisual";
import type { VoiceVisualSegment } from "@/lib/voiceVisualTypes";

export type { VoiceChatVisualContext, VoiceVisualSegment } from "@/lib/voiceVisualTypes";

export const MARKER_SCORES = "[[scores_visual]]";
export const MARKER_TOP_RECS = "[[top_recs_visual]]";
export const MARKER_DEADLINE_TIMELINE = "[[deadline_timeline_visual]]";
export const MARKER_INTERVIEW_AGENDA = "[[interview_agenda_visual]]";
export const MARKER_CALENDAR_SAVED = "[[calendar_saved_visual]]";

function parseBeforeAfterInner(inner: string): { before: string; after: string } | null {
  const lines = inner
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let before = "";
  let after = "";
  for (const line of lines) {
    const mB = line.match(/^BEFORE:\s*(.+)$/i);
    const mA = line.match(/^AFTER:\s*(.+)$/i);
    if (mB) before = mB[1]!.trim();
    else if (mA) after = mA[1]!.trim();
  }
  if (!before && !after) return null;
  return { before: before || "…", after: after || "…" };
}

function parseChipsInner(inner: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const line of inner.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const idx = t.indexOf(":");
    if (idx <= 0) continue;
    const label = t.slice(0, idx).trim();
    const value = t.slice(idx + 1).trim();
    if (label && value) out.push({ label, value });
  }
  return out.slice(0, 8);
}

function parseStepsInner(inner: string): string[] {
  return inner
    .split(/\r?\n/)
    .map((l) => l.replace(/^\d+[\).\s]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function parseApplicationCardInner(inner: string): { company: string; role?: string; status?: string; deadline?: string } | null {
  let company = "";
  let role: string | undefined;
  let status: string | undefined;
  let deadline: string | undefined;
  for (const line of inner.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const mC = t.match(/^Company:\s*(.+)$/i);
    if (mC) {
      company = mC[1]!.trim();
      continue;
    }
    const mR = t.match(/^Role:\s*(.+)$/i);
    if (mR) {
      role = mR[1]!.trim();
      continue;
    }
    const mS = t.match(/^Status:\s*(.+)$/i);
    if (mS) {
      status = mS[1]!.trim();
      continue;
    }
    const mD = t.match(/^Deadline:\s*(.+)$/i);
    if (mD) {
      deadline = mD[1]!.trim();
    }
  }
  if (!company) return null;
  return { company, role, status, deadline };
}

function parseNextMovesInner(inner: string): string[] {
  return inner
    .split(/\r?\n/)
    .map((l) => l.replace(/^\d+[\).\s]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function parseStoryTimelineInner(inner: string): { kind: string; text: string }[] {
  const out: { kind: string; text: string }[] = [];
  for (const line of inner.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const idx = t.indexOf(":");
    if (idx <= 0) continue;
    const kind = t.slice(0, idx).trim();
    const text = t.slice(idx + 1).trim();
    if (kind && text) out.push({ kind, text });
  }
  return out.slice(0, 8);
}

function extractBlocks(raw: string): { text: string; blocks: VoiceVisualSegment[] } {
  const blocks: VoiceVisualSegment[] = [];
  let s = raw;

  const take = (re: RegExp, fn: (inner: string) => VoiceVisualSegment | null) => {
    s = s.replace(re, (full, inner: string) => {
      const seg = fn(inner);
      if (!seg) return full;
      const id = blocks.length;
      blocks.push(seg);
      return ` __VD${id}__ `;
    });
  };

  take(/\[\[before_after\]\]\s*([\s\S]*?)\s*\[\[\/before_after\]\]/gi, (inner) => {
    const p = parseBeforeAfterInner(inner);
    return p ? { type: "before_after_visual", ...p } : null;
  });
  take(/\[\[chips\]\]\s*([\s\S]*?)\s*\[\[\/chips\]\]/gi, (inner) => {
    const chips = parseChipsInner(inner);
    return chips.length ? { type: "fact_chips_visual", chips } : null;
  });
  take(/\[\[steps\]\]\s*([\s\S]*?)\s*\[\[\/steps\]\]/gi, (inner) => {
    const items = parseStepsInner(inner);
    return items.length ? { type: "steps_visual", items } : null;
  });
  take(/\[\[calendar_saved\]\]\s*([\s\S]*?)\s*\[\[\/calendar_saved\]\]/gi, (inner) => {
    const line =
      inner
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? "";
    const summary = line.length > 0 ? line.slice(0, 200) : null;
    return { type: "calendar_saved_visual", summary };
  });
  take(/\[\[application_card\]\]\s*([\s\S]*?)\s*\[\[\/application_card\]\]/gi, (inner) => {
    const p = parseApplicationCardInner(inner);
    return p ? { type: "application_card_visual", ...p } : null;
  });
  take(/\[\[next_moves\]\]\s*([\s\S]*?)\s*\[\[\/next_moves\]\]/gi, (inner) => {
    const items = parseNextMovesInner(inner);
    return items.length ? { type: "next_moves_visual", items } : null;
  });
  take(/\[\[story_timeline\]\]\s*([\s\S]*?)\s*\[\[\/story_timeline\]\]/gi, (inner) => {
    const nodes = parseStoryTimelineInner(inner);
    return nodes.length ? { type: "story_timeline_visual", nodes } : null;
  });

  return { text: s, blocks };
}

function tryConsumeMarker(text: string, i: number): { seg: VoiceVisualSegment; len: number } | null {
  const rest = text.slice(i);
  const lower = rest.toLowerCase();
  if (lower.startsWith("[[scores_visual]]")) return { seg: { type: "scores_visual" }, len: "[[scores_visual]]".length };
  if (lower.startsWith("[[top_recs_visual]]")) return { seg: { type: "top_recs_visual" }, len: "[[top_recs_visual]]".length };
  if (lower.startsWith("[[deadline_timeline_visual]]"))
    return { seg: { type: "deadline_timeline_visual" }, len: "[[deadline_timeline_visual]]".length };
  const ia = rest.match(/^\[\[interview_agenda_visual:(\d)\]\]/i);
  if (ia) {
    const n = parseInt(ia[1]!, 10);
    return {
      seg: { type: "interview_agenda_visual", highlightStep: Math.min(3, Math.max(0, n)) },
      len: ia[0].length,
    };
  }
  if (lower.startsWith("[[interview_agenda_visual]]"))
    return { seg: { type: "interview_agenda_visual", highlightStep: null }, len: "[[interview_agenda_visual]]".length };
  if (lower.startsWith("[[calendar_saved_visual]]"))
    return { seg: { type: "calendar_saved_visual", summary: null }, len: "[[calendar_saved_visual]]".length };
  if (lower.startsWith("[[peer_context_visual]]"))
    return { seg: { type: "peer_context_visual" }, len: "[[peer_context_visual]]".length };
  return null;
}

function nextSpecialIndex(text: string, from: number): number {
  const slice = text.slice(from);
  if (!slice.length) return -1;
  const lower = slice.toLowerCase();
  let best = -1;
  const bump = (p: number) => {
    if (p < 0) return;
    best = best < 0 ? p : Math.min(best, p);
  };
  bump(slice.indexOf("__VD"));
  bump(lower.indexOf("[[scores_visual]]"));
  bump(lower.indexOf("[[top_recs_visual]]"));
  bump(lower.indexOf("[[deadline_timeline_visual]]"));
  bump(lower.indexOf("[[interview_agenda_visual]]"));
  bump(lower.indexOf("[[calendar_saved_visual]]"));
  bump(lower.indexOf("[[calendar_saved]]"));
  bump(lower.indexOf("[[peer_context_visual]]"));
  bump(lower.indexOf("[[application_card]]"));
  bump(lower.indexOf("[[next_moves]]"));
  bump(lower.indexOf("[[story_timeline]]"));
  const iaIdx = lower.search(/\[\[interview_agenda_visual:\d\]\]/);
  bump(iaIdx);
  return best < 0 ? -1 : from + best;
}

export function parseVoiceVisualSegments(raw: string): VoiceVisualSegment[] {
  const { text, blocks } = extractBlocks(raw);
  const segments: VoiceVisualSegment[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && (text[i] === " " || text[i] === "\n" || text[i] === "\t")) i++;
    if (i >= text.length) break;
    const ph = text.slice(i).match(/^__VD(\d+)__/);
    if (ph) {
      const id = parseInt(ph[1]!, 10);
      const blk = blocks[id];
      if (blk) segments.push(blk);
      i += ph[0].length;
      continue;
    }
    const consumed = tryConsumeMarker(text, i);
    if (consumed) {
      segments.push(consumed.seg);
      i += consumed.len;
      continue;
    }
    const next = nextSpecialIndex(text, i);
    if (next < 0 || next > i) {
      const chunk = next < 0 ? text.slice(i) : text.slice(i, next);
      if (chunk) segments.push({ type: "text", content: chunk });
      i = next < 0 ? text.length : next;
    } else {
      segments.push({ type: "text", content: text[i] ?? "" });
      i += 1;
    }
  }
  return mergeAdjacentText(segments);
}

function mergeAdjacentText(segs: VoiceVisualSegment[]): VoiceVisualSegment[] {
  const out: VoiceVisualSegment[] = [];
  for (const seg of segs) {
    if (seg.type === "text" && out.length && out[out.length - 1]!.type === "text") {
      (out[out.length - 1] as { type: "text"; content: string }).content += seg.content;
    } else if (seg.type !== "text" || seg.content.trim()) {
      out.push(seg);
    }
  }
  return out;
}

export function stripVoiceVisualArtifacts(text: string): string {
  const { text: t } = extractBlocks(text);
  let u = t.replace(/\[\[scores_visual\]\]\s*/gi, "");
  u = u.replace(/\[\[top_recs_visual\]\]\s*/gi, "");
  u = u.replace(/\[\[deadline_timeline_visual\]\]\s*/gi, "");
  u = u.replace(/\[\[interview_agenda_visual\]\]\s*/gi, "");
  u = u.replace(/\[\[interview_agenda_visual:\d\]\]\s*/gi, "");
  u = u.replace(/\[\[calendar_saved_visual\]\]\s*/gi, "");
  u = u.replace(/\[\[peer_context_visual\]\]\s*/gi, "");
  u = u.replace(/\s*__VD\d+__\s*/g, " ");
  u = u.replace(/\[\[[^\]]*$/g, "");
  return u.replace(/\s+\n/g, "\n").trim();
}

export function voiceMessageContainsVisualMarkers(raw: string): boolean {
  if (/\[\[scores_visual\]\]/i.test(raw)) return true;
  if (/\[\[top_recs_visual\]\]/i.test(raw)) return true;
  if (/\[\[deadline_timeline_visual\]\]/i.test(raw)) return true;
  if (/\[\[interview_agenda_visual/i.test(raw)) return true;
  if (/\[\[before_after\]\]/i.test(raw)) return true;
  if (/\[\[chips\]\]/i.test(raw)) return true;
  if (/\[\[steps\]\]/i.test(raw)) return true;
  if (/\[\[calendar_saved_visual\]\]/i.test(raw)) return true;
  if (/\[\[calendar_saved\]\]/i.test(raw)) return true;
  if (/\[\[peer_context_visual\]\]/i.test(raw)) return true;
  if (/\[\[application_card\]\]/i.test(raw)) return true;
  if (/\[\[next_moves\]\]/i.test(raw)) return true;
  if (/\[\[story_timeline\]\]/i.test(raw)) return true;
  return false;
}

/**
 * One-line detail under the “Saved to your calendar” card (from assistant prose).
 */
export function extractCalendarSavedSummaryLine(raw: string): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  const sent = (oneLine.split(/(?<=[.!?])\s+/)[0] || oneLine).slice(0, 180);
  const stripped = sent
    .replace(/^I(?:'ve| have)\s+added\s+/i, "")
    .replace(/^I\s+added\s+/i, "")
    .replace(/^I've\s+saved\s+/i, "")
    .replace(/^I\s+saved\s+/i, "")
    .replace(/^I've\s+put\s+/i, "")
    .replace(/^I\s+put\s+/i, "")
    .replace(/^I've\s+scheduled\s+/i, "")
    .replace(/^I\s+scheduled\s+/i, "")
    .replace(/^Done[.!—\s-]*/i, "")
    .replace(/^All\s+set[.!—\s-]*/i, "")
    .trim();
  if (stripped.length >= 6) return stripped.slice(0, 160);
  return "Calendar updated";
}

/**
 * Assistant confirmed saving a meeting, deadline, or calendar item — show the confirmation card.
 * Model may emit [[calendar_saved_visual]] or [[calendar_saved]]…[[/calendar_saved]]; if omitted, client may inject.
 */
export function assistantMessageSuggestsCalendarSavedVisual(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 18) return false;
  if (/\[\[calendar_saved/i.test(t)) return false;
  const head = t.slice(0, 900);
  if (/\b(added\s+(?:numbers|metrics|quant|more)\s+to|add\s+numbers\s+to)\b/i.test(head)) return false;
  const confirmsWrite =
    /\b(I(?:'ve| have)\s+added|I\s+added|I've\s+saved|I\s+saved|I've\s+put|I\s+put|I've\s+scheduled|I\s+scheduled|it's\s+on\s+your|it\s+is\s+on\s+your|now\s+on\s+your\s+calendar|got\s+it\s+on\s+your\s+calendar|logged\s+(?:that|it)\s+on\s+your|recorded\s+(?:that|it)\s+(?:on|for)\s+your)\b/i.test(
      head,
    );
  const calendarish =
    /\b(calendar|schedule|planner|deadline|reminder|meeting|zoom|teams|google\s+meet|coffee\s+chat|call|interview|appointment|event)\b/i.test(
      head,
    );
  return confirmsWrite && calendarish;
}

/** Reply is primarily about deadlines / calendar — do not attach the interview prep strip. */
function replyIsDeadlineFocused(head: string): boolean {
  return /\b(what\s+deadlines|deadlines?\s+do\s+i|your\s+deadlines|deadlines?\s+(you\s+have|coming|up)|upcoming\s+deadlines?|important\s+deadlines?|due\s+dates?|on\s+your\s+calendar|add\s+(these|them|it)\s+to\s+your\s+calendar|save\s+(these|them)\s+to\s+your\s+calendar)\b/i.test(
    head,
  );
}

/**
 * Model often omits [[deadline_timeline_visual]] while listing upcoming dates. Only when profile has deadlines to show.
 */
export function assistantMessageSuggestsDeadlineTimelineVisual(raw: string, hasDeadlineData: boolean): boolean {
  if (!hasDeadlineData) return false;
  const t = raw.trim();
  if (t.length < 40) return false;
  if (/\[\[deadline_timeline_visual\]\]/i.test(t)) return false;
  const head = t.slice(0, 2800);
  if (!/\b(deadline|due\s+date|calendar)\b/i.test(head)) return false;
  return replyIsDeadlineFocused(head);
}

/**
 * Model often omits [[interview_agenda_visual]] while still giving a numbered prep plan.
 * Strict: real interview-prep vocabulary (not bare “interview” in a deadline reply) + list structure.
 */
export function assistantMessageSuggestsInterviewAgendaStrip(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 80) return false;
  if (/\[\[interview_agenda_visual/i.test(t)) return false;
  const head = t.slice(0, 2200);

  const explicitInterviewCue =
    /\b(mock\s+interview|interview\s+prep|prep\s+for\s+(your|my|the)\s+interview|before\s+(your|the)\s+interview|behavioral\s+interview|case\s+interview|phone\s+screen|hiring\s+manager|interview\s+agenda|interview\s+(day|tomorrow|next\s+week|this\s+week)|for\s+(your|the)\s+interview|at\s+the\s+interview|STAR(?:\s+(?:method|stories))?|questions?\s+they('ll|will|\s+might)\s+ask|night\s+before\s+(your|the)\s+interview)\b/i.test(
      head,
    );

  const looksGenericCoaching =
    /\b(what\s+can\s+i\s+do|how\s+can\s+i\s+improve|how\s+to\s+improve|to\s+be\s+better|get\s+better|improve\s+your\s+(score|scores)|your\s+(smart|grit|build)\s+score|score\s+breakdown|from\s+your\s+(latest\s+)?audit|overall\s+\d+)\b/i.test(
      head,
    );
  if (looksGenericCoaching && !explicitInterviewCue) return false;

  if (replyIsDeadlineFocused(head)) {
    const strongInterviewPrep =
      /\b(behavioral\s+interview|interview\s+prep|mock\s+interview|phone\s+screen|case\s+interview|STAR(?:\s+(?:method|stories))?|prep\s+for\s+(your|my|the)\s+interview|before\s+(your|the)\s+interview|interview\s+(day|tomorrow|next\s+week))\b/i.test(
        head,
      );
    if (!strongInterviewPrep) return false;
  }
  const interviewPrepFocused =
    /\b(behavioral\s+interview|mock\s+interview|phone\s+screen|case\s+interview|interview\s+prep|prep\s+for\s+(your|my|the)\s+interview|before\s+(your|the)\s+interview|interview\s+agenda|STAR(?:\s+(?:method|stories))?|questions?\s+they('ll|will|\s+might)\s+ask|hiring\s+manager\s+interview|night\s+before\s+(your|the)\s+interview|for\s+(your|the)\s+interview|at\s+the\s+interview|interview\s+(day|tomorrow|next\s+week))\b/i.test(
      head,
    );
  if (!interviewPrepFocused) return false;
  const lines = head.split(/\n/);
  const numberedLines = lines.filter((ln) => /\d+\.\s*\S/.test(ln.trim()));
  const hasList =
    numberedLines.length >= 3 ||
    (numberedLines.length >= 2 && /\b(agenda|prep\s+plan|behavioral|mock\s+interview|interview\s+prep)\b/i.test(head));
  return hasList;
}

export function voiceReplyShouldDisableTypewriter(
  raw: string,
  injectScores: boolean,
  hasDeadlineDataForHeuristic?: boolean,
): boolean {
  if (injectScores) return true;
  if (voiceMessageContainsVisualMarkers(raw)) return true;
  if (hasDeadlineDataForHeuristic && assistantMessageSuggestsDeadlineTimelineVisual(raw, true)) return true;
  if (assistantMessageSuggestsInterviewAgendaStrip(raw)) return true;
  if (assistantMessageSuggestsCalendarSavedVisual(raw)) return true;
  return false;
}

export { assistantMessageSuggestsScoreBreakdown };
