"use client";

type AuditScreenHeaderProps = {
  onMenuClick?: () => void;
  onMoreClick?: () => void;
};

export function AuditScreenHeader({ onMenuClick, onMoreClick }: AuditScreenHeaderProps) {
  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between gap-2 py-3"
      style={{ background: "var(--bg)" }}
    >
      <button
        type="button"
        onClick={onMenuClick}
        className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full transition-opacity hover:opacity-90 active:opacity-80"
        style={{ background: "var(--s2)", color: "var(--t2)" }}
        aria-label="Menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <h1 className="text-[15px] font-semibold truncate text-center flex-1 min-w-0" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>
        Dilly
      </h1>
      <button
        type="button"
        onClick={onMoreClick}
        className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full transition-opacity hover:opacity-90 active:opacity-80"
        style={{ background: "var(--s2)", color: "var(--t2)" }}
        aria-label="More options"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
    </header>
  );
}
