/**
 * Desktop design tokens — color palette re-exported from @dilly/api (single source of truth).
 * Add new colors to packages/dilly-api/src/constants.ts, not here.
 */
export { colors } from "@dilly/api";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
