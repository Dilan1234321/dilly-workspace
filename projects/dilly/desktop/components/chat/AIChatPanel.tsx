"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { getToken } from "@/lib/auth";

/**
 * AI Coach chat panel with real streaming, tool calling, and tool approval.
 * Self-contained — no shadcn dependency. Uses Dilly's gold accent palette.
 */
export function AIChatPanel() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"coaching" | "practice">("coaching");
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const authToken = getToken() || "";

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: { Authorization: `Bearer ${authToken}` },
        body: { mode },
      }),
    [authToken, mode],
  );

  const {
    messages,
    status,
    error,
    sendMessage,
    stop,
    addToolApprovalResponse,
  } = useChat({ transport, experimental_throttle: 50 });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isStreaming = status === "streaming" || status === "submitted";

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || isStreaming) return;
      sendMessage({ text });
      setInput("");
    },
    [input, isStreaming, sendMessage],
  );

  // Pending approval requests (v6: dynamic-tool with state approval-requested)
  const pendingApprovals = messages.flatMap((m) =>
    (m.parts ?? [])
      .filter(
        (p): p is Extract<typeof p, { type: "dynamic-tool" }> =>
          p.type === "dynamic-tool" && "state" in p && p.state === "approval-requested",
      )
      .map((p) => ({
        id: p.toolCallId,
        toolName: p.toolName,
        args: p.input as Record<string, unknown>,
      })),
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-amber-500 text-black shadow-lg hover:bg-amber-400 transition-all flex items-center justify-center"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c-4.97 0-9 3.13-9 7 0 2.38 1.42 4.5 3.6 5.82L5 21l4.34-2.17C10.2 18.94 11.08 19 12 19c4.97 0 9-3.13 9-7s-4.03-7-9-7z"/></svg>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-end sm:justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={() => setOpen(false)} />

      {/* Panel */}
      <div className="relative z-50 flex flex-col w-full h-full sm:w-[420px] sm:h-[640px] sm:max-h-[80vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-lg">&#10024;</span>
            <span className="font-semibold text-sm text-white">Dilly Coach</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-zinc-900 rounded-full p-0.5">
              {(["coaching", "practice"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    mode === m
                      ? "bg-amber-500/20 text-amber-400 font-medium"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {m === "coaching" ? "Coach" : "Practice"}
                </button>
              ))}
            </div>
            <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white p-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full text-zinc-600 text-sm text-center px-8">
              Ask me anything about your career, resume, applications, or interviews. I can see your entire dashboard.
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0 mt-0.5">
                  D
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-amber-500/15 text-amber-100"
                    : "bg-zinc-900 text-zinc-200"
                }`}
              >
                {message.parts?.map((part, i) => {
                  if (part.type === "text") {
                    return <span key={i} className="whitespace-pre-wrap">{part.text}</span>;
                  }
                  if (part.type === "dynamic-tool") {
                    return (
                      <ToolCallChip
                        key={i}
                        toolName={part.toolName}
                        state={part.state}
                        args={part.input as Record<string, unknown>}
                        result={"output" in part ? part.output : undefined}
                      />
                    );
                  }
                  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
                    const tp = part as { type: string; state: string; input?: unknown; output?: unknown };
                    return (
                      <ToolCallChip
                        key={i}
                        toolName={part.type.replace("tool-", "")}
                        state={tp.state}
                        args={(tp.input as Record<string, unknown>) ?? {}}
                        result={"output" in tp ? tp.output : undefined}
                      />
                    );
                  }
                  return null;
                }) ?? null}
              </div>
            </div>
          ))}

          {isStreaming && messages.at(-1)?.role !== "assistant" && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0">D</div>
              <div className="bg-zinc-900 rounded-xl px-3.5 py-2.5">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}

          {/* Tool approval prompts */}
          {pendingApprovals.map((a) => (
            <div key={a.id} className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <p className="text-sm font-medium text-amber-400 mb-1">
                Confirm: {humanize(a.toolName)}
              </p>
              <p className="text-xs text-zinc-500 mb-3">{formatArgs(a.args)}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => addToolApprovalResponse({ id: a.id, approved: true })}
                  className="px-3 py-1.5 text-xs rounded-md bg-green-600/20 text-green-400 hover:bg-green-600/30 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => addToolApprovalResponse({ id: a.id, approved: false })}
                  className="px-3 py-1.5 text-xs rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
                >
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 p-3">
          {error && (
            <p className="text-xs text-red-400 mb-2">{error.message || "Something went wrong."}</p>
          )}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === "practice" ? "Answer the question..." : "Ask your coach anything..."}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button type="button" onClick={stop} className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---

function ToolCallChip({
  toolName,
  state,
  args,
  result,
}: {
  toolName: string;
  state: string;
  args: Record<string, unknown>;
  result?: unknown;
}) {
  const running = state === "input-streaming" || state === "input-available";
  const done = state === "output-available";
  const err = state === "error";

  return (
    <div className="my-1.5 px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-900/50 text-xs">
      <div className="flex items-center gap-1.5">
        {running && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
        {done && <span className="text-green-400">&#10003;</span>}
        {err && <span className="text-red-400">&#10007;</span>}
        <span className="font-medium text-zinc-300">{humanize(toolName)}</span>
      </div>
      {Object.keys(args).length > 0 && (
        <p className="text-zinc-600 mt-0.5">{formatArgs(args)}</p>
      )}
      {done && <p className="text-green-400/70 mt-0.5">Done</p>}
      {err && <p className="text-red-400/70 mt-0.5">Failed</p>}
    </div>
  );
}

function humanize(name: string): string {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim();
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
    .join(", ");
}
