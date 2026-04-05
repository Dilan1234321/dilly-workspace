"use client";

import React from "react";
import type { VoiceActionItem } from "@/contexts/VoiceContext";
import type { SchoolTheme } from "@/lib/schools";

// ── Props ────────────────────────────────────────────────────────────────────

export interface ActionItemsPanelProps {
  theme: SchoolTheme;
  voiceActionItems: VoiceActionItem[];
  setVoiceActionItems: React.Dispatch<React.SetStateAction<VoiceActionItem[]>>;
  setActionItemsPanelOpen: (open: boolean) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ActionItemsPanel({
  theme,
  voiceActionItems,
  setVoiceActionItems,
  setActionItemsPanelOpen,
}: ActionItemsPanelProps) {
  return (
    <div className="voice-chat-container mb-3 p-3.5 cal-drawer">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="voice-avatar w-6 h-6 rounded-full flex items-center justify-center shrink-0">
            <span
              className="text-[9px] font-bold"
              style={{ color: theme.primary }}
            >
              M
            </span>
          </div>
          <p className="text-slate-200 text-xs font-semibold">
            Action items from Dilly
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActionItemsPanelOpen(false)}
          className="text-slate-600 hover:text-slate-300 p-1 transition-colors"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="space-y-1.5">
        {voiceActionItems
          .slice()
          .reverse()
          .map((item) => (
            <div key={item.id} className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() =>
                  setVoiceActionItems((prev) =>
                    prev.map((i) =>
                      i.id === item.id ? { ...i, done: !i.done } : i,
                    ),
                  )
                }
                className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all ${item.done ? "border-transparent" : "border-slate-600 hover:border-slate-400"}`}
                style={
                  item.done
                    ? {
                        background: theme.primary,
                        borderColor: theme.primary,
                      }
                    : {}
                }
              >
                {item.done && (
                  <svg
                    className="w-2.5 h-2.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                )}
              </button>
              <p
                className={`text-xs leading-relaxed flex-1 ${item.done ? "line-through text-slate-600" : "text-slate-300"}`}
              >
                {item.text}
              </p>
              <button
                type="button"
                onClick={() =>
                  setVoiceActionItems((prev) =>
                    prev.filter((i) => i.id !== item.id),
                  )
                }
                className="text-slate-700 hover:text-red-400 p-0.5 transition-colors shrink-0"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
      </div>
      {voiceActionItems.some((i) => i.done) && (
        <button
          type="button"
          onClick={() =>
            setVoiceActionItems((prev) => prev.filter((i) => !i.done))
          }
          className="mt-2.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          Clear Completed
        </button>
      )}
    </div>
  );
}
