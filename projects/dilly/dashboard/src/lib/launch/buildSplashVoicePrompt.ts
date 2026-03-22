import type { SplashState } from "@/lib/launch/splashStates";

/**
 * Gold splash CTA → Dilly Voice: prefer server `voice_prompt`, else echo API copy + ask for next step.
 * (Template lines are UI instructions only; all situation copy comes from `data`.)
 */
export function buildGoldButtonVoicePrompt(data: SplashState): string {
  const preset = (data.voice_prompt ?? "").trim();
  if (preset) return preset;

  const eyebrow = (data.eyebrow ?? "").trim();
  const headline = (data.headline ?? "").trim();
  const sub = (data.sub ?? "").trim();

  const lines = [
    "Here’s what my Dilly welcome screen just said:",
    eyebrow ? `• ${eyebrow}` : "",
    headline,
    sub,
    "Help me act on that — what’s the smartest next step for me right now? Be specific and use my profile and audit if you can.",
  ];
  return lines.filter((x) => x.length > 0).join("\n\n");
}
