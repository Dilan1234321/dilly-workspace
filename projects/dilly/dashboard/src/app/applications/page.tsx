"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Application tracker lives on Get Hired (`/?tab=resources`). */
export default function ApplicationsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/?tab=resources&view=applications");
  }, [router]);
  return null;
}
