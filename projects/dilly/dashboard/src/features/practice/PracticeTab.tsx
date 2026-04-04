"use client";

import React from "react";
import { getEffectiveCohortLabel } from "@/lib/trackDefinitions";
import { hapticLight } from "@/lib/haptics";
import { AppProfileHeader } from "@/components/career-center";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import type { AuditV2 } from "@/types/dilly";
import type { TransitionSource } from "@/lib/dillyPresence";

interface PracticeTabProps {
  openVoiceWithNewChat: (prompt?: string, title?: string, opts?: { initialAssistantMessage?: string; transitionSource?: TransitionSource }) => void;
  openVoiceFromScreen: (screenId: string, prompt?: string, convoTitle?: string) => void;
  profilePhotoUrl: string | null;
  latestAuditRef: React.MutableRefObject<AuditV2 | null>;
}

const VOICE_PRACTICE_ITEMS: { id: string; title: string; prompt: string; icon: React.ReactNode; description: string }[] = [
  {
    id: "bullet-practice",
    title: "Bullet practice",
    prompt: "I want to practice writing a resume bullet. I'll describe an experience and you help me turn it into a strong, quantified bullet. Give me prompts to fill in: what I did, for whom, with what tools, and what the outcome was.",
    icon: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--coral)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>,
    description: "Turn experiences into quantified bullets",
  },
  {
    id: "elevator-pitch",
    title: "60-second pitch",
    prompt: "I need to practice my 60-second elevator pitch. Ask me to record or type it, then give feedback: did I hit my strongest Smart, Grit, and Build evidence? What should I add or cut?",
    icon: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--coral)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>,
    description: "Tell me about yourself — get feedback",
  },
  {
    id: "common-questions",
    title: "Common questions",
    prompt: "Give me 3 common interview questions (e.g. Why this company? Biggest weakness? Tell me about a conflict). For each, I'll answer and you give feedback. Make it specific to my background.",
    icon: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--coral)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>,
    description: "Why this company? Weakness? Conflict?",
  },
  {
    id: "interview-prep",
    title: "Interview prep",
    prompt: "I have an interview coming up. Give me a short interview-day checklist and 3 questions they might ask, with suggested answers based on my resume.",
    icon: <svg className="w-5 h-5 shrink-0" style={{ color: "var(--coral)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg>,
    description: "Checklist + 3 likely questions",
  },
];

export function PracticeTab({ openVoiceWithNewChat, openVoiceFromScreen, profilePhotoUrl, latestAuditRef }: PracticeTabProps) {
  const { appProfile, school } = useAppContext();
  const { audit, savedAuditForCenter } = useAuditScore();
  const { voiceAvatarIndex } = useVoice();

  return (
    <div className="career-center-talent min-h-full w-full" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
      <section className="max-w-[390px] mx-auto pb-40 px-4 min-w-0 overflow-hidden animate-fade-up min-h-full" aria-label="Practice" style={{ background: "var(--bg)" }}>
        <AppProfileHeader
          name={appProfile?.name ?? undefined}
          track={getEffectiveCohortLabel((latestAuditRef.current ?? audit ?? savedAuditForCenter)?.detected_track, appProfile?.track)}
          schoolName={school?.name ?? undefined}
          photoUrl={profilePhotoUrl ?? undefined}
          className="mb-4"
        />
        <header className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--t3)" }}>Rehearsal</p>
          <h1 className="text-[15px] font-semibold" style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}>Practice</h1>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--t3)" }}>Rehearse before the real thing. Score-driven feedback on every answer.</p>
        </header>

        {/* Featured: Mock Interview */}
        <button
          type="button"
          onClick={() => {
            hapticLight();
            openVoiceWithNewChat("Start a mock interview.", "Mock interview");
          }}
          className="w-full rounded-[18px] p-5 mb-5 text-left overflow-hidden transition-opacity hover:opacity-90 active:opacity-80 group"
          style={{ background: "var(--s2)", borderLeft: "4px solid var(--coral)" }}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(255, 69, 58, 0.2)" }}>
              <svg className="w-6 h-6" style={{ color: "var(--coral)" }} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold mb-0.5" style={{ color: "var(--t1)" }}>Mock Interview</h2>
              <p className="text-[11px] leading-relaxed mb-3" style={{ color: "var(--t3)" }}>5 behavioral questions · STAR format · Per-answer scoring</p>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--coral)" }}>
                Start in Dilly AI
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </span>
            </div>
          </div>
        </button>

        {/* More ways to practice */}
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t3)" }}>More ways to practice</p>
        <div className="space-y-4 mb-5">
          {VOICE_PRACTICE_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { hapticLight(); openVoiceWithNewChat(item.prompt); }}
              className="w-full rounded-[18px] p-4 flex items-center gap-4 text-left min-h-[52px] transition-opacity hover:opacity-90 active:opacity-80"
              style={{ background: "var(--s2)", borderLeft: "4px solid var(--coral)" }}
            >
              {item.icon}
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium block" style={{ color: "var(--t2)" }}>{item.title}</span>
                <span className="text-[11px] leading-snug" style={{ color: "var(--t3)" }}>{item.description}</span>
              </div>
              <svg className="w-4 h-4 shrink-0" style={{ color: "var(--t3)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          ))}
        </div>

        {/* Ask Dilly AI */}
        <button
          type="button"
          onClick={() => openVoiceFromScreen("practice", "What should I practice first?")}
          className="w-full rounded-[18px] p-3 flex items-center gap-3 text-left min-h-[48px] transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: "var(--s2)" }}
          title="Ask Dilly AI about this screen"
        >
          <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="sm" className="ring-0 shrink-0" />
          <span className="text-sm font-medium" style={{ color: "var(--t2)" }}>Ask Dilly AI</span>
          <span className="ml-auto text-xs" style={{ color: "var(--t3)" }}>What should I practice first?</span>
        </button>
      </section>
    </div>
  );
}
