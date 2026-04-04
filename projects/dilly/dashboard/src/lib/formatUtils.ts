/**
 * Formatting utilities: UUIDs, action items, natural suggestions, milestone nudges,
 * punchy findings, proactive nudges, snapshot SVG, fetchWithTimeout.
 */

import type { AuditV2, DimensionKey } from "@/types/dilly";
import { ACHIEVEMENT_DEFINITIONS } from "@/lib/achievements";
import { DIMENSIONS } from "./constants";

/** Safe UUID for environments where crypto.randomUUID may be missing (e.g. non-HTTPS, older browsers). */
export function safeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}

/** Fetch with AbortSignal timeout so a slow or hung API cannot block the UI indefinitely. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export type TopActionItem = {
  title: string;
  detail?: string;
  type: "line_edit" | "action" | "strategic" | "red_flag";
  recIndex?: number;
  currentLine?: string;
  suggestedLine?: string;
  copyable?: boolean;
};

/** Prioritized "Do these 3 next" from audit. Red flags first, then line_edits, then actions, then strategic. */
export function getTopThreeActions(audit: AuditV2 | null | undefined): TopActionItem[] {
  if (!audit) return [];
  const items: TopActionItem[] = [];
  const recs = audit.recommendations ?? [];
  const redFlags = audit.red_flags ?? [];
  const scores = audit.scores ?? { smart: 0, grit: 0, build: 0 };
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  const weakest = keys.reduce((acc, k) => (scores[k] < acc.score ? { key: k, score: scores[k] } : acc), { key: keys[0], score: scores[keys[0]] });

  // 1. Red flags first (max 2)
  for (let i = 0; i < Math.min(2, redFlags.length) && items.length < 3; i++) {
    const rf = redFlags[i];
    const msg = typeof rf === "string" ? rf : (rf?.message ?? "");
    if (msg) items.push({ title: msg, type: "red_flag" });
  }

  // 2. Line edits (high impact)
  const lineEdits = recs
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (r.type || "generic") === "line_edit" && (r.title || r.action));
  for (const { r, i } of lineEdits) {
    if (items.length >= 3) break;
    const title = (r.title || r.action || "").trim();
    if (title) {
      items.push({
        title,
        type: "line_edit",
        recIndex: i,
        currentLine: r.current_line ?? undefined,
        suggestedLine: r.suggested_line ?? undefined,
        copyable: !!r.suggested_line,
      });
    }
  }

  // 3. Action recs (tied to weakest dimension when possible)
  const actionRecs = recs
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (r.type || "generic") === "action" && (r.title || r.action));
  for (const { r, i } of actionRecs) {
    if (items.length >= 3) break;
    const title = (r.title || r.action || "").trim();
    if (title) items.push({ title, type: "action", recIndex: i });
  }

  // 4. Strategic / generic to fill to 3
  const usedIndices = new Set(items.map((it) => it.recIndex).filter((x): x is number => x !== undefined));
  const rest = recs
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => !usedIndices.has(i) && (r.title || r.action));
  for (const { r, i } of rest) {
    if (items.length >= 3) break;
    if (items.some((it) => it.recIndex === i)) continue;
    const title = (r.title || r.action || "").trim();
    if (title) items.push({ title, type: "strategic", recIndex: i });
  }

  return items.slice(0, 3);
}

