"use client";

import { useState, useEffect, FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { API_BASE, RECRUITER_API_KEY_STORAGE } from "@/lib/dillyUtils";

const DILLY_VOICE_AI_AVATAR = "/voice-avatars/dilly-voice-ai.png";
import { Bot, CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ChatBubble,
  ChatBubbleAvatar,
  ChatBubbleMessage,
} from "@/components/ui/chat-bubble";
import { FormattedChatText } from "@/components/ui/formatted-chat-text";
import { ChatInput } from "@/components/ui/chat-input";
import {
  ExpandableChat,
  ExpandableChatHeader,
  ExpandableChatBody,
} from "@/components/ui/expandable-chat";
import { ChatMessageList } from "@/components/ui/chat-message-list";

const QUICK_QUERIES = [
  "Who has stronger evidence for this role’s core requirements?",
  "What should I probe in interviews for each candidate?",
  "What’s the biggest hiring risk for each person, based on the profiles?",
];

type Message = { role: "user" | "assistant"; content: string };

export type CompareAskAIChatProps = {
  candidateIds: [string, string];
  nameA: string;
  nameB: string;
  roleDescription?: string;
  /** Latest Dilly Compare narrative; included as context for each question. */
  comparisonSummary?: string;
  className?: string;
  /** `inline` = panel inside compare modal (header button toggles). `fab` = floating chat. */
  variant?: "inline" | "fab";
  /**
   * When set (e.g. score breakdown + AI both open), renders in the scrollable middle so the JD
   * narrative fills space above chat history instead of a blank message area.
   */
  embeddedExplanation?: ReactNode;
};

function getKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(RECRUITER_API_KEY_STORAGE);
}

const TYPING_SPEED_MS = 20;

