/**
 * Must match `projects/dilly/api/output_safety.py` REDIRECT_MESSAGE.
 */
export const VOICE_ASSISTANT_SLUR_REDIRECT = "Let's try to keep this professional.";

/** Defense in depth with server `output_safety.py` — block slurs in any assistant text shown in Voice. */
const SLUR_REGEXES: readonly RegExp[] = [
  /\bn[i1!|@]gg[ae3@][r2]?s?\b/i,
  /\bniggas?\b/i,
  /\bniggaz\b/i,
  /\bsand[\W_]*n[i1!@]gg[ae3@][r2]?s?\b/i,
  /\bch[i1]nk[sz]?\b/i,
  /\bg[o0]{2}ks?\b/i,
  /\bsp[i1]c[s]?\b/i,
  /\bw[e3]tb[a@]cks?\b/i,
  /\bt[o0]w[e3]lh[e3][a@]ds?\b/i,
  /\br[a@]gh[e3][a@]ds?\b/i,
  /\bb[e3][a@]n[e3]rs?\b/i,
  /\bc[o0]{2}ns?\b/i,
  /\bj[i1]g[a@]b[o0]{2}s?\b/i,
  /\bp[i1]ck[a@]nn[i1]nn(y|ies)\b/i,
  /\bp[a@]k[i1]s?\b/i,
  /\bw[o0]gs?\b/i,
  /\bd[a@]g[o0]s?\b/i,
  /\bkr[a@]uts?\b/i,
  /\bh[o0]nk(y|ies)\b/i,
  /\bch[i1]n[a@]m[a@]n\b/i,
  /\b[i1]njuns?\b/i,
  /\br[e3]dsk[i1]ns?\b/i,
  /\bsp[o0]{2}ks?\b/i,
  /\bk[i1@!]k[e3]s?\b/i,
  /\bf[a@4]gg[o0]ts?\b/i,
  /\bf[a@4]gs?\b/i,
  /\bd[y0]k[e3]s?\b/i,
  /\btr[a@]nn(y|ies)\b/i,
  /\bsh[e3]m[a@]l[e3]s?\b/i,
  /\br[e3]t[a@]rd(s|ed)?\b/i,
  /\bc[u]nts?\b/i,
  /\bwh[o0]r[e3]s?\b/i,
  /\bsl[u]ts?\b/i,
  /\bb[i1]tch[e3]s?\b/i,
];

function textContainsBlockedSlur(text: string): boolean {
  const sample = text.normalize("NFKC");
  return SLUR_REGEXES.some((rx) => {
    rx.lastIndex = 0;
    return rx.test(sample);
  });
}

/**
 * Fix garbled calendar/agenda placeholders, empty bullets, and broken score lines the model
 * sometimes emits next to [[scores_visual]] or proactive context.
 */
export function cleanVoiceAssistantGlitchArtifacts(text: string): string {
  let s = text;
  // Strip known-bad opener: agenda filler + empty date fragments (model confuses calendar + scores)
  const stripAgendaJunk = (re: RegExp) => {
    const next = s.replace(re, "");
    if (next !== s) s = next;
  };
  stripAgendaJunk(
    /^Here'?s what'?s on your agenda,?\s+[^:]+:\s*(?:-\s*)?on\s+the\s*\.\s*(?:That'?s in\s*!\s*)?/i
  );
  stripAgendaJunk(/^Here'?s what'?s on your agenda\s*:\s*(?:-\s*)?on\s+the\s*\.\s*(?:That'?s in\s*!\s*)?/i);
  stripAgendaJunk(
    /^Here'?s what'?s on your agenda,?\s+[^:]+:\s*(?:-\s*)?on\s+\.\s*(?:That'?s in\s*!\s*)?/i
  );
  stripAgendaJunk(/^Here'?s what'?s on your agenda\s*:\s*(?:-\s*)?on\s+\.\s*(?:That'?s in\s*!\s*)?/i);
  s = s.replace(/\bThat'?s in\s*!\s*/gi, " ");

  // Empty list markers (lines that are only - or •)
  for (let n = 0; n < 8; n++) {
    const next = s.replace(/(^|\n)\s*[-*•]\s*(?=\n|$)/g, "$1");
    if (next === s) break;
    s = next;
  }
  // "- : 81" broken label (chart already shows overall; strip orphan)
  s = s.replace(/\s*[-–]\s*:\s*\d{1,3}\b/g, " ");
  // Empty date fragments (narrow — avoid breaking normal English like "He's on …")
  s = s.replace(/\b(is\s+)?on\s+the\s*\.\s*/gi, (_m, is) => (is ? "is on a date you still need to confirm " : "on a date you still need to confirm "));
  s = s.replace(/\s-\s*on\s+\.\s*/gi, " on a date to confirm ");
  s = s.replace(/\b(interview|deadline|meeting|call|orientation)\s+is\s+on\s+\.\s*/gi, "$1 is on a date you still need to confirm ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

/** Remove redundant speaker labels the model sometimes echoes from transcript formatting. */
export function stripVoiceAssistantSpeakerPrefix(text: string): string {
  let s = text.trimStart();
  // Repeat in case of double labels
  for (let i = 0; i < 3; i++) {
    const next = s
      .replace(/^(?:\*\*)?Dilly(?:\*\*)?\s*:\s*/i, "")
      .replace(/^(?:\*\*)?Assistant(?:\*\*)?\s*:\s*/i, "")
      .replace(/^(?:\*\*)?(?:Dilly)(?:\*\*)?\s*:\s*/i, "");
    if (next === s) break;
    s = next;
  }
  return s.trimStart();
}

/**
 * Fix common broken model outputs (empty date before a period, etc.).
 */
export function sanitizeVoiceAssistantReply(text: string): string {
  let s = text.trim();
  if (!s) return s;
  s = stripVoiceAssistantSpeakerPrefix(s);
  s = cleanVoiceAssistantGlitchArtifacts(s);
  if (textContainsBlockedSlur(s)) return VOICE_ASSISTANT_SLUR_REDIRECT;
  return s.trim();
}
