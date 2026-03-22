"use client";

/** Podium / rank tab glyph for BottomNav (matches Voice/Practice icon scale). */
export function RankTabIcon() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8M12 17v4M6 3h12v8a4 4 0 01-4 4h-4a4 4 0 01-4-4V3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h.01M15 10h.01" />
    </svg>
  );
}
