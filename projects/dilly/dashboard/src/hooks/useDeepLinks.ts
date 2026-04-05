import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClientSearchParams } from "@/lib/clientSearchParams";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useNavigation } from "@/contexts/NavigationContext";
import {
  AUTH_USER_CACHE_KEY,
  DILLY_OPEN_OVERLAY_KEY,
  PENDING_VOICE_KEY,
  auditStorageKey,
  stashAuditForReportHandoff,
} from "@/lib/dillyUtils";

import type { AuditV2 } from "@/types/dilly";

interface UseDeepLinksParams {
  replaceToAuditReport: (auditId: string, explicitFullAudit?: AuditV2 | null) => void;
  voiceAuditReportIdRef: React.MutableRefObject<string | null>;
  voiceCertLandingRef: React.MutableRefObject<{ cert_id: string; name?: string; provider?: string; source?: string } | null>;
}

export function useDeepLinks({
  replaceToAuditReport,
  voiceAuditReportIdRef,
  voiceCertLandingRef,
}: UseDeepLinksParams) {
  const router = useRouter();
  const searchParams = useClientSearchParams();
  const {
    state: { mainAppTab, reviewSubView },
    setMainAppTab, setReviewSubView, setGetHiredSubTab, setJobsPanelInitialFilter,
  } = useNavigation();
  const { user, appProfile, school } = useAppContext();
  const {
    audit,
    savedAuditForCenter,
    viewingAudit,
    auditHistory,
    setCenterRefreshKey,
  } = useAuditScore();
  const { setVoiceOverlayOpen } = useVoice();

  const [stickerSheetOpen, setStickerSheetOpen] = useState(false);
  const scrollApplicationsOnResourcesRef = useRef(false);
  const fromSettingsWhenEditingProfileRef = useRef(false);

  // Local state for upload flow trigger (needs to be passed back)
  const [wantsNewAudit, setWantsNewAudit] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);

  // Open sticker sheet from Settings (e.g. /?openStickerSheet=1)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (searchParams.get("openStickerSheet") === "1") {
       
      setStickerSheetOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("openStickerSheet");
      window.history.replaceState({}, "", url.pathname + url.search || "/");
    }
  }, [searchParams]);

  // Deep link from /jobs
  useEffect(() => {
    const tab = searchParams.get("tab");
    const sub = searchParams.get("sub");
    const auditRefresh = searchParams.get("audit_refresh") === "1";
    if (!tab && !sub && !auditRefresh) return;
    const url = new URL(typeof window !== "undefined" ? window.location.href : "http://localhost/");
    let applied = false;
    if (tab === "center") { setMainAppTab("center"); applied = true; }
    if (tab === "explore") { setMainAppTab("center"); applied = true; }
    if (tab === "calendar") { setMainAppTab("calendar"); applied = true; }
    else if (tab === "practice") { setMainAppTab("practice"); applied = true; }
    else if (tab === "voice") { applied = false; }
    else if (tab === "resources") {
      const view = searchParams.get("view");
      if (view === "certifications") { queueMicrotask(() => setMainAppTab("certifications")); applied = true; }
      else if (view === "playbook") { queueMicrotask(() => setMainAppTab("career_playbook")); applied = true; }
      else {
        if (view === "applications") {
          scrollApplicationsOnResourcesRef.current = true;
          setGetHiredSubTab("applications");
          setJobsPanelInitialFilter(null);
        } else if (view === "jobs") {
          setGetHiredSubTab("jobs");
          const type = (searchParams.get("type") || "").trim().toLowerCase();
          if (type === "internship") setJobsPanelInitialFilter("internship");
          else if (type === "job" || type === "full_time" || type === "full-time") setJobsPanelInitialFilter("full_time");
          else setJobsPanelInitialFilter(null);
        }
        setMainAppTab("resources");
        applied = true;
      }
    } else if (tab === "report" || sub === "report") {
      setMainAppTab("hiring");
      const viewAuditId = searchParams.get("viewAudit")?.trim();
      if (viewAuditId) {
        queueMicrotask(() => {
          try {
            const ur = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(AUTH_USER_CACHE_KEY) : null;
            if (ur) {
              const u = JSON.parse(ur) as { email?: string };
              if (u?.email) {
                const stored = localStorage.getItem(auditStorageKey(u.email));
                if (stored) {
                  const aud = JSON.parse(stored) as AuditV2;
                  if (String(aud?.id || "").trim() === viewAuditId && aud.scores) {
                    stashAuditForReportHandoff(aud);
                  }
                }
              }
            }
          } catch { /* ignore */ }
          router.replace(`/audit/${encodeURIComponent(viewAuditId)}`);
        });
        setReviewSubView("home");
      } else {
        setReviewSubView("home");
      }
      applied = true;
    } else if (tab === "insights" || sub === "insights") {
      setMainAppTab("hiring"); setReviewSubView("insights"); applied = true;
    } else if (tab === "upload" || sub === "upload") {
       
      setMainAppTab("hiring"); setReviewSubView("upload"); setWantsNewAudit(true);
      if (searchParams.get("paste") === "1") { setPasteMode(true); }
      applied = true;
    } else if (tab === "score" || sub === "score") {
      queueMicrotask(() => setMainAppTab("score")); applied = true;
    } else if (tab === "edit") {
      setMainAppTab("edit"); applied = true;
    }
    if (auditRefresh) { setCenterRefreshKey((k) => k + 1); applied = true; }
    if (applied && typeof window !== "undefined") {
      url.searchParams.delete("tab");
      url.searchParams.delete("sub");
      url.searchParams.delete("audit_refresh");
      url.searchParams.delete("paste");
      url.searchParams.delete("viewAudit");
      url.searchParams.delete("view");
      url.searchParams.delete("share");
      window.history.replaceState({}, "", url.pathname + url.search || "/");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [searchParams, router]);

  // Scroll to applications
  useEffect(() => {
    if (mainAppTab !== "resources" || !scrollApplicationsOnResourcesRef.current) return;
    scrollApplicationsOnResourcesRef.current = false;
    const t = window.setTimeout(() => {
      document.getElementById("get-hired-applications")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => clearTimeout(t);
  }, [mainAppTab]);

  // tab=voice in URL
  useEffect(() => {
    if (searchParams.get("tab") !== "voice" || !user?.subscribed) return;
    setMainAppTab("center");
    const url = new URL(typeof window !== "undefined" ? window.location.href : "http://localhost/");
    url.searchParams.delete("tab");
    if (typeof window !== "undefined") window.history.replaceState({}, "", url.pathname + url.search || "/");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [searchParams, user?.subscribed]);

  // Legacy reviewSubView === "report" redirect
  useEffect(() => {
    if (mainAppTab !== "hiring" || reviewSubView !== "report") return;
    const da = viewingAudit ?? audit ?? savedAuditForCenter;
    const id = (da?.id || auditHistory[0]?.id || "").trim();
    setReviewSubView("home");
    if (id) replaceToAuditReport(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [mainAppTab, reviewSubView, viewingAudit, audit, savedAuditForCenter, auditHistory, replaceToAuditReport]);

  // Handle redirects from standalone Jobs page
  useEffect(() => {
    if (typeof window === "undefined" || !user?.subscribed) return;
    let preserveLaunchVoice = false;
    try { preserveLaunchVoice = sessionStorage.getItem(DILLY_OPEN_OVERLAY_KEY) === "1"; } catch { /* ignore */ }
    if (!preserveLaunchVoice) {
      voiceAuditReportIdRef.current = null;
      voiceCertLandingRef.current = null;
      setVoiceOverlayOpen(false);
    }
    try {
      sessionStorage.removeItem("dilly_pending_voice_prompt");
      if (!preserveLaunchVoice) sessionStorage.removeItem(PENDING_VOICE_KEY);
      if (typeof localStorage !== "undefined") localStorage.removeItem("dilly_pending_voice_prompt");
      const openTab = sessionStorage.getItem("dilly_open_tab");
      if (openTab === "hiring") {
        sessionStorage.removeItem("dilly_open_tab");
        setMainAppTab("hiring");
        setReviewSubView("home");
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [user?.subscribed]);

  // Edit profile from settings
  useEffect(() => {
    const sp = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (sp?.get("edit") !== "profile" || !user?.subscribed || !appProfile) return;
    fromSettingsWhenEditingProfileRef.current = true;
    setMainAppTab("center");
    router.replace("/");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [user?.subscribed, appProfile, school]);

  // Clear stale pending Voice prompt
  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    try {
      if (sessionStorage.getItem(DILLY_OPEN_OVERLAY_KEY) === "1") return;
      sessionStorage.removeItem(PENDING_VOICE_KEY);
    } catch { /* ignore */ }
  }, []);

  return {
    stickerSheetOpen,
    setStickerSheetOpen,
    scrollApplicationsOnResourcesRef,
    fromSettingsWhenEditingProfileRef,
    wantsNewAudit,
    setWantsNewAudit,
    pasteMode,
    setPasteMode,
  };
}
