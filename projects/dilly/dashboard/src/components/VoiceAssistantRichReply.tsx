"use client";

import * as React from "react";
import { VoiceFormattedText } from "@/components/VoiceFormattedText";
import { VoiceTypewriterText } from "@/components/VoiceTypewriterText";
import { VoiceInlineScoresVisual, type VoiceScoresTriple } from "@/components/VoiceInlineScoresVisual";
import { VoiceBeforeAfterVisual } from "@/components/voice-visuals/VoiceBeforeAfterVisual";
import { VoiceDeadlineTimelineVisual } from "@/components/voice-visuals/VoiceDeadlineTimelineVisual";
import { VoiceFactChipsVisual } from "@/components/voice-visuals/VoiceFactChipsVisual";
import { VoiceInterviewAgendaVisual } from "@/components/voice-visuals/VoiceInterviewAgendaVisual";
import { VoiceStepsVisual } from "@/components/voice-visuals/VoiceStepsVisual";
import { VoiceTopRecsVisual } from "@/components/voice-visuals/VoiceTopRecsVisual";
import { VoiceCalendarSavedVisual } from "@/components/voice-visuals/VoiceCalendarSavedVisual";
import { VoiceApplicationCardVisual } from "@/components/voice-visuals/VoiceApplicationCardVisual";
import { VoiceNextMovesVisual } from "@/components/voice-visuals/VoiceNextMovesVisual";
import { VoiceStoryTimelineVisual } from "@/components/voice-visuals/VoiceStoryTimelineVisual";
import { VoicePeerContextVisual } from "@/components/voice-visuals/VoicePeerContextVisual";
import type { DillyVoiceChatScoresBundle, VoiceApplicationPreview, VoiceVisualSegment } from "@/lib/voiceVisualTypes";
import {
  assistantMessageSuggestsCalendarSavedVisual,
  assistantMessageSuggestsDeadlineTimelineVisual,
  assistantMessageSuggestsInterviewAgendaStrip,
  assistantMessageSuggestsScoreBreakdown,
  extractCalendarSavedSummaryLine,
  parseVoiceVisualSegments,
  stripVoiceVisualArtifacts,
  voiceReplyShouldDisableTypewriter,
} from "@/lib/voiceMessageVisuals";
import { rawVoiceTextRequestsScoresVisual } from "@/lib/voiceScoreVisual";
import { cleanVoiceAssistantGlitchArtifacts, stripVoiceAssistantSpeakerPrefix } from "@/lib/voiceReplySanitize";
import { healEmptyVoiceDimensionTags } from "@/lib/voiceDimensionMarkup";
import {
  VoiceDedupVisualHost,
  useVoiceVisualDedup,
  type VoiceDedupKind,
} from "@/components/VoiceChatVisualDedup";

function dedupKindForSegment(seg: VoiceVisualSegment): VoiceDedupKind | null {
  switch (seg.type) {
    case "scores_visual":
      return "scores";
    case "interview_agenda_visual":
      return "agenda";
    case "deadline_timeline_visual":
      return "deadline";
    case "top_recs_visual":
      return "top_recs";
    case "calendar_saved_visual":
      return "calendar_saved";
    case "application_card_visual":
      return "application";
    case "next_moves_visual":
      return "next_moves";
    case "story_timeline_visual":
      return "story_timeline";
    case "peer_context_visual":
      return "peer_context";
    default:
      return null;
  }
}

