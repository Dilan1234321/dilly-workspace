"use client";

import { useVoice } from "@/contexts/VoiceContext";
import { dilly } from "@/lib/dilly";

/**
 * Encapsulates bullet-rewriter state and the rewrite handler.
 * All underlying state lives in VoiceContext; this hook just wraps
 * the async logic so VoiceTab doesn't have to.
 */
export function useBulletRewriter(buildVoiceContext: () => Record<string, unknown>) {
  const {
    bulletInput,
    setBulletInput,
    bulletRewritten,
    setBulletRewritten,
    bulletLoading,
    setBulletLoading,
    bulletHistory,
    setBulletHistory,
    bulletRewriterOpen,
    setBulletRewriterOpen,
  } = useVoice();

  const handleBulletRewrite = async (instruction?: string) => {
    if (!bulletInput.trim() || bulletLoading) return;
    setBulletLoading(true);
    try {
      const res = await dilly.fetch(`/voice/rewrite-bullet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bullet: bulletInput.trim(),
          instruction: instruction || undefined,
          context: buildVoiceContext(),
        }),
      });
      const data = res.ok ? await res.json() : null;
      const rewritten = (data?.rewritten || "Could not rewrite. Try Again.") as string;
      setBulletRewritten(rewritten);
      setBulletHistory((h) => {
        if (!h.original) return { original: bulletInput.trim(), versions: [rewritten] };
        return { ...h, versions: [...h.versions, rewritten] };
      });
    } catch {
      setBulletRewritten("Could not reach Dilly. Check your connection.");
    } finally {
      setBulletLoading(false);
    }
  };

  return {
    bulletInput,
    setBulletInput,
    bulletRewritten,
    setBulletRewritten,
    bulletLoading,
    bulletHistory,
    setBulletHistory,
    bulletRewriterOpen,
    setBulletRewriterOpen,
    handleBulletRewrite,
  };
}
