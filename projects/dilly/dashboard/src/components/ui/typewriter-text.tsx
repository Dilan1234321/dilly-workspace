"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Characters per second — smooth, Word-like pacing */
const CHARS_PER_SECOND = 55;

type Props = {
  fullText: string;
  /** When true, reveal text character by character. When false, show full text immediately. */
  isTyping: boolean;
  className?: string;
  /** Show a blinking cursor at the end while typing. Default true. */
  showCursor?: boolean;
  cursorColor?: string;
};

export function TypewriterText({
  fullText,
  isTyping,
  className,
  showCursor = true,
  cursorColor = "currentColor",
}: Props) {
  const [visibleLength, setVisibleLength] = useState(() => (isTyping ? 0 : fullText.length));
  const prevFullTextRef = useRef(fullText);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  // New message: reset and type from start. When isTyping becomes false, show full.
  useEffect(() => {
    if (fullText !== prevFullTextRef.current) {
      prevFullTextRef.current = fullText;
      setVisibleLength(isTyping ? 0 : fullText.length);
      startTimeRef.current = null;
    } else if (!isTyping) {
      setVisibleLength(fullText.length);
    }
  }, [fullText, isTyping, fullText.length]);

  // Smooth time-based reveal via requestAnimationFrame (no visibleLength in deps to avoid re-triggering)
  useEffect(() => {
    if (!isTyping || fullText.length === 0) return;
    if (startTimeRef.current === null) startTimeRef.current = performance.now();

    const tick = () => {
      const elapsed = performance.now() - (startTimeRef.current ?? 0);
      const targetChars = Math.floor((elapsed / 1000) * CHARS_PER_SECOND);
      const next = Math.min(targetChars, fullText.length);
      setVisibleLength(next);
      if (next < fullText.length) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isTyping, fullText.length]);

  const displayed = fullText.slice(0, visibleLength);
  const stillTyping = isTyping && visibleLength < fullText.length;

  return (
    <span className={cn("inline", className)}>
      {displayed}
      {showCursor && stillTyping && (
        <span
          className="inline-block w-0.5 h-[1em] ml-0.5 align-text-bottom voice-cursor-blink"
          style={{ backgroundColor: cursorColor }}
          aria-hidden
        />
      )}
    </span>
  );
}
