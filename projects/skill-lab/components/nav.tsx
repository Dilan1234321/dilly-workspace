import Link from "next/link";
import type { SessionUser } from "@/lib/types";

export function Nav({ session }: { session: SessionUser | null }) {
  return (
    <header className="border-b border-[color:var(--color-border)]">
      <div className="container-app flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--color-accent)]" />
          Skill Lab
          <span className="text-xs text-[color:var(--color-muted)]">by Dilly</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-[color:var(--color-muted)] hover:text-white">
            Browse
          </Link>
          <Link href="/library" className="text-[color:var(--color-muted)] hover:text-white">
            Library
          </Link>
          {session ? (
            <>
              <span className="chip">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {session.email.split("@")[0]}
              </span>
              <form action="/api/sign-out" method="post">
                <button type="submit" className="btn btn-ghost" aria-label="Sign out">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/sign-in" className="btn btn-ghost">Sign in</Link>
              <Link href="/sign-up" className="btn btn-primary">Create account</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
