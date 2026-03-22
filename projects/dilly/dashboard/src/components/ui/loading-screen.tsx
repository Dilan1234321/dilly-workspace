"use client";

import { cn } from "@/lib/utils";

export interface LoadingScreenProps {
  /** Message below the spinner (e.g. "Loading your resume...") */
  message?: string;
  /** Extra class for the outer full-screen container */
  className?: string;
  /** Optional inline style for the container */
  style?: React.CSSProperties;
  /** Use Career Center design tokens (var(--bg), var(--t3)) */
  variant?: "default" | "career-center";
  /** Optional content below the message (e.g. Back to Settings link) */
  children?: React.ReactNode;
}

/**
 * Full-screen loading state: centered spinner + message.
 * `career-center` uses the same chrome as Career Center / ATS (`var(--bg)`), not warm `--m-bg`.
 */
export function LoadingScreen({
  message = "Loading…",
  className,
  style,
  variant = "default",
  children,
}: LoadingScreenProps) {
  const isCareerCenter = variant === "career-center";
  return (
    <div
      className={cn(
        "min-h-[100dvh] min-h-screen flex flex-col items-center justify-center antialiased",
        className
      )}
      style={{
        background: isCareerCenter ? "var(--bg)" : "var(--m-bg)",
        ...(isCareerCenter
          ? { fontFamily: "var(--font-inter), system-ui, sans-serif", backgroundImage: "none" as const }
          : {}),
        ...style,
      }}
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      <div className="flex flex-col items-center gap-5 px-6">
        <div
          className={isCareerCenter ? "loading-spinner-gradient loading-spinner-career-center" : "loading-spinner-gradient"}
          aria-hidden
        />
        <p
          className="text-center text-[15px] font-medium leading-snug max-w-[280px] tracking-tight"
          style={{ color: isCareerCenter ? "var(--t1)" : "var(--m-text-2)" }}
        >
          {message}
        </p>
        {children}
      </div>
    </div>
  );
}
