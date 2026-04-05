/**
 * Maps API `AuditV2` into props for the full-screen audit report UI.
 * API shape may omit spec-only fields; we derive sensible defaults.
 */

import type { AuditV2, DimensionKey, Rec } from "@/types/dilly";
import { DIMENSIONS, topPercentileHeadline } from "@/lib/dillyUtils";

export type AuditReportTagColor = "g" | "b" | "a" | "r" | "t" | "i";

export type AuditReportRecommendationVM = {
  id: string;
  title: string;
  body: string;
  type: "line_edit" | "action_step" | "strategic";
  dimension: DimensionKey;
  tag_label: string;
};

export type AuditReportRewriteVM = {
  id: string;
  title: string;
  original: string;
  rewritten: string;
  reason: string;
  reason_tag: string;
  reason_type: "placeholder" | "acronym" | "verb" | "quantification" | "header";
  index: number;
  total: number;
  recId: string;
};

export type AuditReportEvidenceVM = {
  id: string;
  number: number;
  dimension: DimensionKey;
  headline: string;
  description: string;
  citation: string;
};

export type AuditReportConsistencyVM = {
  id: string;
  severity: "warning" | "info";
  message: string;
};

export type AuditReportLogEntryVM = {
  label: string;
  value: string;
};

export type AuditReportCohortVM = {
  track: string;
  smart_description: string;
  grit_description: string;
  build_description: string;
};

