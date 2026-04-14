"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function RecruiterNavLeft() {
  const pathname = usePathname() ?? "";
  const isCandidatePage =
    pathname.startsWith("/recruiter/candidates/") &&
    pathname !== "/recruiter/candidates";

  return (
    <div className="dr-nav-left">
      {isCandidatePage && (
        <Link
          href="/recruiter"
          className="dr-nav-back"
          aria-label="Back to search"
        >
          ←
        </Link>
      )}
      <Link href="/recruiter" className="dr-logo">
        Dilly Recruiter
      </Link>
    </div>
  );
}
