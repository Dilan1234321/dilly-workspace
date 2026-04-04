/**
 * Share/export utilities: badge SVG, share card SVG, snapshot SVG, download/convert helpers.
 */

import type { AuditV2, DimensionKey } from "@/types/dilly";
import { ACHIEVEMENT_DEFINITIONS } from "@/lib/achievements";
import { DIMENSIONS } from "./constants";

export type ShareCardOptions = {
  customTagline?: string | null;
  selectedAchievements?: string[];
};

/** Options for share-card SVG (matches the in-app share card: one metric, achievements). */
export type ShareCardSvgOptions = ShareCardOptions & {
  /** Which metric to show: smart | grit | build | mts | ats */
  shareCardMetric: "smart" | "grit" | "build" | "mts" | "ats";
  /** For metric "ats": current ATS score (0–100). Omit if no ATS run yet. */
  atsScore?: number | null;
  /** For metric "ats": peer percentile (0–100). Top % = 100 - atsPeerPercentile. */
  atsPeerPercentile?: number | null;
  /** Ring/accent color (default #1e293b). */
  primaryColor?: string;
};

export function generateBadgeSvg(
  audit: AuditV2,
  dimension: "smart" | "grit" | "build" = "grit",
  options?: ShareCardOptions
): string {
  const scores = audit.scores ?? { smart: 0, grit: 0, build: 0 };
  const percs = audit.peer_percentiles ?? { smart: 50, grit: 50, build: 50 };
  const track = (audit.detected_track ?? "").trim() || "Humanities";
  const score = scores[dimension] ?? 0;
  const pct = percs[dimension] ?? 50;
  const topPct = Math.max(1, 100 - pct);
  const color = topPct <= 25 ? "#22c55e" : topPct <= 50 ? "#eab308" : "#94a3b8";
  const tagline = (options?.customTagline ?? "").trim();
  const achievements = options?.selectedAchievements ?? [];
  const achSlots = achievements.slice(0, 3);
  const badgeH = tagline || achSlots.length ? 160 : 120;
  const cohortBadgeLine = audit.peer_fallback_all ? "All tracks (Dilly)" : `${track} Track`;
  const achSvg =
    achSlots.length > 0
      ? achSlots
            .map((id, i) => {
              const def = ACHIEVEMENT_DEFINITIONS[id as keyof typeof ACHIEVEMENT_DEFINITIONS];
              const emoji = def?.emoji ?? "?";
              const x = 24 + i * 52;
              return `<g transform="translate(${x},${tagline ? 130 : 100})"><circle r="18" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="1"/><text x="0" y="6" font-size="14" text-anchor="middle" fill="${color}">${emoji}</text></g>`;
            })
            .join("")
      : "";
  const taglineSvg = tagline
    ? `<text x="24" y="100" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8" font-style="italic">${tagline.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${badgeH}" viewBox="0 0 320 ${badgeH}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs>
  <rect width="320" height="${badgeH}" rx="16" fill="url(#bg)"/>
  <rect x="1" y="1" width="318" height="${badgeH - 2}" rx="15" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity="0.4"/>
  <text x="24" y="36" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8" font-weight="600" letter-spacing="1.2">DILLY VERIFIED</text>
  <text x="24" y="62" font-family="system-ui,sans-serif" font-size="20" fill="#e2e8f0" font-weight="700">Top ${topPct}% ${dimension.charAt(0).toUpperCase() + dimension.slice(1)}</text>
  <text x="24" y="84" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">${cohortBadgeLine}</text>
  <text x="24" y="104" font-family="system-ui,sans-serif" font-size="10" fill="#475569">Score: ${Math.round(score)} · trydilly.com</text>
  ${taglineSvg}
  ${achSvg}
  <circle cx="274" cy="60" r="28" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="1.5"/>
  <text x="274" y="65" font-family="system-ui,sans-serif" font-size="18" fill="${color}" font-weight="700" text-anchor="middle">${Math.round(score)}</text>
</svg>`;
}

/**
 * Share card as SVG — matches the in-app share card (light background, one metric circle, achievements).
 * Use for "Download Snapshot" so the file matches what the user sees and shares.
 */
