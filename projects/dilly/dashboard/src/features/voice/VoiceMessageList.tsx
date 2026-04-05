"use client";

import React from "react";
import { HeartFavorite } from "@/components/ui/heart-favorite";
import { ThumbsDown } from "lucide-react";
import { VoiceAssistantRichReply } from "@/components/VoiceAssistantRichReply";
import { LoaderOne } from "@/components/ui/loader-one";
import { VoiceMockInterviewBanner, VoiceMockInterviewTurn } from "@/components/voice/VoiceMockInterviewUI";
import { ProfilePhotoWithFrame } from "@/components/ProfilePhotoWithFrame";
import { MascotAvatar, getMascotMood } from "@/components/MascotAvatar";
import { getProfileFrame } from "@/lib/profileFrame";

import { VoiceVisualDedupProvider, VoiceDedupScrollRoot } from "@/components/VoiceChatVisualDedup";
import type { VoiceMockInterviewSession } from "@/contexts/VoiceContext";
import type { DillyVoiceChatScoresBundle } from "@/lib/voiceVisualTypes";
import type { VoiceConvo } from "@/types/dilly";
import type { SchoolTheme } from "@/lib/schools";

// ── Props ────────────────────────────────────────────────────────────────────

export interface VoiceMessageListProps {
  theme: SchoolTheme;
  profilePhotoUrl: string | null;
  voiceAvatarIndex: number | null;
  voiceMessages: VoiceConvo["messages"];
  voiceMessageQueue: string[];
  voiceLoading: boolean;
  voiceStreamingText: string;
  voiceScoresForChat: DillyVoiceChatScoresBundle | null;
  voiceFeedback: Record<number, "up" | "down">;
  voiceMockInterviewSession: VoiceMockInterviewSession | null;
  displayAudit: Record<string, unknown> | null;
  lastAudit: Record<string, unknown> | null;
  appProfile: Record<string, unknown> | null;
  user: { email?: string } | null;
  voiceGreeting: string;
  isFreshAudit: boolean;
  voiceChatScrollRef: React.RefObject<HTMLDivElement | null>;
  voiceEndRef: React.RefObject<HTMLDivElement | null>;
  setVoiceAvatarPickerOpen: (open: boolean) => void;
  endVoiceMockInterviewByUser: () => void;
  openVoiceWithNewChat: (prompt?: string) => void;
  sendVoiceFeedback: (msgIndex: number, rating: "up" | "down") => void;
  resumeDeepDivePrompt: string;
  fmtTs: (ts?: number) => string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function VoiceMessageList({
  theme,
  profilePhotoUrl,
  voiceAvatarIndex,
  voiceMessages,
  voiceMessageQueue,
  voiceLoading,
  voiceStreamingText,
  voiceScoresForChat,
  voiceFeedback,
  voiceMockInterviewSession,
  displayAudit,
  lastAudit,
  appProfile,
  user,
  voiceGreeting,
  isFreshAudit,
  voiceChatScrollRef,
  voiceEndRef,
  setVoiceAvatarPickerOpen,
  endVoiceMockInterviewByUser,
  openVoiceWithNewChat,
  sendVoiceFeedback,
  resumeDeepDivePrompt,
  fmtTs,
}: VoiceMessageListProps) {
  const peerPercentiles = (displayAudit as Record<string, unknown> | null)?.peer_percentiles as
    | Record<string, number>
    | undefined;

  return (
    <div className="voice-chat-container overflow-hidden flex flex-col flex-1 min-h-0 min-w-0 max-w-full">
      <VoiceVisualDedupProvider>
        <VoiceDedupScrollRoot
          scrollRef={voiceChatScrollRef}
          className="flex-1 min-h-0 min-w-0 max-w-full overflow-y-auto overflow-x-hidden px-4 sm:px-5 py-5 space-y-4"
        >
          {voiceMockInterviewSession ? (
            <VoiceMockInterviewBanner
              active
              questionNumber={voiceMockInterviewSession.questionIndex + 1}
              total={voiceMockInterviewSession.totalQuestions}
              onEnd={endVoiceMockInterviewByUser}
            />
          ) : null}
          {voiceMessages.length === 0 && !voiceLoading && (
            <div className="voice-empty flex flex-col items-center justify-center text-center py-12 px-4">
              <button
                type="button"
                onClick={() => setVoiceAvatarPickerOpen(true)}
                className="cursor-pointer mb-4 focus:outline-none focus:ring-2 focus:ring-[var(--dilly-primary)] focus:ring-offset-2 focus:ring-offset-[var(--m-bg)] rounded-full"
                aria-label="Change avatar"
              >
                <MascotAvatar
                  voiceAvatarIndex={voiceAvatarIndex}
                  mood={getMascotMood(displayAudit as Parameters<typeof getMascotMood>[0], lastAudit as Parameters<typeof getMascotMood>[1])}
                  size="lg"
                />
              </button>
              <p className="text-slate-300 text-sm leading-relaxed max-w-full mb-4">
                {voiceGreeting}
              </p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-2">
                Tell Dilly AI anything
              </p>
              <ul className="text-slate-400 text-xs text-left space-y-1 max-w-xs mb-4">
                <li>
                  People you met, rejections, interviews--I remember it all
                </li>
                <li>Explain your scores and how to improve them</li>
                <li>Rewrite resume bullets for stronger impact</li>
                <li>Prep you for interviews using your evidence</li>
                <li>Run gap scans for target firms</li>
              </ul>
              <button
                type="button"
                onClick={() =>
                  openVoiceWithNewChat(resumeDeepDivePrompt)
                }
                className="voice-chip text-xs px-3 py-2 rounded-xl border border-[var(--m-border)] text-slate-300 hover:text-slate-100 hover:border-[var(--dilly-primary)] hover:bg-[var(--dilly-primary)]/10 transition-colors"
              >
                Help Dilly know you better
              </button>
            </div>
          )}

          {/* Fresh audit banner */}
          {isFreshAudit && voiceMessages.length === 0 && (
            <div
              className="mb-3 px-4 py-2.5 m-rounded-card flex items-center gap-2.5 text-sm font-medium text-white"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}22, ${theme.primary}11)`,
                border: `1px solid ${theme.primary}44`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0 voice-glow-pulse"
                style={{ backgroundColor: theme.primary }}
              />
              <span className="text-slate-300">
                New audit results are ready. Ask me what to do next.
              </span>
            </div>
          )}

          {(voiceMessages ?? []).map((msg, i) => (
            <div
              key={i}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} ${msg.role === "user" ? "voice-msg-user" : "voice-msg-ai"}`}
              style={{
                animationDelay: `${Math.min(i * 30, 150)}ms`,
              }}
            >
              <div
                className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {msg.role === "user" && (
                  <div className="mb-0.5 shrink-0">
                    <ProfilePhotoWithFrame
                      photoUrl={profilePhotoUrl}
                      frame={getProfileFrame(peerPercentiles)}
                      size="sm"
                      fallbackLetter={
                        (appProfile as { name?: string })?.name || user?.email || "?"
                      }
                      variant="voice"
                    />
                  </div>
                )}
                {msg.role === "assistant" && (
                  <div className="mb-0.5 shrink-0">
                    <MascotAvatar
                      voiceAvatarIndex={voiceAvatarIndex}
                      mood={getMascotMood(displayAudit as Parameters<typeof getMascotMood>[0], lastAudit as Parameters<typeof getMascotMood>[1])}
                      size="sm"
                    />
                  </div>
                )}
                <div className="max-w-[85%] min-w-0 w-full overflow-hidden">
                  {msg.role === "assistant" ? (
                    <div className="voice-bubble-ai text-[13.5px] px-4 py-2.5 leading-relaxed break-words text-slate-200">
                      {msg.mockTurn ? (
                        <VoiceMockInterviewTurn turn={msg.mockTurn} />
                      ) : (
                        <VoiceAssistantRichReply
                          rawContent={msg.content}
                          voiceScores={voiceScoresForChat}
                          priorUserContent={
                            i > 0 &&
                            voiceMessages[i - 1]?.role === "user"
                              ? voiceMessages[i - 1]!.content
                              : null
                          }
                          useTypewriter={false}
                          cursorColor={theme.primary}
                          messageListIndex={i}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-[13.5px] px-4 py-2.5 leading-relaxed break-words voice-bubble-user text-slate-100">
                      {msg.content}
                    </p>
                  )}
                </div>
              </div>
              {msg.role === "assistant" && !msg.mockTurn && (
                <div className="flex items-center gap-0.5 ml-9 mt-0.5">
                  <HeartFavorite
                    size="compact"
                    isLiked={voiceFeedback[i] === "up"}
                    onToggle={() => sendVoiceFeedback(i, "up")}
                  />
                  <button
                    type="button"
                    onClick={() => sendVoiceFeedback(i, "down")}
                    className="rounded-full p-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
                    title="Downvote"
                    aria-label="Downvote"
                  >
                    <ThumbsDown
                      className={`h-3.5 w-3.5 transition-colors ${
                        voiceFeedback[i] === "down"
                          ? "fill-slate-500 text-slate-500"
                          : "text-slate-600 hover:text-slate-400"
                      }`}
                    />
                  </button>
                </div>
              )}
              {msg.ts && (
                <p
                  className={`text-[10px] text-slate-600 mt-0.5 ${msg.role === "user" ? "mr-1" : "ml-9"}`}
                >
                  {fmtTs(msg.ts)}
                </p>
              )}
            </div>
          ))}

