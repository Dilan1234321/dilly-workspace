"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** `/career` now forwards to Practice on home. Legacy `?tab=applications` still routes to the application tracker on Get Hired. */
function CareerRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("tab") === "applications") {
      router.replace("/?tab=resources&view=applications");
      return;
    }
    router.replace("/?tab=practice");
  }, [router, searchParams]);
  return null;
}

export default function CareerPage() {
  return (
    <Suspense fallback={null}>
      <CareerRedirectInner />
    </Suspense>
  );
}
