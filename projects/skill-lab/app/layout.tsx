import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { getSession } from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { getStreak } from "@/lib/session-state";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Skill Lab by Dilly — a learning library, not a playlist",
  description:
    "A careful, human-curated library of learning videos for 22 fields. Start here. Read the curator's notes. Build real skill, not watch history.",
  openGraph: {
    title: "Skill Lab by Dilly",
    description: "A careful, human-curated library of learning videos for 22 fields.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [lang, session, streak] = await Promise.all([
    getLang(),
    getSession().catch(() => null),
    getStreak(),
  ]);
  return (
    <html lang={lang}>
      <head>
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700,900&display=swap"
        />
      </head>
      <body>
        <Nav session={session} lang={lang} streak={streak.streak} />
        <ShortcutsHelp />
        <main>{children}</main>
        <footer className="container-app mt-24 border-t border-[color:var(--color-border)] py-10 text-sm text-[color:var(--color-muted)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {t(lang, "footer.tagline")}{" "}
              <a href="https://dilly.app" className="underline decoration-[color:var(--color-accent)]/40 underline-offset-4 hover:text-white">
                Dilly
              </a>
              .
            </div>
            <div className="text-xs text-[color:var(--color-dim)]">
              {t(lang, "footer.disclaimer")}
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
