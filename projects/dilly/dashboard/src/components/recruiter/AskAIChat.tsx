"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { cn } from "@/lib/utils";
import { API_BASE, RECRUITER_API_KEY_STORAGE } from "@/lib/dillyUtils";

/** Dilly AI avatar: man glyph (exclusive, no other avatar) */
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
  ExpandableChatFooter,
} from "@/components/ui/expandable-chat";
import { ChatMessageList } from "@/components/ui/chat-message-list";

const QUICK_QUERIES = [
  "How do they handle technical ambiguity?",
  "What is the biggest risk in hiring this candidate for this JD?",
  "Generate 3 custom interview questions based on their Build gaps.",
];

type Message = { role: "user" | "assistant"; content: string };

type AskAIChatProps = {
  candidateId: string;
  candidateName: string;
  roleDescription?: string;
};

function getKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(RECRUITER_API_KEY_STORAGE);
}

const TYPING_SPEED_MS = 20; // ~50 chars/sec

export function AskAIChat({ candidateId, candidateName, roleDescription = "" }: AskAIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [displayedLength, setDisplayedLength] = useState(0);

  const sendQuestion = async (question: string) => {
    const q = question.trim();
    if (!q || !candidateId) return;

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
      const res = await fetch(`${API_BASE}/recruiter/candidates/${candidateId}/ask`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          question: q,
          role_description: roleDescription || undefined,
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  // Typewriter effect: animate displayedLength toward streamBuffer.length
  useEffect(() => {
    if (displayedLength >= streamBuffer.length) return;
    const id = setInterval(() => {
      setDisplayedLength((prev) => Math.min(prev + 2, streamBuffer.length));
    }, TYPING_SPEED_MS);
    return () => clearInterval(id);
  }, [displayedLength, streamBuffer.length]);

  // Reset displayed length when stream starts fresh
  useEffect(() => {
    if (streamBuffer === "") setDisplayedLength(0);
  }, [streamBuffer]);

  const displayedText = streamBuffer.slice(0, displayedLength);

  return (
    <ExpandableChat
      size="lg"
      position="bottom-right"
      icon={<Bot className="h-6 w-6" />}
      theme="recruiter"
      className="recruiter-ask-ai-chat"
    >
      <ExpandableChatHeader className="flex-col text-center justify-center recruiter-chat-header">
        <h1 className="text-xl font-semibold">Ask Dilly about {candidateName}</h1>
        <p className="text-sm text-muted-foreground">
          Evidence-based analysis using Smart/Grit/Build scores and experience
        </p>
      </ExpandableChatHeader>

      <ExpandableChatBody>
        <div className="flex flex-wrap gap-2 p-3 border-b border-border">
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
        <ChatMessageList smooth>
          {messages.map((m, i) => (
            <ChatBubble
              key={i}
              variant={m.role === "user" ? "sent" : "received"}
            >
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
                    <span className="animate-pulse" aria-hidden>▌</span>
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
        </ChatMessageList>
      </ExpandableChatBody>

      <ExpandableChatFooter>
        <form
          onSubmit={handleSubmit}
          className="relative rounded-lg border border-border bg-background p-1 recruiter-chat-form"
        >
          <ChatInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about this candidate…"
            className="min-h-12 resize-none rounded-lg bg-background border-0 p-3 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
          />
          <div className="flex items-center p-3 pt-0 justify-end">
            <Button type="submit" size="sm" className="gap-1.5 recruiter-chat-send">
              Send
              <CornerDownLeft className="size-3.5" />
            </Button>
          </div>
        </form>
      </ExpandableChatFooter>
    </ExpandableChat>
  );
}
