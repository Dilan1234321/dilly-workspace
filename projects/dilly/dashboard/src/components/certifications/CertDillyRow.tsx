"use client";

import { useRouter } from "next/navigation";
import { DillyAvatar } from "@/components/ats/DillyAvatar";
import { VOICE_FROM_CERT_HANDOFF_KEY } from "@/lib/dillyUtils";
import type { Certification } from "@/types/certifications";

function ChevronRight({ color }: { color: string }) {
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

export function CertDillyRow({ cert }: { cert: Certification }) {
  const router = useRouter();

  const onOpenVoice = () => {
    try {
      sessionStorage.setItem(
        VOICE_FROM_CERT_HANDOFF_KEY,
        JSON.stringify({
          cert_id: cert.id,
          name: cert.name,
          provider: cert.provider,
          source: "cert_landing",
        }),
      );
    } catch {
      /* ignore */
    }
    router.push(`/voice?context=cert&id=${encodeURIComponent(cert.id)}`);
  };

  return (
    <button
      type="button"
      onClick={onOpenVoice}
      className="w-full border-0 cursor-pointer text-left outline-none"
      style={{
        background: "var(--s3)",
        borderRadius: 11,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <DillyAvatar size={28} />
      <span className="flex-1 min-w-0" style={{ fontSize: 12, fontWeight: 600, color: "var(--blue)" }}>
        Make it land on your resume →
      </span>
      <div
        className="shrink-0 flex items-center justify-center rounded-full"
        style={{ width: 22, height: 22, background: "var(--bdim)" }}
      >
        <ChevronRight color="var(--blue)" />
      </div>
    </button>
  );
}
