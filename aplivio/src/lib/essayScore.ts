export type EssayRubric = {
  overall: number;
  clarity: number;
  specificity: number;
  structure: number;
  voice: number;
  notes: string[];
};

const BANNED_GENERIC = [
  "since i was young",
  "ever since i was a child",
  "i have always been passionate",
  "in the world today",
  "webster's dictionary defines",
];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Offline, deterministic rubric (no LLM). Complements /api/essay/coach when available. */
export function scoreEssayDraft(text: string): EssayRubric {
  const t = text.trim();
  const wc = wordCount(t);
  const notes: string[] = [];

  const lower = t.toLowerCase();
  let specificity = 55;
  const numbers = (t.match(/\d{2,4}/g) ?? []).length;
  const hasYear = /\b20\d{2}\b/.test(t);
  if (numbers >= 2 || hasYear) {
    specificity += 15;
    notes.push("Good: concrete numbers or dates anchor the story.");
  } else {
    notes.push("Add concrete details: numbers, time, place, or a named scene.");
  }

  const firstPerson = /\b(i|my|me)\b/i.test(t.slice(0, 400));
  if (firstPerson) {
    specificity += 15;
  } else {
    notes.push("Lead with first-person reflection so admissions hears your voice.");
  }

  for (const phrase of BANNED_GENERIC) {
    if (lower.includes(phrase)) {
      specificity -= 18;
      notes.push(`Avoid generic opener: "${phrase.replace(/\bi\b/g, "I")}"`);
    }
  }

  let structure = 60;
  const paragraphs = t.split(/\n\n+/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= 3) {
    structure += 15;
    notes.push("Structure: multiple paragraphs help pacing.");
  } else {
    notes.push("Break into 3–5 paragraphs: scene, conflict, resolution/reflection.");
  }

  let clarity = 58;
  const avgSentenceLen =
    t.split(/[.!?]+/).filter((s) => s.trim().length > 0).reduce((acc, s) => acc + s.split(/\s+/).length, 0) /
    Math.max(1, t.split(/[.!?]+/).filter((s) => s.trim().length > 0).length);
  if (avgSentenceLen > 8 && avgSentenceLen < 28) clarity += 12;
  else notes.push("Vary sentence length—mix short punchy lines with longer reflection.");

  if (wc < 200) {
    clarity -= 15;
    notes.push("Draft is short—aim for 500–650 words for Common App personal statement.");
  }
  if (wc > 720) {
    clarity -= 10;
    notes.push("Likely over typical limits—trim repetition and tighten anecdotes.");
  }

  let voice = 62;
  if (/[,]{2,}|\.\.|\bvery\b|\breally\b|\bjust\b/gi.test(t) && wc > 200) {
    voice -= 8;
    notes.push("Trim filler words (very/really/just) where possible.");
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  const clarityS = clamp(clarity);
  const specS = clamp(specificity);
  const structS = clamp(structure);
  const voiceS = clamp(voice);
  const overall = clamp((clarityS + specS + structS + voiceS) / 4);

  return {
    overall,
    clarity: clarityS,
    specificity: specS,
    structure: structS,
    voice: voiceS,
    notes: [...new Set(notes)].slice(0, 6),
  };
}
