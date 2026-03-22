"use client";

import * as React from "react";
import { Mic, MicOff } from "lucide-react";
import { DillyVoicePrompt } from "@/components/ui/dilly-voice-prompt";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { cn } from "@/lib/utils";

export interface VoiceInputWithMicProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  rotatingExamples?: string[];
  className?: string;
  autoFocus?: boolean;
}

/** Voice input with mic button — voice as default, text as fallback. */
export function VoiceInputWithMic({
  value,
  onChange,
  onSend,
  isLoading = false,
  disabled = false,
  placeholder = "Tell Dilly AI anything…",
  rotatingExamples,
  className,
  autoFocus = false,
}: VoiceInputWithMicProps) {
  const { isListening, transcript, isSupported, startListening, stopListening } = useSpeechRecognition();
  const displayValue = isListening && transcript ? (value ? `${value} ${transcript}` : transcript) : value;

  const handleMicTap = React.useCallback(() => {
    if (isListening) {
      stopListening();
      if (transcript.trim()) {
        onChange(value ? `${value} ${transcript.trim()}` : transcript.trim());
      }
    } else if (isSupported) {
      startListening();
    }
  }, [isListening, transcript, isSupported, startListening, stopListening, value, onChange]);

  return (
    <div className={cn("flex items-end gap-2", className)}>
      <button
        type="button"
        onClick={handleMicTap}
        className={cn(
          "shrink-0 p-2 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center",
          isSupported ? "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50" : "text-slate-500 cursor-default",
          isListening && "text-red-400 bg-red-500/20"
        )}
        aria-label={isListening ? "Stop recording" : isSupported ? "Tap to speak" : "Type instead of speaking"}
      >
        {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>
      <div className="flex-1 min-w-0">
        <DillyVoicePrompt
          value={displayValue}
          onChange={onChange}
          onSend={onSend}
          isLoading={isLoading}
          disabled={disabled}
          placeholder={placeholder}
          rotatingExamples={rotatingExamples}
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
}
