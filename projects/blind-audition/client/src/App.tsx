import { useEffect } from "react";
import BlindAudition from "./pages/BlindAudition";

// Load fonts
const link1 = document.createElement("link");
link1.rel = "preconnect";
link1.href = "https://fonts.googleapis.com";
document.head.appendChild(link1);

const link2 = document.createElement("link");
link2.rel = "preconnect";
link2.href = "https://fonts.gstatic.com";
link2.crossOrigin = "anonymous";
document.head.appendChild(link2);

const link3 = document.createElement("link");
link3.rel = "stylesheet";
link3.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap";
document.head.appendChild(link3);

export default function App() {
  useEffect(() => {
    document.title = "The Blind Audition — Dilly Recruiter";
  }, []);

  return <BlindAudition />;
}
