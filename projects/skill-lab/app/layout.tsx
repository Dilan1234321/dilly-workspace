import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { getSession } from "@/lib/api";

export const metadata: Metadata = {
  title: "Skill Lab by Dilly",
  description:
    "The highest-signal YouTube videos for your field, curated and sorted by cohort. Free to use. Built by Dilly.",
  openGraph: {
    title: "Skill Lab by Dilly",
    description: "Curated learning videos for your cohort. Free.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession().catch(() => null);
  return (
    <html lang="en">
      <body>
        <Nav session={session} />
        <main className="container-app pb-24 pt-6">{children}</main>
        <footer className="container-app py-10 text-sm text-[color:var(--color-muted)]">
          Skill Lab is a free product by{" "}
          <a href="https://dilly.app" className="underline hover:text-white">
            Dilly
          </a>
          . Videos are embedded from YouTube and remain the property of their creators.
        </footer>
      </body>
    </html>
  );
}
