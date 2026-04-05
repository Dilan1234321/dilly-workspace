import { sanitizeVoiceAssistantReply } from "@/lib/voiceReplySanitize";
import { computeScoreTrajectory } from "@/lib/dillyUtils";
import { safeUuid } from "@/lib/dillyUtils";
import type { ChatMessage, DillyDeadline, VoiceConvo } from "@/types/dilly";
import type { VoiceActionItem } from "@/contexts/VoiceContext";

export interface ProcessVoiceStreamDeps {
  convId: string | undefined;
  text: string;
  setVoiceStreamingText: (v: string) => void;
  setVoiceMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setVoiceFollowUpSuggestions: React.Dispatch<React.SetStateAction<string[]>>;
  setVoiceConvos: React.Dispatch<React.SetStateAction<VoiceConvo[]>>;
  setVoiceMemory: React.Dispatch<React.SetStateAction<string[]>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setAppProfile: React.Dispatch<React.SetStateAction<any>>;
  setVoiceActionItems: React.Dispatch<React.SetStateAction<VoiceActionItem[]>>;
  mergeVoiceAutoSavedDeadlines: (rows: DillyDeadline[]) => void;
  saveProfile: (data: Record<string, unknown>) => Promise<boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewingAudit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  savedAuditForCenter: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  appProfile: any;
  activeVoiceConvId: string | null;
}

