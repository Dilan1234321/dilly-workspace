"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";
import type { AppProfile } from "@/types/dilly";
import { dillyPresenceManager, type HomeInsightContext } from "@/lib/dillyPresence";
import { InsightRichText } from "./InsightRichText";

type Props = {
  uid: string;
  profile: AppProfile;
  context: HomeInsightContext;
  voiceAvatarIndex: number | null;
  emphases?: string[];
  /** Bump when audit / deadlines / applications change materially */
  refreshKey?: string | number;
};

/**
 * One home insight below score card. Renders nothing while loading, on failure, or when NULL.
 */
export function DillyHomeInsight({ uid, profile, context, voiceAvatarIndex, emphases = [], refreshKey = 0 }: Props) {
  const [insight, setInsight] = useState<string | null | undefined>(undefined);
  const contextRef = useRef(context);
  contextRef.current = context;
  /** Parent often passes a new `profile` object identity each render — must not be an effect dependency. */
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    setInsight(undefined);
    dillyPresenceManager.invalidateHomeInsight();
    let cancelled = false;
    const h = dillyPresenceManager.hydrateHomeContext(uid, contextRef.current);
    void (async () => {
      const text = await dillyPresenceManager.getHomeInsight(profileRef.current, h);
      if (!cancelled) setInsight(text);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, refreshKey]);

  if (insight === undefined || insight === null) return null;

  return (
    <div
      className="flex flex-row items-start gap-2.5"
      style={{ paddingLeft: 16, paddingRight: 16, marginBottom: 12 }}
    >
      <VoiceAvatar voiceAvatarIndex={voiceAvatarIndex} size="xs" className="!w-4 !h-4 shrink-0 mt-0.5 ring-0" />
      <p
        className="text-[13px] leading-[1.6] flex-1 min-w-0"
        style={{
          color: "var(--t2)",
          fontFamily: "var(--font-inter), system-ui, sans-serif",
          fontWeight: 400,
        }}
      >
        <InsightRichText text={insight} emphases={emphases} />
      </p>
    </div>
  );
}