function normCompany(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function enrichApplicationFromPreview(
  seg: { company: string; role?: string; status?: string; deadline?: string },
  previews: VoiceApplicationPreview[] | undefined,
): { company: string; role?: string; status?: string; deadline?: string } {
  if (!previews?.length) return seg;
  const n = normCompany(seg.company);
  const hit = previews.find(
    (a) =>
      normCompany(a.company) === n ||
      normCompany(a.company).includes(n) ||
      n.includes(normCompany(a.company)),
  );
  if (!hit) return seg;
  return {
    company: seg.company || hit.company,
    role: seg.role || hit.role,
    status: seg.status || hit.status,
    deadline: seg.deadline || hit.deadline || undefined,
  };
}

export function VoiceAssistantRichReply({
  rawContent,
  voiceScores,
  priorUserContent,
  useTypewriter,
  cursorColor = "var(--m-accent)",
  onTypewriterProgress,
  /** Index of this assistant row in the chat list; -1 = dedup disabled. */
  messageListIndex = -1,
}: {
  rawContent: string;
  voiceScores?: DillyVoiceChatScoresBundle | null;
  /** Previous message if it was the user — improves healing when the model writes **Your score** without tags. */
  priorUserContent?: string | null;
  useTypewriter?: boolean;
  cursorColor?: string;
  onTypewriterProgress?: () => void;
  messageListIndex?: number;
}) {
  const visualDedup = useVoiceVisualDedup();
  let rawContentStripped = cleanVoiceAssistantGlitchArtifacts(stripVoiceAssistantSpeakerPrefix(rawContent));
  const triple: VoiceScoresTriple | null =
    voiceScores != null && voiceScores.scoresAuthoritative !== false
      ? { smart: voiceScores.smart, grit: voiceScores.grit, build: voiceScores.build }
      : null;
  rawContentStripped = healEmptyVoiceDimensionTags(rawContentStripped, triple, { priorUserContent });
  const finalScore = voiceScores?.final ?? null;
  const prevScores = voiceScores?.prevScores ?? null;
  const recommendations = voiceScores?.recommendations;
  const deadlines = voiceScores?.deadlines;

  const injectScores =
    triple != null &&
    !rawVoiceTextRequestsScoresVisual(rawContentStripped) &&
    assistantMessageSuggestsScoreBreakdown(rawContentStripped);

  const hasDeadlineData = Boolean(deadlines?.length);
  let injectDeadlineTimeline = assistantMessageSuggestsDeadlineTimelineVisual(rawContentStripped, hasDeadlineData);
  let injectInterviewAgenda = assistantMessageSuggestsInterviewAgendaStrip(rawContentStripped);
  let injectCalendarSaved = assistantMessageSuggestsCalendarSavedVisual(rawContentStripped);
  if (injectDeadlineTimeline) injectInterviewAgenda = false;
  // Score overview: don't stack deadline strip or interview strip (avoids agenda/calendar word salad in score replies)
  if (injectScores) {
    injectDeadlineTimeline = false;
    injectInterviewAgenda = false;
    injectCalendarSaved = false;
  }
  if (injectCalendarSaved) {
    injectDeadlineTimeline = false;
    injectInterviewAgenda = false;
  }

  let rawForParse = rawContentStripped;
  if (injectScores) rawForParse = `[[scores_visual]]\n${rawForParse}`;
  if (injectDeadlineTimeline) rawForParse = `[[deadline_timeline_visual]]\n${rawForParse}`;
  if (injectInterviewAgenda) rawForParse = `[[interview_agenda_visual]]\n${rawForParse}`;
  if (injectCalendarSaved) {
    const line = extractCalendarSavedSummaryLine(rawContentStripped);
    rawForParse = `[[calendar_saved]]\n${line}\n[[/calendar_saved]]\n${rawForParse}`;
  }
  const segments = parseVoiceVisualSegments(rawForParse);
  const stripped = stripVoiceVisualArtifacts(rawContentStripped);

  const disableTypewriter = voiceReplyShouldDisableTypewriter(rawContentStripped, injectScores, hasDeadlineData);
  const effectiveTw = Boolean(useTypewriter && !disableTypewriter);

  const hasNonTextSegment = segments.some((s) => s.type !== "text");
  const singleTextOnly =
    segments.length === 1 &&
    segments[0]!.type === "text" &&
    !injectScores &&
    !injectDeadlineTimeline &&
    !injectInterviewAgenda &&
    !injectCalendarSaved &&
    !hasNonTextSegment;

  if (singleTextOnly) {
    if (effectiveTw) {
      return (
        <VoiceTypewriterText
          fullText={stripped}
          cursorColor={cursorColor}
          onProgress={onTypewriterProgress}
        />
      );
    }
    return <VoiceFormattedText content={stripped} />;
  }

  const ctx = {
    triple,
    finalScore,
    prevScores,
    recommendations,
    deadlines,
    applicationsPreview: voiceScores?.applications_preview,
    peerPercentiles: voiceScores?.peer_percentiles ?? null,
    cohortTrack: voiceScores?.cohort_track ?? null,
  };

  return (
    <div className="flex flex-col gap-2 w-full min-w-0">
      {segments.map((seg, idx) => {
        const kind = dedupKindForSegment(seg);
        const node = renderSegment(seg, idx, ctx);
        if (!kind || messageListIndex < 0 || !visualDedup) return <React.Fragment key={idx}>{node}</React.Fragment>;
        const allow = visualDedup.shouldShow(messageListIndex, kind);
        return (
          <VoiceDedupVisualHost key={idx} kind={kind} messageIndex={messageListIndex} show={allow}>
            {allow ? node : null}
          </VoiceDedupVisualHost>
        );
      })}
    </div>
  );
}

function renderSegment(
  seg: VoiceVisualSegment,
  key: number,
  ctx: {
    triple: VoiceScoresTriple | null;
    finalScore: number | null;
    prevScores: VoiceScoresTriple | null;
    recommendations: DillyVoiceChatScoresBundle["recommendations"];
    deadlines: DillyVoiceChatScoresBundle["deadlines"];
    applicationsPreview?: VoiceApplicationPreview[];
    peerPercentiles: { smart?: number; grit?: number; build?: number } | null;
    cohortTrack: string | null;
  },
) {
  switch (seg.type) {
    case "text": {
      if (!seg.content.trim()) return null;
      return (
        <div key={key} className="min-w-0">
          <VoiceFormattedText content={seg.content} />
        </div>
      );
    }
    case "scores_visual": {
      if (!ctx.triple) return null;
      return (
        <VoiceInlineScoresVisual
          key={key}
          scores={ctx.triple}
          finalScore={ctx.finalScore}
          prevScores={ctx.prevScores}
        />
      );
    }
    case "top_recs_visual": {
      if (!ctx.recommendations?.length) return null;
      return <VoiceTopRecsVisual key={key} items={ctx.recommendations} />;
    }
    case "deadline_timeline_visual": {
      if (!ctx.deadlines?.length) return null;
      return <VoiceDeadlineTimelineVisual key={key} deadlines={ctx.deadlines} />;
    }
    case "interview_agenda_visual":
      return <VoiceInterviewAgendaVisual key={key} highlightStep={seg.highlightStep} />;
    case "calendar_saved_visual":
      return <VoiceCalendarSavedVisual key={key} summary={seg.summary} />;
    case "before_after_visual":
      return <VoiceBeforeAfterVisual key={key} before={seg.before} after={seg.after} />;
    case "fact_chips_visual":
      return <VoiceFactChipsVisual key={key} chips={seg.chips} />;
    case "steps_visual":
      return <VoiceStepsVisual key={key} items={seg.items} />;
    case "application_card_visual": {
      const e = enrichApplicationFromPreview(seg, ctx.applicationsPreview);
      return (
        <VoiceApplicationCardVisual
          key={key}
          company={e.company}
          role={e.role}
          status={e.status}
          deadline={e.deadline}
        />
      );
    }
    case "next_moves_visual":
      return <VoiceNextMovesVisual key={key} items={seg.items} />;
    case "story_timeline_visual":
      return <VoiceStoryTimelineVisual key={key} nodes={seg.nodes} />;
    case "peer_context_visual": {
      const pp = ctx.peerPercentiles;
      if (!pp || (pp.smart == null && pp.grit == null && pp.build == null)) return null;
      return (
        <VoicePeerContextVisual
          key={key}
          trackLabel={ctx.cohortTrack}
          smartPct={pp.smart ?? null}
          gritPct={pp.grit ?? null}
          buildPct={pp.build ?? null}
        />
      );
    }
    default:
      return null;
  }
}
