"use client";

import * as React from "react";
import { Mic, MicOff, X, Menu, Plus, Pencil, Minus, Sparkles } from "lucide-react";
import { DillyVoicePrompt } from "@/components/ui/dilly-voice-prompt";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import { VoiceAssistantRichReply } from "@/components/VoiceAssistantRichReply";
import { VoiceMockInterviewBanner, VoiceMockInterviewTurn } from "@/components/voice/VoiceMockInterviewUI";
import type { VoiceMockTurnDisplay } from "@/types/dilly";
import { VoiceVisualDedupProvider, VoiceDedupScrollRoot } from "@/components/VoiceChatVisualDedup";
import { voiceReplyShouldDisableTypewriter } from "@/lib/voiceMessageVisuals";
import { assistantMessageSuggestsScoreBreakdown } from "@/lib/voiceScoreVisual";
import type { DillyVoiceChatScoresBundle } from "@/lib/voiceVisualTypes";
import { cn } from "@/lib/utils";

/** Tab for header bar */
export interface VoiceOverlayTab {
  id: string;
  title: string;
}

/** Gemini-style floating overlay for Dilly. Always pill at bottom; messages float at top. */
/** Chat for the list drawer */
export interface VoiceOverlayChat {
  id: string;
  title: string;
  messages?: { role: string; content: string }[];
  updatedAt?: number;
}

export interface VoiceOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Input value and handler */
  value: string;
  onChange: (v: string) => void;
  onSend: (overrideText?: string) => void;
  isLoading?: boolean;
  /** Messages to show at top of screen */
  messages: { role: "user" | "assistant"; content: string; ts?: number; mockTurn?: VoiceMockTurnDisplay }[];
  /** In-chat mock interview mode: question strip + End (same session as main Voice tab). */
  mockInterviewBanner?: { questionNumber: number; total: number; onEnd: () => void } | null;
  streamingText?: string;
  followUpSuggestions?: string[];
  voiceAvatarIndex?: number | null;
  /** Theme primary for glow */
  themePrimary?: string;
  /** Header: plus creates new chat */
  onNewChat?: () => void;
  /** Header: tabs (open convos) */
  tabs?: VoiceOverlayTab[];
  activeTabId?: string | null;
  onTabSelect?: (id: string) => void;
  /** Close/remove a tab from view */
  onCloseTab?: (id: string) => void;
  /** "Help Dilly know you better" resume deep-dive flow */
  onHelpDillyKnowYou?: () => void;
  /** All chats for the hamburger drawer */
  chats?: VoiceOverlayChat[];
  /** Delete a chat */
  onDeleteChat?: (id: string) => void;
  /** Rename a chat */
  onRenameChat?: (id: string, newTitle: string) => void;
  /** Profile-based starter suggestions for new chats (when no follow-ups). Falls back to default if empty. */
  starterSuggestions?: string[];
  /** Latest audit Smart/Grit/Build + optional data for inline visuals ([[...]] markers). */
  voiceScoresForChat?: DillyVoiceChatScoresBundle | null;
  /** Empty-chat hero copy (first-time long intro vs "Hey {name}, …" from parent). */
  emptyChatGreeting?: string;
}

/** Dark enough for readable text, still lets app show through */
const OVERLAY_BG = "bg-black/80 backdrop-blur-[8px]";
/** Keep content within the hue border (12px inset from 375px frame) */
const WITHIN_HUE = "left-1/2 -translate-x-1/2 w-[calc(375px-24px)] max-w-[calc(100vw-24px)]";

/** Chat scroll / empty state: fill space between header strip and composer (bottom-4 + input row + gap + home indicator). */
const CHAT_AREA_BOTTOM_STYLE: React.CSSProperties = {
  bottom: "calc(1rem + 0.5rem + 3.75rem + env(safe-area-inset-bottom, 0px))",
};

