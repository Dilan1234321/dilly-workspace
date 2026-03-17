import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meridian | The Last Check Before You Apply",
  description:
    "Meridian scores your resume the way a senior hiring manager would—Smart, Grit, Build. Get concrete edits, track-specific advice, and a career coach in your pocket. .edu only. We don't sell your data.",
  keywords: [
    "resume review",
    "career readiness",
    "college students",
    "internship prep",
    "job application",
    "resume audit",
    "career coach",
    "University of Tampa",
  ],
  openGraph: {
    title: "Meridian | The Last Check Before You Apply",
    description:
      "Score your resume like a hiring manager. Get the edits. Get hired. Meridian is the career center in your pocket.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${instrumentSans.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
