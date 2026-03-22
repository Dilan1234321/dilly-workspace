import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-[var(--muted)]">
      <Link href="/" className="text-[var(--accent)] underline">
        ← Home
      </Link>
      <h1 className="text-2xl font-semibold text-[var(--text)]">Privacy</h1>
      <p>
        Aplivio MVP stores your profile and saved school list in a <strong className="text-[var(--text)]">server</strong>{" "}
        database keyed to an anonymous session cookie (<code className="rounded bg-[var(--surface2)] px-1">HttpOnly</code>
        ). There is no account system yet—clear cookies or use another browser for a fresh session.
      </p>
      <p>
        Essay drafts you type in the app stay in the page unless you use the optional AI coach; coach requests are sent
        to your configured model provider when <code className="rounded bg-[var(--surface2)] px-1">OPENAI_API_KEY</code>{" "}
        is set on the server.
      </p>
      <p>
        This is not legal advice. Before production, add a proper privacy policy, data retention, and minors handling
        with counsel.
      </p>
    </div>
  );
}
