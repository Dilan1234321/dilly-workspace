"use client";

import * as React from "react";

/**
 * Supported colors for [color]text[/color] syntax.
 * Colored text is always rendered bold.
 */
const COLOR_MAP: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  purple: "#a855f7",
  pink: "#ec4899",
  cyan: "#06b6d4",
  teal: "#14b8a6",
  gold: "#fdb913",
  white: "#ffffff",
  gray: "#9ca3af",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRecursive(text: string, keyPrefix: string): React.ReactNode {
  if (!text) return null;

  // 1. Color blocks [colorName]text[/colorName] - colored text must be bold
  const colorRegex = /\[(\w+)\]([\s\S]*?)\[\/\1\]/g;
  const colorMatch = colorRegex.exec(text);
  if (colorMatch) {
    const [full, colorName, inner] = colorMatch;
    const idx = text.indexOf(full);
    const color = COLOR_MAP[colorName.toLowerCase()] ?? colorName;
    return (
      <React.Fragment key={keyPrefix}>
        {formatRecursive(text.slice(0, idx), `${keyPrefix}-a`)}
        <span style={{ color }} className="font-bold">
          {formatRecursive(inner, `${keyPrefix}-c`)}
        </span>
        {formatRecursive(text.slice(idx + full.length), `${keyPrefix}-b`)}
      </React.Fragment>
    );
  }

  // 2. Bold **text**
  const boldMatch = text.match(/\*\*([\s\S]+?)\*\*/);
  if (boldMatch) {
    const [full, inner] = boldMatch;
    const idx = text.indexOf(full);
    return (
      <React.Fragment key={keyPrefix}>
        {formatRecursive(text.slice(0, idx), `${keyPrefix}-a`)}
        <strong>{formatRecursive(inner, `${keyPrefix}-b`)}</strong>
        {formatRecursive(text.slice(idx + full.length), `${keyPrefix}-c`)}
      </React.Fragment>
    );
  }

  // 3. Italic *text* (single asterisks, not **)
  const italicMatch = text.match(/\*([^*]+)\*/);
  if (italicMatch) {
    const [full, inner] = italicMatch;
    const idx = text.indexOf(full);
    return (
      <React.Fragment key={keyPrefix}>
        {formatRecursive(text.slice(0, idx), `${keyPrefix}-a`)}
        <em>{formatRecursive(inner, `${keyPrefix}-b`)}</em>
        {formatRecursive(text.slice(idx + full.length), `${keyPrefix}-c`)}
      </React.Fragment>
    );
  }

  // 4. Underline __text__
  const underlineMatch = text.match(/__([\s\S]+?)__/);
  if (underlineMatch) {
    const [full, inner] = underlineMatch;
    const idx = text.indexOf(full);
    return (
      <React.Fragment key={keyPrefix}>
        {formatRecursive(text.slice(0, idx), `${keyPrefix}-a`)}
        <u>{formatRecursive(inner, `${keyPrefix}-b`)}</u>
        {formatRecursive(text.slice(idx + full.length), `${keyPrefix}-c`)}
      </React.Fragment>
    );
  }

  // 5. Strikethrough ~~text~~
  const strikeMatch = text.match(/~~([\s\S]+?)~~/);
  if (strikeMatch) {
    const [full, inner] = strikeMatch;
    const idx = text.indexOf(full);
    return (
      <React.Fragment key={keyPrefix}>
        {formatRecursive(text.slice(0, idx), `${keyPrefix}-a`)}
        <s>{formatRecursive(inner, `${keyPrefix}-b`)}</s>
        {formatRecursive(text.slice(idx + full.length), `${keyPrefix}-c`)}
      </React.Fragment>
    );
  }

  // No match: return escaped plain text
  return <span dangerouslySetInnerHTML={{ __html: escapeHtml(text) }} />;
}

interface FormattedChatTextProps {
  children: string;
  className?: string;
}

/**
 * Renders chat text with support for:
 * - **bold**
 * - *italic*
 * - __underline__
 * - ~~strikethrough~~
 * - [colorName]text[/colorName] (colored + bold). Colors: red, blue, green, yellow, orange, purple, pink, cyan, teal, gold, white, gray
 */
export function FormattedChatText({ children, className }: FormattedChatTextProps) {
  return (
    <span className={className} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {formatRecursive(children, "fmt")}
    </span>
  );
}
