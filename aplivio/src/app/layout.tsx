import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { MeProvider } from "@/components/MeProvider";
import { DisclaimerModal } from "@/components/DisclaimerModal";

export const metadata: Metadata = {
  title: "Aplivio — Admissions copilot",
  description:
    "College list, estimated odds, action plans, essay feedback, and deadlines — session-backed MVP.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <MeProvider>
          <DisclaimerModal />
          <AppShell>{children}</AppShell>
        </MeProvider>
      </body>
    </html>
  );
}
