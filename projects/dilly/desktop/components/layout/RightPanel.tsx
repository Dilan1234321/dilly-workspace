'use client';

export default function RightPanel() {
  return (
    <aside className="w-[340px] flex-shrink-0 h-screen border-l border-border-main bg-surface-1 flex flex-col">
      <div className="h-[56px] flex items-center justify-between px-4 border-b border-border-main">
        <span className="text-[13px] font-semibold text-txt-2">Ask Dilly</span>
        <span className="text-[11px] text-txt-3 bg-surface-2 px-2 py-0.5 rounded font-mono">cmd+\</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
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
        <div className="flex flex-col gap-2 mb-3">
          <button className="text-left text-[12px] text-txt-2 bg-surface-2 hover:bg-surface-2/80 rounded-lg px-3 py-2.5 transition-colors hover:text-txt-1">
            How do I improve my Build score?
          </button>
          <button className="text-left text-[12px] text-txt-2 bg-surface-2 hover:bg-surface-2/80 rounded-lg px-3 py-2.5 transition-colors hover:text-txt-1">
            Review my resume for data roles
          </button>
          <button className="text-left text-[12px] text-txt-2 bg-surface-2 hover:bg-surface-2/80 rounded-lg px-3 py-2.5 transition-colors hover:text-txt-1">
            What jobs am I ready for?
          </button>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Ask Dilly anything..."
            className="w-full h-10 bg-surface-2 rounded-lg px-4 pr-10 text-[13px] text-txt-1 placeholder:text-txt-3 outline-none focus:ring-1 focus:ring-dilly-blue/40 transition-shadow"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md bg-dilly-blue flex items-center justify-center hover:bg-dilly-blue-light transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
