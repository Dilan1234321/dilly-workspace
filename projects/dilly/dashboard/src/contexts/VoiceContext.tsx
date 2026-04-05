"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { VoiceConvo, MemoryItem, SessionCapture, ConversationOutput } from "@/types/dilly";
import type { VoiceSessionRecap } from "@/lib/voiceSessionRecap";

// ── Types ──────────────────────────────────────────────────────────────────────

export type VoiceMockInterviewSession = {
  sessionContext: string;
  questionIndex: number;
  history: { q: string; a: string }[];
  currentQuestion: string;
  totalQuestions: number;
  awaitingAnswer: boolean;
};

export type VoiceApplicationPreview = {
  company: string;
  role?: string;
  status?: string;
  deadline?: string | null;
};

export type VoiceActionItem = {
  id: string;
  text: string;
  done: boolean;
  convId: string | null;
};

// ── Context value ──────────────────────────────────────────────────────────────

export interface VoiceContextValue {
  // Conversations
  voiceConvos: VoiceConvo[];
  setVoiceConvos: React.Dispatch<React.SetStateAction<VoiceConvo[]>>;
  openVoiceConvIds: string[];
  setOpenVoiceConvIds: React.Dispatch<React.SetStateAction<string[]>>;
  activeVoiceConvId: string | null;
  setActiveVoiceConvId: React.Dispatch<React.SetStateAction<string | null>>;
  voiceChatListOpen: boolean;
  setVoiceChatListOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Avatar
  voiceAvatarIndex: number | null;
  setVoiceAvatarIndex: React.Dispatch<React.SetStateAction<number | null>>;
  voiceAvatarPickerOpen: boolean;
  setVoiceAvatarPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Rename
  renamingVoiceConvId: string | null;
  setRenamingVoiceConvId: React.Dispatch<React.SetStateAction<string | null>>;
  renameValue: string;
  setRenameValue: React.Dispatch<React.SetStateAction<string>>;
  // Messages & chat
  voiceMessages: VoiceConvo["messages"];
  setVoiceMessages: React.Dispatch<React.SetStateAction<VoiceConvo["messages"]>>;
  voiceMessageQueue: string[];
  setVoiceMessageQueue: React.Dispatch<React.SetStateAction<string[]>>;
  voiceInput: string;
  setVoiceInput: React.Dispatch<React.SetStateAction<string>>;
  voiceLoading: boolean;
  setVoiceLoading: React.Dispatch<React.SetStateAction<boolean>>;
  voiceStreamingText: string;
  setVoiceStreamingText: React.Dispatch<React.SetStateAction<string>>;
  voiceFollowUpSuggestions: string[];
  setVoiceFollowUpSuggestions: React.Dispatch<React.SetStateAction<string[]>>;
  // Mock interview
  voiceMockInterviewSession: VoiceMockInterviewSession | null;
  setVoiceMockInterviewSession: React.Dispatch<React.SetStateAction<VoiceMockInterviewSession | null>>;
  // Misc
  mascotTapCount: number;
  setMascotTapCount: React.Dispatch<React.SetStateAction<number>>;
  lastAuditTsOnVoiceEnter: number | null;
  setLastAuditTsOnVoiceEnter: React.Dispatch<React.SetStateAction<number | null>>;
  // Memory & captures
  memoryItems: MemoryItem[];
  setMemoryItems: React.Dispatch<React.SetStateAction<MemoryItem[]>>;
  pendingSessionCaptureCard: SessionCapture | null;
  setPendingSessionCaptureCard: React.Dispatch<React.SetStateAction<SessionCapture | null>>;
  latestConversationOutput: ConversationOutput | null;
  setLatestConversationOutput: React.Dispatch<React.SetStateAction<ConversationOutput | null>>;
  voiceRecapNonce: number;
  setVoiceRecapNonce: React.Dispatch<React.SetStateAction<number>>;
  voiceRecapForCard: VoiceSessionRecap | null;
  setVoiceRecapForCard: React.Dispatch<React.SetStateAction<VoiceSessionRecap | null>>;
  voiceApplicationsPreview: VoiceApplicationPreview[];
  setVoiceApplicationsPreview: React.Dispatch<React.SetStateAction<VoiceApplicationPreview[]>>;
  // Bullet rewriter
  bulletRewriterOpen: boolean;
  setBulletRewriterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bulletInput: string;
  setBulletInput: React.Dispatch<React.SetStateAction<string>>;
  bulletRewritten: string;
  setBulletRewritten: React.Dispatch<React.SetStateAction<string>>;
  bulletLoading: boolean;
  setBulletLoading: React.Dispatch<React.SetStateAction<boolean>>;
  bulletHistory: { original: string; versions: string[] };
  setBulletHistory: React.Dispatch<React.SetStateAction<{ original: string; versions: string[] }>>;
  // Remember notes
  voiceRememberOpen: boolean;
  setVoiceRememberOpen: React.Dispatch<React.SetStateAction<boolean>>;
  voiceRememberNote: string;
  setVoiceRememberNote: React.Dispatch<React.SetStateAction<string>>;
  // Outcome capture
  outcomeAskingConsent: "interview" | "offer" | null;
  setOutcomeAskingConsent: React.Dispatch<React.SetStateAction<"interview" | "offer" | null>>;
  // Action items
  voiceActionItems: VoiceActionItem[];
  setVoiceActionItems: React.Dispatch<React.SetStateAction<VoiceActionItem[]>>;
  actionItemsPanelOpen: boolean;
  setActionItemsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Company tracker
  voiceCompany: string;
  setVoiceCompany: React.Dispatch<React.SetStateAction<string>>;
  voiceCompanyInput: string;
  setVoiceCompanyInput: React.Dispatch<React.SetStateAction<string>>;
  voiceCompanyPanelOpen: boolean;
  setVoiceCompanyPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Firm deadlines
  firmDeadlines: { label: string; date?: string; note: string; source: "calendar" | "estimate"; disclaimer?: string }[];
  setFirmDeadlines: React.Dispatch<React.SetStateAction<{ label: string; date?: string; note: string; source: "calendar" | "estimate"; disclaimer?: string }[]>>;
  // Voice memory
  voiceMemory: string[];
  setVoiceMemory: React.Dispatch<React.SetStateAction<string[]>>;
  // Feedback
  voiceFeedback: Record<number, "up" | "down">;
  setVoiceFeedback: React.Dispatch<React.SetStateAction<Record<number, "up" | "down">>>;
  // Overlay & badge
  voiceOverlayOpen: boolean;
  setVoiceOverlayOpen: React.Dispatch<React.SetStateAction<boolean>>;
  voiceBadgeLastSeen: { deadlinesWithin7: number; auditTs: number | null } | null;
  setVoiceBadgeLastSeen: React.Dispatch<React.SetStateAction<{ deadlinesWithin7: number; auditTs: number | null } | null>>;
  // Calendar sync
  voiceCalendarSyncKey: number;
  setVoiceCalendarSyncKey: React.Dispatch<React.SetStateAction<number>>;
  // Screen context
  voiceScreenContext: { current_screen: string; prompt?: string } | null;
  setVoiceScreenContext: React.Dispatch<React.SetStateAction<{ current_screen: string; prompt?: string } | null>>;
  // Pending prompt
  pendingVoicePrompt: string | null;
  setPendingVoicePrompt: React.Dispatch<React.SetStateAction<string | null>>;
  // Score card strip
  scoreCardDillyStrip: string | null;
  setScoreCardDillyStrip: React.Dispatch<React.SetStateAction<string | null>>;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [voiceConvos, setVoiceConvos] = useState<VoiceConvo[]>([]);
  const [openVoiceConvIds, setOpenVoiceConvIds] = useState<string[]>([]);
  const [activeVoiceConvId, setActiveVoiceConvId] = useState<string | null>(null);
  const [voiceChatListOpen, setVoiceChatListOpen] = useState(false);
  const [voiceAvatarIndex, setVoiceAvatarIndex] = useState<number | null>(null);
  const [voiceAvatarPickerOpen, setVoiceAvatarPickerOpen] = useState(false);
  const [renamingVoiceConvId, setRenamingVoiceConvId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [voiceMessages, setVoiceMessages] = useState<VoiceConvo["messages"]>([]);
  const [voiceMockInterviewSession, setVoiceMockInterviewSession] = useState<VoiceMockInterviewSession | null>(null);
  const [voiceMessageQueue, setVoiceMessageQueue] = useState<string[]>([]);
  const [voiceInput, setVoiceInput] = useState("");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceStreamingText, setVoiceStreamingText] = useState("");
  const [voiceFollowUpSuggestions, setVoiceFollowUpSuggestions] = useState<string[]>([]);
  const [mascotTapCount, setMascotTapCount] = useState(0);
  const [lastAuditTsOnVoiceEnter, setLastAuditTsOnVoiceEnter] = useState<number | null>(null);
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [pendingSessionCaptureCard, setPendingSessionCaptureCard] = useState<SessionCapture | null>(null);
  const [latestConversationOutput, setLatestConversationOutput] = useState<ConversationOutput | null>(null);
  const [voiceRecapNonce, setVoiceRecapNonce] = useState(0);
  const [voiceRecapForCard, setVoiceRecapForCard] = useState<VoiceSessionRecap | null>(null);
  const [voiceApplicationsPreview, setVoiceApplicationsPreview] = useState<VoiceApplicationPreview[]>([]);
  const [bulletRewriterOpen, setBulletRewriterOpen] = useState(false);
  const [bulletInput, setBulletInput] = useState("");
  const [bulletRewritten, setBulletRewritten] = useState("");
  const [bulletLoading, setBulletLoading] = useState(false);
  const [bulletHistory, setBulletHistory] = useState<{ original: string; versions: string[] }>({ original: "", versions: [] });
  const [voiceRememberOpen, setVoiceRememberOpen] = useState(false);
  const [voiceRememberNote, setVoiceRememberNote] = useState("");
  const [outcomeAskingConsent, setOutcomeAskingConsent] = useState<"interview" | "offer" | null>(null);
  const [voiceActionItems, setVoiceActionItems] = useState<VoiceActionItem[]>([]);
  const [actionItemsPanelOpen, setActionItemsPanelOpen] = useState(false);
  const [voiceCompany, setVoiceCompany] = useState("");
  const [voiceCompanyInput, setVoiceCompanyInput] = useState("");
  const [voiceCompanyPanelOpen, setVoiceCompanyPanelOpen] = useState(false);
  const [firmDeadlines, setFirmDeadlines] = useState<VoiceContextValue["firmDeadlines"]>([]);
  const [voiceMemory, setVoiceMemory] = useState<string[]>([]);
  const [voiceFeedback, setVoiceFeedback] = useState<Record<number, "up" | "down">>({});
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const [voiceBadgeLastSeen, setVoiceBadgeLastSeen] = useState<{ deadlinesWithin7: number; auditTs: number | null } | null>(null);
  const [voiceCalendarSyncKey, setVoiceCalendarSyncKey] = useState(0);
  const [voiceScreenContext, setVoiceScreenContext] = useState<{ current_screen: string; prompt?: string } | null>(null);
  const [pendingVoicePrompt, setPendingVoicePrompt] = useState<string | null>(null);
  const [scoreCardDillyStrip, setScoreCardDillyStrip] = useState<string | null>(null);

