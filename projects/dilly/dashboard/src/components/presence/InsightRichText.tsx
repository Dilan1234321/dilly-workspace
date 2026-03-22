"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Renders insight with emphasis phrases (and numeric tokens) in stronger type.
 */
export function InsightRichText({ text, emphases = [] }: { text: string; emphases?: string[] }) {
  const sorted = [...emphases].filter(Boolean).sort((a, b) => b.length - a.length);
  const pieces: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length) {
    let found: { start: number; phrase: string } | null = null;
    for (const phrase of sorted) {
      const i = remaining.indexOf(phrase);
      if (i >= 0 && (found === null || i < found.start)) found = { start: i, phrase };
    }
    if (!found) {
      pieces.push(
        <span key={key++} className="tabular-nums">
          {highlightNumbers(remaining)}
        </span>,
      );
      break;
    }
    if (found.start > 0) {
      pieces.push(
        <span key={key++} className="tabular-nums">
          {highlightNumbers(remaining.slice(0, found.start))}
        </span>,
      );
    }
    pieces.push(
      <span key={key++} className="font-semibold" style={{ color: "var(--t1)" }}>
        {found.phrase}
      </span>,
    );
    remaining = remaining.slice(found.start + found.phrase.length);
  }

  return <>{pieces}</>;
}

function highlightNumbers(s: string): ReactNode {
  const re = /(\d+(?:\.\d+)?%?)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(<Fragment key={k++}>{s.slice(last, m.index)}</Fragment>);
    out.push(
      <span key={k++} className="font-semibold" style={{ color: "var(--t1)" }}>
        {m[1]}
      </span>,
    );
    last = m.index + m[1].length;
  }
  if (last < s.length) out.push(<Fragment key={k++}>{s.slice(last)}</Fragment>);
  return out.length ? out : s;
}
