"use client";

import React, { useMemo } from "react";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import { getVoiceAvatarUrl } from "@/lib/voiceAvatars";
import { hapticLight } from "@/lib/haptics";
import type { VoiceConvo } from "@/types/dilly";
import type { AppTab } from "@/contexts/NavigationContext";

// ── Props ────────────────────────────────────────────────────────────────────

export interface VoiceEmptyStateProps {
  voiceConvos: VoiceConvo[];
  voiceAvatarIndex: number | null;
  voiceGreeting: string;
  memoryItemsCount: number;
  setVoiceAvatarPickerOpen: (open: boolean) => void;
  setMainAppTab: (tab: AppTab) => void;
  startNewChat: () => void;
  openChat: (id: string) => void;
  deleteChat: (id: string) => void;
  openVoiceWithNewChat: (prompt?: string) => void;
  resumeDeepDivePrompt: string;
  fmtTs: (ts?: number) => string;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Renders either:
 * 1. The "no conversations" empty state (greeting + start first chat)
 * 2. The "has convos but no open tabs" list view
 *
 * Returns null when there are open tabs (the caller renders the tab view).
 */
export function VoiceEmptyState({
  voiceConvos,
  voiceAvatarIndex,
  voiceGreeting,
  memoryItemsCount,
  setVoiceAvatarPickerOpen,
  setMainAppTab,
  startNewChat,
  openChat,
  deleteChat,
  openVoiceWithNewChat,
  resumeDeepDivePrompt,
  fmtTs,
}: VoiceEmptyStateProps) {
  const voiceConvosByRecent = useMemo(
    () =>
      [...voiceConvos].sort(
        (a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0),
      ),
    [voiceConvos],
  );

  // ── No conversations at all ──────────────────────────────────────────────

  if (voiceConvos.length === 0) {
    return (
      <section
        className="max-w-[375px] mx-auto pb-40 px-4 sm:px-0 animate-fade-up"
        aria-label="Dilly AI"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <header className="te-page-hero text-left py-0 mb-2">
              <h2 className="te-hero-title text-xl">Dilly AI</h2>
              <p className="te-hero-sub text-sm mt-0.5 mb-0">
                Tell me anything career-related. I remember it all.
              </p>
            </header>
            {memoryItemsCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  hapticLight();
                  setMainAppTab("memory");
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border"
                style={{
                  background: "var(--bdim)",
                  borderColor: "var(--bbdr)",
                  color: "var(--t2)",
                }}
              >
                <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" />
                <span className="text-[11px] font-semibold">
                  {memoryItemsCount} things Dilly AI knows
                </span>
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setVoiceAvatarPickerOpen(true)}
            className="shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center cursor-pointer bg-white p-1"
            title={getVoiceAvatarUrl(voiceAvatarIndex) ? "Change avatar" : "Choose avatar"}
          >
            {getVoiceAvatarUrl(voiceAvatarIndex) ? (
              <img
                src={getVoiceAvatarUrl(voiceAvatarIndex)!}
                alt="Your avatar"
                className="w-full h-full object-contain"
              />
            ) : (
              <svg
                className="w-5 h-5 text-black"
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
        </div>
        <div className="voice-chat-container voice-empty p-10 text-center">
          <button
            type="button"
            onClick={() => setVoiceAvatarPickerOpen(true)}
            className="voice-avatar w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden bg-white p-1.5 cursor-pointer"
          >
            {getVoiceAvatarUrl(voiceAvatarIndex) ? (
              <img
                src={getVoiceAvatarUrl(voiceAvatarIndex)!}
                alt="Your avatar"
                className="w-full h-full object-contain"
              />
            ) : (
              <svg
                className="w-7 h-7 text-black"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
            )}
          </button>
          <p className="text-slate-200 font-semibold text-lg mb-1">Start a conversation</p>
          <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto mb-4">
            {voiceGreeting}
          </p>
          <button
            type="button"
            onClick={startNewChat}
            className="voice-send-btn text-sm font-medium px-6 py-2.5 inline-flex items-center gap-2 mb-3"
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
            Start your first chat
          </button>
          <button
            type="button"
            onClick={() => openVoiceWithNewChat(resumeDeepDivePrompt)}
            className="cc-btn text-xs px-4 py-2 rounded-xl"
          >
            Help Dilly know you better
          </button>
        </div>
      </section>
    );
  }

  // ── Has convos but no open tabs ──────────────────────────────────────────

  return (
    <section
      className="max-w-[375px] mx-auto pb-40 px-4 sm:px-0 animate-fade-up"
      aria-label="Dilly AI"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <header className="te-page-hero text-left py-0 mb-2">
            <h2 className="te-hero-title text-xl">Dilly AI</h2>
            <p className="te-hero-sub text-sm mt-0.5 mb-0">Your chats. Click to open.</p>
          </header>
          {memoryItemsCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                hapticLight();
                setMainAppTab("memory");
              }}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border"
              style={{
                background: "var(--bdim)",
                borderColor: "var(--bbdr)",
                color: "var(--t2)",
              }}
            >
              <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" />
              <span className="text-[11px] font-semibold">
                {memoryItemsCount} things Dilly AI knows
              </span>
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVoiceAvatarPickerOpen(true)}
            className="shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center cursor-pointer bg-white p-1"
            title={getVoiceAvatarUrl(voiceAvatarIndex) ? "Change avatar" : "Choose avatar"}
          >
            {getVoiceAvatarUrl(voiceAvatarIndex) ? (
              <img
                src={getVoiceAvatarUrl(voiceAvatarIndex)!}
                alt="Your avatar"
                className="w-full h-full object-contain"
              />
            ) : (
              <svg
                className="w-5 h-5 text-black"
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
          <button
            type="button"
            onClick={startNewChat}
            className="voice-send-btn text-sm font-medium px-4 py-2 inline-flex items-center gap-2"
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
      </div>
      <div className="space-y-2">
        {voiceConvosByRecent.map((convo) => (
          <div
            key={convo.id}
            className="voice-convo-card flex items-center justify-between gap-3 p-4"
          >
            <button
              type="button"
              onClick={() => openChat(convo.id)}
              className="min-w-0 flex-1 text-left cursor-pointer rounded-lg -m-2 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              <p className="text-slate-200 font-medium truncate">{convo.title}</p>
              <p className="text-slate-500 text-xs mt-0.5">
                {convo.messages?.length
                  ? `${convo.messages.length} messages`
                  : "No messages yet"}
                {convo.updatedAt && ` \u00b7 ${fmtTs(convo.updatedAt)}`}
              </p>
            </button>
            <button
              type="button"
              onClick={() => deleteChat(convo.id)}
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
    </section>
  );
}