  const value = useMemo<VoiceContextValue>(() => ({
    voiceConvos, setVoiceConvos,
    openVoiceConvIds, setOpenVoiceConvIds,
    activeVoiceConvId, setActiveVoiceConvId,
    voiceChatListOpen, setVoiceChatListOpen,
    voiceAvatarIndex, setVoiceAvatarIndex,
    voiceAvatarPickerOpen, setVoiceAvatarPickerOpen,
    renamingVoiceConvId, setRenamingVoiceConvId,
    renameValue, setRenameValue,
    voiceMessages, setVoiceMessages,
    voiceMockInterviewSession, setVoiceMockInterviewSession,
    voiceMessageQueue, setVoiceMessageQueue,
    voiceInput, setVoiceInput,
    voiceLoading, setVoiceLoading,
    voiceStreamingText, setVoiceStreamingText,
    voiceFollowUpSuggestions, setVoiceFollowUpSuggestions,
    mascotTapCount, setMascotTapCount,
    lastAuditTsOnVoiceEnter, setLastAuditTsOnVoiceEnter,
    memoryItems, setMemoryItems,
    pendingSessionCaptureCard, setPendingSessionCaptureCard,
    latestConversationOutput, setLatestConversationOutput,
    voiceRecapNonce, setVoiceRecapNonce,
    voiceRecapForCard, setVoiceRecapForCard,
    voiceApplicationsPreview, setVoiceApplicationsPreview,
    bulletRewriterOpen, setBulletRewriterOpen,
    bulletInput, setBulletInput,
    bulletRewritten, setBulletRewritten,
    bulletLoading, setBulletLoading,
    bulletHistory, setBulletHistory,
    voiceRememberOpen, setVoiceRememberOpen,
    voiceRememberNote, setVoiceRememberNote,
    outcomeAskingConsent, setOutcomeAskingConsent,
    voiceActionItems, setVoiceActionItems,
    actionItemsPanelOpen, setActionItemsPanelOpen,
    voiceCompany, setVoiceCompany,
    voiceCompanyInput, setVoiceCompanyInput,
    voiceCompanyPanelOpen, setVoiceCompanyPanelOpen,
    firmDeadlines, setFirmDeadlines,
    voiceMemory, setVoiceMemory,
    voiceFeedback, setVoiceFeedback,
    voiceOverlayOpen, setVoiceOverlayOpen,
    voiceBadgeLastSeen, setVoiceBadgeLastSeen,
    voiceCalendarSyncKey, setVoiceCalendarSyncKey,
    voiceScreenContext, setVoiceScreenContext,
    pendingVoicePrompt, setPendingVoicePrompt,
    scoreCardDillyStrip, setScoreCardDillyStrip,
  }), [
    voiceConvos, openVoiceConvIds, activeVoiceConvId, voiceChatListOpen,
    voiceAvatarIndex, voiceAvatarPickerOpen, renamingVoiceConvId, renameValue,
    voiceMessages, voiceMockInterviewSession, voiceMessageQueue, voiceInput,
    voiceLoading, voiceStreamingText, voiceFollowUpSuggestions, mascotTapCount,
    lastAuditTsOnVoiceEnter, memoryItems, pendingSessionCaptureCard,
    latestConversationOutput, voiceRecapNonce, voiceRecapForCard,
    voiceApplicationsPreview, bulletRewriterOpen, bulletInput, bulletRewritten,
    bulletLoading, bulletHistory, voiceRememberOpen, voiceRememberNote,
    outcomeAskingConsent, voiceActionItems, actionItemsPanelOpen,
    voiceCompany, voiceCompanyInput, voiceCompanyPanelOpen, firmDeadlines,
    voiceMemory, voiceFeedback, voiceOverlayOpen, voiceBadgeLastSeen,
    voiceCalendarSyncKey, voiceScreenContext, pendingVoicePrompt, scoreCardDillyStrip,
  ]);

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within VoiceProvider");
  return ctx;
}
