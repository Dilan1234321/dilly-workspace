"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReadyCheckIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/ready-check/new");
  }, [router]);
  return null;
}

