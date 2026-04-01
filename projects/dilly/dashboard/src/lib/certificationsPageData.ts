import { estimateBuildDeltaForCert } from "@/lib/certificationBuildEstimate";
import { getCertificationsForTrack, type CertificationEntry } from "@/lib/certificationsHub";
import type { AuditV2 } from "@/types/dilly";
import type { Certification, CertificationsPageData, CertificationShieldColor } from "@/types/certifications";
import { dilly } from "@/lib/dilly";

const SHIELD_ROTATION: CertificationShieldColor[] = ["green", "amber", "blue", "indigo"];

const CACHE_PREFIX = "dilly_certifications_ctx_";

export type CertificationsContextCache = {
  audit_id: string;
  dilly_commentary: string;
  bulletsByCertId: Record<string, string[]>;
};

function cacheKey(uid: string, auditId: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(uid)}_${encodeURIComponent(auditId)}`;
}

function loadCache(uid: string, auditId: string): CertificationsContextCache | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(uid, auditId));
    if (!raw) return null;
    const p = JSON.parse(raw) as CertificationsContextCache;
    if (p?.audit_id !== auditId || typeof p.dilly_commentary !== "string" || !p.bulletsByCertId) return null;
    return p;
  } catch {
    return null;
  }
}

function saveCache(uid: string, data: CertificationsContextCache): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(cacheKey(uid, data.audit_id), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function noteToPrice(note?: string): { price_label: string; is_free: boolean } {
  const n = (note || "").trim();
  if (!n) return { price_label: "See provider", is_free: false };
  const lower = n.toLowerCase();
  if (lower === "free") return { price_label: "Free", is_free: true };
  if (lower.includes("audit")) return { price_label: "Free to audit", is_free: true };
  if (lower.includes("trial")) return { price_label: "Free trial", is_free: false };
  if (lower.includes("free")) return { price_label: n, is_free: true };
  return { price_label: n, is_free: false };
}

function buildDefaultCommentary(buildScore: number, track: string, peerBuildPercentile?: number | null): string {
  const b = Math.round(buildScore);
  const buildPct = peerBuildPercentile;
  const tail =
    buildPct != null && buildPct < 80
      ? " **One of these could move you toward Top 20% Build.**"
      : " **They tighten the proof gap recruiters scan for on your Build score.**";
  return `Your Build is at **${b}** — the gap is missing concrete credentials for your **${track}** signal. These certs give recruiters something verifiable to anchor on.${tail}`;
}

function buildDefaultTopPickReason(track: string, certName: string): string {
  return `**${certName}** has the strongest estimated **Build** lift for **${track}** right now — it matches what we see recruiters keyword on for your track.`;
}

function defaultWhyBullets(
  cert: CertificationEntry,
  track: string,
  audit: AuditV2,
  idx: number,
): string[] {
  const finding0 = audit.audit_findings?.[0]?.trim() || "";
  const shortFinding = finding0.length > 100 ? `${finding0.slice(0, 97)}…` : finding0;
  const nameShort = cert.name.split(/\s+/).slice(0, 5).join(" ");
  return [
    `${nameShort} reinforces **${track}** stack signals that often decide first-pass resume screens.`,
    shortFinding
      ? `Ties to something flagged in your audit: ${shortFinding}`
      : "Adds a third-party line recruiters can search for alongside your projects and coursework.",
    idx === 0
      ? "Dilly weighted this toward your biggest **Build** gap from the last audit."
      : "Completing it gives you a clean bullet for Education or a Certifications section without bloating experience.",
  ];
}

function normalizeApiCert(raw: unknown, fallbackTrack: string, currentBuild: number): Certification | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id || "").trim();
  const name = String(o.name || "").trim();
  if (!id || !name) return null;
  const pts = Math.max(0, Math.round(Number(o.estimated_build_pts) || 0));
  const after = Math.min(100, Math.max(0, Math.round(Number(o.estimated_build_score_after) || currentBuild + pts)));
  const shield = (["green", "amber", "blue", "indigo"] as const).includes(o.shield_color as CertificationShieldColor)
    ? (o.shield_color as CertificationShieldColor)
    : "blue";
  const why = Array.isArray(o.why_it_matters) ? o.why_it_matters.map((x) => String(x)) : [];
  while (why.length < 3) why.push("Strengthens recruiter-visible proof for your profile.");
  return {
    id,
    name,
    provider: String(o.provider || "Provider"),
    price_label: String(o.price_label || "—"),
    is_free: !!o.is_free,
    estimated_build_pts: pts,
    estimated_build_score_after: after,
    url: String(o.url || "#"),
    why_it_matters: why.slice(0, 5),
    dilly_pick: !!o.dilly_pick,
    shield_color: shield,
    track: String(o.track || fallbackTrack),
  };
}

function normalizeApiPageData(raw: unknown): CertificationsPageData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const track = String(o.track || "").trim();
  const certsIn = Array.isArray(o.certifications) ? o.certifications : [];
  const currentBuild = Math.round(Number(o.current_build_score) || 0);
  const certifications: Certification[] = [];
  for (const c of certsIn) {
    const n = normalizeApiCert(c, track || "your track", currentBuild);
    if (n) certifications.push(n);
  }
  if (!certifications.length) return null;
  const commentary = String(o.dilly_commentary || "").trim();
  const topReason = String(o.dilly_top_pick_reason || "").trim();
  const topPick = certifications.find((x) => x.dilly_pick) ?? certifications[0];
  const trackLabel = track || "your track";
  return {
    track: trackLabel,
    current_build_score: currentBuild,
    certifications,
    dilly_commentary: commentary || buildDefaultCommentary(currentBuild, trackLabel, undefined),
    dilly_top_pick_reason: topReason || buildDefaultTopPickReason(trackLabel, topPick?.name || "this pick"),
    total_certs: Math.round(Number(o.total_certs) || certifications.length),
  };
}

/**
 * Try GET /certifications?uid=…; returns null if missing or invalid.
 */
export async function fetchCertificationsFromApi(uid: string, _token?: string | null): Promise<CertificationsPageData | null> {
  if (!uid.trim()) return null;
  try {
    const res = await dilly.fetch(
      `/certifications?uid=${encodeURIComponent(uid)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return normalizeApiPageData(data);
  } catch {
    return null;
  }
}

