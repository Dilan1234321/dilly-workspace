"use client";

import React from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type FirmDeadlineItem = {
  label: string;
  date?: string;
  note: string;
  source: "calendar" | "estimate";
  disclaimer?: string;
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface CompanyPanelProps {
  voiceCompanyInput: string;
  setVoiceCompanyInput: (v: string) => void;
  voiceCompany: string;
  firmDeadlines: FirmDeadlineItem[];
  handleCompanySet: (company: string) => void;
  setVoiceCompanyPanelOpen: (open: boolean) => void;
  voiceCompanyInputRef: React.RefObject<HTMLInputElement | null>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CompanyPanel({
  voiceCompanyInput,
  setVoiceCompanyInput,
  voiceCompany,
  firmDeadlines,
  handleCompanySet,
  setVoiceCompanyPanelOpen,
  voiceCompanyInputRef,
}: CompanyPanelProps) {
  return (
    <div className="voice-chat-container mb-3 p-3.5 cal-drawer">
      <p className="text-slate-400 text-xs font-semibold mb-2">
        Target company / firm
      </p>
      <p className="text-slate-600 text-[11px] mb-2.5">
        Dilly will tailor all advice to this company&apos;s hiring culture and
        what they value.
      </p>
      <div className="flex gap-2">
        <input
          ref={voiceCompanyInputRef}
          type="text"
          value={voiceCompanyInput}
          onChange={(e) => setVoiceCompanyInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCompanySet(voiceCompanyInput);
            if (e.key === "Escape") setVoiceCompanyPanelOpen(false);
          }}
          placeholder="E.g. Goldman Sachs, Google, McKinsey\u2026"
          className="voice-input-field flex-1 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
        />
        <button
          type="button"
          onClick={() => handleCompanySet(voiceCompanyInput)}
          className="voice-send-btn text-white text-xs font-medium px-4 py-2"
        >
          Set
        </button>
        {voiceCompany && (
          <button
            type="button"
            onClick={() => handleCompanySet("")}
            className="text-slate-600 hover:text-red-400 text-xs px-2 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      {firmDeadlines.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest">
            Known deadlines
          </p>
          {firmDeadlines.map((fd, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {fd.source === "calendar" ? (
                <svg
                  className="w-3 h-3 mt-0.5 shrink-0 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                  />
                </svg>
              ) : (
                <svg
                  className="w-3 h-3 mt-0.5 shrink-0 text-yellow-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
              )}
              <div>
                <p className="text-slate-300">
                  {fd.label}
                  {fd.date ? (
                    <span className="text-slate-500 ml-1">
                      {"\u00b7"} {fd.date}
                    </span>
                  ) : null}
                </p>
                {fd.note && <p className="text-slate-600">{fd.note}</p>}
                {fd.source === "estimate" &&
                  fd.disclaimer &&
                  i ===
                    firmDeadlines.findIndex(
                      (x) => x.source === "estimate",
                    ) && (
                    <p className="text-slate-700 italic mt-1">
                      {fd.disclaimer}
                    </p>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