function useCompareAskStream(
  candidateIds: [string, string],
  roleDescription: string,
  comparisonSummary: string,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [displayedLength, setDisplayedLength] = useState(0);

  useEffect(() => {
    setMessages([]);
    setInput("");
    setStreamBuffer("");
    setDisplayedLength(0);
  }, [candidateIds[0], candidateIds[1]]);

  const sendQuestion = async (question: string) => {
    const q = question.trim();
    if (!q || !candidateIds[0] || !candidateIds[1]) return;

    const key = getKey();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setStreaming(true);
    setStreamBuffer("");
    setDisplayedLength(0);

    try {
      const res = await fetch(`${API_BASE}/recruiter/compare/ask`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          candidate_ids: candidateIds,
          question: q,
          role_description: roleDescription || undefined,
          comparison_summary: comparisonSummary.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${res.status} ${err || res.statusText}` },
        ]);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullText += parsed.text;
                  setStreamBuffer(fullText);
                }
                if (parsed.error) {
                  fullText = `Error: ${parsed.error}`;
                  setStreamBuffer(fullText);
                }
              } catch {
                // skip malformed
              }
            }
          }
        }
      }

      setMessages((prev) => [...prev, { role: "assistant", content: fullText }]);
      setStreamBuffer("");
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "Request failed"}` },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  useEffect(() => {
    if (displayedLength >= streamBuffer.length) return;
    const id = setInterval(() => {
      setDisplayedLength((prev) => Math.min(prev + 2, streamBuffer.length));
    }, TYPING_SPEED_MS);
    return () => clearInterval(id);
  }, [displayedLength, streamBuffer.length]);

  useEffect(() => {
    if (streamBuffer === "") setDisplayedLength(0);
  }, [streamBuffer]);

  const displayedText = streamBuffer.slice(0, displayedLength);

  return {
    messages,
    input,
    setInput,
    streaming,
    streamBuffer,
    displayedText,
    sendQuestion,
  };
}

function CompareAskChatInner({
  messages,
  input,
  setInput,
  streaming,
  displayedText,
  streamBuffer,
  sendQuestion,
  onSubmit,
  listClassName,
  embeddedExplanation,
}: {
  messages: Message[];
  input: string;
  setInput: (s: string) => void;
  streaming: boolean;
  displayedText: string;
  streamBuffer: string;
  sendQuestion: (q: string) => void;
  onSubmit: (e: FormEvent) => void;
  listClassName?: string;
  embeddedExplanation?: ReactNode;
}) {
  const messageListClass = embeddedExplanation
    ? cn("min-h-0 py-2", listClassName)
    : cn("min-h-[140px] max-h-[min(40vh,320px)]", listClassName);

  const messageBubbles = (
    <>
      {messages.map((m, i) => (
        <ChatBubble key={i} variant={m.role === "user" ? "sent" : "received"}>
          <ChatBubbleAvatar
            className={cn("h-8 w-8 shrink-0", m.role !== "user" && "recruiter-ai-avatar")}
            src={
              m.role === "user"
                ? "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&q=80&crop=faces&fit=crop"
                : DILLY_VOICE_AI_AVATAR
            }
            fallback={m.role === "user" ? "You" : "AI"}
          />
          <ChatBubbleMessage variant={m.role === "user" ? "sent" : "received"}>
            <FormattedChatText>{m.content}</FormattedChatText>
          </ChatBubbleMessage>
        </ChatBubble>
      ))}
      {streaming && (
        <ChatBubble variant="received">
          <ChatBubbleAvatar className="h-8 w-8 shrink-0 recruiter-ai-avatar" src={DILLY_VOICE_AI_AVATAR} fallback="AI" />
          <ChatBubbleMessage variant="received">
            {streamBuffer ? (
              <>
                <FormattedChatText>{displayedText}</FormattedChatText>
                <span className="animate-pulse" aria-hidden>
                  ▌
                </span>
              </>
            ) : (
              <div className="flex items-center space-x-2">
                <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" />
                <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse [animation-delay:0.2s]" />
                <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse [animation-delay:0.4s]" />
              </div>
            )}
          </ChatBubbleMessage>
        </ChatBubble>
      )}
    </>
  );

  return (
    <>
      <div className="flex flex-wrap gap-2 p-3 border-b border-border shrink-0">
        {QUICK_QUERIES.map((q) => (
          <Button
            key={q}
            variant="outline"
            size="sm"
            className="text-xs recruiter-quick-query"
            onClick={() => sendQuestion(q)}
            disabled={streaming}
          >
            {q}
          </Button>
        ))}
      </div>
      {embeddedExplanation ? (
        <div className="te-compare-ask-inline-mid flex flex-1 flex-col min-h-0 overflow-hidden border-b border-border">
          <div className="te-compare-ask-embedded-explanation flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
            {embeddedExplanation}
          </div>
          <div className="te-compare-ask-messages-wrap min-h-0 max-h-[min(28vh,220px)] flex-shrink-0 overflow-y-auto border-t border-border/60 px-1">
            <ChatMessageList smooth className={messageListClass}>
              {messageBubbles}
            </ChatMessageList>
          </div>
        </div>
      ) : (
        <ChatMessageList smooth className={messageListClass}>
          {messageBubbles}
        </ChatMessageList>
      )}
      <div className="border-t border-border p-3 shrink-0">
        <form onSubmit={onSubmit} className="relative rounded-lg border border-border bg-background p-1 recruiter-chat-form">
          <ChatInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a follow-up about this compare…"
            className="min-h-12 resize-none rounded-lg bg-background border-0 p-3 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
          />
          <div className="flex items-center p-3 pt-0 justify-end">
            <Button type="submit" size="sm" className="gap-1.5 recruiter-chat-send">
              Send
              <CornerDownLeft className="size-3.5" />
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

export function CompareAskAIChat({
  candidateIds,
  nameA,
  nameB,
  roleDescription = "",
  comparisonSummary = "",
  className,
  variant = "fab",
  embeddedExplanation,
}: CompareAskAIChatProps) {
  const { messages, input, setInput, streaming, streamBuffer, displayedText, sendQuestion } = useCompareAskStream(
    candidateIds,
    roleDescription,
    comparisonSummary,
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "te-compare-ask-inline flex flex-col border-b border-[var(--te-border)] bg-[rgba(0,0,0,0.15)]",
          embeddedExplanation && "te-compare-ask-inline--split flex-1 min-h-0",
          className,
        )}
      >
        <div className="px-4 py-2 border-b border-[var(--te-border)] flex items-center justify-between gap-2 shrink-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--te-text-muted)] m-0">Dilly AI</p>
            <p className="text-sm text-[var(--te-text-soft)] m-0 mt-0.5">
              Ask follow-ups about {nameA} vs {nameB}
            </p>
          </div>
        </div>
        <CompareAskChatInner
          messages={messages}
          input={input}
          setInput={setInput}
          streaming={streaming}
          displayedText={displayedText}
          streamBuffer={streamBuffer}
          sendQuestion={sendQuestion}
          onSubmit={handleSubmit}
          embeddedExplanation={embeddedExplanation}
        />
      </div>
    );
  }

  return (
    <ExpandableChat
      size="lg"
      position="bottom-right"
      icon={<Bot className="h-6 w-6" />}
      theme="recruiter"
      className={cn("recruiter-compare-ask-ai !z-[1100]", className)}
    >
      <ExpandableChatHeader className="flex-col text-center justify-center recruiter-chat-header">
        <h1 className="text-xl font-semibold">Ask Dilly — compare</h1>
        <p className="text-sm text-muted-foreground">
          {nameA} vs {nameB}
          {roleDescription.trim() ? " · uses your role description + compare context" : ""}
        </p>
      </ExpandableChatHeader>

      <ExpandableChatBody className="flex flex-col min-h-0">
        <CompareAskChatInner
          messages={messages}
          input={input}
          setInput={setInput}
          streaming={streaming}
          displayedText={displayedText}
          streamBuffer={streamBuffer}
          sendQuestion={sendQuestion}
          onSubmit={handleSubmit}
          listClassName="flex-1"
        />
      </ExpandableChatBody>
    </ExpandableChat>
  );
}
