"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (hasRedirected.current) return;
    hasRedirected.current = true;

    const token = localStorage.getItem("dilly_auth_token");

    if (token) {
      // Has token — send to dashboard
      window.location.replace("http://localhost:3000");
    } else {
      // No token — send to onboarding
      router.replace("/onboarding/welcome");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show nothing while redirecting
  return <div style={{ background: "#080809", minHeight: "100vh" }} />;
}
