'use client';
import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'How do I improve my Build score?',
  'Review my resume for data roles',
  'What jobs am I ready for?',
];

export default function RightPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json() as { content: string };
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble connecting right now. Try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-[40px] flex items-center justify-between px-4 border-b border-border-main flex-shrink-0">
        <span className="text-[13px] font-semibold text-txt-2">Ask Dilly</span>
        <span className="text-[11px] text-txt-3 bg-surface-2 px-2 py-0.5 rounded font-mono">cmd+\</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 pb-4">
            <div className="w-10 h-10 rounded-full bg-dilly-blue/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B4CC0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <p className="text-[14px] font-medium text-txt-1 text-center">What can I help with?</p>
            <p className="text-[12px] text-txt-3 text-center leading-relaxed">
              Ask about your scores, get resume feedback, or prep for interviews.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-dilly-blue/15 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                    <span className="text-[10px] font-bold text-dilly-blue">D</span>
                  </div>
                )}
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed
                  ${m.role === 'user'
                    ? 'bg-dilly-blue text-white rounded-br-sm'
                    : 'bg-surface-2 text-txt-1 rounded-bl-sm'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-dilly-blue/15 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                  <span className="text-[10px] font-bold text-dilly-blue">D</span>
                </div>
                <div className="bg-surface-2 rounded-xl rounded-bl-sm px-3 py-2.5">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-txt-3 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-txt-3 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-txt-3 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Suggestions (only when empty) */}
      {messages.length === 0 && (
        <div className="px-4 flex flex-col gap-1.5 mb-3">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)}
              className="text-left text-[12px] text-txt-2 bg-surface-2 hover:bg-surface-2/80 rounded-lg px-3 py-2.5 transition-colors hover:text-txt-1">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Dilly anything..."
            disabled={loading}
            className="w-full h-10 bg-surface-2 rounded-lg px-4 pr-10 text-[13px] text-txt-1 placeholder:text-txt-3 outline-none focus:ring-1 focus:ring-dilly-blue/40 transition-shadow disabled:opacity-50"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md bg-dilly-blue flex items-center justify-center hover:bg-dilly-blue-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
