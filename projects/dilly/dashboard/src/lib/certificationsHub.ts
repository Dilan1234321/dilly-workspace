/**
 * Curated free certifications for the Certifications Hub.
 * Framed as Dilly giving students access; all are free (or free tier) from public providers.
 * Filtered by track so students see relevant certs first.
 */

import type { TrackKey } from "./trackDefinitions";

export interface CertificationEntry {
  id: string;
  name: string;
  provider: string;
  url: string;
  description: string;
  /** Tracks this cert is relevant for; empty = all tracks */
  tracks: TrackKey[];
  /** Optional: "Free" or "Free tier" etc. */
  note?: string;
}

export const CERTIFICATIONS_HUB: CertificationEntry[] = [
  // Tech
  { id: "google-it", name: "Google IT Support Professional Certificate", provider: "Google (Coursera)", url: "https://www.coursera.org/professional-certificates/google-it-support", description: "Foundational IT support and troubleshooting.", tracks: ["Tech"], note: "Free to audit" },
  { id: "google-data", name: "Google Data Analytics Professional Certificate", provider: "Google (Coursera)", url: "https://www.coursera.org/professional-certificates/google-data-analytics", description: "Data analysis, SQL, and visualization.", tracks: ["Tech", "Business", "Finance"], note: "Free to audit" },
  { id: "google-ux", name: "Google UX Design Professional Certificate", provider: "Google (Coursera)", url: "https://www.coursera.org/professional-certificates/google-ux-design", description: "UX research, prototyping, and design.", tracks: ["Tech", "Arts", "Communications"], note: "Free to audit" },
  { id: "aws-cloud", name: "AWS Cloud Practitioner Essentials", provider: "Amazon Web Services", url: "https://aws.amazon.com/training/digital/aws-cloud-practitioner-essentials/", description: "Cloud concepts and AWS basics.", tracks: ["Tech"], note: "Free" },
  { id: "meta-frontend", name: "Meta Front-End Developer Professional Certificate", provider: "Meta (Coursera)", url: "https://www.coursera.org/professional-certificates/meta-front-end-developer", description: "HTML, CSS, JavaScript, React.", tracks: ["Tech"], note: "Free to audit" },
  { id: "ibm-data-science", name: "IBM Data Science Professional Certificate", provider: "IBM (Coursera)", url: "https://www.coursera.org/professional-certificates/ibm-data-science", description: "Python, data analysis, ML basics.", tracks: ["Tech", "Science"], note: "Free to audit" },
  { id: "freecodecamp-responsive", name: "Responsive Web Design", provider: "freeCodeCamp", url: "https://www.freecodecamp.org/learn/2022/responsive-web-design/", description: "HTML, CSS, responsive layout.", tracks: ["Tech"], note: "Free" },
  { id: "freecodecamp-js", name: "JavaScript Algorithms and Data Structures", provider: "freeCodeCamp", url: "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/", description: "Core JavaScript and algorithms.", tracks: ["Tech"], note: "Free" },
  // Business / Finance
  { id: "linkedin-excel", name: "Excel Skills for Business", provider: "Macquarie (Coursera)", url: "https://www.coursera.org/specializations/excel", description: "Excel from essentials to advanced analysis.", tracks: ["Business", "Finance", "Consulting"], note: "Free to audit" },
  { id: "linkedin-quickbooks", name: "QuickBooks Online Certification", provider: "Intuit (LinkedIn Learning)", url: "https://www.linkedin.com/learning/topics/quickbooks", description: "Bookkeeping and small business accounting.", tracks: ["Business", "Finance"], note: "Free trial" },
  { id: "coursera-finance", name: "Introduction to Financial Accounting", provider: "Wharton (Coursera)", url: "https://www.coursera.org/learn/wharton-accounting", description: "Financial statements and accounting fundamentals.", tracks: ["Finance", "Business"], note: "Free to audit" },
  // Pre-Health / Science
  { id: "coursera-public-health", name: "Public Health Essentials", provider: "Coursera", url: "https://www.coursera.org/learn/public-health", description: "Core public health concepts.", tracks: ["Pre-Health", "Science"], note: "Free to audit" },
  { id: "edx-bio", name: "Introduction to Biology", provider: "edX (MIT)", url: "https://www.edx.org/learn/biology", description: "Foundational biology for pre-health and science.", tracks: ["Pre-Health", "Science"], note: "Free to audit" },
  { id: "coursera-medical", name: "Understanding Medical Research", provider: "Yale (Coursera)", url: "https://www.coursera.org/learn/clinical-trials", description: "How to read and interpret medical studies.", tracks: ["Pre-Health"], note: "Free to audit" },
  // Communications / Arts
  { id: "google-digital", name: "Google Digital Marketing & E-commerce Certificate", provider: "Google (Coursera)", url: "https://www.coursera.org/professional-certificates/google-digital-marketing-ecommerce", description: "Digital marketing, SEO, and e-commerce.", tracks: ["Communications", "Business", "Arts"], note: "Free to audit" },
  { id: "hubspot-inbound", name: "HubSpot Inbound Marketing", provider: "HubSpot Academy", url: "https://academy.hubspot.com/courses/inbound-marketing", description: "Inbound methodology and content marketing.", tracks: ["Communications", "Business"], note: "Free" },
  { id: "coursera-graphic", name: "Graphic Design Specialization", provider: "CalArts (Coursera)", url: "https://www.coursera.org/specializations/graphic-design", description: "Fundamentals of graphic design.", tracks: ["Arts", "Communications"], note: "Free to audit" },
  // Education
  { id: "coursera-teaching", name: "Teaching with Technology", provider: "Coursera", url: "https://www.coursera.org/learn/teaching-with-technology", description: "EdTech and blended learning.", tracks: ["Education"], note: "Free to audit" },
  { id: "unesco-inclusive", name: "Inclusive Education", provider: "UNESCO", url: "https://www.unesco.org/en/inclusive-education", description: "Inclusive education concepts and practices.", tracks: ["Education"], note: "Free" },
  // Pre-Law / Humanities
  { id: "coursera-critical-thinking", name: "Critical Thinking at Work", provider: "Coursera", url: "https://www.coursera.org/learn/critical-thinking", description: "Analytical and argument evaluation skills.", tracks: ["Pre-Law", "Humanities", "Consulting"], note: "Free to audit" },
  { id: "edx-writing", name: "Academic and Business Writing", provider: "edX", url: "https://www.edx.org/learn/writing", description: "Clear, professional writing.", tracks: ["Pre-Law", "Humanities", "Communications"], note: "Free to audit" },
  // Consulting / General
  { id: "linkedin-project-management", name: "Project Management Foundations", provider: "LinkedIn Learning", url: "https://www.linkedin.com/learning/topics/project-management", description: "Planning, execution, and delivery.", tracks: ["Consulting", "Business", "Tech"], note: "Free trial" },
  { id: "coursera-negotiation", name: "Successful Negotiation", provider: "Michigan (Coursera)", url: "https://www.coursera.org/learn/negotiation-skills", description: "Negotiation strategy and tactics.", tracks: ["Consulting", "Business", "Pre-Law"], note: "Free to audit" },
];

/**
 * Get certifications curated for this student's track only.
 * Dilly knows the student from audit + profile; we show only certs relevant to their track.
 * If track is null/unknown, returns [] so the UI can prompt "Run a resume audit so we can recommend certs for your track."
 */
export function getCertificationsForTrack(track: TrackKey | string | null | undefined): CertificationEntry[] {
  const normalized = (track?.trim() || "") as TrackKey;
  if (!normalized) return [];
  return CERTIFICATIONS_HUB.filter((c) => c.tracks.length === 0 || c.tracks.includes(normalized));
}