/** Natural, conversational suggestion label + prompt from a recommendation/red-flag title. Never verbose or botty. */
export function toNaturalSuggestion(
  title: string,
  type: TopActionItem["type"],
  suggestedLine?: string
): { label: string; prompt: string } {
  const t = (title || "").toLowerCase().trim();
  const promptBase = suggestedLine ? `Help me fix this. Suggested: ${suggestedLine}` : `Help me fix this: ${title}`;

  // One page — simple, powerful
  if (t.includes("over one page") || t.includes("one page") && (t.includes("trim") || t.includes("tighten") || t.includes("early-career"))) {
    return { label: "How can I help get your resume to one page?", prompt: "Help me get my resume to one page. What should I trim or tighten?" };
  }
  // References upon request
  if (t.includes("references") && (t.includes("upon request") || t.includes("available"))) {
    return { label: "How can I help remove outdated references?", prompt: promptBase };
  }
  // Generic objective
  if (t.includes("objective") || t.includes("reads like filler")) {
    return { label: "How can I help sharpen my objective?", prompt: promptBase };
  }
  // Add dates
  if (t.includes("add") && (t.includes("date") || t.includes("graduation") || t.includes("start/end"))) {
    return { label: "How can I help add dates to my resume?", prompt: promptBase };
  }
  // Resume too thin
  if (t.includes("too thin") || t.includes("incomplete")) {
    return { label: "How can I help strengthen my resume?", prompt: promptBase };
  }
  // Duplicate bullets
  if (t.includes("duplicate") || t.includes("same") && t.includes("bullet")) {
    return { label: "How can I help fix duplicate bullets?", prompt: promptBase };
  }
  // All caps
  if (t.includes("all caps") || t.includes("hard to read")) {
    return { label: "How can I help improve readability?", prompt: promptBase };
  }
  // No email
  if (t.includes("email") || t.includes("contact")) {
    return { label: "How can I add my contact info?", prompt: promptBase };
  }
  // ATS
  if (t.startsWith("ats:") || t.includes("ats")) {
    return { label: "How can I fix ATS issues?", prompt: promptBase };
  }
  // Line edit: often about bullets, metrics, wording — keep it short
  if (type === "line_edit") {
    if (t.includes("metric") || t.includes("number")) {
      return { label: "How can I add numbers to this bullet?", prompt: promptBase };
    }
    if (t.includes("bullet") || t.includes("rewrite")) {
      return { label: "How can I help with this bullet?", prompt: promptBase };
    }
    return { label: "How can I help with this?", prompt: promptBase };
  }
  // Red flag fallback: extract key action or use generic
  if (type === "red_flag") {
    return { label: "How can I help with this?", prompt: promptBase };
  }
  // Action / strategic: keep it simple
  return { label: "How can I help with this?", prompt: promptBase };
}

/** One actionable nudge from top recommendation or weakest dimension. Natural, conversational — never verbose. */
export function getProactiveNudge(audit: AuditV2 | null | undefined): string | null {
  if (!audit) return null;
  const topThree = getTopThreeActions(audit);
  if (topThree.length > 0) {
    const first = topThree[0];
    const { label } = toNaturalSuggestion(first.title, first.type, first.suggestedLine);
    return label;
  }
  const recs = audit.recommendations ?? [];
  const top = recs.find((r) => (r.type || "generic") === "line_edit") ?? recs[0];
  if (top?.title) {
    const { label } = toNaturalSuggestion(top.title, (top.type as TopActionItem["type"]) || "strategic");
    return label;
  }
  const scores = audit.scores ?? { smart: 0, grit: 0, build: 0 };
  const keys: DimensionKey[] = ["smart", "grit", "build"];
  const weakest = keys.reduce((acc, k) => (scores[k] < acc.score ? { key: k, score: scores[k] } : acc), { key: keys[0], score: scores[keys[0]] });
  const label = DIMENSIONS.find((d) => d.key === weakest.key)?.label ?? weakest.key;
  if (weakest.score < 50) return `Boost your ${label} score. Check your recommendations for specific steps.`;
  return "Review your recommendations and pick one to tackle this week.";
}

/** Milestone nudge when scores improved since last audit. */
export function getMilestoneNudge(
  current: { scores?: { smart: number; grit: number; build: number } } | null | undefined,
  prev: { scores?: { smart: number; grit: number; build: number } } | null | undefined
): string | null {
  if (!current?.scores || !prev?.scores) return null;
  const cs = current.scores;
  const ps = prev.scores;
  const gains: { key: DimensionKey; delta: number }[] = [];
  for (const k of ["smart", "grit", "build"] as DimensionKey[]) {
    const d = (cs[k] ?? 0) - (ps[k] ?? 0);
    if (d > 0) gains.push({ key: k, delta: d });
  }
  if (gains.length === 0) return null;
  const best = gains.sort((a, b) => b.delta - a.delta)[0];
  const label = DIMENSIONS.find((d) => d.key === best.key)?.label ?? best.key;
  return `${label} up ${Math.round(best.delta)} points since last run.`;
}

