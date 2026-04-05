"use client";

import React from "react";
import { createPortal } from "react-dom";

import { DownloadDoneIcon } from "@/components/ui/animated-state-icons";
import { AchievementSticker } from "@/components/AchievementSticker";

import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useToast } from "@/hooks/useToast";

import { dilly } from "@/lib/dilly";
import { getEffectiveCohortLabel } from "@/lib/trackDefinitions";
import { hapticLight, hapticMedium, hapticSuccess } from "@/lib/haptics";
import {
  topPercentileHeadline,
  oneLineSummary,
  copyTextSync,
  generateBadgeSvg,
  generateShareCardSvg,
  downloadSvg,
} from "@/lib/dillyUtils";
import {
  ACHIEVEMENT_IDS,
  isUnlocked,
  type AchievementId,
  type ProfileAchievements,
} from "@/lib/achievements";
import html2canvas from "html2canvas";

import type { AuditV2 } from "@/types/dilly";

/** Desktop Chrome (and many browsers) report no file sharing or reject share({ files }) */
function navigatorCanSharePngFile(file: File): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export interface ShareCardProps {
  shareCardRef: React.RefObject<HTMLDivElement | null>;
  theme: { primary: string; secondary: string; backgroundTint?: string; primaryContrast?: string };
  displayAudit: AuditV2;
  latestAtsScoreResolved: number | null;
  saveProfile: (data: Record<string, unknown>) => Promise<boolean>;
  achievements: ProfileAchievements;
  shareCardAchievements: string[];
  captureShareCardAsPngFile: () => Promise<{ file: File; canvas: HTMLCanvasElement } | null>;
  // Copy/download feedback
  copyFeedback: string | null;
  setCopyFeedback: React.Dispatch<React.SetStateAction<"one-line" | "suggested" | "report-link" | "top-pct" | "shared" | null>>;
  downloadFeedback: string | null;
  setDownloadFeedback: React.Dispatch<React.SetStateAction<"snapshot" | "pdf" | null>>;
  // Achievement picker state
  achievementPickerSlot: 0 | 1 | 2 | null;
  setAchievementPickerSlot: React.Dispatch<React.SetStateAction<0 | 1 | 2 | null>>;
  achievementPickerClosing: boolean;
  setAchievementPickerClosing: React.Dispatch<React.SetStateAction<boolean>>;
  shareCardDeselectingSlot: number | null;
  setShareCardDeselectingSlot: React.Dispatch<React.SetStateAction<number | null>>;
  shareCardAddingSlot: number | null;
  setShareCardAddingSlot: React.Dispatch<React.SetStateAction<number | null>>;
  shareImageSheet: { file: File; shareText: string; title: string } | null;
  setShareImageSheet: React.Dispatch<React.SetStateAction<{ file: File; shareText: string; title: string } | null>>;
  shareImagePreparing: boolean;
  setShareImagePreparing: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function ShareCard(props: ShareCardProps) {
  const {
    shareCardRef,
    theme,
    displayAudit,
    latestAtsScoreResolved,
    saveProfile,
    achievements,
    shareCardAchievements,
    captureShareCardAsPngFile,
    copyFeedback,
    setCopyFeedback,
    downloadFeedback,
    setDownloadFeedback,
    achievementPickerSlot,
    setAchievementPickerSlot,
    achievementPickerClosing,
    setAchievementPickerClosing,
    shareCardDeselectingSlot,
    setShareCardDeselectingSlot,
    shareCardAddingSlot,
    setShareCardAddingSlot,
    shareImageSheet,
    setShareImageSheet,
    shareImagePreparing,
    setShareImagePreparing,
    setError,
  } = props;

  const { appProfile, setAppProfile } = useAppContext();
  const { atsPeerPercentile } = useAuditScore();
  const { toast } = useToast();

  const shareMetric = (appProfile?.share_card_metric === "smart" || appProfile?.share_card_metric === "grit" || appProfile?.share_card_metric === "build" || appProfile?.share_card_metric === "mts" || appProfile?.share_card_metric === "ats")
    ? appProfile.share_card_metric
    : "grit";
  const isDimension = shareMetric === "smart" || shareMetric === "grit" || shareMetric === "build";
  const k = isDimension ? shareMetric : "grit";
  const percentile = displayAudit?.peer_percentiles?.[k] ?? 50;
  const topPct = Math.max(1, Math.min(100, 100 - percentile));
  const cohort = getEffectiveCohortLabel(displayAudit?.detected_track, appProfile?.track) || "your track";
  const size = 56;
  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;
  const dimensionPeerRankArc = ((100 - topPct) / 100) * circumference;
  const dimensionScore = Math.round(displayAudit?.scores?.[k] ?? 0);
  const mtsScore = displayAudit?.final_score != null ? Math.round(displayAudit.final_score) : null;
  const atsScore = latestAtsScoreResolved;
  const atsTopPct = atsPeerPercentile != null ? Math.max(1, 100 - atsPeerPercentile) : null;
  const shareCardStickers = appProfile?.share_card_achievements ?? [];
  const circleLabel = shareMetric === "mts"
    ? (mtsScore != null ? String(mtsScore) : "\u2014")
    : shareMetric === "ats"
      ? (atsScore != null ? String(atsScore) : "\u2014")
      : (displayAudit?.peer_percentiles ? `${topPct}%` : String(dimensionScore));
  const subLabel = shareMetric === "mts"
    ? "Final \u00B7 Overall"
    : shareMetric === "ats"
      ? atsTopPct != null ? `ATS \u00B7 Top ${atsTopPct}% vs peers` : "Dilly ATS score"
      : `${k.charAt(0).toUpperCase() + k.slice(1)} in ${cohort}`;
  const showPercentRing = (isDimension && displayAudit?.peer_percentiles) || (shareMetric === "mts" && mtsScore != null) || (shareMetric === "ats" && atsScore != null);
  const ringArcLength =
    shareMetric === "mts"
      ? (Math.min(100, Math.max(0, mtsScore ?? 0)) / 100) * circumference
      : shareMetric === "ats"
        ? (Math.min(100, Math.max(0, atsScore ?? 0)) / 100) * circumference
        : dimensionPeerRankArc;

  return (
    <div
      className="mb-5 rounded-[24px] p-4 min-w-0"
      style={{
        maxWidth: "375px",
        width: "100%",
        boxSizing: "border-box",
        background: "var(--s2)",
      }}
    >
      {/* Friend-focused headline */}
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold tracking-tight" style={{ color: "var(--t1)" }}>Send this to your friends</h3>
        <p className="text-sm mt-1" style={{ color: "var(--t3)" }}>They&apos;ll see your score \u2014 and can get their own.</p>
      </div>
      {/* Top 25% nudge */}
      {displayAudit?.peer_percentiles && (() => {
        const pct = displayAudit.peer_percentiles;
        const hasTop25 = (["smart", "grit", "build"] as const).some((dim) => Math.max(1, 100 - (pct[dim] ?? 50)) <= 25);
        return hasTop25 ? (
          <div className="rounded-[18px] p-3 mb-4 flex items-center gap-3 min-w-0" style={{ background: "var(--gdim)" }}>
            <span className="text-2xl shrink-0">&#127881;</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--t1)" }}>You&apos;re in the Top 25%</p>
              <p className="text-xs" style={{ color: "var(--t3)" }}>Your friends will want to see this.</p>
            </div>
          </div>
        ) : null;
      })()}
      {/* Inner platinum card */}
      <div
        ref={shareCardRef}
        className="share-card-canvas m-rounded-card p-4 select-none mb-4 flex flex-col gap-3 min-w-0"
        style={{
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          background: "#ffffff",
          color: "#1e293b",
        }}
        aria-label="Dilly score card"
      >
        {/* Row 1: Dilly left, circle further left */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-left min-w-0 flex-1 flex flex-col justify-center" style={{ maxWidth: "58%" }}>
            <p className="text-2xl font-bold tracking-tight" style={{ color: "#0f172a", fontFamily: '"Times New Roman", Times, serif' }}>Dilly</p>
            <p className="text-sm mt-2 leading-tight" style={{ color: "#475569", fontFamily: '"Times New Roman", Times, serif' }}>
              Resume scored like a<br />senior hiring manager.
            </p>
            <p className="text-xs mt-2 whitespace-nowrap" style={{ color: "#64748b" }}>Your career center. Open 24/7.</p>
          </div>
          {/* Right: single metric circle */}
          <div className="flex flex-col items-center shrink-0 ml-5 mr-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#64748b" }}>{shareMetric === "mts" ? "Final" : shareMetric === "ats" ? "ATS" : "Top"}</p>
            <div className="relative shrink-0" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="pointer-events-none" style={{ display: "block" }} aria-hidden>
                <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                  <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={4} />
                  {showPercentRing && (
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={r}
                      fill="none"
                      stroke={theme.primary}
                      strokeWidth={4}
                      strokeLinecap="round"
                      strokeDasharray={`${ringArcLength} ${circumference}`}
                      strokeDashoffset={0}
                    />
                  )}
                </g>
                <text
                  x={size / 2}
                  y={size / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-bold tabular-nums"
                  style={{
                    fill: "#0f172a",
                    fontFamily: '"Times New Roman", Times, serif',
                    fontSize: circleLabel.length > 3 ? 14 : 16,
                  }}
                >
                  {circleLabel}
                </text>
              </svg>
            </div>
            <p className="text-[9px] font-medium text-center mt-0.5 leading-tight max-w-[100px]" style={{ color: "#475569" }}>{subLabel}</p>
          </div>
        </div>
        {/* Row 2: achievement stickers */}
        {shareCardStickers.length > 0 && (
          <div className="flex justify-start gap-2 flex-wrap min-w-0 pt-1 items-center">
            {(shareCardStickers as AchievementId[]).slice(0, 3).map((id, index) => {
              const isDeselecting = shareCardDeselectingSlot === index;
              const isAdding = shareCardAddingSlot === index;
              return (
                <div
                  key={id}
                  className={`origin-center ${isDeselecting ? "share-card-sticker-pop-out" : isAdding ? "share-card-sticker-pop-in" : ""}`}
                >
                  <AchievementSticker achievementId={id} unlocked size="sm" showName={false} />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* CTA: choose metric, add achievements, then send */}
      <div className="space-y-3 mb-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-2">Show on card</p>
          <div className="flex flex-wrap gap-2">
            {(["smart", "grit", "build", "mts", "ats"] as const).map((dim) => {
              const isSelected = (appProfile?.share_card_metric === "smart" || appProfile?.share_card_metric === "grit" || appProfile?.share_card_metric === "build" || appProfile?.share_card_metric === "mts" || appProfile?.share_card_metric === "ats")
                ? appProfile?.share_card_metric === dim
                : dim === "grit";
              const noAtsYet = dim === "ats" && latestAtsScoreResolved == null;
              const label = dim === "mts" ? "Final" : dim === "ats" ? "ATS" : dim.charAt(0).toUpperCase() + dim.slice(1);
              return (
                <button
                  key={dim}
                  type="button"
                  disabled={noAtsYet}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (noAtsYet) return;
                    hapticLight();
                    const previous = appProfile?.share_card_metric ?? null;
                    setAppProfile((prev) => prev ? { ...prev, share_card_metric: dim } : prev);
                    saveProfile({ share_card_metric: dim }).then((ok) => {
                      if (!ok) setAppProfile((p) => p ? { ...p, share_card_metric: previous } : p);
                    });
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: isSelected ? theme.primary : "var(--ut-surface-raised)",
                    color: isSelected ? (theme.primaryContrast ?? "#0f172a") : "var(--m-text-3)",
                    border: isSelected ? "none" : "1px solid var(--ut-border)",
                  }}
                  title={noAtsYet ? "Run an ATS scan in Review to show ATS on your card" : undefined}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Add achievements to card */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Add to card:</span>
          <div className="flex gap-2 items-center min-h-[48px]">
            {[0, 1, 2].map((slot) => {
              const id = shareCardAchievements[slot];
              const isDeselecting = shareCardDeselectingSlot === slot;
              const isAdding = shareCardAddingSlot === slot;
              return id ? (
                <button
                  key={`${slot}-${id}`}
                  type="button"
                  disabled={shareCardDeselectingSlot !== null}
                  onClick={() => {
                    if (shareCardDeselectingSlot !== null) return;
                    hapticLight();
                    setShareCardDeselectingSlot(slot);
                  }}
                  onAnimationEnd={(e) => {
                    if (isDeselecting) {
                      const next = shareCardAchievements.filter((_, i) => i !== slot);
                      setAppProfile((prev) => (prev ? { ...prev, share_card_achievements: next } : prev));
                      setShareCardDeselectingSlot(null);
                      if (localStorage.getItem("dilly_auth_token")) {
                        dilly.fetch(`/profile`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ share_card_achievements: next }),
                        }).catch(() => toast("Couldn't update card", "error"));
                      }
                    }
                    if (isAdding && ((e as { propertyName?: string }).propertyName === "transform" || (e as { propertyName?: string }).propertyName === "opacity")) {
                      setShareCardAddingSlot(null);
                    }
                  }}
                  className={`shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400 origin-center min-h-[48px] min-w-[48px] flex items-center justify-center ${
                    isDeselecting ? "share-card-sticker-pop-out" : isAdding ? "share-card-sticker-pop-in" : ""
                  } disabled:pointer-events-none disabled:opacity-70`}
                  aria-label={isDeselecting ? undefined : `Remove ${id} from card`}
                >
                  <AchievementSticker achievementId={id as AchievementId} unlocked size="sm" showName={false} />
                </button>
              ) : (
                <button
                  key={`empty-${slot}`}
                  type="button"
                  onClick={() => { hapticLight(); setAchievementPickerSlot(slot as 0 | 1 | 2); }}
                  disabled={shareCardDeselectingSlot !== null}
                  className="w-12 h-12 shrink-0 rounded-full border-2 border-dashed border-slate-500/60 flex items-center justify-center text-slate-500/60 hover:border-slate-400 hover:text-slate-400 transition-colors min-h-[44px] min-w-[44px] disabled:opacity-60 disabled:pointer-events-none"
                  aria-label="Add achievement to card"
                >
                  <span className="text-lg leading-none">+</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Picker modal */}
        {achievementPickerSlot !== null && typeof document !== "undefined" && createPortal(
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 ${achievementPickerClosing ? "share-card-picker-backdrop-out" : "share-card-picker-backdrop-in"}`}
            onClick={() => !achievementPickerClosing && setAchievementPickerClosing(true)}
            aria-modal="true"
            role="dialog"
            aria-label="Choose achievement for card"
          >
            <div
              className={`bg-slate-800 rounded-xl p-4 max-h-[70vh] overflow-y-auto w-full max-w-sm border border-slate-600 ${achievementPickerClosing ? "share-card-picker-panel-out" : "share-card-picker-panel-in"}`}
              onClick={(e) => e.stopPropagation()}
              onAnimationEnd={(e) => {
                if (!achievementPickerClosing || e.target !== e.currentTarget) return;
                setAchievementPickerSlot(null);
                setAchievementPickerClosing(false);
              }}
            >
              <p className="text-sm font-medium text-slate-200 mb-3">Pick an achievement for your card</p>
              <div className="flex flex-wrap gap-2">
                {ACHIEVEMENT_IDS.filter((aid) => isUnlocked(aid, achievements)).map((aid) => {
                  const inOtherSlot = shareCardAchievements.some((_, i) => i !== achievementPickerSlot && shareCardAchievements[i] === aid);
                  return (
                    <button
                      key={aid}
                      type="button"
                      disabled={inOtherSlot}
                      onClick={() => {
                        if (inOtherSlot) return;
                        const slot = achievementPickerSlot!;
                        const arr = [shareCardAchievements[0], shareCardAchievements[1], shareCardAchievements[2]];
                        arr[slot] = aid;
                        const next = arr.filter(Boolean) as string[];
                        setShareCardAddingSlot(slot);
                        setAppProfile((prev) => (prev ? { ...prev, share_card_achievements: next } : prev));
                        setAchievementPickerClosing(true);
                        if (localStorage.getItem("dilly_auth_token")) {
                          dilly.fetch(`/profile`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ share_card_achievements: next }),
                          }).catch(() => toast("Couldn't update card", "error"));
                        }
                      }}
                      className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <AchievementSticker achievementId={aid} unlocked size="sm" showName={false} />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => !achievementPickerClosing && setAchievementPickerClosing(true)}
                className="mt-3 w-full py-2 text-sm font-medium text-slate-400 hover:text-slate-200 border border-slate-600 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
        {typeof navigator !== "undefined" && navigator.share ? (
          <>
            <button
              type="button"
              disabled={shareImagePreparing}
              className="w-full min-h-[44px] font-semibold text-sm rounded-lg transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-55 disabled:pointer-events-none"
              style={{ background: "var(--blue)", color: "#fff" }}
              onClick={async () => {
                hapticMedium();
                const url = appProfile?.profile_slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${appProfile.profile_slug}` : "";
                const shareText = (topPercentileHeadline(displayAudit) || oneLineSummary(displayAudit) || "I got my resume scored on Dilly") + " \u2014 get yours too." + (url ? ` ${url}` : "");
                const sharePayload = {
                  title: "My Dilly Resume Score",
                  text: shareText,
                  url: url || undefined,
                } as const;
                const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
                const isAppleTouch =
                  /iPad|iPhone|iPod/.test(ua) ||
                  (typeof navigator !== "undefined" &&
                    navigator.platform === "MacIntel" &&
                    (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints > 1);
                const isSafari =
                  /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg\//i.test(ua);
                const useWebKitDeferredImageShare = isAppleTouch || isSafari;
                let shareTextPrimed = false;
                const onShareFail = async (e: unknown) => {
                  const name =
                    e instanceof DOMException ? e.name : (e as { name?: string })?.name ?? "";
                  if (name === "AbortError") return;
                  if (shareTextPrimed || copyTextSync(shareText)) {
                    hapticLight();
                    toast("Copied your message \u2014 paste to share.", "success");
                    return;
                  }
                  try {
                    await navigator.clipboard.writeText(shareText);
                    hapticLight();
                    toast("Copied your message \u2014 paste to share.", "success");
                  } catch {
                    toast(
                      "Couldn't copy automatically \u2014 tap Copy link to send to friends or Download below.",
                      "info"
                    );
                  }
                };
                if (useWebKitDeferredImageShare) {
                  setShareImagePreparing(true);
                  try {
                    const captured = await captureShareCardAsPngFile();
                    if (captured?.file) {
                      setShareImageSheet({
                        file: captured.file,
                        shareText,
                        title: sharePayload.title,
                      });
                      toast("Tap Share card to send the image", "info");
                      return;
                    }
                  } catch {
                    /* fall through to text share */
                  } finally {
                    setShareImagePreparing(false);
                  }
                  toast("Couldn't capture the card image \u2014 sharing your message and link only.", "info");
                  try {
                    await navigator.share({ text: shareText });
                    hapticSuccess();
                    setCopyFeedback("shared");
                    setTimeout(() => setCopyFeedback(null), 2000);
                    toast("Sent!", "success");
                  } catch (e) {
                    const n =
                      e instanceof DOMException ? e.name : (e as { name?: string })?.name ?? "";
                    if (n !== "AbortError") await onShareFail(e);
                  }
                  return;
                }
                setShareImagePreparing(true);
                try {
                  const captured = await captureShareCardAsPngFile();
                  if (captured?.file) {
                    const canShareFile = navigatorCanSharePngFile(captured.file);
                    if (canShareFile) {
                      try {
                        await navigator.share({
                          title: sharePayload.title,
                          text: shareText,
                          files: [captured.file],
                        });
                        hapticSuccess();
                        setCopyFeedback("shared");
                        setTimeout(() => setCopyFeedback(null), 2000);
                        toast("Sent!", "success");
                        return;
                      } catch (e) {
                        const n =
                          e instanceof DOMException ? e.name : (e as { name?: string })?.name ?? "";
                        if (n === "AbortError") return;
                      }
                    }
                    setShareImageSheet({
                      file: captured.file,
                      shareText,
                      title: sharePayload.title,
                    });
                    toast(
                      canShareFile
                        ? "Tap Share card to send the image with your message."
                        : "This browser usually can't attach the image in one step \u2014 tap Share card to copy or download it, then add it to your message.",
                      "info",
                    );
                    return;
                  }
                  toast("Couldn't capture the card image \u2014 sharing your message and link only.", "info");
                  shareTextPrimed = copyTextSync(shareText);
                  await navigator.share(sharePayload);
                  hapticSuccess();
                  setCopyFeedback("shared");
                  setTimeout(() => setCopyFeedback(null), 2000);
                  toast("Sent!", "success");
                } catch (e) {
                  await onShareFail(e);
                } finally {
                  setShareImagePreparing(false);
                }
              }}
            >
              {shareImagePreparing ? "Preparing card\u2026" : "Send to friends"}
            </button>
            {shareImageSheet
              ? createPortal(
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Share score card"
                    className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 p-4"
                    onClick={() => setShareImageSheet(null)}
                  >
                    <div
                      className="w-full max-w-[360px] rounded-t-[20px] sm:rounded-[20px] border p-4 shadow-xl"
                      style={{ background: "var(--s2)", borderColor: "var(--b1)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-sm font-semibold mb-1" style={{ color: "var(--t1)" }}>Share your score card</p>
                      <p className="text-xs mb-4 leading-relaxed" style={{ color: "var(--t3)" }}>
                        Tries to attach the card image. On desktop, you may need to paste the copied image into your message after the share sheet opens.
                      </p>
                      <button
                        type="button"
                        className="w-full min-h-[44px] font-semibold text-sm rounded-lg transition-opacity hover:opacity-90 active:opacity-80 mb-2"
                        style={{ background: "var(--blue)", color: "#fff" }}
                        onClick={async () => {
                          const sheet = shareImageSheet;
                          if (!sheet) return;
                          const openTextShare = async () => {
                            try {
                              await navigator.share({
                                title: sheet.title,
                                text: sheet.shareText,
                              });
                              hapticSuccess();
                              setCopyFeedback("shared");
                              setTimeout(() => setCopyFeedback(null), 2000);
                              toast("Sent!", "success");
                            } catch (e2) {
                              const n2 =
                                e2 instanceof DOMException ? e2.name : (e2 as { name?: string })?.name ?? "";
                              if (n2 !== "AbortError") {
                                hapticLight();
                                toast("Paste the image from your clipboard into your message.", "info");
                              }
                            }
                          };
                          try {
                            await navigator.share({
                              title: sheet.title,
                              text: sheet.shareText,
                              files: [sheet.file],
                            });
                            hapticSuccess();
                            setCopyFeedback("shared");
                            setTimeout(() => setCopyFeedback(null), 2000);
                            toast("Sent!", "success");
                          } catch (e) {
                            const n = e instanceof DOMException ? e.name : (e as { name?: string })?.name ?? "";
                            if (n === "AbortError") {
                              setShareImageSheet(null);
                              return;
                            }
                            try {
                              if (typeof ClipboardItem !== "undefined") {
                                await navigator.clipboard.write([
                                  new ClipboardItem({ [sheet.file.type]: sheet.file }),
                                ]);
                                hapticLight();
                                toast("Image copied \u2014 opening share for your text; paste the image into the draft.", "info");
                                await openTextShare();
                              } else {
                                throw new Error("no clipboard item");
                              }
                            } catch {
                              const ou = URL.createObjectURL(sheet.file);
                              const a = document.createElement("a");
                              a.href = ou;
                              a.download = "dilly-score-card.png";
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(ou);
                              toast("Card saved \u2014 opening share for your text; attach the downloaded image.", "info");
                              await openTextShare();
                            }
                          }
                          setShareImageSheet(null);
                        }}
                      >
                        Share card
                      </button>
                      <button
                        type="button"
                        className="w-full min-h-[40px] text-sm font-medium rounded-lg transition-opacity hover:opacity-90"
                        style={{ color: "var(--t3)" }}
                        onClick={() => setShareImageSheet(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>,
                  document.body,
                )
              : null}
          </>
        ) : appProfile?.profile_slug ? (
          <button
            type="button"
            className="w-full min-h-[44px] font-semibold text-sm rounded-lg transition-opacity hover:opacity-90 active:opacity-80"
            style={{ background: "var(--blue)", color: "#fff" }}
            onClick={() => {
              const url = typeof window !== "undefined" ? `${window.location.origin}/p/${appProfile?.profile_slug}` : "";
              navigator.clipboard.writeText(url);
              hapticSuccess();
              setCopyFeedback("report-link");
              setTimeout(() => setCopyFeedback(null), 2000);
              toast("Link copied \u2014 paste in a text to your friends!", "success");
            }}
          >
            {copyFeedback === "report-link" ? "Copied!" : "Copy link to send to friends"}
          </button>
        ) : null}
      </div>
      {/* Secondary: LinkedIn, download, etc. */}
      <p className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: "var(--t3)" }}>Or share elsewhere</p>
      <p className="text-[11px] mb-2" style={{ color: "var(--t3)" }}>Snapshot = full score (all 3 dimensions + findings). Share card above = one metric for quick share.</p>
      <div className="flex flex-wrap gap-2 items-center [&>button]:min-h-[44px] [&>button]:min-w-0 [&>button]:flex-1 [&>button]:sm:flex-initial [&>button.copy-link-icon-btn]:flex-initial [&>button.copy-link-icon-btn]:flex-none">
        <button type="button" className="text-xs font-medium rounded-lg px-4 py-2 min-h-[44px] transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s3)", color: "var(--t2)" }} onClick={async () => {
          try {
            const caption = (topPercentileHeadline(displayAudit) || oneLineSummary(displayAudit)) + " \u00B7 Dilly Careers \u00B7 trydilly.com";
            const el = shareCardRef.current;
            if (el && typeof html2canvas !== "undefined") {
              const canvas = await html2canvas(el, {
                scale: 2,
                backgroundColor: "#ebe9e6",
                useCORS: true,
                logging: false,
              });
              const dataUrl = canvas.toDataURL("image/png");
              const a = document.createElement("a");
              a.href = dataUrl;
              a.download = "dilly-score-card.png";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            } else {
              const svg = generateBadgeSvg(displayAudit, "grit", {
                customTagline: appProfile?.custom_tagline ?? null,
                selectedAchievements: appProfile?.share_card_achievements ?? [],
              });
              downloadSvg(svg, "dilly-score-card.svg");
            }
            navigator.clipboard.writeText(caption);
            hapticSuccess();
            setCopyFeedback("shared");
            window.location.href = "https://www.linkedin.com/feed/";
          } catch (e) {
            if ((e as Error)?.name === "AbortError") return;
            setError(e instanceof Error ? e.message : "Share failed");
            setTimeout(() => setError(null), 4000);
          }
        }}>Share to LinkedIn</button>
        <button type="button" className="text-xs font-medium rounded-lg px-4 py-2 min-h-[44px] flex items-center justify-center gap-2 transition-opacity hover:opacity-90 active:opacity-80" style={{ background: "var(--s3)", color: "var(--t2)" }} onClick={() => {
          try {
            const currentShareMetric = (appProfile?.share_card_metric === "smart" || appProfile?.share_card_metric === "grit" || appProfile?.share_card_metric === "build" || appProfile?.share_card_metric === "mts" || appProfile?.share_card_metric === "ats")
              ? appProfile.share_card_metric
              : "grit";
            const svg = generateShareCardSvg(displayAudit, {
              shareCardMetric: currentShareMetric,
              selectedAchievements: appProfile?.share_card_achievements ?? [],
              atsScore: latestAtsScoreResolved,
              atsPeerPercentile: atsPeerPercentile ?? null,
            });
            downloadSvg(svg, "dilly-snapshot.svg");
            setDownloadFeedback("snapshot");
            setTimeout(() => setDownloadFeedback(null), 1500);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Download failed");
            setTimeout(() => setError(null), 4000);
          }
        }}>{downloadFeedback === "snapshot" ? <><DownloadDoneIcon size={16} state={true} color="currentColor" /> Downloaded</> : "Download Snapshot"}</button>
        {appProfile?.profile_slug && (
          <button
            type="button"
            onClick={() => {
              const url = typeof window !== "undefined" ? `${window.location.origin}/p/${appProfile?.profile_slug}` : "";
              navigator.clipboard.writeText(url);
              hapticSuccess();
              setCopyFeedback("report-link");
              setTimeout(() => setCopyFeedback(null), 2000);
              toast("Link copied", "success");
            }}
            className="copy-link-icon-btn inline-flex items-center justify-center rounded-lg w-[44px] h-[44px] shrink-0 transition-opacity hover:opacity-90 active:opacity-80"
            style={{
              background: copyFeedback === "report-link" ? "var(--gdim)" : "var(--s3)",
            }}
            title={copyFeedback === "report-link" ? "Copied" : "Copy link"}
            aria-label={copyFeedback === "report-link" ? "Copied" : "Copy link"}
          >
            <img src="/copy-link-icon.png" alt="" className="w-5 h-5 object-contain" aria-hidden />
          </button>
        )}
      </div>
      <p className="text-[11px] text-center mt-4" style={{ color: "var(--t3)" }}>Friends can get their own score free \u2014 trydilly.com</p>
    </div>
  );
}
