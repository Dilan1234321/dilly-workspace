/**
 * Model output sometimes uses empty dimension wrappers, e.g. "Your [build][/build] score"
 * which renders as a visible gap. We normalize tag casing and fill empty pairs using authoritative scores.
 */

export type VoiceScoresTriple = { smart: number; grit: number; build: number };

export type HealVoiceDimensionOpts = {
  /** Last user message in the thread — used to infer Smart/Grit/Build when the model omits tags. */
  priorUserContent?: string | null;
};

const DIM_KEYS = ["smart", "grit", "build"] as const;

function dimLabel(dim: (typeof DIM_KEYS)[number]): string {
  return dim === "smart" ? "Smart" : dim === "grit" ? "Grit" : "Build";
}

/** First dimension mentioned in the user's text (smart / grit / build), or null. */
export function inferVoiceFocusDimensionFromUserText(text: string | null | undefined): (typeof DIM_KEYS)[number] | null {
  if (!text?.trim()) return null;
  const t = text.toLowerCase();
  let best: (typeof DIM_KEYS)[number] | null = null;
  let bestIdx = Infinity;
  for (const dim of DIM_KEYS) {
    const idx = t.search(new RegExp(`\\b${dim}\\b`));
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx;
      best = dim;
    }
  }
  return best;
}

function stripInvisibleAndNbsp(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/[\u200b-\u200d\ufeff]/g, "");
}

/** Lowercase [Smart] → [smart] and [/Build] → [/build] for known dimensions so VoiceFormattedText parses them. */
export function normalizeVoiceDimensionMarkup(text: string): string {
  let s = text;
  for (const dim of DIM_KEYS) {
    s = s.replace(new RegExp(`\\[(${dim})\\]`, "gi"), `[${dim}]`);
    s = s.replace(new RegExp(`\\[\\/(${dim})\\]`, "gi"), `[/${dim}]`);
  }
  return s;
}

/**
 * Replace empty [dim][/dim] with "[dim]Dim score of N[/dim]" using live scores.
 * Also fixes "Your [dim][/dim] score" → "Your [dim]Dim score of N[/dim]" (drops duplicate "score").
 * When the model omits tags entirely (**Your score** is …) and priorUserContent names a dimension, fills that in.
 */
export function healEmptyVoiceDimensionTags(
  text: string,
  scores: VoiceScoresTriple | null,
  opts?: HealVoiceDimensionOpts | null,
): string {
  if (!scores) return text;
  let s = stripInvisibleAndNbsp(normalizeVoiceDimensionMarkup(text));

  s = s.replace(
    new RegExp(
      "\\bYour\\s+\\[\\s*(smart|grit|build)\\s*\\]\\s*\\[\\s*/\\s*\\1\\s*\\]\\s+score\\b",
      "gi",
    ),
    (_m, d) => {
      const dim = String(d).toLowerCase() as (typeof DIM_KEYS)[number];
      if (!DIM_KEYS.includes(dim)) return _m;
      const label = dimLabel(dim);
      const n = Math.round(Number(scores[dim]) || 0);
      return `Your [${dim}]${label} score of ${n}[/${dim}]`;
    },
  );

  for (const dim of DIM_KEYS) {
    const label = dimLabel(dim);
    const n = Math.round(Number(scores[dim]) || 0);
    const re = new RegExp(`\\[\\s*${dim}\\s*\\]\\s*\\[\\s*/\\s*${dim}\\s*\\]`, "gi");
    s = s.replace(re, `[${dim}]${label} score of ${n}[/${dim}]`);
  }

  const focus = inferVoiceFocusDimensionFromUserText(opts?.priorUserContent);
  if (focus) {
    const label = dimLabel(focus);
    const n = Math.round(Number(scores[focus]) || 0);
    const dim = focus;
    const inner = `[${dim}]${label} score of ${n}[/${dim}]`;
    s = s.replace(
      new RegExp("\\*\\*Your\\s+score\\*\\*(?=\\s+(?:is|was|means|reflects|shows|sits|looks)\\b)", "gi"),
      `**Your ${inner}**`,
    );
  }

  return s.replace(/[ \t]{2,}/g, " ");
}
