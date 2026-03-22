import { Cinzel, Montserrat } from "next/font/google";
import { RecruiterNavLeft } from "./RecruiterNavLeft";
import { RecruiterNavRight } from "./RecruiterNavRight";
import "./recruiter-talent.css";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export default function RecruiterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`recruiter-talent ${cinzel.variable} ${montserrat.variable}`}
      style={{ fontFamily: "var(--font-montserrat), sans-serif" }}
    >
      <header className="te-nav">
        <RecruiterNavLeft />
        <RecruiterNavRight />
      </header>
      <main>{children}</main>
    </div>
  );
}
