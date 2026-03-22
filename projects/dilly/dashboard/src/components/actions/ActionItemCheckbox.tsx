"use client";

import { useState } from "react";

export function ActionItemCheckbox({
  done,
  onToggle,
}: {
  done: boolean;
  onToggle: () => void;
}) {
  const [animating, setAnimating] = useState(false);

  return (
    <button
      type="button"
      aria-label={done ? "Mark undone" : "Mark done"}
      className="shrink-0"
      style={{ width: 24, height: 24 }}
      onClick={() => {
        if (!done) setAnimating(true);
        onToggle();
        if (!done) setTimeout(() => setAnimating(false), 350);
      }}
    >
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <circle
          cx={12}
          cy={12}
          r={10.5}
          stroke={done ? "var(--green)" : "var(--b2)"}
          strokeWidth={1.5}
          fill={done ? "var(--green)" : "none"}
          style={{ transition: "fill 0.3s, stroke 0.3s" }}
        />
        {(done || animating) && (
          <path
            d="M8 12.5l2.5 2.5 5-5"
            stroke="#fff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            style={{
              strokeDasharray: 20,
              strokeDashoffset: animating ? 20 : 0,
              transition: "stroke-dashoffset 0.3s ease-out",
            }}
          />
        )}
      </svg>
    </button>
  );
}
