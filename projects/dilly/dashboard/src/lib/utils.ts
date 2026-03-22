import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names with Tailwind-aware deduping. Use for all shared UI components. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
