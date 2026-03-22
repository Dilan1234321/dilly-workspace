export function shouldRegenerateNarrative(
  lastUpdatedAt: string | null | undefined,
  newItemsCount: number,
  nowMs = Date.now()
): boolean {
  if (!lastUpdatedAt) return true;
  const last = Date.parse(lastUpdatedAt);
  if (!Number.isFinite(last)) return true;
  const age = nowMs - last;
  if (age > 7 * 24 * 60 * 60 * 1000) return true;
  if (newItemsCount > 0 && age > 24 * 60 * 60 * 1000) return true;
  return false;
}

