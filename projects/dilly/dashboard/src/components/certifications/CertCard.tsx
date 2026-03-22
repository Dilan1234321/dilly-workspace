"use client";

import { forwardRef, useCallback, useState } from "react";
import type { Certification, CertificationShieldColor } from "@/types/certifications";
import { CertBuildImpactCard } from "./CertBuildImpactCard";
import { CertBullets } from "./CertBullets";
import { CertDillyRow } from "./CertDillyRow";

function ShieldIcon({ color }: { color: string }) {
  return (
    <svg width={19} height={19} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l7 3v5c0 5-3 9-7 10-4-1-7-5-7-10V6l7-3z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-5" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDown({ color }: { color: string }) {
  return (
    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function ExternalIcon({ color }: { color: string }) {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

function shieldStyles(color: CertificationShieldColor): { bg: string; border: string; icon: string } {
  switch (color) {
    case "green":
      return { bg: "var(--gdim)", border: "var(--gbdr)", icon: "var(--green)" };
    case "amber":
      return { bg: "var(--adim)", border: "var(--abdr)", icon: "var(--amber)" };
    case "blue":
      return { bg: "var(--bdim)", border: "var(--bbdr)", icon: "var(--blue)" };
    case "indigo":
    default:
      return { bg: "var(--idim)", border: "var(--ibdr)", icon: "var(--indigo)" };
  }
}

function openProviderLabel(provider: string): string {
  return provider.split(/\s*\(/)[0]?.trim() || provider;
}

export const CertCard = forwardRef<
  HTMLDivElement,
  {
    cert: Certification;
    expanded: boolean;
    currentBuild: number;
    onToggle: () => void;
  }
>(function CertCard({ cert, expanded, currentBuild, onToggle }, ref) {
  const [hover, setHover] = useState(false);
  const ss = shieldStyles(cert.shield_color);
  const deltaPts = cert.estimated_build_pts;
  const borderColor = expanded ? "var(--gbdr)" : hover ? "var(--b2)" : "var(--b1)";

  const onOpenUrl = useCallback(() => {
    if (cert.url && cert.url !== "#") window.open(cert.url, "_blank", "noopener,noreferrer");
  }, [cert.url]);

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--s2)",
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${borderColor}`,
        transition: "border-color 0.2s",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="cursor-pointer outline-none"
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: "13px 14px",
        }}
      >
        <div
          className="shrink-0 flex items-center justify-center"
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: ss.bg,
            border: `1px solid ${ss.border}`,
          }}
        >
          <ShieldIcon color={ss.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--t1)",
              letterSpacing: "-0.01em",
              lineHeight: 1.35,
              marginBottom: 5,
            }}
          >
            {cert.name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              style={{
                background: "var(--s3)",
                border: "1px solid var(--b2)",
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--t2)",
              }}
            >
              {cert.provider}
            </span>
            <span style={{ fontSize: 11, fontWeight: 500, color: cert.is_free ? "var(--green)" : "var(--t3)" }}>{cert.price_label}</span>
            {cert.dilly_pick ? (
              <span
                style={{
                  background: "var(--adim)",
                  border: "1px solid var(--abdr)",
                  color: "var(--amber)",
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 8,
                  fontWeight: 700,
                }}
              >
                Dilly&apos;s pick
              </span>
            ) : (
              <span
                style={{
                  background: "var(--gdim)",
                  border: "1px solid var(--gbdr)",
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--green)",
                }}
              >
                +{deltaPts} Build
              </span>
            )}
          </div>
        </div>
        <div
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 26, height: 26, background: "var(--s3)" }}
        >
          <span className={expanded ? "block rotated" : "block"} style={{ transition: "transform 0.25s", transform: expanded ? "rotate(180deg)" : "none" }}>
            <ChevronDown color="var(--t3)" />
          </span>
        </div>
      </div>

      <div
        style={{
          maxHeight: expanded ? 600 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s ease",
        }}
      >
        <div style={{ borderTop: "1px solid var(--b1)", padding: 14 }}>
          <CertBuildImpactCard currentBuild={currentBuild} after={cert.estimated_build_score_after} deltaPts={deltaPts} />
          <CertBullets items={cert.why_it_matters.slice(0, 3)} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenUrl();
            }}
            className="flex flex-row items-center gap-1.5 border-0 bg-transparent cursor-pointer p-0"
            style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", marginBottom: 11 }}
          >
            Open {openProviderLabel(cert.provider)}
            <ExternalIcon color="var(--blue)" />
          </button>
          <CertDillyRow cert={cert} />
        </div>
      </div>
    </div>
  );
});

CertCard.displayName = "CertCard";