          {/* Queued messages */}
          {voiceMessageQueue.map((text, i) => (
            <div
              key={`queued-${i}`}
              className="flex flex-col items-end voice-msg-user"
            >
              <div className="flex items-end gap-2 flex-row-reverse">
                <div className="mb-0.5 shrink-0">
                  <ProfilePhotoWithFrame
                    photoUrl={profilePhotoUrl}
                    frame={getProfileFrame(peerPercentiles)}
                    size="sm"
                    fallbackLetter={
                      (appProfile as { name?: string })?.name || user?.email || "?"
                    }
                    variant="voice"
                  />
                </div>
                <div className="max-w-[85%] min-w-0 overflow-hidden">
                  <p className="voice-bubble-queued text-[13.5px] px-4 py-2.5 leading-relaxed break-words text-slate-400">
                    {text}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Streaming bubble */}
          {voiceLoading && (
            <div className="flex flex-col items-start voice-msg-ai">
              <div className="flex items-end gap-2">
                <div className="mb-0.5 shrink-0">
                  <MascotAvatar
                    voiceAvatarIndex={voiceAvatarIndex}
                    mood={getMascotMood(displayAudit as Parameters<typeof getMascotMood>[0], lastAudit as Parameters<typeof getMascotMood>[1])}
                    size="sm"
                  />
                </div>
                <div className="max-w-[85%] min-w-0 overflow-hidden">
                  {voiceStreamingText ? (
                    <div className="voice-bubble-ai text-[13.5px] px-4 py-2.5 leading-relaxed break-words text-slate-200">
                      <VoiceAssistantRichReply
                        rawContent={voiceStreamingText}
                        voiceScores={voiceScoresForChat}
                        priorUserContent={
                          [...voiceMessages]
                            .reverse()
                            .find((m) => m.role === "user")?.content ?? null
                        }
                        useTypewriter={false}
                        cursorColor={theme.primary}
                        messageListIndex={voiceMessages.length}
                      />
                      <span
                        className="inline-block w-0.5 h-[1em] ml-0.5 voice-cursor-blink"
                        style={{
                          backgroundColor: theme.primary,
                          verticalAlign: "text-bottom",
                        }}
                      />
                    </div>
                  ) : (
                    <div className="voice-bubble-ai px-4 py-3 flex items-center">
                      <LoaderOne color={theme.primary} size={10} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div ref={voiceEndRef} />
        </VoiceDedupScrollRoot>
      </VoiceVisualDedupProvider>
    </div>
  );
}
