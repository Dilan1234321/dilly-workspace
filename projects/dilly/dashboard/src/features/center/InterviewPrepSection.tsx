"use client";

import React from "react";
import { ChevronRight } from "lucide-react";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";

import { useVoice } from "@/contexts/VoiceContext";

import { hapticLight } from "@/lib/haptics";

export interface InterviewPrepSectionProps {
  theme: { primary: string; secondary: string; backgroundTint?: string; primaryContrast?: string };
  openVoiceWithNewChat: (prompt?: string, convoTitle?: string, opts?: { initialAssistantMessage?: string }) => void;
  // Interview prep
  interviewPrepEvidenceOpen: boolean;
  setInterviewPrepEvidenceOpen: React.Dispatch<React.SetStateAction<boolean>>;
  interviewPrepEvidence: { dimensions: { name: string; question: string; strategy: string; script: string }[] } | null;
  interviewPrepEvidenceLoading: boolean;
  // Cover letter
  coverLetterOpen: boolean;
  setCoverLetterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  coverLetterResult: { cover_openers: string[]; outreach_hooks: string[] } | null;
  coverLetterLoading: boolean;
  // Gap scan
  gapScanOpen: boolean;
  setGapScanOpen: React.Dispatch<React.SetStateAction<boolean>>;
  gapScanResult: { gaps: { gap: string; dimension: string; severity: string; fix: string; impact: string }[]; overall_readiness: string; readiness_summary: string } | null;
  gapScanLoading: boolean;
  handleGapScan: () => Promise<void>;
}