export async function processVoiceStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  deps: ProcessVoiceStreamDeps,
): Promise<void> {
  const {
    convId,
    text,
    setVoiceStreamingText,
    setVoiceMessages,
    setVoiceFollowUpSuggestions,
    setVoiceConvos,
    setVoiceMemory,
    setAppProfile,
    setVoiceActionItems,
    mergeVoiceAutoSavedDeadlines,
    saveProfile,
    viewingAudit,
    audit,
    savedAuditForCenter,
    appProfile,
    activeVoiceConvId,
  } = deps;

  const decoder = new TextDecoder();
  let accumulated = "";
  let streamedText = "";
  let assistantReplyCommitted = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
    const lines = accumulated.split("\n");
    accumulated = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const evt = JSON.parse(raw);
        if (typeof evt.t === "string" && evt.t.length > 0) {
          streamedText += evt.t;
          const forDisplay = streamedText.replace(/\n\s*SUGGESTIONS:\s*[\s\S]*$/i, "").trim();
          setVoiceStreamingText(forDisplay);
        }
        if (evt.done === true) {
          setVoiceStreamingText("");
          const cleaned = (streamedText || "")
            .replace(/\n\s*SUGGESTIONS:\s*[\s\S]*$/i, "")
            .trim();
          const finalMsg =
            sanitizeVoiceAssistantReply(cleaned) || cleaned || "Dilly had trouble responding.";
          if (!assistantReplyCommitted) {
            assistantReplyCommitted = true;
            setVoiceMessages((m) => [
              ...m,
              { role: "assistant", content: finalMsg, ts: Date.now() },
            ]);
            const summary = `[${new Date().toLocaleDateString()}] You asked: "${text.slice(0, 80)}". Dilly said: "${finalMsg.slice(0, 120)}"`;
            setVoiceMemory((prev) => [...prev.slice(-9), summary]);
          }
          streamedText = "";
          const baseSuggestions = Array.isArray(evt.suggestions) ? evt.suggestions : [];
          const displayAuditForChip = viewingAudit ?? audit ?? savedAuditForCenter;
          let suggestionsToSet = baseSuggestions;
          if (displayAuditForChip?.scores) {
            const traj = computeScoreTrajectory(displayAuditForChip);
            const hasGain =
              traj &&
              (["smart", "grit", "build"] as const).some((dim) => {
                const delta = (traj[dim] ?? 0) - (displayAuditForChip.scores[dim] ?? 0);
                return delta >= 3;
              });
            if (hasGain && !baseSuggestions.includes("What's my score potential?")) {
              suggestionsToSet = [...baseSuggestions, "What's my score potential?"];
            }
          }
          setVoiceFollowUpSuggestions((prev) =>
            suggestionsToSet.length > 0
              ? suggestionsToSet
              : prev.length > 0
                ? prev
                : suggestionsToSet,
          );
          if (evt.title && typeof evt.title === "string" && convId) {
            setVoiceConvos((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? { ...c, title: (evt.title as string).slice(0, 60), updatedAt: Date.now() }
                  : c,
              ),
            );
          }
          if (
            Array.isArray(evt.deadlines_auto_saved) &&
            evt.deadlines_auto_saved.length > 0
          ) {
            mergeVoiceAutoSavedDeadlines(evt.deadlines_auto_saved as DillyDeadline[]);
          }
          if (Array.isArray(evt.action_items) && evt.action_items.length > 0) {
            const count = (evt.action_items as string[]).length;
            setVoiceActionItems((prev) => {
              if (prev.length >= 8) return prev;
              const existingTexts = prev.map((i) => i.text.toLowerCase());
              const stopWords = new Set([
                "a","an","the","and","or","to","in","on","of","for","your",
                "you","with","by","at","is","are","it","this","that","be",
                "as","up","so","if","its",
              ]);
              const keywordsOf = (s: string) =>
                s.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !stopWords.has(w));
              const isDuplicate = (incoming: string) =>
                existingTexts.some((existing) => {
                  const kIn = keywordsOf(incoming);
                  const kEx = keywordsOf(existing);
                  const overlap = kIn.filter((w) => kEx.includes(w)).length;
                  return overlap >= 3 || (kIn.length <= 3 && overlap >= 2);
                });
              const deduped = (evt.action_items as string[]).filter((t) => !isDuplicate(t));
              if (deduped.length === 0) return prev;
              const space = 8 - prev.length;
              if (space <= 0) return prev;
              const newItems = deduped
                .slice(0, space)
                .map((t) => ({ id: safeUuid(), text: t, done: false, convId: convId ?? null }));
              return [...prev, ...newItems];
            });
            setVoiceMessages((m) => [
              ...m,
              {
                role: "assistant",
                content: `I added ${count} task${count !== 1 ? "s" : ""} to your tasks.`,
                ts: Date.now(),
              },
            ]);
          }
          if (
            evt.voice_onboarding_complete ||
            (evt.profile_updates && typeof evt.profile_updates === "object")
          ) {
            const updates = (evt.profile_updates || {}) as Record<string, unknown>;
            if (Object.keys(updates).length > 0) {
              setAppProfile((prev: Record<string, unknown> | null) => (prev ? { ...prev, ...updates } : prev));
              if (Array.isArray(updates.voice_memory)) {
                setVoiceMemory(updates.voice_memory as string[]);
              }
            }
            if (evt.voice_onboarding_complete && activeVoiceConvId) {
              setVoiceConvos((prev) =>
                prev.map((c) =>
                  c.id === activeVoiceConvId ? { ...c, title: "Onboarding complete" } : c,
                ),
              );
            }
          }
          if (
            evt.deadline_added &&
            typeof evt.deadline_added === "object" &&
            evt.deadline_added.label &&
            evt.deadline_added.date
          ) {
            const current = (appProfile as { deadlines?: DillyDeadline[] })?.deadlines || [];
            const newDl: DillyDeadline = {
              id: safeUuid(),
              label: (evt.deadline_added as { label: string }).label,
              date: (evt.deadline_added as { date: string }).date,
            };
            if (!current.some((d) => d.label === newDl.label && d.date === newDl.date)) {
              saveProfile({ deadlines: [...current, newDl] });
            }
          }
          if (
            evt.action_item_added &&
            typeof evt.action_item_added === "object" &&
            (evt.action_item_added as { text?: string }).text
          ) {
            const itemText = (evt.action_item_added as { text: string }).text.trim();
            if (itemText) {
              setVoiceActionItems((prev) => {
                if (prev.length >= 8) return prev;
                const existingTexts = prev.map((i) => i.text.toLowerCase());
                if (existingTexts.includes(itemText.toLowerCase())) return prev;
                return [
                  ...prev,
                  { id: safeUuid(), text: itemText, done: false, convId: convId ?? null },
                ];
              });
              setVoiceMessages((m) => [
                ...m,
                {
                  role: "assistant",
                  content: "I added 1 task to your tasks.",
                  ts: Date.now(),
                },
              ]);
            }
          }
        }
      } catch {
        /* bad JSON chunk - skip */
      }
    }
  }
  // Edge case: stream ended without done event
  if (!assistantReplyCommitted && streamedText.trim()) {
    setVoiceStreamingText("");
    const cleaned = streamedText.replace(/\n\s*SUGGESTIONS:\s*[\s\S]*$/i, "").trim();
    const finalMsg =
      sanitizeVoiceAssistantReply(cleaned) || cleaned || "Dilly had trouble responding.";
    setVoiceMessages((m) => [
      ...m,
      { role: "assistant", content: finalMsg, ts: Date.now() },
    ]);
    const summary = `[${new Date().toLocaleDateString()}] You asked: "${text.slice(0, 80)}". Dilly said: "${finalMsg.slice(0, 120)}"`;
    setVoiceMemory((prev) => [...prev.slice(-9), summary]);
  }
}
