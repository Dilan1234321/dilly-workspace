"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AUTH_USER_CACHE_KEY,
  AUTH_USER_CACHE_MAX_AGE_MS,
  PROFILE_CACHE_KEY_BASE,
  SCHOOL_NAME_KEY,
  profilePhotoCacheKey,
} from "@/lib/dillyUtils";
import { dilly } from "@/lib/dilly";

type AppProfileHeaderProps = {
  /** Override name (avoids reading from cache). */
  name?: string | null;
  /** Override track/cohort line. */
  track?: string | null;
  /** Override school name. */
  schoolName?: string | null;
  /** Override profile photo URL (null = no photo). */
  photoUrl?: string | null;
  /** Called when profile photo circle is tapped (e.g. open edit-profile). Defaults to navigating to /?tab=center. */
  onPhotoTap?: () => void;
  /** Show a back arrow to the left of the profile photo. Pass an href string or a click handler. */
  back?: string | (() => void);
  /** When set, replaces the settings gear (e.g. Save on resume edit). */
  rightSlot?: ReactNode;
  /** Shown after the name (e.g. unsaved indicator). */
  titleSuffix?: ReactNode;
  /** Extra className on outer <header>. */
  className?: string;
};

/**
 * Shared sticky header: profile photo · single wrapping title line (name · cohort · school) · settings gear.
 * Title uses text-balance + overflow-wrap so it stays one line when there is room and wraps when narrow (e.g. back button).
 * Reads cached profile from localStorage for instant paint on standalone pages.
 */
export function AppProfileHeader({
  name: nameProp,
  track: trackProp,
  schoolName: schoolProp,
  photoUrl: photoProp,
  onPhotoTap,
  back,
  rightSlot,
  titleSuffix,
  className,
}: AppProfileHeaderProps) {
  const [name, setName] = useState(nameProp || "");
  const [track, setTrack] = useState(trackProp || "");
  const [schoolName, setSchoolName] = useState(schoolProp || "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(photoProp || null);

  useEffect(() => {
    void (async () => {
      try {
        let email: string | null = null;
        const raw = sessionStorage.getItem(AUTH_USER_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.email && typeof parsed.ts === "number" && Date.now() - parsed.ts < AUTH_USER_CACHE_MAX_AGE_MS) {
            email = parsed.email;
          }
        }
        if (!email) {
          const isAuth = await dilly.isAuthenticated();
          if (!isAuth) return;
        }

        if (email) {
          if (nameProp === undefined) {
            const cached = localStorage.getItem(`${PROFILE_CACHE_KEY_BASE}_${email}`);
            if (cached) {
              const p = JSON.parse(cached);
              if (p?.name) setName(p.name);
              if (p?.track) setTrack(p.track);
            }
          }
          if (photoProp === undefined) {
            const photo = localStorage.getItem(profilePhotoCacheKey(email));
            if (photo && photo.startsWith("data:image/")) setPhotoUrl(photo);
          }
        }

        if (nameProp === undefined) {
          const sn = localStorage.getItem(SCHOOL_NAME_KEY);
          if (sn) setSchoolName(sn);
        }
      } catch { /* ignore */ }
    })();
  }, [nameProp, photoProp]);

  useEffect(() => { if (nameProp !== undefined) setName(nameProp || ""); }, [nameProp]);
  useEffect(() => { if (trackProp !== undefined) setTrack(trackProp || ""); }, [trackProp]);
  useEffect(() => { if (schoolProp !== undefined) setSchoolName(schoolProp || ""); }, [schoolProp]);
  useEffect(() => { if (photoProp !== undefined) setPhotoUrl(photoProp || null); }, [photoProp]);

  /** Shown after name; same as before when track/school missing (placeholder cohort). */
  const cohortLine = [track, schoolName].filter(Boolean).join(" · ") || "Your track";

  const backArrow = (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );

  return (
    <header
      className={`sticky top-0 z-20 flex items-center gap-3 py-3 px-0${className ? ` ${className}` : ""}`}
      style={{ background: "var(--bg)" }}
    >
      {back && (
        typeof back === "string" ? (
          <Link
            href={back}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80 -mr-1"
            style={{ color: "var(--t2)" }}
            aria-label="Back"
          >
            {backArrow}
          </Link>
        ) : (
          <button
            type="button"
            onClick={back}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80 border-0 bg-transparent -mr-1"
            style={{ color: "var(--t2)" }}
            aria-label="Back"
          >
            {backArrow}
          </button>
        )
      )}
      {onPhotoTap ? (
        <button
          type="button"
          onClick={onPhotoTap}
          className="shrink-0 rounded-full overflow-hidden transition-opacity hover:opacity-90 active:opacity-80 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-[var(--bg)] w-[34px] h-[34px] flex items-center justify-center ring-2 ring-white"
          aria-label="Edit profile"
          style={{ background: photoUrl ? "transparent" : "var(--s2)" }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          )}
        </button>
      ) : (
        <Link
          href="/profile/details"
          className="shrink-0 rounded-full overflow-hidden transition-opacity hover:opacity-90 active:opacity-80 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-[var(--bg)] w-[34px] h-[34px] flex items-center justify-center ring-2 ring-white"
          aria-label="Profile"
          style={{ background: photoUrl ? "transparent" : "var(--s2)" }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          )}
        </Link>
      )}

      <div className="min-w-0 flex-1 text-center px-0.5">
        <h1
          className="text-[15px] font-semibold leading-snug min-w-0 max-w-full text-balance"
          style={{ color: "var(--t1)", letterSpacing: "-0.02em" }}
        >
          <span className="inline [overflow-wrap:anywhere]">
            <span className="font-semibold" style={{ color: "var(--t1)" }}>
              {name || "Welcome"}
              {titleSuffix}
            </span>
            {" "}
            <span className="font-normal" style={{ color: "var(--t3)" }} aria-hidden>
              ·{" "}
            </span>
            <span
              className="text-[12px] font-medium sm:text-[11px]"
              style={{ color: "var(--t3)" }}
            >
              {cohortLine}
            </span>
          </span>
        </h1>
      </div>

      {rightSlot ?? (
        <Link
          href="/settings"
          className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg transition-opacity hover:opacity-80"
          style={{ color: "var(--t2)" }}
          aria-label="Settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      )}
    </header>
  );
}
