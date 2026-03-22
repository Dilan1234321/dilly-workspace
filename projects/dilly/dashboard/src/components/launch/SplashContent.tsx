"use client";

import type { SplashState, EyebrowColorKey } from "@/lib/launch/splashStates";

const EYEBROW_COLOR: Record<EyebrowColorKey, string> = {
  coral: "var(--coral)",
  gold: "var(--gold)",
  green: "var(--green)",
  amber: "var(--amber)",
  muted: "var(--launch-muted-eyebrow)",
};

function splitHeadline(headline: string, goldPhrase: string): { before: string; gold: string; after: string } | null {
  const g = (goldPhrase || "").trim();
  if (!g) return null;
  const i = headline.indexOf(g);
  if (i < 0) return null;
  return {
    before: headline.slice(0, i),
    gold: g,
    after: headline.slice(i + g.length),
  };
}

export type SplashContentPhaseStyle = {
  eyebrow: React.CSSProperties;
  shimmer: React.CSSProperties;
  headline: React.CSSProperties;
  sub: React.CSSProperties;
  primary: React.CSSProperties;
  ghost: React.CSSProperties;
};

type SplashContentProps = {
  data: SplashState;
  phaseStyle: SplashContentPhaseStyle;
  onPrimary: () => void;
  onGhost: () => void;
};

export function SplashContent({ data, phaseStyle, onPrimary, onGhost }: SplashContentProps) {
  const ec = EYEBROW_COLOR[data.eyebrow_color] || EYEBROW_COLOR.muted;
  const parts = splitHeadline(data.headline, data.headline_gold);
  const primaryIsGreen = data.glow_color === "green";

  return (
    <div className="flex w-full max-w-[280px] flex-col items-center">
      <div
        className="flex items-center justify-center gap-1 text-center"
        style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 8,
          color: ec,
          ...phaseStyle.eyebrow,
        }}
      >
        {data.eyebrow_pulse ? (
          <span
            className="inline-block shrink-0 rounded-full"
            style={{
              width: 5,
              height: 5,
              background: ec,
              animation: "dilly-launch-pdot 1.2s ease-in-out infinite",
            }}
            aria-hidden
          />
        ) : null}
        <span>{data.eyebrow}</span>
      </div>

      <div
        className="mx-auto"
        aria-hidden
        style={{
          width: 38,
          height: 1,
          margin: "0 auto 12px",
          background: "linear-gradient(to right, transparent, color-mix(in srgb, var(--gold) 60%, transparent), transparent)",
          ...phaseStyle.shimmer,
        }}
      />

      <h1
        style={{
          fontFamily: "var(--font-playfair), 'Playfair Display', serif",
          fontSize: 17,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.28,
          letterSpacing: "-0.02em",
          color: "var(--t1)",
          marginBottom: 5,
          ...phaseStyle.headline,
        }}
      >
        {parts ? (
          <>
            {parts.before}
            <span style={{ color: "var(--gold)" }}>{parts.gold}</span>
            {parts.after}
          </>
        ) : (
          data.headline
        )}
      </h1>

      <p
        style={{
          fontSize: 10,
          textAlign: "center",
          lineHeight: 1.6,
          color: "var(--t2)",
          marginBottom: 20,
          maxWidth: 185,
          ...phaseStyle.sub,
        }}
      >
        {data.sub}
      </p>

      <button
        type="button"
        onClick={onPrimary}
        className="w-full border-none"
        style={{
          borderRadius: 12,
          padding: 12,
          fontFamily: "var(--font-inter), system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          marginBottom: 8,
          background: primaryIsGreen
            ? "linear-gradient(135deg, var(--green), color-mix(in srgb, var(--green) 72%, #000))"
            : "linear-gradient(135deg, var(--gold), color-mix(in srgb, var(--gold) 65%, #000))",
          color: primaryIsGreen ? "var(--launch-cta-on-green)" : "var(--launch-cta-on-gold)",
          ...phaseStyle.primary,
        }}
      >
        {data.cta_primary}
      </button>

      <button
        type="button"
        onClick={onGhost}
        className="w-full bg-transparent"
        style={{
          border: "1px solid var(--b1)",
          borderRadius: 12,
          padding: 9,
          fontFamily: "var(--font-inter), system-ui, sans-serif",
          fontSize: 10,
          fontWeight: 500,
          color: "var(--t3)",
          cursor: "pointer",
          ...phaseStyle.ghost,
        }}
      >
        Go to your career center
      </button>
    </div>
  );
}
