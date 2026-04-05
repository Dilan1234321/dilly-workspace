"use client";

import { useVoice } from "@/contexts/VoiceContext";
import { useAppContext } from "@/context/AppContext";
import { dilly } from "@/lib/dilly";

/**
 * Encapsulates company-target state and the firm-deadlines fetch.
 * All underlying state lives in VoiceContext.
 */
export function useCompanyDeadlines() {
  const {
    voiceCompany,
    setVoiceCompany,
    voiceCompanyInput,
    setVoiceCompanyInput,
    voiceCompanyPanelOpen,
    setVoiceCompanyPanelOpen,
    firmDeadlines,
    setFirmDeadlines,
  } = useVoice();

  const { appProfile } = useAppContext();

  const handleCompanySet = async (company: string) => {
    setVoiceCompany(company.trim());
    setVoiceCompanyInput("");
    setVoiceCompanyPanelOpen(false);
    if (!company.trim()) {
      setFirmDeadlines([]);
      return;
    }
    try {
      const res = await dilly.fetch(`/voice/firm-deadlines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firm: company.trim(),
          application_target: appProfile?.application_target || "",
        }),
      });
      const data = res.ok ? await res.json() : null;
      if (data) {
        const savedItems = (data.saved || []).map(
          (d: { label: string; date?: string }) => ({
            label: d.label,
            date: d.date,
            note: d.date ? `In your calendar \u00b7 ${d.date}` : "In your calendar",
            source: "calendar" as const,
          }),
        );
        const disclaimer = data.suggested?.[0]?.disclaimer || "";
        const suggestedItems = (data.suggested || []).map(
          (d: { label: string; typical_date?: string; notes?: string }) => ({
            label: d.label,
            date: d.typical_date,
            note: d.notes || "",
            source: "estimate" as const,
            disclaimer,
          }),
        );
        setFirmDeadlines([...savedItems, ...suggestedItems]);
      } else {
        setFirmDeadlines([]);
      }
    } catch {
      setFirmDeadlines([]);
    }
  };

  return {
    voiceCompany,
    voiceCompanyInput,
    setVoiceCompanyInput,
    voiceCompanyPanelOpen,
    setVoiceCompanyPanelOpen,
    firmDeadlines,
    handleCompanySet,
  };
}
