"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 8;

interface CityChipsInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export function CityChipsInput({
  value,
  onChange,
  options,
  placeholder = "Type a city…",
  className,
}: CityChipsInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = (inputValue || "").toLowerCase().trim();
  const alreadyAdded = new Set(value.map((v) => v.toLowerCase()));
  const opts = options ?? [];
  const filtered = query
    ? opts.filter(
        (opt) =>
          opt.toLowerCase().includes(query) && !alreadyAdded.has(opt.toLowerCase())
      )
    : opts.filter((opt) => !alreadyAdded.has(opt.toLowerCase()));
  const suggestions = filtered.slice(0, MAX_SUGGESTIONS);

  useEffect(() => {
    setHighlightIndex(0);
  }, [inputValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addCity = (city: string) => {
    const c = city.trim();
    if (!c || alreadyAdded.has(c.toLowerCase())) return;
    onChange([...value, c]);
    setInputValue("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeCity = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
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
      addCity(suggestions[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeCity(value.length - 1);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className="flex flex-wrap gap-2 p-3 rounded-[18px] border min-h-[44px]"
        style={{ backgroundColor: "var(--s3)", borderColor: "var(--b2)" }}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((city, i) => (
          <span
            key={`${city}-${i}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[12px] text-sm"
            style={{ backgroundColor: "var(--s2)", color: "var(--t2)" }}
          >
            {city}
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                removeCity(i);
              }}
              className="hover:opacity-70 transition-opacity"
              aria-label={`Remove ${city}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:opacity-60"
          style={{ color: "var(--t1)" }}
          autoComplete="off"
        />
      </div>
      {isOpen && suggestions.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-[18px] border py-1"
          style={{ borderColor: "var(--b2)", backgroundColor: "var(--s3)" }}
          role="listbox"
        >
          {suggestions.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={i === highlightIndex}
              className={cn(
                "px-3 py-2.5 text-sm cursor-pointer transition-colors rounded-[12px] mx-1",
                i === highlightIndex ? "bg-[var(--s2)]" : "hover:bg-[var(--s2)]/70"
              )}
              style={{ color: "var(--t1)" }}
              onMouseEnter={() => setHighlightIndex(i)}
              onClick={() => addCity(opt)}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