export function toPunchyFindings(audit: AuditV2): string[] {
  const take = (audit.dilly_take ?? "").trim();
  const percs = audit.peer_percentiles ?? { smart: 50, grit: 50, build: 50 };
  const findings = audit.audit_findings ?? [];
  const lines: string[] = [];
  const maxLen = 28;

  const PUNCHY_MAP: [RegExp, string][] = [
    [/academic|gpa|honors|dean'?s list|top \d+%/i, "GPA & honors speak volumes"],
    [/leadership|led|exec|president|director/i, "Leadership stands out"],
    [/technical|projects|built|code|data/i, "Technical build is strong"],
    [/quantifiable|metrics|impact|results/i, "Add metrics. Impact pops"],
    [/clinical|shadowing|patient/i, "Clinical experience shines"],
    [/research|published|lab/i, "Research experience proven"],
  ];

  function extractPunchy(text: string): string | null {
    const rest = text.replace(/^(Smart|Grit|Build):\s*/i, "").trim().toLowerCase();
    for (const [re, phrase] of PUNCHY_MAP) {
      if (re.test(rest)) return phrase;
    }
    const words = rest.split(/\s+/).slice(0, 4).join(" ");
    return words.length <= maxLen && words.length > 5 ? words : null;
  }

  if (take && take.length <= 40) lines.push(take);
  if (lines.length >= 2) return lines.slice(0, 2);

  const dims = (["smart", "grit", "build"] as const)
    .map((d) => ({ d, p: percs[d] ?? 50 }))
    .filter((x) => x.p > 50);
  if (dims.length > 0) {
    const best = dims.sort((a, b) => b.p - a.p)[0];
    const topPct = Math.max(1, 100 - best.p);
    const label = best.d.charAt(0).toUpperCase() + best.d.slice(1);
    lines.push(`Top ${topPct}% ${label}`);
  }
  if (lines.length >= 2) return lines.slice(0, 2);

  for (const f of findings) {
    if (lines.length >= 2) break;
    const punchy = extractPunchy(f ?? "");
    if (punchy && punchy.length <= maxLen && !lines.includes(punchy)) lines.push(punchy);
  }
  return lines.slice(0, 2);
}

/**
 * Full score summary SVG for "Download Snapshot".
 * Differs from the in-app share card:
 * - Share card: one metric (Smart/Grit/Build), one % circle, achievements — for quick social share (e.g. Send to friends).
 * - Snapshot: name, final score (MTS), all 3 dimensions, key findings, achievements — for applications or saving a full record.
 */
export function generateSnapshotSvg(audit: AuditV2, options?: { customTagline?: string | null; selectedAchievements?: string[] }): string {
  const scores = audit.scores ?? {};
  const fs = audit.final_score ?? 0;
  const track = (audit.detected_track ?? "").trim() || "Humanities";
  const name = (audit.candidate_name ?? "").trim() || "Student";
  const customTagline = (options?.customTagline ?? "").trim();
  const achSlots = (options?.selectedAchievements ?? []).slice(0, 3);
  const punchyLines = toPunchyFindings(audit);
  const displayLines = punchyLines.length > 0 ? punchyLines : ["Dilly Truth Standard \u00B7 Your resume, scored."];
  const s = scores.smart ?? 0;
  const g = scores.grit ?? 0;
  const b = scores.build ?? 0;
  const fsc = fs >= 70 ? "#22c55e" : fs >= 50 ? "#eab308" : "#ef4444";
  let extraH = 0;
  if (customTagline) extraH += 24;
  if (achSlots.length) extraH += 40;
  const findingsBaseY = 302 + (customTagline ? 24 : 0);
  const findingsSvg = displayLines
    .map((line, i) => {
      const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<text x="24" y="${findingsBaseY + i * 22}" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#e2e8f0">\u2022 ${escaped}</text>`;
    })
    .join("");
  const achSvg =
    achSlots.length > 0
      ? achSlots
            .map((id, i) => {
              const def = ACHIEVEMENT_DEFINITIONS[id as keyof typeof ACHIEVEMENT_DEFINITIONS];
              const emoji = def?.emoji ?? "?";
              const x = 80 + i * 80;
              const y = 352 + displayLines.length * 22 + (customTagline ? 24 : 0) + 20;
              return `<g transform="translate(${x},${y})"><circle r="14" fill="${fsc}" fill-opacity="0.15" stroke="${fsc}" stroke-width="1"/><text x="0" y="5" font-size="12" text-anchor="middle" fill="${fsc}">${emoji}</text></g>`;
            })
            .join("")
      : "";
  const taglineSvg = customTagline
    ? `<text x="24" y="120" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8" font-style="italic">${customTagline.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`
    : "";
  const footerY = 352 + displayLines.length * 22 + extraH;
  const h = footerY + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${h}" viewBox="0 0 400 ${h}" overflow="hidden">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs>
  <rect width="400" height="${h}" rx="20" fill="url(#bg)"/>
  <text x="24" y="36" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.5">DILLY SNAPSHOT</text>
  <text x="24" y="52" font-family="system-ui,sans-serif" font-size="9" fill="#64748b" opacity="0.9">Full score summary \u00B7 All 3 dimensions + key findings</text>
  <text x="24" y="78" font-family="system-ui,sans-serif" font-size="22" fill="#e2e8f0" font-weight="700">${(name ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
  <text x="24" y="98" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">${(track ?? "").replace(/&/g, "&amp;")} Track</text>
  <circle cx="340" cy="88" r="32" fill="${fsc}" fill-opacity="0.12" stroke="${fsc}" stroke-width="2"/>
  <text x="340" y="93" font-family="system-ui,sans-serif" font-size="22" fill="${fsc}" font-weight="700" text-anchor="middle">${Math.round(fs)}</text>
  <text x="340" y="106" font-family="system-ui,sans-serif" font-size="8" fill="${fsc}" text-anchor="middle" opacity="0.7">MTS</text>
  ${taglineSvg}
  <line x1="24" y1="${122 + (customTagline ? 24 : 0)}" x2="376" y2="${122 + (customTagline ? 24 : 0)}" stroke="#334155" stroke-width="0.5"/>
  <text x="24" y="${152 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.2">DIMENSIONS</text>
  <rect x="24" y="${167 + (customTagline ? 24 : 0)}" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="79" y="${192 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Smart</text>
  <text x="79" y="${217 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="24" fill="${s >= 70 ? "#22c55e" : s >= 50 ? "#eab308" : "#ef4444"}" font-weight="700" text-anchor="middle">${Math.round(s)}</text>
  <rect x="145" y="${167 + (customTagline ? 24 : 0)}" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="200" y="${192 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Grit</text>
  <text x="200" y="${217 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="24" fill="${g >= 70 ? "#22c55e" : g >= 50 ? "#eab308" : "#ef4444"}" font-weight="700" text-anchor="middle">${Math.round(g)}</text>
  <rect x="266" y="${167 + (customTagline ? 24 : 0)}" width="110" height="70" rx="10" fill="#1e293b"/>
  <text x="321" y="${192 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Build</text>
  <text x="321" y="${217 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="24" fill="${b >= 70 ? "#22c55e" : b >= 50 ? "#eab308" : "#ef4444"}" font-weight="700" text-anchor="middle">${Math.round(b)}</text>
  <text x="24" y="${272 + (customTagline ? 24 : 0)}" font-family="system-ui,sans-serif" font-size="10" fill="#64748b" font-weight="600" letter-spacing="1.2">KEY FINDINGS</text>
  ${findingsSvg}
  ${achSvg}
  <text x="200" y="${footerY + 20}" font-family="system-ui,sans-serif" font-size="9" fill="#475569" text-anchor="middle">trydilly.com \u00B7 Share Your Score</text>
</svg>`;
}
