"use client";

import { useState } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type AuditV2 = {
  candidate_name: string;
  detected_track: string;
  major: string;
  scores: { smart: number; grit: number; build: number };
  final_score: number;
  audit_findings: string[];
  evidence: Record<string, string>;
  recommendations: { title: string; action: string }[];
  raw_logs: string[];
};

export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [audit, setAudit] = useState<AuditV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");

  const testConnection = async () => {
    setConnectionStatus("checking");
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setConnectionStatus("ok");
        return data;
      }
      throw new Error(res.statusText);
    } catch (e) {
      setConnectionStatus("fail");
      throw e;
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/audit/v2`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        const msg = typeof err?.detail === "string" ? err.detail : "Audit failed";
        throw new Error(msg);
      }
      const data: AuditV2 = await res.json();
      setAudit(data);
    } catch (err) {
      const message =
        err instanceof TypeError && err.message === "Failed to fetch"
          ? "Cannot reach backend. Is the API running? (Start it from repo root: python -m uvicorn projects.meridian.api.main:app --host 0.0.0.0 --port 8000)"
          : err instanceof Error
            ? err.message
            : "Upload failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const radarData = audit
    ? [
        { subject: "Smart", score: audit.scores.smart, fullMark: 100 },
        { subject: "Grit", score: audit.scores.grit, fullMark: 100 },
        { subject: "Build", score: audit.scores.build, fullMark: 100 },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#0c1222] text-slate-100 p-6 md:p-8 font-sans">
      <header className="mb-10 border-b border-slate-700/60 pb-6 flex flex-wrap justify-between items-end gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-emerald-400">
            MERIDIAN <span className="text-slate-200">AI</span>
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm font-medium">
            High-Velocity Talent Infrastructure · Ground Truth V6.5
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={testConnection}
            disabled={connectionStatus === "checking"}
            className="px-4 py-2 rounded-lg border border-slate-600 hover:border-emerald-500/50 hover:bg-emerald-500/10 text-sm font-medium text-slate-300 hover:text-emerald-400 transition-colors disabled:opacity-50"
          >
            {connectionStatus === "checking"
              ? "Checking…"
              : connectionStatus === "ok"
                ? "Connected"
                : connectionStatus === "fail"
                  ? "Retry connection"
                  : "Test connection"}
          </button>
          {connectionStatus === "ok" && (
            <span className="text-xs text-emerald-400 font-mono">localhost:8000 OK</span>
          )}
          {connectionStatus === "fail" && (
            <span className="text-xs text-red-400 font-mono">Backend unreachable</span>
          )}
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-600">
            Thursday MVP · CTO Dashboard
          </span>
        </div>
      </header>

      {!audit ? (
        <div className="max-w-xl mx-auto mt-16">
          <div className="border-2 border-dashed border-slate-700 rounded-2xl p-16 text-center hover:border-emerald-500/50 transition-colors cursor-pointer group bg-slate-900/30">
            <input
              type="file"
              className="hidden"
              id="fileInput"
              accept=".pdf,.docx"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setError(null);
              }}
            />
            <label htmlFor="fileInput" className="cursor-pointer block">
              <div className="bg-emerald-500/10 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
                <svg
                  className="w-10 h-10 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <p className="text-lg font-semibold text-slate-200 mb-1">
                {file ? file.name : "Drop PDF or DOCX"}
              </p>
              <p className="text-slate-500 text-sm">
                Upload a PDF or DOCX resume to run the Meridian Auditor (Vantage Alpha).
              </p>
            </label>
          </div>
          {error && (
            <p className="mt-4 text-center text-red-400 text-sm">{error}</p>
          )}
          {file && (
            <button
              onClick={handleUpload}
              disabled={loading}
              className="w-full mt-6 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-all shadow-lg shadow-emerald-900/20"
            >
              {loading ? "AUDITING…" : "RUN AUDIT"}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-8 shadow-xl">
              <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-slate-100">{audit.candidate_name}</h2>
                  <p className="text-emerald-400 font-mono text-xs uppercase tracking-widest mt-1">
                    {audit.detected_track} · {audit.major}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-emerald-500/15 text-emerald-400 px-4 py-1.5 rounded-full text-sm font-semibold border border-emerald-500/30">
                    Final {audit.final_score}
                  </span>
                </div>
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top: 24, right: 24, bottom: 24, left: 24 }}>
                    <PolarGrid stroke="rgba(148, 163, 184, 0.2)" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: "rgb(148, 163, 184)", fontSize: 12 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: "rgb(100, 116, 139)", fontSize: 10 }}
                    />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="rgb(52, 211, 153)"
                      fill="rgb(52, 211, 153)"
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgb(15, 23, 42)",
                        border: "1px solid rgb(51, 65, 85)",
                        borderRadius: "8px",
                      }}
                      labelStyle={{ color: "rgb(203, 213, 225)" }}
                      formatter={(value: number) => [value.toFixed(1), "Score"]}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-center text-slate-500 text-xs mt-2">
                Smart · Grit · Build (0–100)
              </p>
            </div>

            <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-8 shadow-xl">
              <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-6">
                Audit Findings
              </h3>
              <ul className="space-y-3">
                {audit.audit_findings.map((finding, idx) => (
                  <li
                    key={idx}
                    className="flex gap-3 p-4 rounded-xl bg-slate-950/60 border border-slate-700/40"
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-mono">
                      {idx + 1}
                    </span>
                    <span className="text-sm text-slate-300 leading-relaxed">{finding}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-8 shadow-xl">
              <h3 className="text-xs font-mono text-emerald-400 uppercase tracking-widest mb-6">
                Tier-1 Recommendations
              </h3>
              <div className="space-y-5">
                {audit.recommendations.map((rec, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <span className="text-sm font-semibold text-slate-200">{rec.title}</span>
                    <p className="text-xs text-slate-400 leading-relaxed">{rec.action}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-700/60 rounded-2xl p-8 shadow-xl">
              <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-4">
                Evidence
              </h3>
              <div className="space-y-3 font-mono text-xs text-slate-400">
                {Object.entries(audit.evidence).map(([key, val]) => (
                  <div key={key}>
                    <span className="text-emerald-500/80">{key}:</span> {val}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-700/40 rounded-2xl p-6">
              <h3 className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-3">
                Log
              </h3>
              <div className="space-y-2 font-mono text-[10px] text-slate-500">
                {audit.raw_logs.map((log, idx) => (
                  <div key={idx}>{log}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {audit && (
        <button
          onClick={() => setAudit(null)}
          className="fixed bottom-8 right-8 bg-slate-800 hover:bg-slate-700 text-slate-300 p-4 rounded-full transition-colors shadow-xl border border-slate-700"
          aria-label="New audit"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}
    </div>
  );
}
