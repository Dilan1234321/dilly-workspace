"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function VoiceVisualShell({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("voice-viz-build-shell w-full min-w-0", className)} style={style}>
      {children}
    </div>
  );
}

export function VoiceStagger({
  children,
  className,
  baseDelayMs = 60,
  stepMs = 72,
}: {
  children: React.ReactNode;
  className?: string;
  baseDelayMs?: number;
  stepMs?: number;
}) {
  const items = React.Children.toArray(children);
  return (
    <div className={cn("flex flex-col gap-1.5 min-w-0", className)}>
      {items.map((child, i) => (
        <div
          key={i}
          className="voice-viz-stagger-item min-w-0"
          style={{ animationDelay: `${baseDelayMs + i * stepMs}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
