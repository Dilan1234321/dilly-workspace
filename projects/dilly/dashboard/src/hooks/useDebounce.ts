"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Debounce a value. Returns the debounced value and a setter.
 * Use for inputs that trigger expensive operations (e.g. API calls).
 */
export function useDebounce<T>(initialValue: T, delayMs: number): [T, (v: T) => void] {
  const [_value, setValue] = useState<T>(initialValue);
  const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDebounced = useCallback(
    (v: T) => {
      setValue(v);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setDebouncedValue(v);
        timeoutRef.current = null;
      }, delayMs);
    },
    [delayMs]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return [debouncedValue, setDebounced];
}

/**
 * Debounced callback - call a function after delayMs of no invocations.
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  // eslint-disable-next-line react-hooks/refs -- intentional
  fnRef.current = fn;

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        fnRef.current(...args);
        timeoutRef.current = null;
      }, delayMs);
    },
    [delayMs]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return debounced;
}
