"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSchoolFromEmail } from "@/lib/schools";
import {
  API_BASE,
  AUTH_TOKEN_KEY,
  AUTH_USER_CACHE_KEY,
  AUTH_USER_CACHE_MAX_AGE_MS,
  auditStorageKey,
  fetchWithTimeout,
  writeLastAtsScoreCache,
  minimalAuditFromHistorySummary,
  type AuditHistorySummaryRow,
} from "@/lib/dillyUtils";
import type { AuditV2 } from "@/types/dilly";
import type { ATSResult } from "./types";

type School = ReturnType<typeof getSchoolFromEmail>;

type ATSVendorName = "Workday" | "Greenhouse" | "iCIMS" | "Lever";

type ATSContextValue = {
  user: { email: string; subscribed: boolean } | null;
  school: School;
  theme: { primary: string };
  displayAudit: AuditV2 | null;
  atsResult: ATSResult | null;
  atsLoading: boolean;
  authLoading: boolean;
  auditLoading: boolean;
  atsScanError: string | null;
  runScan: (opts?: { force?: boolean }) => Promise<void>;
  retry: () => Promise<void>;
};

const ATSContext = createContext<ATSContextValue | null>(null);

type RawAtsAnalysis = {
  readiness?: string;
  readiness_summary?: string;
  score?: number;
  issues?: Array<{
    category?: string;
    severity?: string;
    title?: string;
    detail?: string;
    fix?: string;
    dilly_reads?: string | null;
    line?: string | null;
  }>;
  checklist?: Array<{ label?: string; passed?: boolean; detail?: string | null }>;
  extracted_fields?: Array<{ field?: string; value?: string | null; status?: string; note?: string | null }>;
  experience_entries?: Array<{ company?: string; role?: string; dates?: string; location?: string; bullet_count?: number }>;
  education_entries?: Array<{ university?: string; degree?: string; major?: string; gpa?: string | null; graduation?: string; location?: string }>;
  detected_sections?: string[];
  missing_sections?: string[];
  skills_extracted?: string[];
};

type RawVendorSim = {
  vendors?: Array<{ vendor?: string; display_name?: string; score?: number; verdict?: string; used_by?: string[] }>;
};

type RawKwDensity = {
  total_keywords?: number;
  total_contextual?: number;
  total_bare?: number;
  density_score?: number;
  keywords?: Array<{
    keyword?: string;
    total_count?: number;
    contextual_count?: number;
    bare_count?: number;
  }>;
};

type RawAtsRewrites = {
  rewrites?: Array<{ original?: string; rewritten?: string; changes?: string[]; source?: string }>;
};

type RawHistoryRow = { ts?: number; score?: number };

function severityFrom(s?: string): "critical" | "warning" | "info" {
  const v = (s || "").toLowerCase();
  if (v.includes("crit")) return "critical";
  if (v.includes("warn") || v.includes("med")) return "warning";
  return "info";
}

function statusFromScore(score: number): ATSResult["status"] {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "risky";
  return "at_risk";
}

function vendorName(raw?: string): ATSVendorName {
  const v = (raw || "").toLowerCase();
  if (v.includes("green")) return "Greenhouse";
  if (v.includes("icims")) return "iCIMS";
  if (v.includes("lever")) return "Lever";
  return "Workday";
}

function vendorStatus(score: number): "will_parse" | "risky" | "fail" {
  if (score >= 80) return "will_parse";
  if (score >= 60) return "risky";
  return "fail";
}