export function generateShareCardSvg(audit: AuditV2, options: ShareCardSvgOptions): string {
  const scores = audit.scores ?? {};
  const percs = audit.peer_percentiles ?? { smart: 50, grit: 50, build: 50 };
  const track = (audit.detected_track ?? "").trim() || "your track";
  const shareMetric = options.shareCardMetric;
  const isDimension = shareMetric === "smart" || shareMetric === "grit" || shareMetric === "build";
  const k = isDimension ? shareMetric : "grit";
  const percentile = percs[k] ?? 50;
  const topPct = Math.max(1, Math.min(100, 100 - percentile));
  const dimensionScore = Math.round(scores[k] ?? 0);
  const mtsScore = audit.final_score != null ? Math.round(audit.final_score) : null;
  const atsScore = options.atsScore != null ? Math.round(options.atsScore) : null;
  const atsTopPct = options.atsPeerPercentile != null ? Math.max(1, 100 - options.atsPeerPercentile) : null;
  const achSlots = (options.selectedAchievements ?? []).slice(0, 3);
  const primary = options.primaryColor ?? "#1e293b";

  const circleLabel =
    shareMetric === "mts"
      ? (mtsScore != null ? String(mtsScore) : "—")
      : shareMetric === "ats"
        ? (atsScore != null ? String(atsScore) : "—")
        : (audit.peer_percentiles ? `${topPct}%` : String(dimensionScore));
  const subLabel =
    shareMetric === "mts"
      ? "Final · Overall"
      : shareMetric === "ats"
        ? atsTopPct != null ? `ATS · Top ${atsTopPct}% vs peers` : "Dilly ATS score"
        : audit.peer_fallback_all
          ? `${k.charAt(0).toUpperCase() + k.slice(1)} · vs all Dilly peers`
          : `${k.charAt(0).toUpperCase() + k.slice(1)} in ${track}`;
  const topLabel = shareMetric === "mts" ? "Final" : shareMetric === "ats" ? "ATS" : "Top";

  const size = 56;
  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;
  const strokeDash =
    shareMetric === "mts"
      ? (Math.min(100, Math.max(0, mtsScore ?? 0)) / 100) * circumference
      : shareMetric === "ats"
        ? (Math.min(100, Math.max(0, atsScore ?? 0)) / 100) * circumference
        : ((100 - topPct) / 100) * circumference;
  const showRing =
    (isDimension && audit.peer_percentiles) ||
    (shareMetric === "mts" && mtsScore != null) ||
    (shareMetric === "ats" && atsScore != null);

  const cardW = 400;
  const row1H = 100;
  const stickerRowH = achSlots.length > 0 ? 52 : 0;
  const padding = 20;
  const cardH = row1H + stickerRowH + padding * 2;
  const circleX = cardW - padding - size / 2 - 20;
  const circleY = 44;

  const achSvg =
    achSlots.length > 0
      ? achSlots
            .map((id, i) => {
              const def = ACHIEVEMENT_DEFINITIONS[id as keyof typeof ACHIEVEMENT_DEFINITIONS];
              const emoji = def?.emoji ?? "?";
              const x = 24 + i * 52;
              const y = row1H + padding + 16;
              return `<g transform="translate(${x},${y})"><circle r="14" fill="${primary}" fill-opacity="0.12" stroke="${primary}" stroke-width="1"/><text x="0" y="5" font-size="14" text-anchor="middle" dominant-baseline="central" fill="${primary}">${emoji}</text></g>`;
            })
            .join("")
      : "";

  const ringSvg = showRing
    ? `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${primary}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${strokeDash} ${circumference}" transform="rotate(-90 0 0)"/>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}" viewBox="0 0 ${cardW} ${cardH}" overflow="hidden">
  <rect width="${cardW}" height="${cardH}" rx="16" fill="#ffffff"/>
  <text x="24" y="32" font-family="Times New Roman, Times, serif" font-size="24" font-weight="700" fill="#0f172a">Dilly</text>
  <text x="24" y="52" font-family="Times New Roman, Times, serif" font-size="13" fill="#475569">Resume scored like a senior hiring manager.</text>
  <text x="24" y="68" font-family="Times New Roman, Times, serif" font-size="12" fill="#64748b">Your career center. Open 24/7.</text>
  <g transform="translate(${circleX},${circleY})">
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="4"/>
    ${ringSvg}
    <text x="0" y="0" font-family="Times New Roman, Times, serif" font-size="${circleLabel.length > 3 ? 14 : 16}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#0f172a">${circleLabel.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
  </g>
  <text x="${circleX}" y="${circleY - r - 8}" font-family="system-ui,sans-serif" font-size="9" font-weight="600" fill="#64748b" text-anchor="middle" letter-spacing="0.05em">${topLabel}</text>
  <text x="${circleX}" y="${circleY + r + 14}" font-family="system-ui,sans-serif" font-size="9" fill="#475569" text-anchor="middle">${subLabel.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>
  ${achSvg}
</svg>`;
}

export function downloadSvg(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function svgToPngFile(svg: string, filename: string): Promise<File> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  const svgEl = doc.querySelector("svg");
  if (!svgEl) throw new Error("Invalid SVG");
  const w = parseInt(svgEl.getAttribute("width") || "320", 10);
  const h = parseInt(svgEl.getAttribute("height") || "120", 10);
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  const img = new Image();
  const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = () => reject(new Error("Failed to load SVG"));
    img.src = dataUrl;
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create PNG"));
        return;
      }
      resolve(new File([blob], filename.replace(/\.svg$/i, ".png"), { type: "image/png" }));
    }, "image/png", 1);
  });
}

/**
 * Synchronous copy via hidden textarea + execCommand.
 * Use when async Clipboard API fails (e.g. user activation expired after await) — still not guaranteed on all iOS versions.
 */
export function copyTextSync(text: string): boolean {
  if (typeof document === "undefined" || !text) return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;font-size:16px;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
