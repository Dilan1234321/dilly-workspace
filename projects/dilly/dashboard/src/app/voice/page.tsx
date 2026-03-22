"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DILLY_OPEN_OVERLAY_KEY,
  DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY,
  DILLY_JOB_GAP_VOICE_PROMPT_KEY,
  DILLY_LEADERBOARD_VOICE_PROMPT_KEY,
  DILLY_SCORE_GAP_VOICE_PROMPT_KEY,
  PENDING_VOICE_KEY,
  VOICE_FROM_AUDIT_ID_KEY,
  VOICE_FROM_CERT_HANDOFF_KEY,
} from "@/lib/dillyUtils";
import { rankSuffix } from "@/components/leaderboard/leaderboardTokens";

/**
 * Deep link: `/voice?context=audit&id=<auditId>` → home + Voice overlay with audit context.
 * (Primary app Voice UI is the overlay on `/`, not this route.)
 */
function VoiceRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const context = searchParams.get("context");
    const id = searchParams.get("id");
    if (context === "audit" && id?.trim()) {
      try {
        sessionStorage.setItem(VOICE_FROM_AUDIT_ID_KEY, id.trim());
        sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    if (context === "cert" && id?.trim()) {
      try {
        const raw = sessionStorage.getItem(VOICE_FROM_CERT_HANDOFF_KEY);
        const base = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        sessionStorage.setItem(
          VOICE_FROM_CERT_HANDOFF_KEY,
          JSON.stringify({
            ...base,
            cert_id: id.trim(),
            source: "cert_landing",
          }),
        );
        sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    if (context === "score_gap") {
      const dimension = (searchParams.get("dimension") || "grit").trim().toLowerCase();
      const gap = (searchParams.get("gap") || "").trim();
      const dimLabel = dimension === "smart" ? "Smart" : dimension === "build" ? "Build" : "Grit";
      const prompt = `I'm on my Score screen. My weakest area right now is ${dimLabel}${gap ? ` (about ${gap} points from the bar)` : ""}. Pick up mid-thought: what's the single highest-impact fix I should make to close that gap, grounded in my actual audit? Be specific.`;
      try {
        sessionStorage.setItem(DILLY_SCORE_GAP_VOICE_PROMPT_KEY, prompt);
        sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    if (context === "job_gap") {
      const company = (searchParams.get("company") || "this company").trim() || "this company";
      const dimension = (searchParams.get("dimension") || "grit").trim().toLowerCase();
      const gap = (searchParams.get("gap") || "0").trim() || "0";
      const daysRaw = (searchParams.get("days") || "").trim();
      const dimLabel = dimension === "smart" ? "Smart" : dimension === "build" ? "Build" : "Grit";
      const daysNum = daysRaw === "" ? null : parseInt(daysRaw, 10);
      const deadlineLine =
        daysNum != null && !Number.isNaN(daysNum) && daysNum >= 0
          ? `deadline is in ${daysNum} day${daysNum === 1 ? "" : "s"}`
          : "let's factor in your deadlines";
      const prompt = `For ${company}, your ${dimLabel} is ${gap} pts short. Let's fix that right now — ${deadlineLine}. Pick up mid-thought with one concrete move from my audit.`;
      try {
        sessionStorage.setItem(DILLY_JOB_GAP_VOICE_PROMPT_KEY, prompt);
        sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    if (context === "expand_job_search") {
      try {
        sessionStorage.setItem(
          DILLY_EXPAND_JOB_SEARCH_VOICE_PROMPT_KEY,
          "You've applied to everything I matched for you. Let's find more — what else are you open to?",
        );
        sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    if (context === "leaderboard") {
      const tr = parseInt((searchParams.get("target_rank") || "2").trim(), 10) || 2;
      const gap = (searchParams.get("gap") || "").trim();
      const wk = (searchParams.get("weakest_dim") || "grit").trim().toLowerCase();
      const track = (searchParams.get("track") || "my track").trim();
      const dimLabel = wk === "smart" ? "Smart" : wk === "build" ? "Build" : "Grit";
      const suf = rankSuffix(tr);
      const prompt = `You're ${gap || "a few"} pts from ${tr}${suf} place in ${track} on my peer leaderboard. Your ${dimLabel} dimension is the gap. Pick up mid-thought — what's the one fix that moves my rank this week? Be specific to my audit.`;
      try {
        sessionStorage.setItem(DILLY_LEADERBOARD_VOICE_PROMPT_KEY, prompt);
        sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    const splashVoice: Record<string, string> = {
      deadline_fix:
        "I have a tight deadline and I'm below the competitive bar. What's the fastest high-impact fix from my audit?",
      deadline_prep: "I'm ready to apply soon — give me a crisp prep checklist for this week.",
      momentum: "My score just moved up. What should I double down on to keep the momentum?",
      rejection_analysis: "Help me understand what likely drove a recent rejection and what to change next.",
      apply_now: "I'm in a strong window for applications. What should my sprint look like this week?",
      interview_prep:
        "I have an interview coming up very soon. Run a tight prep: likely questions for my background and 30-second answers.",
    };
    if (context && splashVoice[context]) {
      try {
        sessionStorage.setItem(PENDING_VOICE_KEY, splashVoice[context]);
        sessionStorage.setItem(DILLY_OPEN_OVERLAY_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    router.replace("/?tab=center");
  }, [router, searchParams]);

  return <div className="min-h-screen w-full" style={{ background: "var(--bg)" }} aria-busy="true" />;
}

export default function VoicePage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full" style={{ background: "var(--bg)" }} aria-busy="true" />}>
      <VoiceRedirectInner />
    </Suspense>
  );
}
