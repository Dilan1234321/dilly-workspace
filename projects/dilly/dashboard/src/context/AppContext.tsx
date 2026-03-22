"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { SchoolConfig } from "@/lib/schools";
import type { AppProfile, User } from "@/types/dilly";

type AppContextValue = {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  appProfile: AppProfile | null;
  setAppProfile: React.Dispatch<React.SetStateAction<AppProfile | null>>;
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
      appProfile,
      setAppProfile,
      school,
      setSchool,
      theme,
    }),
    [user, appProfile, school, theme]
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
