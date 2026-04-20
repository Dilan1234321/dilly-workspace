// The 22 Dilly cohorts, mirrored from projects/dilly/academic_taxonomy.py.
// Slug is URL-safe. Keep this list in sync whenever academic_taxonomy.py changes.

export type Cohort = {
  slug: string;
  name: string;
  tagline: string;
  blurb: string;
  accent: string; // tailwind color class seed
};

export const COHORTS: Cohort[] = [
  { slug: "software-engineering-cs",         name: "Software Engineering & CS",         tagline: "Build systems that scale.",         blurb: "Languages, frameworks, algorithms, and the craft of shipping production software.", accent: "sky" },
  { slug: "data-science-analytics",          name: "Data Science & Analytics",          tagline: "Turn data into decisions.",         blurb: "SQL, Python, statistics, and the analytical instinct recruiters actually test for.",    accent: "indigo" },
  { slug: "cybersecurity-it",                name: "Cybersecurity & IT",                tagline: "Defend what matters.",              blurb: "Offensive security, blue team tooling, network fundamentals, and the certifications that open doors.", accent: "rose" },
  { slug: "electrical-computer-engineering", name: "Electrical & Computer Engineering", tagline: "From silicon to systems.",          blurb: "Circuits, embedded systems, signal processing, and the hardware side of modern tech.",   accent: "amber" },
  { slug: "mechanical-aerospace-engineering",name: "Mechanical & Aerospace Engineering",tagline: "Design that moves the world.",      blurb: "CAD, dynamics, thermo, controls, and the projects that land offers at top labs and primes.", accent: "orange" },
  { slug: "civil-environmental-engineering", name: "Civil & Environmental Engineering", tagline: "Build the built world.",            blurb: "Structures, transportation, water, and sustainability — the work behind cities that last.", accent: "emerald" },
  { slug: "chemical-biomedical-engineering", name: "Chemical & Biomedical Engineering", tagline: "Engineering meets life science.",    blurb: "Process design, bioreactors, devices, and the interface between chemistry and medicine.", accent: "teal" },
  { slug: "finance-accounting",              name: "Finance & Accounting",              tagline: "Read the numbers that move markets.", blurb: "Modeling, valuation, audit, and the interview prep that separates offers from rejections.", accent: "green" },
  { slug: "consulting-strategy",             name: "Consulting & Strategy",             tagline: "Structure the unstructurable.",      blurb: "Case math, frameworks, storytelling, and the skills top consulting firms actually hire for.", accent: "slate" },
  { slug: "marketing-advertising",           name: "Marketing & Advertising",           tagline: "Make people care.",                 blurb: "Positioning, copy, paid acquisition, and brand — the discipline of demand.",           accent: "pink" },
  { slug: "management-operations",           name: "Management & Operations",           tagline: "Run the machine well.",             blurb: "Supply chain, process, lean, and operating the systems that make companies work.",    accent: "stone" },
  { slug: "entrepreneurship-innovation",     name: "Entrepreneurship & Innovation",     tagline: "Ship your own thing.",              blurb: "Customer discovery, MVPs, fundraising, and the craft of starting companies that matter.", accent: "violet" },
  { slug: "economics-public-policy",         name: "Economics & Public Policy",         tagline: "Incentives, institutions, outcomes.", blurb: "Micro, macro, econometrics, and the policy levers that shape real-world decisions.",   accent: "cyan" },
  { slug: "healthcare-clinical",             name: "Healthcare & Clinical",             tagline: "Medicine, practiced.",              blurb: "Pre-health prep, clinical reasoning, and the long arc into medicine, nursing, and allied health.", accent: "red" },
  { slug: "biotech-pharmaceutical",          name: "Biotech & Pharmaceutical",          tagline: "Molecules to medicines.",           blurb: "Lab technique, drug discovery, and the science behind the biotech pipeline.",         accent: "lime" },
  { slug: "life-sciences-research",          name: "Life Sciences & Research",          tagline: "The experiment is the work.",       blurb: "Molecular biology, genetics, ecology, and the thinking that wins research positions.", accent: "green" },
  { slug: "physical-sciences-math",          name: "Physical Sciences & Math",          tagline: "First principles, every time.",     blurb: "Physics, chemistry, pure math — the foundational fields that compound for a lifetime.", accent: "blue" },
  { slug: "law-government",                  name: "Law & Government",                  tagline: "Argue from the page up.",            blurb: "Legal reasoning, public service, and the track into law school, clerkships, and government.", accent: "zinc" },
  { slug: "media-communications",            name: "Media & Communications",            tagline: "Story is infrastructure.",           blurb: "Journalism, PR, content, and communicating with precision across formats.",           accent: "fuchsia" },
  { slug: "design-creative-arts",            name: "Design & Creative Arts",            tagline: "Craft things people notice.",        blurb: "Visual design, UX, film, music — the disciplines where taste and execution compound.",  accent: "purple" },
  { slug: "education-human-development",     name: "Education & Human Development",     tagline: "Teach so it sticks.",               blurb: "Pedagogy, developmental psychology, and the practice of helping people learn.",       accent: "yellow" },
  { slug: "social-sciences-nonprofit",       name: "Social Sciences & Nonprofit",       tagline: "People, places, and change.",       blurb: "Sociology, anthropology, political science, and the nonprofit sector that applies them.", accent: "neutral" },
];

export const COHORTS_BY_SLUG: Record<string, Cohort> = Object.fromEntries(
  COHORTS.map((c) => [c.slug, c]),
);

export const COHORTS_BY_NAME: Record<string, Cohort> = Object.fromEntries(
  COHORTS.map((c) => [c.name, c]),
);

export function cohortFromSlug(slug: string): Cohort | null {
  return COHORTS_BY_SLUG[slug] ?? null;
}
