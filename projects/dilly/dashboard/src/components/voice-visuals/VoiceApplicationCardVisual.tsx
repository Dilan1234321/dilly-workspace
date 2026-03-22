"use client";

import { cn } from "@/lib/utils";
import { VoiceVisualShell } from "@/components/voice-visuals/VoiceVisualShell";

export function VoiceApplicationCardVisual({
  company,
  role,
  status,
  deadline,
  className,
}: {
  company: string;
  role?: string;
  status?: string;
  deadline?: string;
  className?: string;
}) {
  if (!company.trim()) return null;

  return (
    <VoiceVisualShell
      className={cn("rounded-xl border border-cyan-500/25 bg-gradient-to-br from-cyan-950/40 to-black/30 px-3 py-2.5", className)}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-400/90 mb-1.5">Application</p>
      <p className="text-[14px] font-semibold text-slate-100 leading-tight">{company}</p>
      {role ? <p className="text-[12px] text-slate-300 mt-0.5 line-clamp-2">{role}</p> : null}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {status ? (
          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-white/10 text-slate-200 border border-white/10">
            {status}
          </span>
        ) : null}
        {deadline ? (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/25">
            Due {deadline}
          </span>
        ) : null}
      </div>
    </VoiceVisualShell>
  );
}
