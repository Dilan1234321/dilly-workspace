import Link from "next/link";

/**
 * Soft account prompt. Shown only where an account adds real value.
 * Never a modal, never gates the page.
 */
export function AccountNudge({
  headline,
  body,
  ctaLabel,
  nextPath,
}: {
  headline: string;
  body: string;
  ctaLabel: string;
  nextPath?: string;
}) {
  const href = nextPath ? `/sign-up?next=${encodeURIComponent(nextPath)}` : "/sign-up";
  return (
    <div className="card mt-6 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-semibold">{headline}</div>
        <div className="mt-1 text-sm text-[color:var(--color-muted)]">{body}</div>
      </div>
      <Link href={href} className="btn btn-primary whitespace-nowrap">
        {ctaLabel}
      </Link>
    </div>
  );
}