/**
 * Build curated certifications from the latest audit + static hub (and optional local copy cache).
 */
export function buildCertificationsPageDataFromAudit(audit: AuditV2, uid: string): CertificationsPageData | null {
  const track = (audit.detected_track || "").trim();
  if (!track) return null;
  const entries = getCertificationsForTrack(track);
  if (!entries.length) return null;

  const auditId = (audit.id && String(audit.id).trim()) || `ts_${audit.candidate_name || "anon"}`;
  const currentBuild = Math.round(audit.scores?.build ?? 0);

  const cached = loadCache(uid, auditId);
  const bulletsById: Record<string, string[]> = { ...(cached?.bulletsByCertId || {}) };

  let commentary: string;
  if (cached && cached.audit_id === auditId) {
    commentary = cached.dilly_commentary;
  } else {
    commentary = buildDefaultCommentary(
      audit.scores?.build ?? 0,
      track,
      audit.peer_percentiles?.build ?? null,
    );
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      bulletsById[e.id] = defaultWhyBullets(e, track, audit, i);
    }
    saveCache(uid, {
      audit_id: auditId,
      dilly_commentary: commentary,
      bulletsByCertId: bulletsById,
    });
  }

  const certifications: Certification[] = entries.slice(0, 20).map((cert, i) => {
    const pts = estimateBuildDeltaForCert(cert, track, currentBuild);
    const after = Math.min(100, currentBuild + pts);
    const { price_label, is_free } = noteToPrice(cert.note);
    return {
      id: cert.id,
      name: cert.name,
      provider: cert.provider,
      price_label,
      is_free,
      estimated_build_pts: pts,
      estimated_build_score_after: after,
      url: cert.url,
      why_it_matters: (bulletsById[cert.id] || defaultWhyBullets(cert, track, audit, i)).slice(0, 3),
      dilly_pick: false,
      shield_color: SHIELD_ROTATION[i % SHIELD_ROTATION.length],
      track,
    };
  });

  const maxPts = Math.max(...certifications.map((c) => c.estimated_build_pts), 0);
  const topIdx = certifications.findIndex((c) => c.estimated_build_pts === maxPts);
  if (topIdx >= 0) {
    certifications.forEach((c, j) => {
      c.dilly_pick = j === topIdx;
    });
  }

  const topPick = certifications[topIdx >= 0 ? topIdx : 0];
  const topReason = buildDefaultTopPickReason(track, topPick?.name || "this program");

  return {
    track,
    current_build_score: currentBuild,
    certifications,
    dilly_commentary: commentary,
    dilly_top_pick_reason: topReason,
    total_certs: certifications.length,
  };
}
