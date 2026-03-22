"use client";

import * as React from "react";
import { SendIcon } from "@/components/ui/animated-state-icons";
import { cn } from "@/lib/utils";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";

export interface DillyVoicePromptProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Optional left-side action (e.g. bullet rewriter toggle) */
  leftAction?: React.ReactNode;
  /** When set, shows a typewriter animation cycling through these strings when input is empty and not focused. */
  rotatingExamples?: string[];
  /** Optional color for the typing indicator dots (e.g. theme.primary). */
  typingIndicatorColor?: string;
  /** Compact pill mode: no outer card, borderless, for embedding in overlay pill */
  compact?: boolean;
  /** Focus the textarea when true (e.g. entering Dilly AI). Re-runs when toggled false→true. */
  autoFocus?: boolean;
}

type TypewriterPhase = "typing" | "hold" | "deleting";

const TYPING_MS = 85;
const HOLD_MS = 2200;
const DELETING_MS = 45;
/** Pause after clearing a phrase before typing the next (no dots / “loading” UI). */
const BETWEEN_PROMPTS_MS = 900;

const DillyVoicePrompt = React.forwardRef<HTMLDivElement, DillyVoicePromptProps>(
  (
    {
      value,
      onChange,
      onSend,
      isLoading = false,
      disabled = false,
      placeholder = "Message Dilly AI…",
      className,
      leftAction,
      rotatingExamples,
      typingIndicatorColor = "#9CA3AF",
      compact = false,
      autoFocus = false,
    },
    ref
  ) => {
    const minHeight = compact ? 36 : 44;
    const maxHeight = compact ? 80 : 160;
    const { textareaRef, adjustHeight } = useAutoResizeTextarea({
      minHeight,
      maxHeight,
    });

    const [justSent, setJustSent] = React.useState(false);
    const [focused, setFocused] = React.useState(false);

    const [twPhase, setTwPhase] = React.useState<TypewriterPhase>("typing");
    const [twPhraseIndex, setTwPhraseIndex] = React.useState(0);
    const [twCharIndex, setTwCharIndex] = React.useState(0);

    const examples = rotatingExamples?.length ? rotatingExamples : [];
    const showTypewriter = examples.length > 0 && !value.trim() && !focused && !disabled;

    React.useEffect(() => {
      if (!showTypewriter || examples.length === 0) return;
      const phrase = examples[twPhraseIndex] ?? "";
      let timeout: ReturnType<typeof setTimeout>;

      if (twPhase === "typing") {
        if (twCharIndex < phrase.length) {
          timeout = setTimeout(() => setTwCharIndex((i) => i + 1), TYPING_MS);
        } else {
          timeout = setTimeout(() => setTwPhase("hold"), 0);
        }
      } else if (twPhase === "hold") {
        timeout = setTimeout(() => setTwPhase("deleting"), HOLD_MS);
      } else if (twPhase === "deleting") {
        if (twCharIndex > 0) {
          timeout = setTimeout(() => setTwCharIndex((i) => i - 1), DELETING_MS);
        } else {
          timeout = setTimeout(() => {
            setTwPhraseIndex((i) => (i + 1) % examples.length);
            setTwPhase("typing");
          }, BETWEEN_PROMPTS_MS);
        }
      }

      return () => clearTimeout(timeout);
    }, [showTypewriter, examples.length, twPhase, twPhraseIndex, twCharIndex, examples]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    const hasContent = value.trim() !== "";

    const handleSubmit = () => {
      if (!hasContent) return;
      setJustSent(true);
      onSend();
      const t = setTimeout(() => setJustSent(false), 500);
      return () => clearTimeout(t);
    };

    React.useEffect(() => {
      if (!justSent) return;
      const t = setTimeout(() => setJustSent(false), 500);
      return () => clearTimeout(t);
    }, [justSent]);

    React.useEffect(() => {
      if (!value.trim()) adjustHeight(true);
    }, [value, adjustHeight]);

    React.useEffect(() => {
      if (!autoFocus || disabled) return;
      const el = textareaRef.current;
      if (!el) return;
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          try {
            el.focus({ preventScroll: true });
          } catch {
            el.focus();
          }
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }, [autoFocus, disabled]);

    const effectivePlaceholder = showTypewriter ? " " : placeholder;
    const displayText = showTypewriter && examples[twPhraseIndex] ? (examples[twPhraseIndex] ?? "").slice(0, twCharIndex) : "";

    return (
      <div ref={ref} className={cn("w-full", className)}>
        <div className={cn("relative", compact ? "flex flex-col" : "flex flex-col gap-2")}>
          <div
            className={cn(
              "dilly-voice-prompt transition-all duration-300",
              compact
                ? "flex gap-2 items-center border-0 bg-transparent shadow-none p-0"
                : "rounded-3xl border border-[#444444] bg-[#1F2023] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.24)]",
            )}
          >
            <div className={cn("flex gap-2 relative", compact ? "items-center" : "items-end")}>
              {leftAction && <div className="shrink-0 self-center">{leftAction}</div>}
              <div className="flex-1 min-w-0 relative">
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => {
                    onChange(e.target.value);
                    adjustHeight();
                  }}
                  onFocus={(e) => {
                    setFocused(true);
                    if (!e.target.value.trim()) {
                      requestAnimationFrame(() => {
                        e.target.setSelectionRange(0, 0);
                      });
                    }
                  }}
                  onBlur={() => setFocused(false)}
                  onKeyDown={handleKeyDown}
                  placeholder={effectivePlaceholder}
                  disabled={disabled || justSent}
                  rows={1}
                  className={cn(
                    "dilly-voice-prompt-textarea w-full min-w-0 resize-none rounded-md border-none bg-transparent text-left text-gray-100 placeholder:text-left placeholder:text-gray-400 antialiased",
                    "focus-visible:outline-none focus-visible:ring-0",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    compact ? "px-2 py-1.5 text-sm min-h-[36px] max-h-[80px] dilly-voice-prompt-textarea--compact" : "px-3 py-2.5 text-base min-h-[44px] max-h-[160px]",
                  )}
                />
                {showTypewriter && (
                  <div
                    className={cn(
                      // Inline flow (not flex row): a full-width text flex item was pushing the cursor to the far right.
                      "absolute inset-0 pointer-events-none text-gray-400 whitespace-pre-wrap break-words text-left",
                      compact ? "px-2 py-1.5 text-sm" : "px-3 py-2.5 text-base"
                    )}
                    aria-hidden
                  >
                    {displayText}
                    {!(twPhase === "deleting" && twCharIndex === 0) && (
                      <span
                        className="voice-cursor-blink inline-block w-0.5 h-[1em] ml-px align-text-bottom"
                        style={{ backgroundColor: typingIndicatorColor }}
                      />
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={disabled || !hasContent}
                className={cn(
                  "shrink-0 rounded-full flex items-center justify-center transition-all duration-200",
                  compact ? "h-8 w-8" : "h-9 w-9",
                  hasContent
                    ? "bg-white hover:bg-white/80 text-[#1F2023]"
                    : "bg-transparent hover:bg-gray-600/30 text-[#9CA3AF] cursor-not-allowed",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                aria-label="Send message"
              >
                <SendIcon size={18} color="currentColor" state={justSent} duration={500} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
DillyVoicePrompt.displayName = "DillyVoicePrompt";

export { DillyVoicePrompt };