/** Chat always starts under the header; suggestion chips float above (higher z) instead of pushing chat down. */
const VOICE_CHAT_TOP = "top-[72px]";
/** Suggestions card stacks above message list; chat drawer stays on top when open. */
const Z_SUGGESTIONS = "z-[103]";
const Z_CHAT_DRAWER = "z-[106]";

/** Starter suggestions for new chats - tap to send. First-person question format. */
const STARTER_SUGGESTIONS = [
  "Am I ready?",
  "How can I add numbers to my bullets?",
  "How do I prepare for my interview?",
];

function fmtTs(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
}

export function VoiceOverlay(props: VoiceOverlayProps) {
  if (!props.open) return null;
  return (
    <VoiceVisualDedupProvider>
      <VoiceOverlayBody {...props} />
    </VoiceVisualDedupProvider>
  );
}

function VoiceOverlayBody({
  open,
  onClose,
  value,
  onChange,
  onSend,
  isLoading = false,
  messages,
  streamingText = "",
  followUpSuggestions = [],
  voiceAvatarIndex = null,
  themePrimary = "var(--m-accent)",
  onNewChat,
  tabs = [],
  activeTabId = null,
  onTabSelect,
  onCloseTab,
  onHelpDillyKnowYou,
  chats = [],
  starterSuggestions,
  onDeleteChat,
  onRenameChat,
  voiceScoresForChat = null,
  emptyChatGreeting,
  mockInterviewBanner = null,
}: VoiceOverlayProps) {
  const [isClosing, setIsClosing] = React.useState(false);
  const [chatListOpen, setChatListOpen] = React.useState(false);
  const [editingChatId, setEditingChatId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  /** User hid the suggestions card; header button can bring it back. Reset when overlay opens. */
  const [suggestionsPanelDismissed, setSuggestionsPanelDismissed] = React.useState(false);
  /** Panel playing exit animation before unmount */
  const [suggestionsPanelClosing, setSuggestionsPanelClosing] = React.useState(false);
  /** Sparkles control playing exit before panel reopens */
  const [suggestionsSparklesClosing, setSuggestionsSparklesClosing] = React.useState(false);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsPanelCloseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsSparklesCloseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleOpenChatLogs = React.useCallback(() => {
    setChatListOpen(true);
  }, []);

  const handleSelectChat = React.useCallback(
    (id: string) => {
      onTabSelect?.(id);
      setChatListOpen(false);
    },
    [onTabSelect]
  );

  const handleClose = React.useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      onClose();
      closeTimeoutRef.current = null;
    }, 1180);
  }, [isClosing, onClose]);

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      if (suggestionsPanelCloseTimerRef.current) clearTimeout(suggestionsPanelCloseTimerRef.current);
      if (suggestionsSparklesCloseTimerRef.current) clearTimeout(suggestionsSparklesCloseTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!open) {
      setIsClosing(false);
      setChatListOpen(false);
      setEditingChatId(null);
    } else {
      setSuggestionsPanelDismissed(false);
      setSuggestionsPanelClosing(false);
      setSuggestionsSparklesClosing(false);
    }
  }, [open]);

  // Lock body scroll when overlay is open — user scrolls only within the chat
  React.useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev || "";
      };
    }
  }, [open]);

  const handleStartRename = React.useCallback((convo: VoiceOverlayChat) => {
    setEditingChatId(convo.id);
    setEditTitle(convo.title);
  }, []);

  const handleSubmitRename = React.useCallback(() => {
    if (!editingChatId || !onRenameChat) return;
    const trimmed = editTitle.trim();
    if (trimmed) {
      onRenameChat(editingChatId, trimmed);
    }
    setEditingChatId(null);
    setEditTitle("");
  }, [editingChatId, editTitle, onRenameChat]);

  const displayMessages = React.useMemo(() => {
    const dm = [...messages];
    if (streamingText) {
      // eslint-disable-next-line react-hooks/purity -- intentional
      dm.push({ role: "assistant" as const, content: streamingText, ts: Date.now() });
    }
    return dm;
  }, [messages, streamingText]);

  const suggestionItems = mockInterviewBanner
    ? []
    : followUpSuggestions.length > 0
      ? [...followUpSuggestions].slice(0, 3).sort((a, b) => a.length - b.length)
      : displayMessages.length === 0 && !isLoading
        ? [...(starterSuggestions?.length ? starterSuggestions : STARTER_SUGGESTIONS)]
            .slice(0, 3)
            .sort((a, b) => a.length - b.length)
        : [];
  const hasSuggestionItems = suggestionItems.length > 0;
  /** Panel mounted (visible or playing close anim) until exit animation finishes */
  const suggestionsPanelMounted =
    hasSuggestionItems && (!suggestionsPanelDismissed || suggestionsPanelClosing);
  const showSuggestionStrip = suggestionsPanelMounted;

  const chatScrollRef = React.useRef<HTMLDivElement>(null);
  const chatInnerRef = React.useRef<HTMLDivElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollToEndRafRef = React.useRef<number>(0);

  /** Keep the latest assistant line above the composer (typewriter + streaming grow height gradually). */
  const scheduleScrollChatToEnd = React.useCallback(() => {
    if (scrollToEndRafRef.current) return;
    scrollToEndRafRef.current = requestAnimationFrame(() => {
      scrollToEndRafRef.current = 0;
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "auto", inline: "nearest" });
    });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    scheduleScrollChatToEnd();
  }, [open, messages, streamingText, isLoading, scheduleScrollChatToEnd]);

  React.useEffect(() => {
    if (!open) return;
    const outer = chatScrollRef.current;
    const inner = chatInnerRef.current;
    if (!outer || !inner) return;
    const ro = new ResizeObserver(() => {
      scheduleScrollChatToEnd();
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, [open, messages, streamingText, isLoading, scheduleScrollChatToEnd]);

  return (
    <>
      {/* Backdrop - slight black, app still visible */}
      <div
        className={cn(
          "fixed inset-0 z-[100] bg-black/60 backdrop-blur-[4px]",
          isClosing ? "voice-overlay-backdrop-out" : "voice-overlay-backdrop-in"
        )}
        onClick={handleClose}
        aria-hidden
      />

      {/* Edge glide: blue & yellow hue — reveal crawls up from bottom (sides first, top completes last) */}
      <div
        className={cn(
          "edge-glide edge-glide-visible",
          isClosing ? "edge-glide-out" : "edge-glide-in"
        )}
        aria-hidden
      />

      {/* Header bar at top - hamburger | tabs | plus - within hue */}
      <div
        className={cn(
          "fixed top-4 z-[101] flex items-center gap-2 rounded-xl px-2 py-2 border border-white/[0.08]",
          WITHIN_HUE,
          OVERLAY_BG,
          isClosing ? "voice-overlay-pop-out" : "voice-overlay-pop-in"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleOpenChatLogs}
          className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          aria-label="Chat logs"
          title="Chat logs"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                "shrink-0 flex items-center gap-0.5 rounded-lg group",
                activeTabId === tab.id ? "bg-slate-700/60" : "hover:bg-white/5"
              )}
            >
              <button
                type="button"
                onClick={() => onTabSelect?.(tab.id)}
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium transition-colors truncate max-w-[100px]",
                  activeTabId === tab.id ? "text-slate-100" : "text-slate-400 hover:text-slate-200"
                )}
              >
                {tab.title}
              </button>
              {onCloseTab && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
                  className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
                  aria-label={`Close ${tab.title}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {hasSuggestionItems && (suggestionsPanelDismissed || suggestionsSparklesClosing) && (
          <button
            type="button"
            onClick={() => {
              if (suggestionsSparklesClosing) return;
              setSuggestionsSparklesClosing(true);
              if (suggestionsSparklesCloseTimerRef.current) clearTimeout(suggestionsSparklesCloseTimerRef.current);
              suggestionsSparklesCloseTimerRef.current = setTimeout(() => {
                suggestionsSparklesCloseTimerRef.current = null;
                setSuggestionsPanelDismissed(false);
                setSuggestionsSparklesClosing(false);
              }, 260);
            }}
            className={cn(
              "shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors",
              suggestionsSparklesClosing ? "voice-suggestions-sparkles-out" : "voice-suggestions-sparkles-in"
            )}
            aria-label="Show suggested prompts"
            title="Show suggestions"
          >
            <Sparkles className="w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onNewChat}
          className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          aria-label="New chat"
          title="New chat"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Suggestions — compact card directly under the top bar */}
      {showSuggestionStrip && (
        <div
          className={cn(
            "fixed rounded-xl border border-white/[0.12] p-3 shadow-xl pointer-events-auto",
            Z_SUGGESTIONS,
            WITHIN_HUE,
            "top-[72px]",
            OVERLAY_BG,
            isClosing
              ? "voice-overlay-pop-out"
              : suggestionsPanelClosing
                ? "voice-suggestions-panel-out"
                : "voice-suggestions-panel-in"
          )}
          onClick={(e) => e.stopPropagation()}
          role="region"
          aria-label="Suggested prompts"
        >
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 pt-0.5">
              {followUpSuggestions.length > 0 ? "Continue with" : "Try asking"}
            </p>
            <button
              type="button"
              onClick={() => {
                if (suggestionsPanelClosing) return;
                setSuggestionsPanelClosing(true);
                if (suggestionsPanelCloseTimerRef.current) clearTimeout(suggestionsPanelCloseTimerRef.current);
                suggestionsPanelCloseTimerRef.current = setTimeout(() => {
                  suggestionsPanelCloseTimerRef.current = null;
                  setSuggestionsPanelDismissed(true);
                  setSuggestionsPanelClosing(false);
                }, 280);
              }}
              className="shrink-0 -mr-1 -mt-1 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
              aria-label="Hide suggested prompts"
              title="Hide suggestions"
            >
              <Minus className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto overflow-x-hidden min-w-0 pr-0.5">
            {suggestionItems.map((s, i) => (
              <button
                key={`${s}-${i}`}
                type="button"
                onClick={() => onSend(s)}
                className="w-fit max-w-full shrink text-left text-xs px-3 py-2 rounded-lg border border-white/[0.12] text-slate-200 hover:bg-white/10 hover:text-slate-100 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat list drawer - slides in when hamburger clicked */}
      {chatListOpen && (
        <div
          className={cn(
            "fixed inset-0 flex flex-col",
            Z_CHAT_DRAWER,
            WITHIN_HUE,
            "left-1/2 -translate-x-1/2 w-[calc(375px-24px)] max-w-[calc(100vw-24px)] top-4 bottom-24",
            OVERLAY_BG,
            "rounded-xl border border-white/[0.12] overflow-hidden",
            isClosing && "voice-overlay-pop-out"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-3 border-b border-white/[0.08] shrink-0">
            <h3 className="text-base font-semibold text-slate-100">All chats</h3>
            <button
              type="button"
              onClick={() => setChatListOpen(false)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {chats.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">No chats yet</p>
            ) : (
              chats.map((convo) => (
                <div
                  key={convo.id}
                  className={cn(
                    "flex items-center justify-between gap-2 py-2.5 px-3 rounded-lg",
                    activeTabId === convo.id ? "bg-slate-700/60 ring-1 ring-slate-600/50" : "hover:bg-white/5"
                  )}
                >
                  {editingChatId === convo.id ? (
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSubmitRename();
                          if (e.key === "Escape") { setEditingChatId(null); setEditTitle(""); }
                        }}
                        onBlur={handleSubmitRename}
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm text-slate-200 bg-slate-700/60 border border-white/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-white/40"
                        placeholder="Chat name"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSelectChat(convo.id)}
                      className="min-w-0 flex-1 text-left -my-2 py-2 -mx-2 px-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                    >
                      <p className="text-slate-200 font-medium text-sm truncate">{convo.title}</p>
                      <p className="text-slate-500 text-[11px] mt-0.5 truncate">
                        {convo.messages?.length ? `${convo.messages.length} messages` : "No messages yet"}
                        {convo.updatedAt ? ` · ${fmtTs(convo.updatedAt)}` : ""}
                      </p>
                    </button>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {onRenameChat && editingChatId !== convo.id && (
                      <button
                        type="button"
                        onClick={() => handleStartRename(convo)}
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
                        aria-label="Rename chat"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {onDeleteChat && (
                      <button
                        type="button"
                        onClick={() => onDeleteChat(convo.id)}
                        className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        aria-label="Delete chat"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {chats.length > 0 && (
            <div className="p-3 border-t border-white/[0.08] shrink-0">
              <button
                type="button"
                onClick={() => { onNewChat?.(); setChatListOpen(false); }}
                className="w-full voice-send-btn text-white text-sm font-medium py-2.5 rounded-xl flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New chat
              </button>
            </div>
          )}
        </div>
      )}

      {/* Center: empty state for new chats - avatar, description, Help Dilly button - within hue */}
      {displayMessages.length === 0 && !isLoading && (
        <div
          className={cn(
            "fixed z-[101] flex flex-col items-center justify-center px-4 pointer-events-auto min-h-0",
            VOICE_CHAT_TOP,
            WITHIN_HUE,
            isClosing && "voice-overlay-pop-out"
          )}
          style={CHAT_AREA_BOTTOM_STYLE}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center text-center gap-4">
            <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="md" className="shrink-0 w-14 h-14" />
            <p className="text-slate-300 text-sm leading-relaxed max-w-[280px]">
              {emptyChatGreeting ??
                "Tell Dilly AI anything career-related—scores, interviews, rejections, networking, who you met. I'll remember it."}
            </p>
            <button
              type="button"
              onClick={onHelpDillyKnowYou}
              className="rounded-xl px-4 py-2.5 text-sm font-medium bg-white text-black hover:bg-white/90 active:scale-[0.98] transition-all"
            >
              Help Dilly know you better
            </button>
          </div>
        </div>
      )}

      {/* Messages below header - scrollable, within hue */}
      {(displayMessages.length > 0 || isLoading) && (
        <VoiceDedupScrollRoot
          scrollRef={chatScrollRef}
          className={cn(
            "fixed z-[101] flex flex-col overflow-y-auto overflow-x-hidden overscroll-contain px-2 min-h-0",
            VOICE_CHAT_TOP,
            WITHIN_HUE,
            isClosing && "voice-overlay-pop-out"
          )}
          style={CHAT_AREA_BOTTOM_STYLE}
          onClick={(e) => e.stopPropagation()}
        >
          <div ref={chatInnerRef} className="flex flex-col gap-2 min-h-0 pb-28">
            {mockInterviewBanner ? (
              <VoiceMockInterviewBanner
                active
                questionNumber={mockInterviewBanner.questionNumber}
                total={mockInterviewBanner.total}
                onEnd={mockInterviewBanner.onEnd}
              />
            ) : null}
            {displayMessages.map((m, i) => {
              const isLastAssistant = m.role === "assistant" && i === displayMessages.length - 1;
              // eslint-disable-next-line react-hooks/purity -- intentional
              const isNewMessage = m.ts && Date.now() - m.ts < 3000;
              const isMockAssistant = m.role === "assistant" && Boolean(m.mockTurn);
              const scoreInject =
                m.role === "assistant" &&
                !isMockAssistant &&
                !!voiceScoresForChat &&
                assistantMessageSuggestsScoreBreakdown(m.content) &&
                !/\[\[scores_visual\]\]/i.test(m.content);
              const hasDeadlineDataForHeuristic = Boolean(voiceScoresForChat?.deadlines?.length);
              const disableTypewriter =
                m.role === "assistant" &&
                voiceReplyShouldDisableTypewriter(m.content, scoreInject, hasDeadlineDataForHeuristic);
              const shouldTypeOut =
                isLastAssistant &&
                (!!streamingText || !!isNewMessage) &&
                !disableTypewriter &&
                !isMockAssistant;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2 rounded-xl px-3 py-2.5 text-sm border border-white/[0.08]",
                    OVERLAY_BG,
                    m.role === "user" ? "self-end max-w-[85%]" : "self-start max-w-[90%]",
                    m.role === "assistant" && "voice-overlay-msg-pop-in"
                  )}
                >
                  {m.role === "assistant" && (
                    <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="shrink-0 mt-0.5" />
                  )}
                  <div className="whitespace-pre-wrap break-words text-slate-200 min-w-0 flex-1">
                    {m.role === "assistant" ? (
                      m.mockTurn ? (
                        <VoiceMockInterviewTurn turn={m.mockTurn} />
                      ) : (
                        <VoiceAssistantRichReply
                          rawContent={m.content}
                          voiceScores={voiceScoresForChat}
                          priorUserContent={
                            i > 0 && displayMessages[i - 1]?.role === "user"
                              ? displayMessages[i - 1]!.content
                              : null
                          }
                          useTypewriter={shouldTypeOut}
                          cursorColor={themePrimary}
                          onTypewriterProgress={scheduleScrollChatToEnd}
                          messageListIndex={i}
                        />
                      )
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && !streamingText && (
              <div
                className={cn(
                  "flex gap-2 rounded-xl px-3 py-2.5 text-sm border border-white/[0.08] self-start max-w-[90%]",
                  OVERLAY_BG
                )}
              >
                <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="shrink-0 mt-0.5" />
                <span className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: themePrimary }} />
                  <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: themePrimary, animationDelay: "200ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: themePrimary, animationDelay: "400ms" }} />
                </span>
              </div>
            )}
            <div ref={messagesEndRef} className="h-px w-full shrink-0 scroll-mt-4" aria-hidden />
          </div>
        </VoiceDedupScrollRoot>
      )}

      {/* Composer — fixed above bottom safe area */}
      <div
        className={cn(
          "fixed bottom-4 z-[101] flex flex-col items-stretch gap-0 px-2",
          WITHIN_HUE,
          isClosing && "voice-overlay-pop-out"
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Dilly AI"
      >
        <div className="w-full">
        <div
          className={cn(
            "w-full flex items-center gap-2 rounded-xl border border-white/[0.12] p-2 shadow-xl",
            "ring-2 ring-transparent",
            OVERLAY_BG,
            isClosing ? "voice-overlay-pop-out" : "voice-overlay-pop-in"
          )}
          style={{
            boxShadow: `0 0 20px ${themePrimary}15, 0 8px 30px rgba(0,0,0,0.4)`,
          }}
        >
          <button
            type="button"
            onClick={handleMicTap}
            className={cn(
              "p-1.5 rounded-full shrink-0 transition-colors",
              isSupported
                ? "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                : "text-slate-500 cursor-default",
              isListening && "text-red-400 bg-red-500/20 animate-pulse"
            )}
            aria-label={isListening ? "Stop recording" : isSupported ? "Tap to speak" : "Type instead of speaking"}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <DillyVoicePrompt
              value={displayValue}
              onChange={onChange}
              onSend={() => onSend()}
              isLoading={isLoading}
              placeholder="Tell Dilly AI anything…"
              rotatingExamples={[
                "I had coffee with Sarah from Goldman",
                "I just got rejected from McKinsey",
                "I'm stressed about my interview tomorrow",
                "I bombed the behavioral question",
              ]}
              compact
              className="min-w-0"
              typingIndicatorColor={themePrimary}
              autoFocus={!chatListOpen}
            />
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-200 hover:bg-white/5 shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        </div>
      </div>
    </>
  );
}
