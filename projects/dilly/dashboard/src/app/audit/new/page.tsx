"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Stable URL for “run new audit”; main flow lives on home hiring tab. */
export default function AuditNewPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/?tab=upload");
  }, [router]);
  return <div className="min-h-screen w-full" style={{ background: "var(--bg)" }} aria-busy="true" />;
}
