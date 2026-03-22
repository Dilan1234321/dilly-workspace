"use client";

import { cn } from "@/lib/utils";

type AvatarProps = {
  /** Initials for fallback when no photo */
  initials?: string;
  /** Optional photo URL */
  photoUrl?: string | null;
  size?: 34 | 36;
  className?: string;
};

export function Avatar({ initials, photoUrl, size = 34, className }: AvatarProps) {
  const s = size;
  const letters = (initials ?? "?").slice(0, 2).toUpperCase();

  return (
    <div
      className={cn("shrink-0 rounded-full overflow-hidden flex items-center justify-center font-semibold", className)}
      style={{
        width: s,
        height: s,
        fontSize: s * 0.4,
        background: "var(--idim)",
        color: "var(--indigo)",
      }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span style={{ letterSpacing: "-0.05em" }}>{letters}</span>
      )}
    </div>
  );
}
