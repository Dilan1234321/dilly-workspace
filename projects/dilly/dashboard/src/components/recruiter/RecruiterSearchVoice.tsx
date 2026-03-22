"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { API_BASE, RECRUITER_API_KEY_STORAGE } from "@/lib/dillyUtils";
import { Bot, CornerDownLeft, ExternalLink } from "lucide-react";
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

const DILLY_VOICE_AI_AVATAR = "/voice-avatars/dilly-voice-ai.png";

type VoiceSearchCandidate = {
  candidate_id: string;
  name: string;
  match_score?: number;
  smart?: number;
  grit?: number;
  build?: number;
  major?: string;
  majors?: string[];
  school_id?: string;
  track?: string;
  evidence_summary?: string;
  profile_link?: string;
};

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; candidates?: VoiceSearchCandidate[] };

type RecruiterSearchVoiceProps = {
  roleDescription?: string;
};

function getKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(RECRUITER_API_KEY_STORAGE);
}

const QUICK_QUERIES = [
  "Find me top 5 for this role",
  "Narrow to CS majors",
  "Who has the strongest Build score?",
  "Find PM candidates who have shipped production code",
];

export function RecruiterSearchVoice({ roleDescription = "" }: RecruiterSearchVoiceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const VOICE_SEARCH_TIMEOUT_MS = 120_000; // 120s — LLM + search + evidence

  const sendQuery = async (query: string) => {
    const q = query.trim();
    if (!q) return;

    const key = getKey();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) {
      headers["X-Recruiter-API-Key"] = key;
      headers["Authorization"] = `Bearer ${key}`;
    }

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VOICE_SEARCH_TIMEOUT_MS);

    try {
      const res = await fetch(`${API_BASE}/recruiter/voice/search`, {
        method: "POST",
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          query: q,
          ...(roleDescription.trim() && { role_description: roleDescription.trim() }),
          conversation_history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        let errMsg = res.statusText;
        try {
          const errBody = await res.json();
          errMsg = (errBody as { detail?: string }).detail ?? errMsg;
        } catch {
          const raw = await res.text();
          if (raw) errMsg = raw;
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.status === 504 ? errMsg : `Error: ${res.status} ${errMsg}` },
        ]);
        return;
      }

      let data: { candidates?: unknown[]; total?: number; role_description?: string };
      try {
        data = await res.json();
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Invalid response from server. Try again." },
        ]);
        return;
      }
      const candidates = data.candidates || [];
      const total = data.total ?? 0;
      const roleDesc = data.role_description || "";

      let intro = "";
      if (candidates.length === 0) {
        intro = "No candidates found matching your criteria. Try broadening your search or adjusting filters.";
      } else {
        intro = `Found **${total}** candidate${total !== 1 ? "s" : ""} for "${roleDesc.slice(0, 80)}${roleDesc.length > 80 ? "…" : ""}":`;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: intro, candidates: candidates as VoiceSearchCandidate[] },
      ]);
    } catch (e) {
      clearTimeout(timeoutId);
      const isAbort = e instanceof Error && e.name === "AbortError";
      const errMsg = e instanceof Error ? e.message : "Request failed";
      const isNetwork = /failed to fetch|load failed|network|connection/i.test(errMsg);
      const msg = isAbort
        ? "Search took too long (2 min). The API may be slow or overloaded. Try a simpler query or try again."
        : isNetwork
          ? `Could not reach the API. Is it running? (${API_BASE})`
          : `Error: ${errMsg}`;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: msg },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendQuery(input);
  };

  return (
    <ExpandableChat
      size="lg"
      position="bottom-right"
      icon={<Bot className="h-6 w-6" />}
      theme="recruiter"
      className="recruiter-ask-ai-chat"
    >
      <ExpandableChatHeader className="flex-col text-center justify-center recruiter-chat-header">
        <h1 className="text-xl font-semibold">Dilly Search</h1>
        <p className="text-sm text-muted-foreground">
          Describe what you need in plain English — get ranked candidates with evidence in seconds
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
              onClick={() => sendQuery(q)}
              disabled={loading}
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
                className={m.role !== "user" ? "h-8 w-8 shrink-0 recruiter-ai-avatar" : "h-8 w-8 shrink-0"}
                src={
                  m.role === "user"
                    ? "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&q=80&crop=faces&fit=crop"
                    : DILLY_VOICE_AI_AVATAR
                }
                fallback={m.role === "user" ? "You" : "AI"}
              />
              <ChatBubbleMessage variant={m.role === "user" ? "sent" : "received"}>
                <FormattedChatText>{m.content}</FormattedChatText>
                {m.role === "assistant" && "candidates" in m && m.candidates && m.candidates.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {m.candidates.map((c) => (
                      <Link
                        key={c.candidate_id}
                        href={c.profile_link || `/recruiter/candidates/${c.candidate_id}`}
                        className="recruiter-voice-candidate-card block rounded-lg border border-border bg-background/50 p-3 transition-colors hover:border-[var(--te-border-gold)] hover:bg-white/5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-foreground">{c.name}</div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              {c.match_score != null && (
                                <span className="font-medium text-[var(--te-gold)]">{Number(c.match_score).toFixed(1)}% match</span>
                              )}
                              {[c.smart, c.grit, c.build].every((n) => n != null) && (
                                <span>S{c.smart} G{c.grit} B{c.build}</span>
                              )}
                              {c.major && <span>{c.major}</span>}
                              {c.track && <span>{c.track}</span>}
                            </div>
                            {c.evidence_summary && (
                              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{c.evidence_summary}</p>
                            )}
                          </div>
                          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </ChatBubbleMessage>
            </ChatBubble>
          ))}
          {loading && (
            <ChatBubble variant="received">
              <ChatBubbleAvatar className="h-8 w-8 shrink-0 recruiter-ai-avatar" src={DILLY_VOICE_AI_AVATAR} fallback="AI" />
              <ChatBubbleMessage variant="received">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Searching candidates…</span>
                  <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" />
                  <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse [animation-delay:0.2s]" />
                  <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse [animation-delay:0.4s]" />
                </div>
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
            placeholder="Find me 5 PM candidates who have shipped production code…"
            className="min-h-12 resize-none rounded-lg bg-background border-0 p-3 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
          />
          <div className="flex items-center p-3 pt-0 justify-end">
            <Button type="submit" size="sm" className="gap-1.5 recruiter-chat-send">
              Search
              <CornerDownLeft className="size-3.5" />
            </Button>
          </div>
        </form>
      </ExpandableChatFooter>
    </ExpandableChat>
  );
}
