"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Jobs for you lives under Get Hired → Jobs tab (`/?tab=resources&view=jobs`). */
function JobsRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const type = searchParams.get("type");
    const q = type != null && type !== "" ? `&type=${encodeURIComponent(type)}` : "";
    router.replace(`/?tab=resources&view=jobs${q}`);
  }, [router, searchParams]);
  return null;
}

export default function JobsPage() {
  return (
    <Suspense fallback={null}>
      <JobsRedirectInner />
    </Suspense>
  );
}
