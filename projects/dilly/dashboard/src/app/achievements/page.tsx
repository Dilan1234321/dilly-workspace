"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getCareerCenterReturnPath } from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";
import { AppProfileHeader } from "@/components/career-center";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { AchievementSticker } from "@/components/AchievementSticker";
import {
  ACHIEVEMENT_IDS,
  ACHIEVEMENT_DEFINITIONS,
  MANUAL_UNLOCK_IDS,
  isUnlocked,
  type AchievementId,
  type ProfileAchievements,
} from "@/lib/achievements";
import { Button } from "@/components/ui/button";

export default function AchievementsPage() {
  const [profile, setProfile] = useState<{
    achievements?: ProfileAchievements;
    share_card_achievements?: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState<string | null>(null);

  useEffect(() => {
    dilly.get("/profile")
      .then((p) => {
        setProfile(p ?? null);
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  const achievements = profile?.achievements ?? {};
  const shareCard = profile?.share_card_achievements ?? [];

  const handleManualUnlock = async (id: AchievementId) => {
    if (!MANUAL_UNLOCK_IDS.includes(id) || isUnlocked(id, achievements)) return;
    setUnlocking(id);
    const updated = {
      ...achievements,
      [id]: { unlockedAt: Date.now() / 1000 },
    };
    try {
      if (id === "first_application") {
        await dilly.patch("/profile", {
          achievements: updated,
          first_application_at: Date.now() / 1000,
        });
      } else if (id === "first_interview") {
        await dilly.patch("/profile", {
          achievements: updated,
          first_interview_at: Date.now() / 1000,
        });
      } else {
        await dilly.patch("/profile", { achievements: updated });
      }
    } catch {
      // ignore patch errors
    }
    setProfile((prev) =>
      prev ? { ...prev, achievements: updated } : { achievements: updated }
    );
    setUnlocking(null);
  };

  const toggleShareCard = (id: string) => {
    if (!isUnlocked(id as AchievementId, achievements)) return;
    let next = [...shareCard];
    const idx = next.indexOf(id);
    if (idx >= 0) {
      next = next.filter((x) => x !== id);
    } else if (next.length < 3) {
      next = [...next, id];
    } else {
      next = [next[1], next[2], id];
    }
    dilly.patch("/profile", { share_card_achievements: next }).then(() => {
      setProfile((prev) =>
        prev ? { ...prev, share_card_achievements: next } : prev
      );
    });
  };

  const unlockedCount = ACHIEVEMENT_IDS.filter((id) =>
    isUnlocked(id, achievements)
  ).length;

  if (loading) {
    return (
      <LoadingScreen message="Loading your achievements collection…" className="app-talent" />
    );
  }

  return (
    <div className="app-talent career-center-talent min-h-screen pt-0 pb-6 sm:pb-8">
      <div className="relative mx-auto w-full max-w-[375px] px-4 pt-0 pb-6 sm:px-6 sm:pb-8">
        <AppProfileHeader back={getCareerCenterReturnPath()} className="mb-2" />
        <header className="te-page-hero text-left mb-0">
          <Link href={getCareerCenterReturnPath()} className="cc-btn cc-btn-ghost inline-flex items-center gap-2 text-sm font-medium mb-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Career Center
          </Link>
          <h1 className="te-hero-title text-lg sm:text-xl">Achievements</h1>
          <p className="te-hero-sub text-xs sm:text-sm mt-1">
            Collect them all! {unlockedCount} of {ACHIEVEMENT_IDS.length} earned. Pick up to 3 for your share cards and recruiter profile.
          </p>
        </header>

        {/* Sticker grid: perforated / cut-out style */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 sm:gap-5">
          {ACHIEVEMENT_IDS.map((id) => {
            const def = ACHIEVEMENT_DEFINITIONS[id];
            const unlocked = isUnlocked(id, achievements);
            const isManual = MANUAL_UNLOCK_IDS.includes(id);
            const onShareCard = shareCard.includes(id);

            return (
              <div
                key={id}
                className="relative flex flex-col items-center"
              >
                {/* Perforated cut line around each sticker */}
                <div
                  className="relative p-2 rounded-full border-2 border-dashed transition-colors"
                  style={{
                    borderColor: unlocked ? "rgba(139, 115, 85, 0.35)" : "rgba(139, 115, 85, 0.15)",
                    background: unlocked ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.15)",
                    boxShadow: unlocked
                      ? "0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)"
                      : "0 1px 4px rgba(0,0,0,0.04)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (unlocked && !isManual) toggleShareCard(id);
                    }}
                    className="cursor-default focus:outline-none focus:ring-2 focus:ring-amber-900/30 focus:ring-offset-2 rounded-full"
                  >
                    <AchievementSticker
                      achievementId={id}
                      unlocked={unlocked}
                      size="md"
                      showName
                      variant="sticker"
                    />
                  </button>
                </div>

                {isManual && !unlocked && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1.5 text-[10px] h-6 px-2 border-amber-900/30 text-amber-900/80 hover:bg-amber-900/10"
                    onClick={() => handleManualUnlock(id)}
                    disabled={unlocking === id}
                  >
                    {unlocking === id ? "…" : "Unlock"}
                  </Button>
                )}
                <p
                  className="mt-1 text-[10px] text-center leading-tight max-w-[72px]"
                  style={{ color: "#a08060" }}
                >
                  {def.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Footer: magazine-style fine print */}
        <p
          className="mt-8 text-center text-[10px]"
          style={{ color: "#a08060", opacity: 0.8 }}
        >
          Earn achievements by using Dilly. Tap unlocked achievements to add them to your share cards.
        </p>
      </div>
    </div>
  );
}