export type AuditReportViewModel = {
  id: string;
  tsMs: number;
  track: string;
  final_score: number;
  smart: number;
  grit: number;
  build: number;
  smart_label: string;
  grit_label: string;
  build_label: string;
  smart_percentile_top: number;
  grit_percentile_top: number;
  build_percentile_top: number;
  smart_at_bar: boolean;
  grit_at_bar: boolean;
  build_at_bar: boolean;
  smart_bar: number;
  grit_bar: number;
  build_bar: number;
  peer_count: number;
  final_percentile_top: number;
  final_label: string;
  recommendations: AuditReportRecommendationVM[];
  rewrites: AuditReportRewriteVM[];
  evidence: AuditReportEvidenceVM[];
  consistency_flags: AuditReportConsistencyVM[];
  cohort_description: AuditReportCohortVM;
  audit_log: AuditReportLogEntryVM[];
  previous_score: number | null;
  score_delta: number | null;
  dilly_score_commentary: string;
  dilly_benchmarking_commentary: string;
  /** Phrases to emphasize in Dilly strips (bold) */
  dilly_emphases: string[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function dimensionLabelFromScore(score: number): string {
  if (score >= 85) return "Elite";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Average";
  return "Weak";
}

function defaultBars(): { smart: number; grit: number; build: number } {
  return { smart: 62, grit: 58, build: 60 };
}

function inferDimensionFromRec(r: Rec): DimensionKey {
  const t = (r.score_target || "").toLowerCase();
  if (t.includes("grit")) return "grit";
  if (t.includes("build")) return "build";
  if (t.includes("smart")) return "smart";
  const title = (r.title || "").toLowerCase();
  if (title.includes("grit") || title.includes("lead")) return "grit";
  if (title.includes("build") || title.includes("track") || title.includes("skill")) return "build";
  return "smart";
}

function recType(r: Rec): "line_edit" | "action_step" | "strategic" {
  if (r.type === "line_edit") return "line_edit";
  if (r.type === "action") return "action_step";
  return "strategic";
}

export function tagColorForDimension(dim: DimensionKey): AuditReportTagColor {
  if (dim === "grit") return "a";
  if (dim === "build") return "g";
  return "b";
}

function inferReasonType(reason: string): AuditReportRewriteVM["reason_type"] {
  const s = reason.toLowerCase();
  if (s.includes("header") || s.includes("section")) return "header";
  if (s.includes("quantif") || s.includes("number") || s.includes("metric")) return "quantification";
  if (s.includes("verb") || s.includes("action word")) return "verb";
  if (s.includes("acronym") || s.includes("abbrev")) return "acronym";
  return "placeholder";
}

function parseEvidence(audit: AuditV2): AuditReportEvidenceVM[] {
  const quotes = audit.evidence_quotes ?? null;
  const base = audit.evidence ?? {};
  const entries: { key: string; description: string; citation: string }[] = [];

  if (quotes && typeof quotes === "object") {
    for (const [k, v] of Object.entries(quotes)) {
      if (typeof v === "string" && v.trim()) {
        const desc = typeof base[k] === "string" ? base[k] : "";
        entries.push({ key: k, description: desc || "Signal from your resume.", citation: v.trim() });
      }
    }
  }
  if (entries.length === 0) {
    for (const [k, v] of Object.entries(base)) {
      if (typeof v !== "string" || !v.trim()) continue;
      entries.push({ key: k, description: v.trim(), citation: v.trim() });
    }
  }

  const dimFromKey = (key: string): DimensionKey => {
    const low = key.toLowerCase();
    if (low.startsWith("grit") || low.includes("grit")) return "grit";
    if (low.startsWith("build") || low.includes("build")) return "build";
    if (low.startsWith("smart") || low.includes("smart")) return "smart";
    return "smart";
  };

  return entries.map((e, idx) => {
    const dimension = dimFromKey(e.key);
    const headline = e.key.includes(":") ? e.key.split(":").slice(1).join(":").trim() : e.key;
    return {
      id: `ev-${idx}`,
      number: idx + 1,
      dimension,
      headline: headline || DIMENSIONS.find((d) => d.key === dimension)?.label || dimension,
      description: e.description,
      citation: e.citation,
    };
  });
}

function parseConsistency(audit: AuditV2): AuditReportConsistencyVM[] {
  const out: AuditReportConsistencyVM[] = [];
  let i = 0;
  for (const line of audit.consistency_findings ?? []) {
    if (typeof line === "string" && line.trim()) {
      out.push({ id: `cf-${i++}`, severity: "warning", message: line.trim() });
    }
  }
  for (const rf of audit.red_flags ?? []) {
    const msg = typeof rf === "string" ? rf : rf?.message;
    if (msg && String(msg).trim()) {
      out.push({ id: `cf-${i++}`, severity: "warning", message: String(msg).trim() });
    }
  }
  return out;
}

function parseAuditLog(audit: AuditV2): AuditReportLogEntryVM[] {
  const rows: AuditReportLogEntryVM[] = [];
  for (const line of audit.raw_logs ?? []) {
    if (typeof line !== "string" || !line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx > 0) {
      rows.push({ label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() });
    } else {
      rows.push({ label: "log", value: line.trim() });
    }
  }
  if (rows.length === 0 && audit.audit_findings?.length) {
    audit.audit_findings.slice(0, 12).forEach((f, i) => {
      rows.push({ label: `finding_${i + 1}`, value: f });
    });
  }
  return rows;
}

/** Build view model from a loaded audit. Pass optional `previousFinalScore` from history for delta. */
export function buildAuditReportViewModel(
  audit: AuditV2,
  opts?: { auditTsSeconds?: number | null; previousFinalScore?: number | null },
): AuditReportViewModel | null {
  if (!audit?.scores) return null;
  const id = (audit.id || "").trim();
  if (!id) return null;

  const smart = Math.round(Number(audit.scores.smart) || 0);
  const grit = Math.round(Number(audit.scores.grit) || 0);
  const build = Math.round(Number(audit.scores.build) || 0);
  const final_score = Math.round(Number(audit.final_score) || (smart + grit + build) / 3);

  const peer = audit.peer_percentiles ?? null;
  const top = (raw: number | undefined) => clamp(Math.max(1, 100 - Math.round(raw ?? 50)), 1, 99);

  const smart_percentile_top = peer ? top(peer.smart) : 50;
  const grit_percentile_top = peer ? top(peer.grit) : 50;
  const build_percentile_top = peer ? top(peer.build) : 50;

  const bars = defaultBars();
  const smart_at_bar = smart >= bars.smart;
  const grit_at_bar = grit >= bars.grit;
  const build_at_bar = build >= bars.build;

  const peer_count = Math.max(0, Math.round(Number(audit.peer_cohort_n) || 0));

  const tops = [smart_percentile_top, grit_percentile_top, build_percentile_top];
  const final_percentile_top = Math.min(...tops);

  const final_label = dimensionLabelFromScore(final_score);

  const recs = audit.recommendations ?? [];
  const rewritesDraft: AuditReportRewriteVM[] = [];
  recs.forEach((r) => {
    if (recType(r) !== "line_edit" || !(r.current_line || r.suggested_line)) return;
    const reason = (r.diagnosis || r.action || "Tighten wording so recruiters see clear impact.").trim();
    const rt = inferReasonType(reason);
    rewritesDraft.push({
      id: `rw-${rewritesDraft.length}`,
      title: (r.title || "Line edit").trim(),
      original: (r.current_line || "").trim() || "—",
      rewritten: (r.suggested_line || "").trim() || "—",
      reason,
      reason_tag: rt === "quantification" ? "Add numbers" : "Improve clarity",
      reason_type: rt,
      index: 0,
      total: 1,
      recId: `rec-${i}`,
    });
  });
  const totalRewrites = Math.max(1, rewritesDraft.length);
  const rewrites = rewritesDraft.map((rw, j) => ({ ...rw, index: j + 1, total: totalRewrites }));

  const recommendations: AuditReportRecommendationVM[] = recs.map((r, i) => {
    const dim = inferDimensionFromRec(r);
    const t = recType(r);
    const tags: string[] = [];
    if (t === "line_edit") tags.push("Edit line");
    if (t === "action_step") tags.push("Add outcome");
    if (dim === "build") tags.push("Boost Build");
    if (dim === "grit") tags.push("Boost Grit");
    if (dim === "smart") tags.push("Boost Smart");
    return {
      id: `rec-${i}`,
      title: (r.title || "Recommendation").trim(),
      body: (r.action || r.diagnosis || "").trim() || (r.suggested_line || "").trim(),
      type: t,
      dimension: dim,
      tag_label: tags.length ? tags.join(", ") : "Strategic",
    };
  });

  const track = (audit.detected_track || "").trim() || "your track";

  const cohort_description: AuditReportCohortVM = {
    track,
    smart_description:
      audit.benchmark_copy?.smart?.trim() ||
      "Course rigor, quantitative or analytical coursework, and academic signals that match your target roles.",
    grit_description:
      audit.benchmark_copy?.grit?.trim() ||
      "Leadership, initiative, and ownership—roles where you drove outcomes, not just participated.",
    build_description:
      audit.benchmark_copy?.build?.trim() ||
      "Skills, projects, and experience that show you can do the work in your track.",
  };

  const headline = topPercentileHeadline(audit);
  const dilly = (audit.dilly_take || audit.dilly_take || audit.strongest_signal_sentence || "").trim();
  const dilly_score_commentary =
    dilly ||
    (headline
      ? `You’re **${headline}** on this resume pass. **Smart**, **Grit**, and **Build** tell different stories—use the breakdown to see where to push next.`
      : `Your **Dilly score** is **${final_score}**. Compare **Smart**, **Grit**, and **Build** below to see what hiring managers weight most in **${track}**.`);

  const dilly_benchmarking_commentary = peer
    ? `Peers in **${track}** set the bar. Where you’re green, you’re competitive; where you’re not, small rewrites and one proof-point usually move you fastest.`
    : `When we have enough peers in **${track}**, benchmarking gets sharper. For now, lean on the dimension scores and recommendations.`;

  const emphases = [String(final_score), track, "Smart", "Grit", "Build"].filter(Boolean);

  const tsMs =
    typeof opts?.auditTsSeconds === "number" && !Number.isNaN(opts.auditTsSeconds)
      ? opts.auditTsSeconds * 1000
      : Date.now();

  const previous_score =
    typeof opts?.previousFinalScore === "number" && !Number.isNaN(opts.previousFinalScore)
      ? Math.round(opts.previousFinalScore)
      : null;
  const score_delta = previous_score !== null ? final_score - previous_score : null;

  return {
    id,
    tsMs,
    track,
    final_score,
    smart,
    grit,
    build,
    smart_label: dimensionLabelFromScore(smart),
    grit_label: dimensionLabelFromScore(grit),
    build_label: dimensionLabelFromScore(build),
    smart_percentile_top,
    grit_percentile_top,
    build_percentile_top,
    smart_at_bar,
    grit_at_bar,
    build_at_bar,
    smart_bar: bars.smart,
    grit_bar: bars.grit,
    build_bar: bars.build,
    peer_count,
    final_percentile_top,
    final_label,
    recommendations,
    rewrites,
    evidence: parseEvidence(audit),
    consistency_flags: parseConsistency(audit),
    cohort_description,
    audit_log: parseAuditLog(audit),
    previous_score,
    score_delta,
    dilly_score_commentary,
    dilly_benchmarking_commentary,
    dilly_emphases: emphases,
  };
}

export function benchmarkRowColor(score: number, bar: number): "green" | "amber" | "coral" {
  if (score >= bar) return "green";
  if (score >= bar * 0.8) return "amber";
  return "coral";
}
