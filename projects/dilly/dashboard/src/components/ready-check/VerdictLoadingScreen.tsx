"use client";

import { useEffect, useState } from "react";
import { VoiceAvatar } from "@/components/VoiceAvatarButton";

const MESSAGES = [
  "Reading your latest score signals",
  "Comparing against this company's bar",
  "Building your roadmap to ready",
  "Writing your recruiter-style verdict",
];

export function VerdictLoadingScreen() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setIdx((n) => (n + 1) % MESSAGES.length), 800);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--bg)" }}>
      <style>{`
        @keyframes readyFadePulse {
          0% { opacity: 0.35; transform: translateY(2px); }
          25% { opacity: 1; transform: translateY(0); }
          75% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0.35; transform: translateY(-2px); }
        }
      `}</style>
      <VoiceAvatar voiceAvatarIndex={null} size="md" className="!w-12 !h-12" />
      <p
        className="mt-4 text-[13px] text-center"
        style={{ color: "var(--t2)", animation: "readyFadePulse 800ms ease-in-out both" }}
      >
        {MESSAGES[idx]}
      </p>
    </div>
  );
}

