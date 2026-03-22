"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function RecruiterNavLeft() {
  const pathname = usePathname() ?? "";
  const isCandidatePage = pathname.startsWith("/recruiter/candidates/") && pathname !== "/recruiter/candidates";

  return (
    <div className="te-nav-left" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      {isCandidatePage && (
        <Link
          href="/recruiter"
          className="te-nav-back"
          style={{
            color: "var(--te-text-muted)",
            fontSize: "1.25rem",
            lineHeight: 1,
            padding: "0.25rem",
            display: "inline-flex",
            textDecoration: "none",
          }}
          aria-label="Back to Recruiter"
        >
          ←
        </Link>
      )}
      <Link href="/" className="te-logo">
        Dilly Recruiter
      </Link>
    </div>
  );
}
