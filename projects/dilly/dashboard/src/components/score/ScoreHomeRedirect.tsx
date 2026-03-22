"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Replaces legacy Review > Score hub; canonical surface is `/score`. */
export function ScoreHomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/score");
  }, [router]);
  return (
    <div className="career-center-talent min-h-[50vh] w-full flex items-center justify-center px-5" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", background: "var(--bg)" }}>
      <p className="text-sm" style={{ color: "var(--t2)" }}>
        Opening your score…
      </p>
    </div>
  );
}
