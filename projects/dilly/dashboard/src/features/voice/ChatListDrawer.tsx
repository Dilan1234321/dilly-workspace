"use client";

import React from "react";
import { getVoiceAvatarUrl } from "@/lib/voiceAvatars";
import type { VoiceConvo } from "@/types/dilly";

// ── Props ────────────────────────────────────────────────────────────────────

export interface ChatListDrawerProps {
  voiceConvos: VoiceConvo[];
  openVoiceConvIds: string[];
  voiceAvatarIndex: number | null;
  setVoiceAvatarPickerOpen: (open: boolean) => void;
  startNewChat: () => void;
  openChat: (id: string) => void;
  deleteChat: (id: string) => void;
  setVoiceChatListOpen: (open: boolean) => void;
  fmtTs: (ts?: number) => string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ChatListDrawer({
  voiceConvos,
  openVoiceConvIds,
  voiceAvatarIndex,
  setVoiceAvatarPickerOpen,
  startNewChat,
  openChat,
  deleteChat,
  setVoiceChatListOpen,
  fmtTs,
}: ChatListDrawerProps) {
  return (
    <div className="absolute inset-x-0 top-0 bottom-20 z-50 bg-[var(--m-bg)] m-rounded-card overflow-hidden flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-800/60 shrink-0">
        <h3 className="text-base font-semibold text-slate-100">All chats</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVoiceAvatarPickerOpen(true)}
            className="shrink-0 w-9 h-9 rounded-full overflow-hidden flex items-center justify-center cursor-pointer bg-white p-0.5"
            title={
              getVoiceAvatarUrl(voiceAvatarIndex) ? "Change avatar" : "Choose avatar"
            }
          >
            {getVoiceAvatarUrl(voiceAvatarIndex) ? (
              <img
                src={getVoiceAvatarUrl(voiceAvatarIndex)!}
                alt="Your avatar"
                className="w-full h-full object-contain"
              />
            ) : (
              <svg
                className="w-4 h-4 text-black"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            )}
          </button>
          {voiceConvos.length === 0 && (
            <button
              type="button"
              onClick={startNewChat}
              className="voice-send-btn text-white text-sm font-medium px-4 py-2 inline-flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              New chat
            </button>
          )}
        </div>
      </div>
      <div
        className={`flex-1 overflow-y-auto p-3 space-y-1.5 ${voiceConvos.length > 0 ? "pb-16" : ""}`}
      >
        {voiceConvos.map((convo) => (
          <div
            key={convo.id}
            className={`voice-convo-card flex items-center justify-between gap-2 py-2.5 px-3 rounded-lg min-h-0 ${openVoiceConvIds.includes(convo.id) ? "ring-1 ring-slate-600/50" : ""}`}
          >
            <button
              type="button"
              onClick={() => {
                openChat(convo.id);
                setVoiceChatListOpen(false);
              }}
              className="min-w-0 flex-1 text-left cursor-pointer rounded -my-2 py-2 -mx-2 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              <p className="text-slate-200 font-medium text-sm truncate">{convo.title}</p>
              <p className="text-slate-500 text-[11px] mt-0.5 truncate">
                {convo.messages?.length
                  ? `${convo.messages.length} messages`
                  : "No messages yet"}
                {convo.updatedAt && ` \u00b7 ${fmtTs(convo.updatedAt)}`}
              </p>
            </button>
            {openVoiceConvIds.includes(convo.id) && (
              <span className="text-[10px] text-slate-500 shrink-0">Open</span>
            )}
            <button
              type="button"
              onClick={() => {
                deleteChat(convo.id);
              }}
              className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="Delete chat"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
      {voiceConvos.length > 0 && (
        <div
          className="absolute bottom-0 left-0 right-0 p-4 pt-8 bg-gradient-to-t from-[var(--m-bg)] via-[var(--m-bg)]/95 to-transparent pointer-events-none"
          aria-hidden
        />
      )}
      {voiceConvos.length > 0 && (
        <div className="absolute bottom-4 left-4 right-4 flex justify-center pointer-events-auto">
          <button
            type="button"
            onClick={startNewChat}
            className="voice-send-btn text-white text-sm font-medium px-5 py-2.5 inline-flex items-center gap-2 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
            style={{
              boxShadow:
                "0 4px 14px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.15)",
            }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            New chat
          </button>
        </div>
      )}
    </div>
  );
}