function formatDate(ts?: number): string {
  if (!ts) return "";
  try {
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function splitDateRange(input?: string): { start: string; end: string | null } {
  if (!input) return { start: "Unknown", end: null };
  const parts = input.split("-").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { start: parts[0], end: parts.slice(1).join(" - ") };
  return { start: input, end: null };
}

function normalizeResult(raw: {
  analysis: RawAtsAnalysis;
  vendor: RawVendorSim | null;
  density: RawKwDensity | null;
  rewrites: RawAtsRewrites | null;
  history: RawHistoryRow[];
  previousScore: number | null;
}): ATSResult {
  const analysis = raw.analysis;
  const score = Math.max(0, Math.min(100, Math.round(analysis.score ?? 0)));
  const checklist = (analysis.checklist ?? []).map((item, idx) => {
    const label = item.label || `Check ${idx + 1}`;
    const impact: "critical" | "high" | "medium" | "low" = item.passed ? "low" : idx < 2 ? "critical" : idx < 5 ? "high" : "medium";
    return {
      id: `check-${idx}`,
      label,
      description: item.detail || "Review this ATS requirement.",
      passed: !!item.passed,
      impact,
      dilly_fix: item.passed ? undefined : `Update this section so ATS can parse ${label.toLowerCase()}.`,
      potential_pts: item.passed ? 0 : impact === "critical" ? 6 : impact === "high" ? 4 : 2,
    };
  });
  const issues = (analysis.issues ?? []).map((issue, idx) => {
    const sev = severityFrom(issue.severity);
    const potential = sev === "critical" ? 8 : sev === "warning" ? 4 : 2;
    return {
      id: `issue-${idx}`,
      severity: sev,
      title: issue.title || issue.category || `Issue ${idx + 1}`,
      detail: issue.detail || "This item can block ATS parsing quality.",
      quote: issue.line || null,
      dilly_insight: issue.dilly_reads || "This can reduce parse confidence.",
      dilly_action: issue.fix || "Rewrite this line with stronger action and measurable outcomes.",
      potential_pts: potential,
    };
  });
  const fixes = (raw.rewrites?.rewrites ?? []).map((rw, idx) => {
    const reason = rw.changes?.[0] || rw.source || "Improves ATS clarity.";
    const lower = reason.toLowerCase();
    const reasonType: ATSResult["quick_fixes"][number]["reason_type"] =
      lower.includes("acronym") ? "acronym" :
      lower.includes("verb") ? "verb" :
      lower.includes("metric") || lower.includes("quant") ? "quantification" :
      lower.includes("head") ? "header" : "placeholder";
    return {
      id: `fix-${idx}`,
      original: rw.original || "",
      rewritten: rw.rewritten || "",
      reason,
      reason_type: reasonType,
    };
  });
  const history = (raw.history || [])
    .filter((h) => typeof h.score === "number")
    .sort((a, b) => {
      const ats = typeof a.ts === "number" ? a.ts : 0;
      const bts = typeof b.ts === "number" ? b.ts : 0;
      return ats - bts;
    })
    .slice(-8)
    .map((h) => ({ date: formatDate(h.ts), score: Math.max(0, Math.min(100, Math.round(h.score || 0))) }));
  const extracted = analysis.extracted_fields ?? [];
  const parsedCount = extracted.filter((f) => !((f.status || "").toLowerCase().includes("miss"))).length;
  const contact = {
    name: extracted.find((f) => (f.field || "").toLowerCase() === "name")?.value || null,
    email: extracted.find((f) => (f.field || "").toLowerCase() === "email")?.value || null,
    phone: extracted.find((f) => (f.field || "").toLowerCase() === "phone")?.value || null,
    linkedin: extracted.find((f) => (f.field || "").toLowerCase().includes("linkedin"))?.value || null,
    location: extracted.find((f) => (f.field || "").toLowerCase() === "location")?.value || null,
    university: analysis.education_entries?.[0]?.university || null,
    major: analysis.education_entries?.[0]?.major || null,
    gpa: analysis.education_entries?.[0]?.gpa || null,
    graduation: analysis.education_entries?.[0]?.graduation || null,
  };
  const keywordRows = (raw.density?.keywords ?? []).map((k) => ({
    keyword: k.keyword || "",
    count: Math.max(0, k.total_count || 0),
    in_context: Math.max(0, k.contextual_count || 0),
    bare_list: Math.max(0, k.bare_count || 0),
  }));
  const keywordStats = {
    total: raw.density?.total_keywords || keywordRows.length,
    in_context: raw.density?.total_contextual || keywordRows.reduce((s, k) => s + k.in_context, 0),
    bare_list: raw.density?.total_bare || keywordRows.reduce((s, k) => s + k.bare_list, 0),
  };
  const vendors = (raw.vendor?.vendors ?? [])
    .slice(0, 4)
    .map((v) => {
      const s = Math.max(0, Math.min(100, Math.round(v.score || 0)));
      return {
        name: vendorName(v.vendor || v.display_name),
        score: s,
        status: vendorStatus(s),
        companies: v.used_by || [],
      };
    });
  while (vendors.length < 4) {
    const fallback = (["Workday", "Greenhouse", "iCIMS", "Lever"] as ATSVendorName[]).find((name) => !vendors.some((v) => v.name === name));
    if (!fallback) break;
    vendors.push({ name: fallback, score: score, status: vendorStatus(score), companies: [] });
  }

  const potential_gain =
    checklist.filter((c) => !c.passed).reduce((sum, c) => sum + (c.potential_pts || 0), 0) +
    issues.reduce((sum, i) => sum + i.potential_pts, 0);

  return {
    score,
    previous_score: raw.previousScore,
    status: statusFromScore(score),
    format_checks: { passed: checklist.filter((c) => c.passed).length, total: checklist.length || 1 },
    fields_parsed: { parsed: parsedCount, total: extracted.length || 1 },
    sections_detected: (analysis.detected_sections || []).length,
    critical_issue_count: issues.filter((i) => i.severity === "critical").length,
    potential_gain,
    score_history: history,
    sections_found: analysis.detected_sections || [],
    sections_missing: analysis.missing_sections || [],
    skills_extracted: analysis.skills_extracted || [],
    contact,
    experience: (analysis.experience_entries || []).map((entry) => {
      const dates = splitDateRange(entry.dates);
      return {
        company: entry.company || "Unknown",
        role: entry.role || null,
        start: dates.start,
        end: dates.end,
        bullet_count: Math.max(0, entry.bullet_count || 0),
      };
    }),
    checklist,
    issues,
    quick_fixes: fixes,
    keyword_placement_pct: Math.max(0, Math.min(100, Math.round((raw.density?.density_score || 0) * 100))),
    keywords: keywordRows,
    keyword_stats: keywordStats,
    vendors,
    dilly_score_commentary: analysis.readiness_summary || `Your ATS score is ${score}.`,
    dilly_trend_commentary: raw.previousScore != null
      ? score >= raw.previousScore ? "Score trend is improving. Keep this momentum." : "Score dipped from your prior scan. Focus critical fixes first."
      : "Run scans after each resume revision to track trend.",
    dilly_keyword_commentary: keywordStats.in_context >= keywordStats.bare_list
      ? "Keyword context is healthy. Keep matching language to your target roles."
      : "More keywords appear in lists than in context. Move key terms into bullets.",
    dilly_vendor_commentary: vendors.some((v) => v.status === "fail")
      ? "At least one vendor may fail parsing. Prioritize fixes in the Issues and Checklist tabs."
      : "Vendor compatibility looks stable across major ATS vendors.",
  };
}

export function ATSProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasAutoRunRef = useRef(false);
  const [user, setUser] = useState<{ email: string; subscribed: boolean } | null>(null);
  const [school, setSchool] = useState<School>(null);
  const [displayAudit, setDisplayAudit] = useState<AuditV2 | null>(null);
  const [atsResult, setAtsResult] = useState<ATSResult | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  /** Only true while network hydration runs; layout does not block on this (instant shell like /career). */
  const [auditLoading, setAuditLoading] = useState(false);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsScanError, setAtsScanError] = useState<string | null>(null);

  const tokenRef = useRef<string | null>(null);

  const theme = useMemo(() => ({ primary: school?.theme?.primary ?? "#C8102E" }), [school]);

  /** Always use a timeout — raw fetch can hang for minutes if the API is down, proxy stalls, or the connection never completes. */
  const fetchAuthed = useCallback(async (path: string, init?: RequestInit, timeoutMs: number = 75_000) => {
    if (!tokenRef.current) throw new Error("Not authenticated.");
    return fetchWithTimeout(
      `${API_BASE}${path}`,
      {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
          ...(init?.headers || {}),
        },
        cache: "no-store",
      },
      timeoutMs
    );
  }, []);

  const buildScanBody = useCallback(async () => {
    const fromAudit = {
      raw_text: displayAudit?.resume_text || displayAudit?.structured_text || "",
      parsed_text: displayAudit?.structured_text || displayAudit?.resume_text || "",
      track: displayAudit?.detected_track || "",
      page_count: displayAudit?.page_count ?? undefined,
    };
    if (fromAudit.raw_text || fromAudit.parsed_text) return fromAudit;
    const resumeRes = await fetchAuthed("/resume-text", undefined, 30_000);
    if (!resumeRes.ok) {
      return fromAudit;
    }
    const resumeData = await resumeRes.json();
    const resumeText = String(resumeData?.resume_text || "").trim();
    return {
      raw_text: resumeText,
      parsed_text: resumeText,
      track: displayAudit?.detected_track || "",
      page_count: displayAudit?.page_count ?? undefined,
    };
  }, [displayAudit?.detected_track, displayAudit?.page_count, displayAudit?.resume_text, displayAudit?.structured_text, fetchAuthed]);

  // Before paint: token + cached user + cached audit (same pattern as main app) so /ats doesn’t flash a full-screen loader.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    tokenRef.current = token;
    if (!token) {
      setAuthLoading(false);
      router.replace("/");
      return;
    }
    try {
      const raw = localStorage.getItem(AUTH_USER_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ts?: number; user?: { email: string; subscribed: boolean } };
      const now = Date.now();
      if (!parsed?.user?.email || !parsed?.ts || now - parsed.ts > AUTH_USER_CACHE_MAX_AGE_MS) return;
      setUser(parsed.user);
      setSchool(getSchoolFromEmail(parsed.user.email));
      try {
        const ar = localStorage.getItem(auditStorageKey(parsed.user.email));
        if (ar) {
          const a = JSON.parse(ar) as AuditV2;
          if (a && typeof a.scores === "object" && typeof a.final_score === "number") {
            setDisplayAudit(a);
          }
        }
      } catch {
        /* ignore */
      }
      setAuthLoading(false);
    } catch {
      /* ignore */
    }
  }, [router]);

  useEffect(() => {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null;
    tokenRef.current = token;
    if (!token) return;
    let cancelled = false;
    const loadUser = async () => {
      const now = Date.now();
      try {
        const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (!res.ok) throw new Error("Auth failed");
        const me = await res.json();
        const meUser = { email: me.email as string, subscribed: !!me.subscribed };
        if (!cancelled) {
          setUser(meUser);
          setSchool(getSchoolFromEmail(meUser.email));
          if (!meUser.subscribed) router.replace("/");
        }
        try {
          localStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify({ ts: now, user: meUser }));
        } catch {
          /* ignore */
        }
      } catch {
        if (!cancelled) router.replace("/");
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    loadUser();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    const loadAudit = async () => {
      setAuditLoading(true);
      let historyRows: Array<{ id?: string; final_score?: number; ts?: number; scores?: AuditV2["scores"] }> = [];
      try {
        const historyRes = await fetchWithTimeout(
          `${API_BASE}/audit/history`,
          {
            headers: { Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json" },
            cache: "no-store",
          },
          15000
        );
        if (!historyRes.ok) throw new Error("History unavailable");
        const historyData = await historyRes.json();
        const rows: typeof historyRows =
          Array.isArray(historyData?.items) ? historyData.items :
          Array.isArray(historyData?.audits) ? historyData.audits :
          [];
        historyRows = rows;
        if (!rows.length) {
          if (!cancelled) {
            try {
              const raw = typeof localStorage !== "undefined" ? localStorage.getItem(auditStorageKey(user?.email)) : null;
              const cached = raw ? (JSON.parse(raw) as AuditV2) : null;
              setDisplayAudit(cached?.id ? cached : null);
            } catch {
              setDisplayAudit(null);
            }
          }
          return;
        }
        const head = rows[0] as Record<string, unknown>;
        const latestId = typeof head?.id === "string" ? head.id.trim() : "";
        const canMinimal =
          head &&
          typeof head.scores === "object" &&
          head.scores !== null &&
          typeof head.final_score === "number" &&
          typeof head.ts === "number";
        const applyMinimal = () => {
          if (!canMinimal || cancelled) return;
          try {
            setDisplayAudit(minimalAuditFromHistorySummary(head as AuditHistorySummaryRow));
          } catch {
            setDisplayAudit(null);
          }
        };
        if (!latestId) {
          if (canMinimal) applyMinimal();
          else if (!cancelled) {
            try {
              const raw = typeof localStorage !== "undefined" ? localStorage.getItem(auditStorageKey(user?.email)) : null;
              const cached = raw ? (JSON.parse(raw) as AuditV2) : null;
              setDisplayAudit(cached?.id ? cached : null);
            } catch {
              setDisplayAudit(null);
            }
          }
          return;
        }
        if (canMinimal) applyMinimal();
        const fullRes = await fetchWithTimeout(
          `${API_BASE}/audit/history/${encodeURIComponent(latestId)}`,
          {
            headers: { Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json" },
            cache: "no-store",
          },
          20000
        );
        if (!fullRes.ok) throw new Error("Audit unavailable");
        const fullData = await fullRes.json();
        const audit = (fullData?.item || fullData?.audit || fullData) as AuditV2;
        if (!cancelled && audit && typeof audit.scores === "object") setDisplayAudit(audit);
      } catch {
        if (!cancelled) {
          const head = historyRows[0] as Record<string, unknown> | undefined;
          const canMinimal =
            head &&
            typeof head.scores === "object" &&
            head.scores !== null &&
            typeof head.final_score === "number" &&
            typeof head.ts === "number";
          if (canMinimal) {
            try {
              setDisplayAudit(minimalAuditFromHistorySummary(head as AuditHistorySummaryRow));
              return;
            } catch { /* fall through */ }
          }
          try {
            const raw = typeof localStorage !== "undefined" ? localStorage.getItem(auditStorageKey(user?.email)) : null;
            const cached = raw ? (JSON.parse(raw) as AuditV2) : null;
            setDisplayAudit(cached?.id ? cached : null);
          } catch {
            setDisplayAudit(null);
          }
        }
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    };
    loadAudit();
    return () => { cancelled = true; };
  }, [authLoading, fetchAuthed, user]);

  const runScan = useCallback(async (opts?: { force?: boolean }) => {
    if (!displayAudit?.id) {
      setAtsScanError("No scored resume on file. Save a resume audit to your profile to run ATS.");
      return;
    }
    if (atsLoading && !opts?.force) return;
    setAtsLoading(true);
    setAtsScanError(null);
    try {
      const scanBody = await buildScanBody();
      if (!scanBody.raw_text && !scanBody.parsed_text) {
        throw new Error("Resume text unavailable for ATS scan.");
      }

      // History + analysis in parallel (saves one RTT). Vendor sim reuses analysis payload (no duplicate run_ats_analysis).
      const [historyBeforeRes, analysisRes] = await Promise.all([
        fetchAuthed("/ats-score/history", undefined, 25_000),
        fetchAuthed("/ats-analysis-from-audit", {
          method: "POST",
          body: JSON.stringify(scanBody),
        }, 95_000),
      ]);

      const historyBeforeData = historyBeforeRes.ok ? await historyBeforeRes.json() : { points: [] };
      const beforeRows: RawHistoryRow[] =
        (Array.isArray(historyBeforeData?.points) ? historyBeforeData.points : Array.isArray(historyBeforeData?.scores) ? historyBeforeData.scores : []);
      const previousScore = beforeRows.length ? Math.round(beforeRows[0]?.score || 0) : null;

      const analysisPayload = await analysisRes.json().catch(() => ({}));
      if (!analysisRes.ok) {
        const detail = (analysisPayload as { detail?: string })?.detail;
        throw new Error(typeof detail === "string" && detail.trim() ? detail : "Scan failed.");
      }
      const analysis = analysisPayload as RawAtsAnalysis;

      const rewriteBullets = (analysis.issues || [])
        .map((i) => (i.line || "").trim())
        .filter(Boolean)
        .slice(0, 10);

      // Record + enrich in parallel; history fetch after record so the new point is included.
      const [, vendorRes, densityRes, rewritesRes] = await Promise.all([
        fetchAuthed("/ats-score/record", {
          method: "POST",
          body: JSON.stringify({ score: Math.round(analysis?.score || 0), audit_id: displayAudit.id }),
        }, 25_000),
        fetchAuthed("/ats-vendor-sim", {
          method: "POST",
          body: JSON.stringify({ ...scanBody, ats_analysis: analysis }),
        }, 75_000),
        fetchAuthed("/ats-keyword-density", { method: "POST", body: JSON.stringify(scanBody) }, 75_000),
        fetchAuthed("/ats-rewrite", {
          method: "POST",
          body: JSON.stringify({
            bullets: rewriteBullets,
            issues: analysis.issues || [],
            track: scanBody.track,
            use_llm: false,
          }),
        }, 75_000),
      ]);

      const historyAfterRes = await fetchAuthed("/ats-score/history", undefined, 25_000);

      const vendor = vendorRes.ok ? ((await vendorRes.json()) as RawVendorSim) : null;
      const density = densityRes.ok ? ((await densityRes.json()) as RawKwDensity) : null;
      const rewrites = rewritesRes.ok ? ((await rewritesRes.json()) as RawAtsRewrites) : null;
      const historyAfterData = historyAfterRes.ok ? await historyAfterRes.json() : { points: [] };
      const historyAfter: RawHistoryRow[] =
        (Array.isArray(historyAfterData?.points) ? historyAfterData.points : Array.isArray(historyAfterData?.scores) ? historyAfterData.scores : []);

      const normalized = normalizeResult({
        analysis,
        vendor,
        density,
        rewrites,
        history: historyAfter,
        previousScore,
      });
      setAtsResult(normalized);
      writeLastAtsScoreCache({
        score: Math.round(normalized.score),
        ts: Date.now(),
        audit_id: displayAudit?.id ?? null,
      });
    } catch (err) {
      const name = typeof err === "object" && err !== null && "name" in err ? String((err as { name: string }).name) : "";
      const message =
        name === "AbortError"
          ? "ATS scan timed out. Check your connection, API URL, or try again."
          : err instanceof Error
            ? err.message
            : "ATS scan failed. Please try again.";
      setAtsScanError(message);
    } finally {
      setAtsLoading(false);
    }
  }, [atsLoading, buildScanBody, displayAudit?.id, fetchAuthed]);

  useEffect(() => {
    if (authLoading || auditLoading) return;
    if (!displayAudit?.id) return;
    const run = searchParams.get("run");
    if (run === "1" && !hasAutoRunRef.current) {
      hasAutoRunRef.current = true;
      void runScan();
    }
  }, [authLoading, auditLoading, displayAudit?.id, runScan, searchParams]);

  const retry = useCallback(async () => {
    await runScan({ force: true });
  }, [runScan]);

  const value = useMemo<ATSContextValue>(() => ({
    user,
    school,
    theme,
    displayAudit,
    atsResult,
    atsLoading,
    authLoading,
    auditLoading,
    atsScanError,
    runScan,
    retry,
  }), [atsLoading, atsResult, atsScanError, auditLoading, authLoading, retry, runScan, school, theme, user, displayAudit]);

  return <ATSContext.Provider value={value}>{children}</ATSContext.Provider>;
}

export function useATSContext() {
  const ctx = useContext(ATSContext);
  if (!ctx) throw new Error("useATSContext must be used inside ATSProvider.");
  return ctx;
}