export function InterviewPrepSection(props: InterviewPrepSectionProps) {
  const {
    theme,
    openVoiceWithNewChat,
    interviewPrepEvidenceOpen,
    setInterviewPrepEvidenceOpen,
    interviewPrepEvidence,
    interviewPrepEvidenceLoading,
    coverLetterOpen,
    setCoverLetterOpen,
    coverLetterResult,
    coverLetterLoading,
    gapScanOpen,
    setGapScanOpen,
    gapScanResult,
    gapScanLoading,
    handleGapScan,
  } = props;

  const { voiceAvatarIndex } = useVoice();

  return (
    <>
      {interviewPrepEvidenceOpen && (
        <div className="mb-4 rounded-[18px] border p-4 min-w-0 overflow-hidden" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--t1)" }}>Interview prep from your evidence</p>
              <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "var(--t3)" }}>
                <span className="font-cinzel" style={{ color: "var(--te-gold)" }}>Smart</span>,{" "}
                <span className="font-cinzel" style={{ color: "var(--te-gold)" }}>Grit</span>,{" "}
                <span className="font-cinzel" style={{ color: "var(--te-gold)" }}>Build</span>
                {" "}\u2014 tap a section to expand
              </p>
            </div>
            <button
              type="button"
              onClick={() => { hapticLight(); setInterviewPrepEvidenceOpen(false); }}
              className="p-2 rounded-lg transition-colors shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
              style={{ color: "var(--t3)" }}
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {interviewPrepEvidenceLoading ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary }} />
              <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "200ms" }} />
              <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "400ms" }} />
              <span className="text-xs ml-1" style={{ color: "var(--t3)" }}>Generating from your resume\u2026</span>
            </div>
          ) : interviewPrepEvidence?.dimensions?.length ? (
            <div className="space-y-2 min-w-0">
              {interviewPrepEvidence.dimensions.map((dim, i) => (
                <details
                  key={i}
                  className="rounded-[14px] border min-w-0 overflow-hidden open:[&_summary_.evidence-dim-chevron]:rotate-90"
                  style={{ borderColor: "var(--b1)", background: "var(--s1)" }}
                >
                  <summary className="flex min-h-[48px] items-center justify-between gap-2 px-3 py-2.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                    <span className="text-sm font-semibold text-left font-cinzel" style={{ color: "var(--t1)" }}>{dim.name}</span>
                    <ChevronRight className="evidence-dim-chevron w-4 h-4 shrink-0 transition-transform duration-200" style={{ color: "var(--t3)" }} aria-hidden />
                  </summary>
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t min-w-0" style={{ borderColor: "var(--b1)" }}>
                    <details className="rounded-lg border min-w-0 overflow-hidden open:[&_summary_.evidence-sub-chevron]:rotate-90" style={{ borderColor: "var(--b1)", background: "var(--s2)" }}>
                      <summary className="flex min-h-[44px] items-center justify-between gap-2 px-2.5 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--t3)" }}>Question</span>
                        <ChevronRight className="evidence-sub-chevron w-3.5 h-3.5 shrink-0 transition-transform duration-200" style={{ color: "var(--t3)" }} aria-hidden />
                      </summary>
                      <p className="text-sm px-2.5 pb-2.5 leading-relaxed" style={{ color: "var(--t2)" }}>{dim.question}</p>
                    </details>
                    <details className="rounded-lg border min-w-0 overflow-hidden open:[&_summary_.evidence-sub-chevron]:rotate-90" style={{ borderColor: "var(--b1)", background: "var(--s2)" }}>
                      <summary className="flex min-h-[44px] items-center justify-between gap-2 px-2.5 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--t3)" }}>Strategy</span>
                        <ChevronRight className="evidence-sub-chevron w-3.5 h-3.5 shrink-0 transition-transform duration-200" style={{ color: "var(--t3)" }} aria-hidden />
                      </summary>
                      <p className="text-xs px-2.5 pb-2.5 leading-relaxed" style={{ color: "var(--t2)" }}>{dim.strategy}</p>
                    </details>
                    <details className="rounded-lg border min-w-0 overflow-hidden open:[&_summary_.evidence-sub-chevron]:rotate-90" style={{ borderColor: "var(--b1)", background: "var(--s2)" }}>
                      <summary className="flex min-h-[44px] items-center justify-between gap-2 px-2.5 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--t3)" }}>30-second script</span>
                        <ChevronRight className="evidence-sub-chevron w-3.5 h-3.5 shrink-0 transition-transform duration-200" style={{ color: "var(--t3)" }} aria-hidden />
                      </summary>
                      <p className="text-xs px-2.5 pb-2.5 leading-relaxed italic" style={{ color: "var(--t2)" }}>&quot;{dim.script}&quot;</p>
                    </details>
                    <button
                      type="button"
                      onClick={() => {
                        hapticLight();
                        openVoiceWithNewChat(`I need to practice this answer for: "${dim.question}" My script: ${dim.script}. Give me feedback and a stronger version.`);
                      }}
                      className="w-full text-[11px] font-medium px-3 py-2.5 rounded-xl border min-h-[44px] inline-flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                      style={{ borderColor: "var(--b2)", color: "var(--t2)" }}
                    >
                      <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="ring-0 shrink-0" />
                      Practice with Dilly AI
                    </button>
                  </div>
                </details>
              ))}
            </div>
          ) : !interviewPrepEvidenceLoading && interviewPrepEvidence ? (
            <p className="text-sm" style={{ color: "var(--t3)" }}>No dimensions generated. Try again in a moment.</p>
          ) : null}
        </div>
      )}
      {coverLetterOpen && (
        <div className="mb-4 rounded-[18px] border p-4 min-w-0 overflow-hidden" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-semibold" style={{ color: "var(--t1)" }}>Cover letter lines</p>
            <button
              type="button"
              onClick={() => { hapticLight(); setCoverLetterOpen(false); }}
              className="p-2 rounded-lg transition-colors shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
              style={{ color: "var(--t3)" }}
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {coverLetterLoading ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary }} />
              <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "200ms" }} />
              <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "400ms" }} />
              <span className="text-xs ml-1" style={{ color: "var(--t3)" }}>Generating lines\u2026</span>
            </div>
          ) : coverLetterResult ? (
            <div className="space-y-4">
              {coverLetterResult.cover_openers?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>Cover letter openers</p>
                  <div className="space-y-2">
                    {coverLetterResult.cover_openers.map((line, i) => (
                      <div key={i} className="p-3 rounded-[14px] border text-xs leading-relaxed" style={{ borderColor: "var(--b1)", background: "var(--s1)", color: "var(--t2)" }}>{line}</div>
                    ))}
                  </div>
                </div>
              )}
              {coverLetterResult.outreach_hooks?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>LinkedIn / email hooks</p>
                  <div className="space-y-2">
                    {coverLetterResult.outreach_hooks.map((line, i) => (
                      <div key={i} className="p-3 rounded-[14px] border text-xs leading-relaxed" style={{ borderColor: "var(--b1)", background: "var(--s1)", color: "var(--t2)" }}>{line}</div>
                    ))}
                  </div>
                </div>
              )}
              {(!coverLetterResult.cover_openers?.length && !coverLetterResult.outreach_hooks?.length) && (
                <p className="text-sm" style={{ color: "var(--t3)" }}>Could not generate lines. Try again.</p>
              )}
            </div>
          ) : null}
        </div>
      )}
      {gapScanOpen && (
        <div className="mb-4 rounded-[18px] border p-4 min-w-0 overflow-hidden" style={{ background: "var(--s2)", borderColor: "var(--b1)" }}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-semibold" style={{ color: "var(--t1)" }}>Gap analysis</p>
            <button
              type="button"
              onClick={() => { hapticLight(); setGapScanOpen(false); }}
              className="p-2 rounded-lg transition-colors shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center"
              style={{ color: "var(--t3)" }}
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {gapScanLoading ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary }} />
              <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "200ms" }} />
              <span className="w-1.5 h-1.5 rounded-full voice-typing-dot" style={{ backgroundColor: theme.primary, animationDelay: "400ms" }} />
              <span className="text-xs ml-1" style={{ color: "var(--t3)" }}>Scanning your profile\u2026</span>
            </div>
          ) : gapScanResult ? (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    background: gapScanResult.overall_readiness === "ready" ? "var(--bdim)" : gapScanResult.overall_readiness === "stretch" ? "var(--adim)" : "var(--s3)",
                    color: "var(--t1)",
                  }}
                >
                  {gapScanResult.overall_readiness === "ready" ? "Ready" : gapScanResult.overall_readiness === "stretch" ? "Stretch" : "Not yet"}
                </span>
                {gapScanResult.readiness_summary ? (
                  <p className="text-xs flex-1 min-w-0" style={{ color: "var(--t3)" }}>{gapScanResult.readiness_summary}</p>
                ) : null}
              </div>
              <div className="space-y-2.5">
                {gapScanResult.gaps.map((gap, i) => (
                  <div key={i} className="p-3 rounded-[14px] border min-w-0" style={{ borderColor: "var(--b1)", background: "var(--s1)" }}>
                    <div className="flex items-start gap-2">
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 mt-0.5" style={{ background: "var(--s3)", color: "var(--t3)" }}>{gap.severity}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium mb-1" style={{ color: "var(--t1)" }}>{gap.gap}</p>
                        <p className="text-xs leading-relaxed" style={{ color: "var(--t2)" }}>{gap.fix}</p>
                        {gap.impact ? <p className="text-xs mt-1" style={{ color: "var(--blue)" }}>{gap.impact}</p> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { hapticLight(); void handleGapScan(); }}
                className="mt-3 text-xs font-medium transition-opacity hover:opacity-90"
                style={{ color: "var(--blue)" }}
              >
                Re-scan
              </button>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
