"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { StudentProfile } from "@/types/student";
import { DEFAULT_PROFILE } from "@/types/student";
import { normalizeProfile } from "@/lib/profileJson";

type MeContextValue = {
  profile: StudentProfile;
  updateProfile: (next: StudentProfile) => void;
  savedCollegeIds: string[];
  toggleCollege: (id: string) => void;
  ready: boolean;
  error: string | null;
  disclaimerAcceptedAt: string | null;
  acceptDisclaimer: () => Promise<void>;
};

const MeContext = createContext<MeContextValue | null>(null);

function readLegacyLocalStorage(): {
  profile?: Partial<StudentProfile>;
  savedCollegeIds?: string[];
} | null {
  if (typeof window === "undefined") return null;
  try {
    const p = localStorage.getItem("aplivio_student_profile_v1");
    const c = localStorage.getItem("aplivio_saved_colleges_v1");
    if (!p && !c) return null;
    return {
      profile: p ? (JSON.parse(p) as Partial<StudentProfile>) : undefined,
      savedCollegeIds: c ? (JSON.parse(c) as string[]) : undefined,
    };
  } catch {
    return null;
  }
}

function clearLegacyLocalStorage() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("aplivio_student_profile_v1");
  localStorage.removeItem("aplivio_saved_colleges_v1");
}

export function MeProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<StudentProfile>(DEFAULT_PROFILE);
  const [savedCollegeIds, setSavedCollegeIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disclaimerAcceptedAt, setDisclaimerAcceptedAt] = useState<string | null>(null);

  const skipProfilePatch = useRef(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/me", { credentials: "include" });
        if (!r.ok) throw new Error("Could not load session");
        const data = (await r.json()) as {
          profile: unknown;
          savedCollegeIds: unknown;
          disclaimerAcceptedAt: string | null;
        };
        if (cancelled) return;

        const legacy = readLegacyLocalStorage();
        let nextProfile = normalizeProfile(data.profile);
        let nextIds = Array.isArray(data.savedCollegeIds)
          ? (data.savedCollegeIds as string[])
          : [];

        if (legacy) {
          nextProfile = normalizeProfile({
            ...nextProfile,
            ...legacy.profile,
          });
          if (legacy.savedCollegeIds?.length) {
            nextIds = [...new Set([...nextIds, ...legacy.savedCollegeIds])];
          }
          await fetch("/api/me", {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile: nextProfile, savedCollegeIds: nextIds }),
          });
          clearLegacyLocalStorage();
        }

        setProfile(nextProfile);
        setSavedCollegeIds(nextIds);
        setDisclaimerAcceptedAt(data.disclaimerAcceptedAt);
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Load failed");
          setReady(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (skipProfilePatch.current) {
      skipProfilePatch.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void fetch("/api/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      }).catch(() => setError("Could not save profile — try again."));
    }, 550);
    return () => window.clearTimeout(t);
  }, [profile, ready]);

  const updateProfile = useCallback((next: StudentProfile) => {
    setProfile(next);
    setError(null);
  }, []);

  const toggleCollege = useCallback((id: string) => {
    setSavedCollegeIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      void fetch("/api/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedCollegeIds: next }),
      }).catch(() => setError("Could not save list — try again."));
      return next;
    });
  }, []);

  const acceptDisclaimer = useCallback(async () => {
    const r = await fetch("/api/me", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disclaimerAccepted: true }),
    });
    if (!r.ok) {
      setError("Could not save acknowledgment");
      return;
    }
    const data = (await r.json()) as { disclaimerAcceptedAt: string | null };
    setDisclaimerAcceptedAt(data.disclaimerAcceptedAt);
  }, []);

  const value = useMemo(
    () => ({
      profile,
      updateProfile,
      savedCollegeIds,
      toggleCollege,
      ready,
      error,
      disclaimerAcceptedAt,
      acceptDisclaimer,
    }),
    [
      profile,
      updateProfile,
      savedCollegeIds,
      toggleCollege,
      ready,
      error,
      disclaimerAcceptedAt,
      acceptDisclaimer,
    ],
  );

  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): MeContextValue {
  const v = useContext(MeContext);
  if (!v) throw new Error("useMe must be used within MeProvider");
  return v;
}
