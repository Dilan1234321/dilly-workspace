import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { getSession } from "@/lib/api";
import { getLang } from "@/lib/lang-server";
import { t } from "@/lib/i18n";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

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
  const lang = await getLang();
  const session = await getSession().catch(() => null);
  return (
    <html lang={lang} className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <Nav session={session} lang={lang} />
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
