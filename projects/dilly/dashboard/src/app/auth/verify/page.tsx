"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { dilly } from "@/lib/dilly";
import { LoadingScreen } from "@/components/ui/loading-screen";

function AuthVerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"verifying" | "ok" | "fail">(token ? "verifying" : "fail");

  useEffect(() => {
    if (!token) return;
    dilly.fetch(`/auth/verify?token=${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        const sessionToken = data?.token;
        if (sessionToken) {
          try {
            localStorage.setItem("dilly_auth_token", sessionToken);
          } catch {
            /* ignore */
          }
        }
        setStatus("ok");
        window.location.href = "/";
      })
      .catch(() => setStatus("fail"));
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "var(--dilly-bg)", color: "var(--dilly-taupe-bright)" }}>
      {status === "verifying" && (
        <div className="flex flex-col items-center gap-4">
          <div className="loading-spinner-gradient" aria-hidden />
          <p className="text-[13px] text-[var(--m-text-3)]">Signing you in…</p>
        </div>
      )}
      {status === "ok" && <p className="text-emerald-400">Signed in. Redirecting…</p>}
      {status === "fail" && (
        <div className="text-center space-y-4">
          <p className="text-amber-400">Invalid or Expired Link.</p>
          <Link href="/" className="text-emerald-400 hover:underline">Back to Dilly</Link>
        </div>
      )}
    </div>
  );
}

export default function AuthVerifyPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading…" />}>
      <AuthVerifyContent />
    </Suspense>
  );
}
