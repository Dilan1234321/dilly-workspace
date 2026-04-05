"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 8;

interface MajorMinorAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function MajorMinorAutocomplete({
  value,
  onChange,
  options,
  placeholder = "Type to search…",
  className,
  inputClassName,
}: MajorMinorAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const query = (inputValue || "").toLowerCase().trim();
  const opts = options ?? [];
  const filtered = query
    ? opts.filter((opt) => opt.toLowerCase().includes(query))
    : opts;
  const suggestions = filtered.slice(0, MAX_SUGGESTIONS);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [inputValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (value && !opts.includes(value)) {
          const match = opts.find((o) => o.toLowerCase() === value.toLowerCase());
          if (match) onChange(match);
          else setInputValue(value);
        } else {
          setInputValue(value);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [value, options, onChange]);

  const select = (opt: string) => {
    onChange(opt);
    setInputValue(opt);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && e.key !== "Escape") {
      setIsOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && suggestions[highlightIndex]) {
      e.preventDefault();
      select(suggestions[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setInputValue(value);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn("bg-[var(--dilly-surface)]/70 border-[var(--ut-border)] text-[var(--dilly-taupe-bright)] flex-1", inputClassName)}
        autoComplete="off"
      />
      {isOpen && (
        <ul
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-[var(--ut-border)] bg-[var(--dilly-surface)] shadow-lg py-1"
          role="listbox"
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
          ) : (
            suggestions.map((opt, i) => (
              <li
                key={opt}
                role="option"
                aria-selected={i === highlightIndex}
                className={cn(
                  "px-3 py-2 text-sm cursor-pointer transition-colors",
                  i === highlightIndex ? "bg-slate-700 text-slate-100" : "text-slate-300 hover:bg-slate-700/70"
                )}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => select(opt)}
              >
                {opt}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
