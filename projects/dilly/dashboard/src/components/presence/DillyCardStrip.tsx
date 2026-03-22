"use client";

import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import { VoiceFormattedText } from "@/components/VoiceFormattedText";
import { healEmptyVoiceDimensionTags, type VoiceScoresTriple } from "@/lib/voiceDimensionMarkup";
import { InsightRichText } from "./InsightRichText";

type Props = {
  text: string;
  voiceAvatarIndex: number | null;
  emphases?: string[];
  /** When set, empty [smart|grit|build] tags are filled with "Dim score of N" for display. */
  scoreTriple?: VoiceScoresTriple | null;
};

const VOICE_MARKUP_RE = /\[(?:\/)?(?:blue|gold|white|red|smart|grit|build)\]/i;

/** Footnote-style strip at bottom of a card — same background as parent. */
export function DillyCardStrip({ text, voiceAvatarIndex, emphases, scoreTriple = null }: Props) {
  if (!text.trim()) return null;
  const healed = healEmptyVoiceDimensionTags(text, scoreTriple);
  const useVoice = VOICE_MARKUP_RE.test(healed);
  return (
    <div
      className="flex flex-row items-start gap-2 border-t pt-2.5 pb-0.5 px-3 -mx-1"
      style={{ borderColor: "var(--b1)" }}
    >
      <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="!w-3.5 !h-3.5 shrink-0 mt-0.5" />
      <p
        className="text-[11px] leading-[1.55] flex-1 min-w-0"
        style={{ color: "var(--t2)", fontFamily: "var(--font-inter), system-ui, sans-serif", fontWeight: 400 }}
      >
        {useVoice ? (
          <VoiceFormattedText content={healed} />
        ) : (
          <InsightRichText text={healed} emphases={emphases} />
        )}
      </p>
    </div>
  );
}
