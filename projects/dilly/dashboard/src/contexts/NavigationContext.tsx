"use client";

import React, { createContext, useContext, useReducer, useMemo, useCallback } from "react";
import type { JobFilterKey } from "@/components/jobs/FilterRow";

// ── Tab types ──────────────────────────────────────────────────────────────────

export type AppTab =
  | "center"
  | "hiring"
  | "voice"
  | "resources"
  | "calendar"
  | "practice"
  | "rank"
  | "score"
  | "memory"
  | "actions"
  | "voice_history"
  | "certifications"
  | "career_playbook"
  | "settings"
  | "profile_details"
  | "ready_check"
  | "edit";

export type HiringSubView = "home" | "upload" | "report" | "insights" | "dimensions";
export type GetHiredSubTab = "applications" | "jobs";

// ── State ──────────────────────────────────────────────────────────────────────

interface NavigationState {
  mainAppTab: AppTab;
  reviewSubView: HiringSubView;
  getHiredSubTab: GetHiredSubTab;
  readyCheckCompany: string | null;
  jobsPanelInitialFilter: JobFilterKey | null;
}

const initialState: NavigationState = {
  mainAppTab: "center",
  reviewSubView: "home",
  getHiredSubTab: "applications",
  readyCheckCompany: null,
  jobsPanelInitialFilter: null,
};

// ── Actions ────────────────────────────────────────────────────────────────────

type NavigationAction =
  | { type: "SET_TAB"; tab: AppTab }
  | { type: "SET_HIRING_SUB_VIEW"; subView: HiringSubView }
  | { type: "SET_GET_HIRED_SUB_TAB"; subTab: GetHiredSubTab }
  | { type: "SET_READY_CHECK_COMPANY"; company: string | null }
  | { type: "SET_JOBS_PANEL_FILTER"; filter: JobFilterKey | null }
  | { type: "NAVIGATE_TO_HIRING"; subView?: HiringSubView }
  | { type: "NAVIGATE_TO_RESOURCES"; subTab?: GetHiredSubTab; filter?: JobFilterKey | null };

function navigationReducer(state: NavigationState, action: NavigationAction): NavigationState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, mainAppTab: action.tab };
    case "SET_HIRING_SUB_VIEW":
      return { ...state, reviewSubView: action.subView };
    case "SET_GET_HIRED_SUB_TAB":
      return { ...state, getHiredSubTab: action.subTab };
    case "SET_READY_CHECK_COMPANY":
      return { ...state, readyCheckCompany: action.company };
    case "SET_JOBS_PANEL_FILTER":
      return { ...state, jobsPanelInitialFilter: action.filter };
    case "NAVIGATE_TO_HIRING":
      return {
        ...state,
        mainAppTab: "hiring",
        reviewSubView: action.subView ?? "home",
      };
    case "NAVIGATE_TO_RESOURCES":
      return {
        ...state,
        mainAppTab: "resources",
        getHiredSubTab: action.subTab ?? state.getHiredSubTab,
        jobsPanelInitialFilter: action.filter ?? state.jobsPanelInitialFilter,
      };
    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────────

interface NavigationContextValue {
  state: NavigationState;
  dispatch: React.Dispatch<NavigationAction>;
  // Convenience setters (avoid dispatch boilerplate in consumers)
  setMainAppTab: (tab: AppTab) => void;
  setReviewSubView: (subView: HiringSubView) => void;
  setGetHiredSubTab: (subTab: GetHiredSubTab) => void;
  setReadyCheckCompany: (company: string | null) => void;
  setJobsPanelInitialFilter: (filter: JobFilterKey | null) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(navigationReducer, initialState);

  const setMainAppTab = useCallback(
    (tab: AppTab) => dispatch({ type: "SET_TAB", tab }),
    [],
  );
  const setReviewSubView = useCallback(
    (subView: HiringSubView) => dispatch({ type: "SET_HIRING_SUB_VIEW", subView }),
    [],
  );
  const setGetHiredSubTab = useCallback(
    (subTab: GetHiredSubTab) => dispatch({ type: "SET_GET_HIRED_SUB_TAB", subTab }),
    [],
  );
  const setReadyCheckCompany = useCallback(
    (company: string | null) => dispatch({ type: "SET_READY_CHECK_COMPANY", company }),
    [],
  );
  const setJobsPanelInitialFilter = useCallback(
    (filter: JobFilterKey | null) => dispatch({ type: "SET_JOBS_PANEL_FILTER", filter }),
    [],
  );

  const value = useMemo<NavigationContextValue>(
    () => ({
      state,
      dispatch,
      setMainAppTab,
      setReviewSubView,
      setGetHiredSubTab,
      setReadyCheckCompany,
      setJobsPanelInitialFilter,
    }),
    [state, setMainAppTab, setReviewSubView, setGetHiredSubTab, setReadyCheckCompany, setJobsPanelInitialFilter],
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider");
  return ctx;
}
