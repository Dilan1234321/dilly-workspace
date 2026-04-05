"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VoiceInputWithMic } from "@/components/VoiceInputWithMic";
import { dilly } from "@/lib/dilly";
import type { VoiceMockInterviewSession } from "@/contexts/VoiceContext";

export interface VoiceInputBarProps {
  voiceInput: string;
  setVoiceInput: (v: string) => void;
  sendVoice: (overrideText?: string) => void;
  voiceLoading: boolean;
  voiceMockInterviewSession: VoiceMockInterviewSession | null;
  voiceFollowUpSuggestions: string[];
  setVoiceFollowUpSuggestions: React.Dispatch<React.SetStateAction<string[]>>;
  voiceRememberOpen: boolean;
  setVoiceRememberOpen: (v: boolean) => void;
  voiceRememberNote: string;
  setVoiceRememberNote: (v: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appProfile: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setAppProfile: React.Dispatch<React.SetStateAction<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toast: (...args: any[]) => void;
  mainAppTab: string;
  voiceOverlayOpen: boolean;
  voiceChatListOpen: boolean;
  bulletRewriterOpen: boolean;
}

export function VoiceInputBar({
  voiceInput,
  setVoiceInput,
  sendVoice,
  voiceLoading,
  voiceMockInterviewSession,
  voiceFollowUpSuggestions,
  setVoiceFollowUpSuggestions,
  voiceRememberOpen,
  setVoiceRememberOpen,
  voiceRememberNote,
  setVoiceRememberNote,
  appProfile,
  setAppProfile,
  toast,
  mainAppTab,
  voiceOverlayOpen,
  voiceChatListOpen,
  bulletRewriterOpen,
}: VoiceInputBarProps) {
  return (
    <div className="sticky bottom-0 shrink-0 pt-2 pb-40 bg-[var(--m-bg)]/95 backdrop-blur-sm border-t border-slate-800/60 -mx-4 px-4 sm:-mx-0 sm:px-0 min-w-0 max-w-full">
      {/* Follow-up suggestions */}
      {!voiceLoading &&
        !voiceMockInterviewSession &&
        voiceFollowUpSuggestions.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-2">
              Suggested follow-ups
            </p>
            <div className="flex flex-wrap gap-2">
              {voiceFollowUpSuggestions.slice(0, 5).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setVoiceFollowUpSuggestions((prev) =>
                      prev.filter((_, j) => j !== i),
                    );
                    sendVoice(s);
                  }}
                  className="voice-chip text-left text-xs px-3 py-2 rounded-xl border border-[var(--m-border)] text-slate-300 hover:text-slate-100 hover:border-[var(--dilly-primary)] hover:bg-[var(--dilly-primary)]/10 transition-colors max-w-full break-words line-clamp-2"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      {voiceRememberOpen && (
        <div
          className="mb-2 p-3 m-rounded-card flex gap-2"
          style={{
            backgroundColor: "var(--m-surface-2)",
            border: "1px solid var(--m-border)",
          }}
        >
          <Input
            value={voiceRememberNote}
            onChange={(e) => setVoiceRememberNote(e.target.value)}
            placeholder="Notes for Dilly to remember (e.g. I'm targeting consulting)"
            className="flex-1 text-sm bg-slate-800/70 border-[var(--ut-border)] text-slate-100"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const note = voiceRememberNote.trim();
              if (!note) return;
              if (!localStorage.getItem("dilly_auth_token")) return;
              const notes = [
                ...((appProfile as { voice_notes?: string[] })?.voice_notes ?? []),
                note,
              ].slice(-20);
              dilly
                .fetch(`/profile`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ voice_notes: notes }),
                })
                .then((res) => {
                  if (res.ok) return res.json();
                  throw new Error("Save failed");
                })
                .then((p) => {
                  setAppProfile((prev: Record<string, unknown> | null) =>
                    prev ? { ...prev, voice_notes: p.voice_notes ?? [] } : prev,
                  );
                  setVoiceRememberNote("");
                  setVoiceRememberOpen(false);
                  toast("Saved. Dilly will remember.", "success");
                })
                .catch(() => toast("Could not save", "error"));
            }}
          />
          <Button
            size="sm"
            onClick={async () => {
              const note = voiceRememberNote.trim();
              if (!note) return;
              if (!localStorage.getItem("dilly_auth_token")) return;
              const notes = [
                ...((appProfile as { voice_notes?: string[] })?.voice_notes ?? []),
                note,
              ].slice(-20);
              try {
                const res = await dilly.fetch(`/profile`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ voice_notes: notes }),
                });
                if (res.ok) {
                  const p = await res.json();
                  setAppProfile((prev: Record<string, unknown> | null) =>
                    prev ? { ...prev, voice_notes: p.voice_notes ?? [] } : prev,
                  );
                  setVoiceRememberNote("");
                  setVoiceRememberOpen(false);
                  toast("Saved. Dilly will remember.", "success");
                }
              } catch {
                toast("Could not save", "error");
              }
            }}
            disabled={!voiceRememberNote.trim()}
          >
            Add
          </Button>
          <button
            type="button"
            onClick={() => {
              setVoiceRememberOpen(false);
              setVoiceRememberNote("");
            }}
            className="text-slate-500 hover:text-slate-300 p-1"
            aria-label="Close"
          >
            {"\u00d7"}
          </button>
        </div>
      )}
      <div className="voice-input-area">
        <VoiceInputWithMic
          value={voiceInput}
          onChange={setVoiceInput}
          onSend={sendVoice}
          isLoading={voiceLoading}
          disabled={false}
          autoFocus={
            mainAppTab === "voice" &&
            !voiceOverlayOpen &&
            !voiceChatListOpen &&
            !voiceRememberOpen &&
            !bulletRewriterOpen
          }
          placeholder="Tell Dilly AI anything\u2026"
          rotatingExamples={[
            "I had coffee with Sarah from Goldman",
            "I just got rejected from McKinsey",
            "I'm stressed about my interview tomorrow",
            "I bombed the behavioral question",
            "I got an offer from Goldman",
            "I'm switching from consulting to tech",
          ]}
        />
      </div>
    </div>
  );
}
