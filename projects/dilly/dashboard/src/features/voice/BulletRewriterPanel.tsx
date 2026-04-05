"use client";

import React from "react";
import { LoaderOne } from "@/components/ui/loader-one";
import type { SchoolTheme } from "@/lib/schools";

export interface BulletRewriterPanelProps {
  theme: SchoolTheme;
  bulletInput: string;
  setBulletInput: (v: string) => void;
  bulletRewritten: string;
  setBulletRewritten: (v: string) => void;
  bulletLoading: boolean;
  bulletHistory: { original: string; versions: string[] };
  setBulletHistory: (v: { original: string; versions: string[] }) => void;
  setBulletRewriterOpen: (v: boolean) => void;
  handleBulletRewrite: (instruction?: string) => void;
  displayAudit: Record<string, unknown> | null;
}

export function BulletRewriterPanel({
  theme,
  bulletInput,
  setBulletInput,
  bulletRewritten,
  setBulletRewritten,
  bulletLoading,
  bulletHistory,
  setBulletHistory,
  setBulletRewriterOpen,
  handleBulletRewrite,
  displayAudit,
}: BulletRewriterPanelProps) {
  return (
    <div className="voice-chat-container mb-3 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="voice-avatar w-7 h-7 rounded-full flex items-center justify-center shrink-0">
            <span
              className="text-[10px] font-bold"
              style={{ color: theme.primary }}
            >
              M
            </span>
          </div>
          <p className="text-slate-200 text-sm font-semibold">Bullet Rewriter</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setBulletRewriterOpen(false);
            setBulletRewritten("");
            setBulletHistory({ original: "", versions: [] });
          }}
          className="text-slate-600 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-white/5"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <p className="text-slate-500 text-[12px] mb-3 leading-relaxed">
        Paste a resume bullet. Dilly will rewrite it based on your audit, without
        changing the facts.
      </p>
      <textarea
        value={bulletInput}
        onChange={(e) => setBulletInput(e.target.value)}
        placeholder="Paste Your Resume Bullet Here\u2026"
        rows={3}
        className="voice-input-field w-full px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 resize-none mb-3"
      />
      {bulletRewritten && (
        <div className="mb-3">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 mb-1.5">
                Before
              </p>
              <div
                className="px-3 py-2.5 m-rounded-card text-slate-500 text-xs leading-relaxed"
                style={{
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.12)",
                }}
              >
                {bulletHistory.original || bulletInput}
              </div>
            </div>
            <div>
              <p
                className="text-[9px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: theme.primary }}
              >
                After
              </p>
              <div
                className="px-3 py-2.5 m-rounded-card text-slate-200 text-xs leading-relaxed select-all"
                style={{
                  background: `rgba(200,16,46,0.08)`,
                  border: `1px solid rgba(200,16,46,0.2)`,
                }}
              >
                {bulletRewritten}
              </div>
            </div>
          </div>
          {(() => {
            const dimKey = (displayAudit as { recommendations?: Array<Record<string, unknown>> })
              ?.recommendations?.find(
                (r) =>
                  typeof r === "object" &&
                  r !== null &&
                  (
                    (r as { current_line?: string | null }).current_line || ""
                  )
                    .toLowerCase()
                    .includes(bulletInput.slice(0, 30).toLowerCase()),
              )?.score_target;
            if (!dimKey) return null;
            return (
              <p className="text-[11px] mb-2" style={{ color: theme.primary }}>
                This strengthens your{" "}
                {(dimKey as string).charAt(0).toUpperCase() +
                  (dimKey as string).slice(1)}{" "}
                signal.
              </p>
            );
          })()}
          {bulletHistory.versions.length > 1 && (
            <div className="mb-2">
              <p className="text-slate-600 text-[10px] font-medium uppercase tracking-widest mb-1.5">
                Previous versions
              </p>
              <div className="space-y-1.5">
                {bulletHistory.versions.slice(0, -1).map((v, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 rounded-lg text-slate-500 text-[12px] leading-relaxed"
                    style={{ background: "rgba(255,255,255,0.03)" }}
                  >
                    {v}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {[
              "Make it shorter",
              "Add more numbers",
              "Stronger action verb",
              "Less jargon",
            ].map((inst) => (
              <button
                key={inst}
                type="button"
                onClick={() => handleBulletRewrite(inst)}
                disabled={bulletLoading}
                className="voice-suggestion-chip text-[11.5px] px-3 py-1 text-slate-400 hover:text-slate-200"
              >
                {inst}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => handleBulletRewrite()}
        disabled={bulletLoading || !bulletInput.trim()}
        className="voice-send-btn text-white text-sm font-medium px-5 py-2 w-full flex items-center justify-center gap-2"
      >
        {bulletLoading ? (
          <LoaderOne color="white" size={8} />
        ) : (
          <>{bulletRewritten ? "Rewrite again" : "Rewrite this bullet"}</>
        )}
      </button>
    </div>
  );
}
