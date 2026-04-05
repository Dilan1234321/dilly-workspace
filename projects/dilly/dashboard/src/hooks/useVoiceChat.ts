"use client";

import { useVoice } from "@/contexts/VoiceContext";
import { safeUuid } from "@/lib/dillyUtils";
import type { VoiceConvo } from "@/types/dilly";

/**
 * Chat list operations: create, open, close, delete, rename, back-to-list.
 * All underlying state lives in VoiceContext.
 */
export function useVoiceChatManagement() {
  const {
    voiceConvos,
    setVoiceConvos,
    openVoiceConvIds,
    setOpenVoiceConvIds,
    activeVoiceConvId,
    setActiveVoiceConvId,
    voiceChatListOpen,
    setVoiceChatListOpen,
    voiceMessages,
    setVoiceMessages,
    setVoiceMessageQueue,
    setVoiceInput,
    setVoiceFollowUpSuggestions,
    setVoiceStreamingText,
    renamingVoiceConvId,
    setRenamingVoiceConvId,
    renameValue,
    setRenameValue,
    setBulletRewriterOpen,
  } = useVoice();

  /** Persist current in-progress messages back to the conversation list. */
  const saveCurrentConvo = (prevList: VoiceConvo[]): VoiceConvo[] => {
    if (!activeVoiceConvId || voiceMessages.length === 0) return prevList;
    return prevList.map((c) =>
      c.id === activeVoiceConvId ? { ...c, messages: voiceMessages, updatedAt: Date.now() } : c,
    );
  };

  const startNewChat = () => {
    setVoiceConvos(saveCurrentConvo);
    const newConvo: VoiceConvo = {
      id: safeUuid(),
      title: "New Chat",
      messages: [],
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
    setVoiceConvos((prev) => [...saveCurrentConvo(prev), newConvo]);
    setOpenVoiceConvIds((prev) => [newConvo.id, ...prev.filter((x) => x !== newConvo.id)]);
    setActiveVoiceConvId(newConvo.id);
    setVoiceMessages([]);
    setVoiceInput("");
    setVoiceFollowUpSuggestions([]);
    setVoiceStreamingText("");
    setBulletRewriterOpen(false);
    setVoiceChatListOpen(false);
  };

  const openChat = (id: string) => {
    setVoiceConvos(saveCurrentConvo);
    const convo = voiceConvos.find((c) => c.id === id);
    if (!convo) return;
    setOpenVoiceConvIds((prev) => (prev.includes(id) ? prev : [id, ...prev]));
    setActiveVoiceConvId(id);
    setVoiceMessages(convo.messages ?? []);
    setVoiceMessageQueue([]);
    setVoiceFollowUpSuggestions([]);
    setVoiceInput("");
    setVoiceStreamingText("");
    setBulletRewriterOpen(false);
    setVoiceChatListOpen(false);
  };

  const closeTab = (id: string) => {
    setOpenVoiceConvIds((prev) => prev.filter((x) => x !== id));
    if (activeVoiceConvId === id) {
      const remaining = openVoiceConvIds.filter((x) => x !== id);
      const next = remaining[0] ?? null;
      if (next) {
        const convo = voiceConvos.find((c) => c.id === next);
        if (convo) {
          setActiveVoiceConvId(next);
          setVoiceMessages(convo.messages ?? []);
          setVoiceMessageQueue([]);
        }
      } else {
        setActiveVoiceConvId(null);
        setVoiceMessages([]);
        setVoiceMessageQueue([]);
      }
    }
  };

  const backToList = () => {
    setVoiceConvos(saveCurrentConvo);
    setActiveVoiceConvId(null);
    setVoiceFollowUpSuggestions([]);
    setVoiceInput("");
    setVoiceStreamingText("");
    setBulletRewriterOpen(false);
  };

  const deleteChat = (id: string) => {
    setVoiceConvos((prev) => prev.filter((c) => c.id !== id));
    setOpenVoiceConvIds((prev) => prev.filter((x) => x !== id));
    if (activeVoiceConvId === id) {
      setActiveVoiceConvId(null);
      setVoiceMessages([]);
      setVoiceMessageQueue([]);
    }
  };

  const startRename = (id: string) => {
    const convo = voiceConvos.find((c) => c.id === id);
    setRenamingVoiceConvId(id);
    setRenameValue(convo?.title || "");
  };

  const commitRename = () => {
    if (!renamingVoiceConvId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      setVoiceConvos((prev) =>
        prev.map((c) => (c.id === renamingVoiceConvId ? { ...c, title: trimmed } : c)),
      );
    }
    setRenamingVoiceConvId(null);
    setRenameValue("");
  };

  return {
    voiceConvos,
    setVoiceConvos,
    openVoiceConvIds,
    activeVoiceConvId,
    voiceChatListOpen,
    setVoiceChatListOpen,
    voiceMessages,
    setVoiceMessages,
    renamingVoiceConvId,
    setRenamingVoiceConvId,
    renameValue,
    setRenameValue,
    saveCurrentConvo,
    startNewChat,
    openChat,
    closeTab,
    backToList,
    deleteChat,
    startRename,
    commitRename,
  };
}
