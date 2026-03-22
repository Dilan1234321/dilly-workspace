import type { CSSProperties } from "react";

/**
 * Stacked report + trending chart (replaces 📊 for resume audits / analytics on Career Hub).
 * Stroke-only so it matches text color (currentColor) on dark UI.
 */
export function CareerAnalyticsReportIcon({
  className,
  style,
  size = 26,
  "aria-hidden": ariaHidden = true,
}: {
  className?: string;
  style?: CSSProperties;
  size?: number;
  "aria-hidden"?: boolean;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={ariaHidden}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Back sheet */}
      <path
        d="M7.25 11.25h11.5v9a1 1 0 0 1-1 1H8.25a1 1 0 0 1-1-1v-9z"
        opacity={0.35}
      />
      {/* Front sheet */}
      <path d="M5.25 4.75h9.5l2.75 2.75V19a1 1 0 0 1-1 1H6.25a1 1 0 0 1-1-1V5.75a1 1 0 0 1 1-1z" />
      {/* Fold / dog-ear */}
      <path d="M14.75 4.75v3.25h3" opacity={0.55} />
      {/* Rolled spine (left) */}
      <path d="M5.25 6.5H4a1.25 1.25 0 0 0-1.25 1.15v8.85c0 .55.35 1 .85 1.1" opacity={0.85} />
      {/* Trending-up chart */}
      <path d="M8 15l2.25-2.75 1.9 1.5 2.35-3.6 2.05 1.65" />
      <path d="M15.85 10.5 17.5 9.25l.9 1.35" />
      {/* Baseline */}
      <line x1="7.75" y1="16.85" x2="17.5" y2="16.85" />
    </svg>
  );
}
