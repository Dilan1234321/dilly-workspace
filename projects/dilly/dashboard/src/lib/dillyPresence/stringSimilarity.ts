/** Jaccard similarity on word sets (0–1). */
export function tokenSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
  const A = new Set(norm(a));
  const B = new Set(norm(b));
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function isMostlySameObservation(a: string, b: string, threshold = 0.8): boolean {
  return tokenSimilarity(a, b) >= threshold;
}

export function hashInsight(text: string): string {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return String(h);
}
