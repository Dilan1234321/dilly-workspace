import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/context/AppContext";
import { useAuditScore } from "@/contexts/AuditScoreContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useToast } from "@/hooks/useToast";
import { dilly } from "@/lib/dilly";
import { getSchoolById } from "@/lib/schools";
import {
  AUTH_USER_CACHE_KEY,
  AUTH_USER_CACHE_MAX_AGE_MS,
  ONBOARDING_STEP_KEY,
  PROFILE_CACHE_KEY_BASE,
  SCHOOL_STORAGE_KEY,
  VOICE_CONVOS_KEY,
  VOICE_MESSAGES_KEY,
  auditStorageKey,
  profilePhotoCacheKey,
  voiceStorageKey,
} from "@/lib/dillyUtils";
import { DEFAULT_VOICE_AVATAR_INDEX, VOICE_AVATAR_OPTIONS } from "@/lib/voiceAvatars";

interface UseAppLifecycleParams {
  setApplicationTarget: (v: string) => void;
}

export function useAppLifecycle({ setApplicationTarget }: UseAppLifecycleParams) {
  const _router = useRouter();
  const { toast: _toast } = useToast();
  const {
    user, setUser: _setUser,
    authLoading: _authLoading, setAuthLoading: _setAuthLoading,
    setAllowMainApp,
    setOnboardingNeeded,
    setProfileFetchDone,
    appProfile, setAppProfile,
    school: _school, setSchool,
  } = useAppContext();
  const {
    setVoiceConvos: _setVoiceConvos,
    setOpenVoiceConvIds: _setOpenVoiceConvIds,
    setActiveVoiceConvId: _setActiveVoiceConvId,
    setVoiceMessages: _setVoiceMessages,
    setVoiceMessageQueue: _setVoiceMessageQueue,
    setVoiceInput: _setVoiceInput,
    setVoiceStreamingText: _setVoiceStreamingText,
    setVoiceFollowUpSuggestions: _setVoiceFollowUpSuggestions,
    setVoiceActionItems: _setVoiceActionItems,
    setVoiceCompany: _setVoiceCompany,
    setVoiceMemory,
    setVoiceAvatarIndex,
    voiceCalendarSyncKey,
  } = useVoice();
  const { centerRefreshKey } = useAuditScore();

  const [isOffline, setIsOffline] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [photoCropImageSrc, setPhotoCropImageSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const hasRedirected = useRef(false);

  // School config load from localStorage
  useEffect(() => {
    try {
      const savedId = localStorage.getItem(SCHOOL_STORAGE_KEY);
      if (savedId) {
        const config = getSchoolById(savedId);
        if (config) {
          setSchool(config);
          setOnboardingNeeded(false);
        } else {
          setOnboardingNeeded(true);
        }
      } else {
        setOnboardingNeeded(true);
      }
    } catch {
      setOnboardingNeeded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, []);

  // Auth check — runs once on mount only
  useEffect(() => {
    if (hasRedirected.current) return;

    // URL token handoff from student app (?token=...)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get("token");
      if (urlToken) {
        localStorage.setItem("dilly_auth_token", urlToken);
        window.history.replaceState({}, "", "/");
      }
    } catch { /* ignore */ }

    if (!localStorage.getItem("dilly_auth_token")) {
      hasRedirected.current = true;
      window.location.replace("http://localhost:3001/onboarding/welcome");
      return;
    }

    // Warm the UI from short-lived session cache
    try {
      const raw = sessionStorage.getItem(AUTH_USER_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { email: string; subscribed: boolean; ts: number };
        if (parsed?.email && typeof parsed.ts === "number" && Date.now() - parsed.ts < AUTH_USER_CACHE_MAX_AGE_MS) {
          setUser({ email: parsed.email, subscribed: true });
        }
      }
    } catch { /* ignore */ }

    dilly.fetch(`/auth/me`)
      .then(async (res) => {
        if (res.status === 401) {
          localStorage.removeItem("dilly_auth_token");
          try { sessionStorage.removeItem(AUTH_USER_CACHE_KEY); } catch { /* ignore */ }
          hasRedirected.current = true;
          window.location.replace("http://localhost:3001/onboarding/verify?returning=true");
          return null;
        }
        if (!res.ok) {
          setAllowMainApp(true);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) {
          const u = { email: data.email ?? "", subscribed: true };
          setUser(u);
          try {
            sessionStorage.setItem(AUTH_USER_CACHE_KEY, JSON.stringify({ ...u, ts: Date.now() }));
          } catch { /* ignore */ }
          setAllowMainApp(true);
        }
      })
      .catch(() => {
        setAllowMainApp(true);
      })
      .finally(() => setAuthLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle redirects from standalone Jobs page
  useEffect(() => {
    if (typeof window === "undefined" || !user?.subscribed) return;
    // NOTE: preserveLaunchVoice and session cleanup handled here but tab setting
    // is done by page.tsx since it needs setMainAppTab from NavigationContext
  }, [user?.subscribed]);

  // Store referral code from ?ref=
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref")?.trim();
    if (ref && ref.length >= 4 && ref.length <= 16) {
      try {
        sessionStorage.setItem("dilly_ref", ref);
        const rest = [...params.entries()].filter(([k]) => k !== "ref");
        const qs = rest.length ? "?" + new URLSearchParams(rest).toString() : "";
        window.history.replaceState({}, "", window.location.pathname + qs);
      } catch { /* ignore */ }
    }
  }, []);

  // Stripe success redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscription") !== "success") return;
    if (!localStorage.getItem("dilly_auth_token")) return;
    dilly.fetch(`/auth/me`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUser({ email: data?.email ?? "", subscribed: true });
        try {
          localStorage.removeItem(ONBOARDING_STEP_KEY);
        } catch { /* ignore */ }
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch(() => {});
  }, []);

  // Load profile for Career Center home
  useEffect(() => {
    if (!user?.email) {
      setAppProfile(null);
      setProfileFetchDone(true);
      return;
    }
    if (!localStorage.getItem("dilly_auth_token")) {
      setProfileFetchDone(true);
      return;
    }

    setProfileFetchDone(false);

    const cacheKey = `${PROFILE_CACHE_KEY_BASE}_${user.email}`;
    let loadedFromCache = false;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && typeof cached === "object") {
          const merged = { ...cached, onboarding_complete: cached.onboarding_complete === true };
          setAppProfile(merged);
          if (cached.application_target && ["internship", "full_time", "exploring"].includes(cached.application_target)) {
            setApplicationTarget(cached.application_target);
          }
          if (typeof cached.voice_avatar_index === "number" && cached.voice_avatar_index >= 0 && cached.voice_avatar_index < VOICE_AVATAR_OPTIONS.length) {
            setVoiceAvatarIndex(cached.voice_avatar_index);
          } else {
            setVoiceAvatarIndex(DEFAULT_VOICE_AVATAR_INDEX);
          }
          loadedFromCache = true;
        }
      }
      if (!loadedFromCache) {
        const avatarRaw = localStorage.getItem(voiceStorageKey("avatar", user.email));
        if (avatarRaw !== null) {
          const idx = parseInt(avatarRaw, 10);
          if (!isNaN(idx) && idx >= 0 && idx < VOICE_AVATAR_OPTIONS.length) {
            setVoiceAvatarIndex(idx);
          } else {
            setVoiceAvatarIndex(DEFAULT_VOICE_AVATAR_INDEX);
          }
        } else {
          setVoiceAvatarIndex(DEFAULT_VOICE_AVATAR_INDEX);
        }
      }
    } catch { /* ignore */ }

    const ac = new AbortController();
    dilly.fetch(`/profile`, { signal: ac.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data === "object") {
          const profile = {
            name: data.name ?? null,
            major: data.major ?? null,
            majors: Array.isArray(data.majors) ? data.majors : (data.major ? [data.major] : []),
            minors: Array.isArray(data.minors) ? data.minors : [],
            goals: Array.isArray(data.goals) ? data.goals : [],
            track: data.track ?? null,
            preProfessional: !!data.preProfessional,
            application_target: data.application_target ?? null,
            application_target_label: data.application_target_label ?? null,
            career_goal: data.career_goal ?? null,
            deadlines: Array.isArray(data.deadlines) ? data.deadlines : [],
            target_school: data.target_school ?? null,
            profile_slug: data.profile_slug ?? null,
            profile_background_color: data.profile_background_color ?? null,
            profile_tagline: data.profile_tagline ?? null,
            profile_theme: data.profile_theme ?? null,
            profile_bio: data.profile_bio ?? null,
            voice_memory: Array.isArray(data.voice_memory) ? data.voice_memory : [],
            job_locations: Array.isArray(data.job_locations) ? data.job_locations : [],
            job_location_scope: data.job_location_scope ?? null,
            voice_avatar_index: typeof data.voice_avatar_index === "number" ? data.voice_avatar_index : undefined,
            custom_tagline: data.custom_tagline ?? null,
            share_card_achievements: Array.isArray(data.share_card_achievements) ? data.share_card_achievements : [],
            share_card_metric: (data.share_card_metric === "smart" || data.share_card_metric === "grit" || data.share_card_metric === "build" || data.share_card_metric === "mts" || data.share_card_metric === "ats") ? data.share_card_metric : null,
            achievements: data.achievements && typeof data.achievements === "object" ? data.achievements : {},
            first_audit_snapshot: data.first_audit_snapshot ?? null,
            first_application_at: typeof data.first_application_at === "number" ? data.first_application_at : null,
            first_interview_at: typeof data.first_interview_at === "number" ? data.first_interview_at : null,
            got_interview_at: typeof data.got_interview_at === "number" ? data.got_interview_at : null,
            got_offer_at: typeof data.got_offer_at === "number" ? data.got_offer_at : null,
            outcome_story_consent: data.outcome_story_consent === true || data.outcome_story_consent === false ? data.outcome_story_consent : null,
            outcome_prompt_dismissed_at: typeof data.outcome_prompt_dismissed_at === "number" ? data.outcome_prompt_dismissed_at : null,
            voice_tone: data.voice_tone ?? null,
            voice_notes: Array.isArray(data.voice_notes) ? data.voice_notes : [],
            voice_onboarding_done: data.voice_onboarding_done === true,
            voice_onboarding_answers: Array.isArray(data.voice_onboarding_answers) ? data.voice_onboarding_answers : undefined,
            transcript_uploaded_at: data.transcript_uploaded_at ?? null,
            transcript_gpa: typeof data.transcript_gpa === "number" ? data.transcript_gpa : null,
            transcript_bcpm_gpa: typeof data.transcript_bcpm_gpa === "number" ? data.transcript_bcpm_gpa : null,
            transcript_courses: Array.isArray(data.transcript_courses) ? data.transcript_courses : [],
            transcript_honors: Array.isArray(data.transcript_honors) ? data.transcript_honors : [],
            transcript_major: data.transcript_major ?? null,
            transcript_minor: data.transcript_minor ?? null,
            transcript_warnings: Array.isArray(data.transcript_warnings) ? data.transcript_warnings : [],
            streak: data.streak && typeof data.streak === "object" ? data.streak : undefined,
            onboarding_complete: data.onboarding_complete === true,
          };
          setAppProfile(profile);
          if (Array.isArray(data.voice_memory) && data.voice_memory.length > 0) {
            setVoiceMemory(data.voice_memory);
          } else {
            try {
              const s = localStorage.getItem(voiceStorageKey("memory", user.email));
              if (s) {
                const p = JSON.parse(s);
                if (Array.isArray(p) && p.length > 0) setVoiceMemory(p);
              }
            } catch { /* ignore */ }
          }
          try { localStorage.setItem(cacheKey, JSON.stringify(profile)); } catch { /* ignore */ }
          if (profile.application_target && ["internship", "full_time", "exploring"].includes(profile.application_target)) {
            setApplicationTarget(profile.application_target);
          }
          // Auto check-in for streak
          dilly.fetch(`/streak/checkin`, { method: "POST" })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => {
              if (d) {
                setAppProfile((prev) => prev ? { ...prev, streak: { current_streak: d.streak, longest_streak: d.longest_streak, last_checkin: d.today } } : prev);
              }
            }).catch(() => {});
          if (typeof data.voice_avatar_index === "number" && data.voice_avatar_index >= 0 && data.voice_avatar_index < VOICE_AVATAR_OPTIONS.length) {
            setVoiceAvatarIndex(data.voice_avatar_index);
          } else {
            setVoiceAvatarIndex(DEFAULT_VOICE_AVATAR_INDEX);
          }
        } else if (!loadedFromCache) {
          setAppProfile(null);
        }
      })
      .catch((err: unknown) => {
        if (err && typeof err === "object" && (err as { name?: string }).name === "AbortError") return;
        if (!loadedFromCache) setAppProfile(null);
      })
      .finally(() => {
        setProfileFetchDone(true);
      });
    return () => ac.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [user?.email, centerRefreshKey, voiceCalendarSyncKey]);

  // Profile cache sync
  useEffect(() => {
    if (!user?.email || !appProfile) return;
    try {
      const cacheKey = `${PROFILE_CACHE_KEY_BASE}_${user.email}`;
      localStorage.setItem(cacheKey, JSON.stringify(appProfile));
    } catch { /* ignore */ }
  }, [appProfile, user?.email]);

  // Profile photo fetch
  useEffect(() => {
    if (!user?.email) {
       
      setProfilePhotoUrl((u) => { if (u) URL.revokeObjectURL(u); return null; });
      return;
    }
    try {
      const cached = localStorage.getItem(profilePhotoCacheKey(user.email));
      if (cached && cached.startsWith("data:image/")) {
        setProfilePhotoUrl(cached);
      }
    } catch { /* ignore */ }

    if (!localStorage.getItem("dilly_auth_token")) return;
    let revoked = false;
    dilly.fetch(`/profile/photo`, { cache: "no-store" })
      .then((res) => {
        if (revoked) return;
        if (!res.ok) {
          if (res.status === 404) {
            try { localStorage.removeItem(profilePhotoCacheKey(user.email)); } catch {}
          }
          setProfilePhotoUrl(null);
          return null;
        }
        return res.blob();
      })
      .then((blob) => {
        if (revoked || !blob) return;
        const objUrl = URL.createObjectURL(blob);
        setProfilePhotoUrl((prev) => {
          if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
          return objUrl;
        });
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            const size = 128;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, size, size);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
              if (dataUrl.length < 100_000) localStorage.setItem(profilePhotoCacheKey(user.email), dataUrl);
            }
          } catch { /* ignore */ }
        };
        img.src = objUrl;
      })
      .catch(() => {
        if (!revoked) setProfilePhotoUrl(null);
      });
    return () => {
      revoked = true;
      setProfilePhotoUrl((u) => { if (u && u.startsWith("blob:")) URL.revokeObjectURL(u); return null; });
    };
  }, [user?.email]);

  // Offline detection
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const onOffline = () => setIsOffline(true);
    const onOnline = () => setIsOffline(false);
     
    setIsOffline(!navigator.onLine);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // signOut function
  const signOut = async () => {
    try {
      if (localStorage.getItem("dilly_auth_token")) {
        await dilly.fetch(`/auth/logout`, { method: "POST" });
      }
    } catch { /* ignore */ }
    try {
      localStorage.removeItem("dilly_auth_token");
      localStorage.removeItem(VOICE_MESSAGES_KEY);
      localStorage.removeItem(VOICE_CONVOS_KEY);
      localStorage.removeItem(ONBOARDING_STEP_KEY);
      if (user?.email) {
        localStorage.removeItem(auditStorageKey(user.email));
        localStorage.removeItem(`${PROFILE_CACHE_KEY_BASE}_${user.email}`);
      }
    } catch { /* ignore */ }
    try {
      sessionStorage.clear();
    } catch { /* ignore */ }
    window.location.href = "http://localhost:3001";
  };

  return {
    isOffline,
    profilePhotoUrl,
    setProfilePhotoUrl,
    profilePhotoUploading,
    setProfilePhotoUploading,
    photoCropImageSrc,
    setPhotoCropImageSrc,
    photoInputRef,
    signOut,
    hasRedirected,
  };
}
