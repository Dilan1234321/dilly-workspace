"use client";

import { useEffect, useRef, useState } from "react";
import { APPROVED_MAJORS_SET } from "@/lib/majors";

// ── X icon ────────────────────────────────────────────────────────────────────
function XIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

// ── Single tag pill ───────────────────────────────────────────────────────────
function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        background: "var(--s3)",
        border: "1px solid var(--b2)",
        borderRadius: "999px",
        padding: "3px 8px 3px 10px",
        fontSize: "10px",
        fontWeight: 500,
        color: "var(--t1)",
        lineHeight: 1,
      }}
    >
      {label}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onRemove();
        }}
        aria-label={`Remove ${label}`}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--t3)",
          display: "flex",
          alignItems: "center",
          lineHeight: 1,
        }}
      >
        <XIcon />
      </button>
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface TagAutocompleteProps {
  /** Currently selected tags */
  tags: string[];
  /** Maximum number of tags allowed */
  maxTags: number;
  /** All approved options (sourced from APPROVED_MAJORS) */
  options: readonly string[];
  /** Placeholder text for the input */
  placeholder?: string;
  /** Called when a tag is added */
  onAdd: (value: string) => void;
  /** Called when a tag is removed */
  onRemove: (value: string) => void;
  /** Optional error message to display below the input */
  error?: string | null;
  /** Called when the error should be cleared */
  onClearError?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TagAutocomplete({
  tags,
  maxTags,
  options,
  placeholder = "Start typing…",
  onAdd,
  onRemove,
  error,
  onClearError,
}: TagAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isMaxed = tags.length >= maxTags;

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    onClearError?.();
    if (val.length === 0) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const q = val.toLowerCase();
    const filtered = options
      .filter((o) => !tags.includes(o) && o.toLowerCase().includes(q))
      .slice(0, 5);
    setSuggestions(filtered);
    setOpen(filtered.length > 0);
  }

  function commitSelection(value: string) {
    if (!APPROVED_MAJORS_SET.has(value)) return;
    if (tags.includes(value)) {
      setQuery("");
      setOpen(false);
      return;
    }
    onAdd(value);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  function handleBlur() {
    // Delay so mousedown on dropdown fires first
    setTimeout(() => {
      setOpen(false);
      const trimmed = query.trim();
      if (!trimmed) return;

      // Exact match in approved list → add
      if (APPROVED_MAJORS_SET.has(trimmed) && !tags.includes(trimmed) && !isMaxed) {
        onAdd(trimmed);
        setQuery("");
        return;
      }
      // Not on the list → show error, clear
      if (!APPROVED_MAJORS_SET.has(trimmed)) {
        // Signal error via a synthetic add with a sentinel, or via parent error state
        // We surface the error through the parent by calling a special path:
        onAdd(`__INVALID__:${trimmed}`);
        setQuery("");
      } else {
        setQuery("");
      }
    }, 150);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;
      if (APPROVED_MAJORS_SET.has(trimmed) && !tags.includes(trimmed) && !isMaxed) {
        commitSelection(trimmed);
      } else if (!APPROVED_MAJORS_SET.has(trimmed)) {
        onAdd(`__INVALID__:${trimmed}`);
        setQuery("");
        setOpen(false);
      }
    }
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: isMaxed ? "var(--s2)" : "var(--s3)",
    border: "1px solid var(--b2)",
    borderRadius: "11px",
    padding: "10px 13px",
    fontSize: "12px",
    color: "var(--t1)",
    outline: "none",
    opacity: isMaxed ? 0.5 : 1,
    cursor: isMaxed ? "not-allowed" : "text",
    boxSizing: "border-box",
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Input */}
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onBlur={handleBlur}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onKeyDown={handleKeyDown}
        placeholder={isMaxed ? `Max ${maxTags} selected` : placeholder}
        disabled={isMaxed}
        autoComplete="off"
        style={inputStyle}
      />

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--s2)",
            border: "1px solid var(--b2)",
            borderRadius: "11px",
            zIndex: 20,
            overflow: "hidden",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          }}
        >
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={() => commitSelection(s)}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                padding: "9px 13px",
                fontSize: "12px",
                color: "var(--t1)",
                textAlign: "left",
                cursor: "pointer",
                display: "block",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--s3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Tag pills */}
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
          {tags.map((t) => (
            <Tag key={t} label={t} onRemove={() => onRemove(t)} />
          ))}
        </div>
      )}

      {/* Inline error */}
      {error && (
        <p
          style={{
            fontSize: "10px",
            color: "var(--coral)",
            marginTop: "5px",
            lineHeight: 1.4,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
