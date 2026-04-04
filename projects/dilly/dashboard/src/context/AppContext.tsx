"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { SchoolConfig } from "@/lib/schools";
import type { AppProfile, User } from "@/types/dilly";
import { getSchoolById } from "@/lib/schools";

/** Storage key for school ID — matches @dilly/api SCHOOL_STORAGE_KEY */
const SCHOOL_STORAGE_KEY = "dilly_school";

type AppContextValue = {
  // Auth
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  authLoading: boolean;
  setAuthLoading: React.Dispatch<React.SetStateAction<boolean>>;
  allowMainApp: boolean;
  setAllowMainApp: React.Dispatch<React.SetStateAction<boolean>>;
  onboardingNeeded: boolean | null;
  setOnboardingNeeded: React.Dispatch<React.SetStateAction<boolean | null>>;
  profileFetchDone: boolean;
  setProfileFetchDone: React.Dispatch<React.SetStateAction<boolean>>;
  // Profile
  appProfile: AppProfile | null;
  setAppProfile: React.Dispatch<React.SetStateAction<AppProfile | null>>;
  // School & theme
  school: SchoolConfig | null;
  setSchool: React.Dispatch<React.SetStateAction<SchoolConfig | null>>;
  theme: { primary: string; secondary: string; backgroundTint: string };
};

const AppContext = createContext<AppContextValue | null>(null);

const DEFAULT_THEME = {
  primary: "#C8102E",
  secondary: "#FFCD00",
  backgroundTint: "#0b0f1a",
};

export function AppProvider({
  children,
  initialUser,
  initialProfile,
  initialSchool,
}: {
  children: React.ReactNode;
  initialUser?: User | null;
  initialProfile?: AppProfile | null;
  initialSchool?: SchoolConfig | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser ?? null);
  const [authLoading, setAuthLoading] = useState(true);
  const [allowMainApp, setAllowMainApp] = useState(false);
  const [onboardingNeeded, setOnboardingNeeded] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const savedId = localStorage.getItem(SCHOOL_STORAGE_KEY);
      if (savedId && getSchoolById(savedId)) return false;
      return true;
    } catch {
      return true;
    }
  });
  const [profileFetchDone, setProfileFetchDone] = useState(false);
  const [appProfile, setAppProfile] = useState<AppProfile | null>(initialProfile ?? null);
  const [school, setSchool] = useState<SchoolConfig | null>(initialSchool ?? null);

  const theme = useMemo(
    () => ({
      primary: school?.theme?.primary ?? DEFAULT_THEME.primary,
      secondary: school?.theme?.secondary ?? DEFAULT_THEME.secondary,
      backgroundTint: school?.theme?.backgroundTint ?? DEFAULT_THEME.backgroundTint,
    }),
    [school?.theme]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      setUser,
      authLoading,
      setAuthLoading,
      allowMainApp,
      setAllowMainApp,
      onboardingNeeded,
      setOnboardingNeeded,
      profileFetchDone,
      setProfileFetchDone,
      appProfile,
      setAppProfile,
      school,
      setSchool,
      theme,
    }),
    [user, authLoading, allowMainApp, onboardingNeeded, profileFetchDone, appProfile, school, theme]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}

export function useAppContextOptional() {
  return useContext(AppContext);
}
