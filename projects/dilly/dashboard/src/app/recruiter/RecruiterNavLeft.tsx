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
      <nav className="dr-nav-links">
        <Link
          href="/recruiter/blind"
          className={`dr-nav-link dr-nav-link--featured ${pathname === "/recruiter/blind" ? "dr-nav-link--active" : ""}`}
        >
          Blind Audition
        </Link>
        <Link
          href="/recruiter/demo"
          className={`dr-nav-link ${pathname === "/recruiter/demo" ? "dr-nav-link--active" : ""}`}
        >
          Demo
        </Link>
        <Link
          href="/recruiter/about"
          className={`dr-nav-link ${pathname === "/recruiter/about" ? "dr-nav-link--active" : ""}`}
        >
          About
        </Link>
      </nav>
    </div>
  );
}
