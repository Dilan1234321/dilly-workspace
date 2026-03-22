"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

/**
 * /invite/[code] redirects to /?ref=code so the main page can handle referral attribution.
 */
export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string | undefined;

  useEffect(() => {
    if (code) {
      router.replace(`/?ref=${encodeURIComponent(code)}`);
    } else {
      router.replace("/");
    }
  }, [code, router]);

  return (
    <div className="m-app min-h-screen flex items-center justify-center">
      <div className="text-[var(--m-text-3)]">Redirecting…</div>
    </div>
  );
}
