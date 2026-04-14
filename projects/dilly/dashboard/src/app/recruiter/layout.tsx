import { Inter, Montserrat } from "next/font/google";
import { RecruiterNavLeft } from "./RecruiterNavLeft";
import { RecruiterNavRight } from "./RecruiterNavRight";
import "./recruiter-talent.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function RecruiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`recruiter-v2 ${inter.variable} ${montserrat.variable}`}
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
    >
      <header className="dr-nav">
        <RecruiterNavLeft />
        <RecruiterNavRight />
      </header>
      <main>{children}</main>
    </div>
  );
}
