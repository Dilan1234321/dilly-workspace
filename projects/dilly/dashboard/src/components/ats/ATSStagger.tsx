"use client";

import { Children, isValidElement, type ReactNode } from "react";

const STEP_MS = 44;
const MAX_DELAY_MS = 560;

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Wraps each child in `template-pop-in` with staggered delay (same motion as resume edit / career tools).
 */
export function ATSStagger({ children, className = "" }: Props) {
  const items = Children.toArray(children);
  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {items.map((child, i) => {
        if (child == null || typeof child === "boolean") return null;
        const key = isValidElement(child) && child.key != null ? String(child.key) : `ats-stagger-${i}`;
        return (
          <div
            key={key}
            className="template-pop-in"
            style={{ animationDelay: `${Math.min(i * STEP_MS, MAX_DELAY_MS)}ms` }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
