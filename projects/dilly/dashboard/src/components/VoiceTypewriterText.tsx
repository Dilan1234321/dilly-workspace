"use client";

import React, { useState, useEffect, useRef } from "react";
import { VoiceFormattedText } from "@/components/VoiceFormattedText";

/** ~80 chars/sec — smooth, Word-like pacing */
const CHARS_PER_SECOND = 80;

type Props = {
  fullText: string;
  /** Theme primary for cursor */
  cursorColor?: string;
  className?: string;
  /** Called when visible text advances (streaming / typewriter); use to keep chat scrolled to end. */
  onProgress?: () => void;
};

/** Types out text character by character. Uses requestAnimationFrame for smooth, frame-synced reveal. */
export function VoiceTypewriterText({ fullText, cursorColor = "var(--m-accent)", className, onProgress }: Props) {
  const [visibleLength, setVisibleLength] = useState(0);
  const prevFullLenRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const visibleLenRef = useRef(0);
  visibleLenRef.current = visibleLength;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  // When fullText shrinks (e.g. switch convos), reset
  useEffect(() => {
    if (fullText.length < prevFullLenRef.current) {
      setVisibleLength(0);
      startTimeRef.current = null;
    }
    prevFullLenRef.current = fullText.length;
  }, [fullText.length]);

  // Smooth time-based reveal via requestAnimationFrame (frame-synced, Word-like)
  useEffect(() => {
    if (visibleLenRef.current >= fullText.length) return;
    const now = performance.now();
    if (startTimeRef.current === null) {
      startTimeRef.current = now;
    } else if (visibleLenRef.current > 0) {
      // Streaming: continue from current position
      startTimeRef.current = now - (visibleLenRef.current / CHARS_PER_SECOND) * 1000;
    }

    const tick = () => {
      const elapsed = performance.now() - (startTimeRef.current ?? 0);
      const targetChars = Math.floor((elapsed / 1000) * CHARS_PER_SECOND);
      const next = Math.min(targetChars, fullText.length);
      setVisibleLength(next);
      onProgressRef.current?.();
      if (next < fullText.length) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fullText.length]);

  const visible = fullText.slice(0, visibleLength);
  const stillTyping = visibleLength < fullText.length;

  return (
    <span className={className}>
      <VoiceFormattedText content={visible} />
      {stillTyping && (
        <span
          className="inline-block w-0.5 h-[1em] ml-0.5 align-text-bottom voice-cursor-blink"
          style={{ backgroundColor: cursorColor }}
          aria-hidden
        />
      )}
    </span>
  );
}
