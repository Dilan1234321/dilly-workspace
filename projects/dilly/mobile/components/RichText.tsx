/**
 * RichText — inline markdown renderer for Dilly AI chat bubbles.
 *
 * Supported syntax:
 *   **text**        → bold
 *   *text*          → italic
 *   __text__        → underline
 *   ~~text~~        → strikethrough
 *   ==gold==        → bold gold (#C9A84C)
 *   ==green:text==  → bold green (#34C759)
 *   ==amber:text==  → bold amber (#FF9F0A)
 *   ==blue:text==   → bold blue (#0A84FF)
 *   ==coral:text==  → bold coral (#FF453A)
 *
 * Nesting: bold + italic can combine (**_text_** or *__text__*)
 * Line breaks (\n) render as newlines.
 */

import React from 'react';
import { Text, TextStyle } from 'react-native';

const GOLD  = '#C9A84C';
const GREEN = '#34C759';
const AMBER = '#FF9F0A';
const BLUE  = '#0A84FF';
const CORAL = '#FF453A';

const COLOR_MAP: Record<string, string> = {
  gold:   GOLD,
  green:  GREEN,
  amber:  AMBER,
  blue:   BLUE,
  coral:  CORAL,
  red:    CORAL,
};

// Token types
type TokenType =
  | 'text'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'color'
  | 'newline';

interface Token {
  type: TokenType;
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parse(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Newline
    if (input[i] === '\n') {
      tokens.push({ type: 'newline', text: '\n' });
      i++;
      continue;
    }

    // ==color:text== or ==text== (gold default)
    if (input.startsWith('==', i)) {
      const end = input.indexOf('==', i + 2);
      if (end !== -1) {
        const inner = input.slice(i + 2, end);
        const colonIdx = inner.indexOf(':');
        if (colonIdx !== -1) {
          const colorKey = inner.slice(0, colonIdx).trim().toLowerCase();
          const text = inner.slice(colonIdx + 1);
          const color = COLOR_MAP[colorKey] || GOLD;
          tokens.push({ type: 'color', text, color, bold: true });
        } else {
          tokens.push({ type: 'color', text: inner, color: GOLD, bold: true });
        }
        i = end + 2;
        continue;
      }
    }

    // ~~strikethrough~~
    if (input.startsWith('~~', i)) {
      const end = input.indexOf('~~', i + 2);
      if (end !== -1) {
        tokens.push({ type: 'strike', text: input.slice(i + 2, end), strike: true });
        i = end + 2;
        continue;
      }
    }

    // __underline__
    if (input.startsWith('__', i)) {
      const end = input.indexOf('__', i + 2);
      if (end !== -1) {
        tokens.push({ type: 'underline', text: input.slice(i + 2, end), underline: true });
        i = end + 2;
        continue;
      }
    }

    // **bold**
    if (input.startsWith('**', i)) {
      const end = input.indexOf('**', i + 2);
      if (end !== -1) {
        tokens.push({ type: 'bold', text: input.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    }

    // *italic*
    if (input[i] === '*' && input[i + 1] !== '*') {
      const end = input.indexOf('*', i + 1);
      if (end !== -1 && input[end + 1] !== '*') {
        tokens.push({ type: 'italic', text: input.slice(i + 1, end), italic: true });
        i = end + 1;
        continue;
      }
    }

    // Plain text — collect until next special char
    let j = i + 1;
    while (j < input.length) {
      const c = input[j];
      if (
        c === '\n' ||
        c === '*' ||
        c === '_' ||
        c === '~' ||
        c === '='
      ) break;
      j++;
    }
    tokens.push({ type: 'text', text: input.slice(i, j) });
    i = j;
  }

  return tokens;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

interface RichTextProps {
  text: string;
  baseStyle?: TextStyle;
}

export default function RichText({ text, baseStyle }: RichTextProps) {
  const tokens = parse(text);

  return (
    <Text style={baseStyle}>
      {tokens.map((token, idx) => {
        if (token.type === 'newline') {
          return <Text key={idx}>{'\n'}</Text>;
        }

        const style: TextStyle = {};

        if (token.bold)      style.fontWeight = '700';
        if (token.italic)    style.fontStyle  = 'italic';
        if (token.underline) style.textDecorationLine = 'underline';
        if (token.strike)    style.textDecorationLine = 'line-through';
        if (token.color) {
          style.color      = token.color;
          style.fontWeight = '700';
        }

        return (
          <Text key={idx} style={style}>
            {token.text}
          </Text>
        );
      })}
    </Text>
  );
}
