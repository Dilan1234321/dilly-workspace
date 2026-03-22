"use client";

import React from "react";
import { normalizeVoiceDimensionMarkup } from "@/lib/voiceDimensionMarkup";

type Part =
  | { type: "text"; content: string }
  | { type: "bold"; content: string }
  | { type: "italic"; content: string }
  | { type: "underline"; content: string }
  | { type: "stripe"; content: string }
  | { type: "color"; content: string; color: string };

const COLOR_CLASSES: Record<string, string> = {
  blue: "font-bold text-blue-400",
  gold: "font-bold text-amber-400",
  white: "font-bold text-white",
  red: "font-bold text-red-400",
  smart: "font-bold text-amber-400",
  grit: "font-bold text-emerald-400",
  build: "font-bold text-sky-400",
};

function parseVoiceContent(text: string): Part[] {
  const parts: Part[] = [];
  let remaining = normalizeVoiceDimensionMarkup(text);

  const patterns: Array<{
    regex: RegExp;
    type: Part["type"];
    getContent: (m: RegExpMatchArray) => { content: string; color?: string };
  }> = [
    {
      regex: /\[(blue|gold|white|red|smart|grit|build)\]([\s\S]*?)\[\/\1\]/g,
      type: "color",
      getContent: (m) => ({ content: m[2] ?? "", color: m[1] }),
    },
    {
      regex: /\*\*([\s\S]+?)\*\*/g,
      type: "bold",
      getContent: (m) => ({ content: m[1] ?? "" }),
    },
    {
      regex: /__([\s\S]+?)__/g,
      type: "underline",
      getContent: (m) => ({ content: m[1] ?? "" }),
    },
    {
      regex: /~~([\s\S]+?)~~/g,
      type: "stripe",
      getContent: (m) => ({ content: m[1] ?? "" }),
    },
    {
      regex: /\*([^*]+)\*/g,
      type: "italic",
      getContent: (m) => ({ content: m[1] ?? "" }),
    },
  ];

  while (remaining.length > 0) {
    let earliest: {
      index: number;
      len: number;
      type: Part["type"];
      content: string;
      color?: string;
    } | null = null;

    for (const { regex, type, getContent } of patterns) {
      const m = remaining.match(regex);
      if (m) {
        const idx = remaining.indexOf(m[0]);
        if (earliest === null || idx < earliest.index) {
          const { content, color } = getContent(m);
          earliest = {
            index: idx,
            len: m[0].length,
            type,
            content,
            color,
          };
        }
      }
    }

    if (!earliest) {
      parts.push({ type: "text", content: remaining });
      break;
    }

    if (earliest.index > 0) {
      parts.push({ type: "text", content: remaining.slice(0, earliest.index) });
    }

    if (earliest.type === "color" && earliest.color) {
      parts.push({
        type: "color",
        content: earliest.content,
        color: earliest.color,
      });
    } else if (earliest.type !== "color") {
      parts.push({
        type: earliest.type,
        content: earliest.content,
      } as Part);
    }

    remaining = remaining.slice(earliest.index + earliest.len);
  }

  return parts;
}

function renderPart(part: Part, key: number): React.ReactNode {
  if (part.type === "text") {
    return <React.Fragment key={key}>{part.content}</React.Fragment>;
  }
  const inner = parseVoiceContent(part.content).map((p, i) => renderPart(p, key * 100 + i));
  switch (part.type) {
    case "bold":
      return <strong key={key}>{inner}</strong>;
    case "italic":
      return <em key={key}>{inner}</em>;
    case "underline":
      return (
        <span key={key} className="underline">
          {inner}
        </span>
      );
    case "stripe":
      return (
        <span key={key} className="line-through">
          {inner}
        </span>
      );
    case "color":
      return (
        <span key={key} className={COLOR_CLASSES[part.color] ?? "font-bold"}>
          {inner}
        </span>
      );
    default:
      return <React.Fragment key={key}>{inner}</React.Fragment>;
  }
}

export function VoiceFormattedText({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const parts = parseVoiceContent(content);
  return (
    <span className={className}>
      {parts.map((p, i) => renderPart(p, i))}
    </span>
  );
}
