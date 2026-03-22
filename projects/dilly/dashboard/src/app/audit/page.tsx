"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Resume audit UI is implemented on the main app hiring tab (?tab=upload) with NewAuditExperience
 * so file upload, paste-audit, Voice, BottomNav, and history share one state tree.
 * /audit keeps a stable URL for bookmarks and external links.
 */
export default function AuditPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/?tab=upload");
  }, [router]);
  return <div className="min-h-screen w-full" style={{ background: "var(--bg)" }} aria-busy="true" />;
}
