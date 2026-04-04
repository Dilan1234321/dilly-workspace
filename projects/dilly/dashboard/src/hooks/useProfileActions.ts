import { useState, useCallback } from "react";
import { useAppContext } from "@/context/AppContext";
import { useToast } from "@/hooks/useToast";
import { dilly } from "@/lib/dilly";
import type { AppProfile } from "@/types/dilly";

type ProfileSaveData = Partial<
  Pick<
    AppProfile,
    | "name"
    | "major"
    | "majors"
    | "minors"
    | "preProfessional"
    | "track"
    | "goals"
    | "career_goal"
    | "deadlines"
    | "target_school"
    | "profile_background_color"
    | "profile_tagline"
    | "profile_theme"
    | "profile_bio"
    | "linkedin_url"
    | "job_locations"
    | "job_location_scope"
    | "share_card_metric"
    | "got_interview_at"
    | "got_offer_at"
    | "outcome_story_consent"
    | "outcome_prompt_dismissed_at"
    | "application_target"
    | "application_target_label"
  >
>;

export function useProfileActions() {
  const { setAppProfile } = useAppContext();
  const { toast } = useToast();
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  const saveProfile = useCallback(
    async (data: ProfileSaveData): Promise<boolean> => {
      setProfileSaveError(null);
      if (!localStorage.getItem("dilly_auth_token")) return false;
      try {
        const res = await dilly.fetch(`/profile`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const msg = "We couldn't save that. Check your connection and try again.";
          setProfileSaveError(msg);
          toast(msg, "error");
          return false;
        }
        if ("career_goal" in data) {
          setAppProfile((prev) => ({ ...(prev ?? {}), career_goal: data.career_goal ?? null }));
        }
        if ("deadlines" in data) {
          setAppProfile((prev) => (prev ? { ...prev, deadlines: data.deadlines || [] } : prev));
        }
        if ("target_school" in data) {
          setAppProfile((prev) => (prev ? { ...prev, target_school: data.target_school ?? null } : prev));
        }
        if ("majors" in data) {
          setAppProfile((prev) => (prev ? { ...prev, majors: data.majors ?? [] } : prev));
        }
        if ("minors" in data) {
          setAppProfile((prev) => (prev ? { ...prev, minors: data.minors ?? [] } : prev));
        }
        if ("track" in data) {
          setAppProfile((prev) => (prev ? { ...prev, track: data.track ?? null } : prev));
        }
        if ("preProfessional" in data) {
          setAppProfile((prev) => (prev ? { ...prev, preProfessional: !!data.preProfessional } : prev));
        }
        if ("profile_background_color" in data) {
          setAppProfile((prev) => (prev ? { ...prev, profile_background_color: data.profile_background_color ?? null } : prev));
        }
        if ("profile_tagline" in data) {
          setAppProfile((prev) => (prev ? { ...prev, profile_tagline: data.profile_tagline ?? null } : prev));
        }
        if ("profile_theme" in data) {
          setAppProfile((prev) => (prev ? { ...prev, profile_theme: data.profile_theme ?? null } : prev));
        }
        if ("profile_bio" in data) {
          setAppProfile((prev) => (prev ? { ...prev, profile_bio: data.profile_bio ?? null } : prev));
        }
        if ("linkedin_url" in data) {
          setAppProfile((prev) => (prev ? { ...prev, linkedin_url: data.linkedin_url ?? null } : prev));
        }
        if ("job_location_scope" in data) {
          setAppProfile((prev) => (prev ? { ...prev, job_location_scope: data.job_location_scope ?? null } : prev));
        }
        if ("job_locations" in data) {
          setAppProfile((prev) => (prev ? { ...prev, job_locations: data.job_locations ?? [] } : prev));
        }
        if ("got_interview_at" in data) {
          setAppProfile((prev) => (prev ? { ...prev, got_interview_at: data.got_interview_at ?? null } : prev));
        }
        if ("got_offer_at" in data) {
          setAppProfile((prev) => (prev ? { ...prev, got_offer_at: data.got_offer_at ?? null } : prev));
        }
        if ("outcome_story_consent" in data) {
          setAppProfile((prev) => (prev ? { ...prev, outcome_story_consent: data.outcome_story_consent ?? null } : prev));
        }
        if ("outcome_prompt_dismissed_at" in data) {
          setAppProfile((prev) => (prev ? { ...prev, outcome_prompt_dismissed_at: data.outcome_prompt_dismissed_at ?? null } : prev));
        }
        if ("share_card_metric" in data) {
          setAppProfile((prev) => (prev ? { ...prev, share_card_metric: data.share_card_metric ?? null } : prev));
        }
        if ("application_target" in data) {
          setAppProfile((prev) => (prev ? { ...prev, application_target: data.application_target ?? null } : prev));
        }
        return true;
      } catch {
        const msg = "We couldn't save that. Check your connection and try again.";
        setProfileSaveError(msg);
        toast(msg, "error");
        return false;
      }
    },
    [setAppProfile, toast],
  );

  return { saveProfile, profileSaveError, setProfileSaveError };
}
