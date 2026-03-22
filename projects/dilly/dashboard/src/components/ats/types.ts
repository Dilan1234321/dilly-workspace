"use client";

export interface ATSResult {
  score: number;
  previous_score: number | null;
  status: "excellent" | "good" | "risky" | "at_risk";
  format_checks: { passed: number; total: number };
  fields_parsed: { parsed: number; total: number };
  sections_detected: number;
  critical_issue_count: number;
  potential_gain: number;
  score_history: { date: string; score: number }[];
  sections_found: string[];
  sections_missing: string[];
  skills_extracted: string[];
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    location: string | null;
    university: string | null;
    major: string | null;
    gpa: string | null;
    graduation: string | null;
  };
  experience: {
    company: string;
    role: string | null;
    start: string;
    end: string | null;
    bullet_count: number;
  }[];
  checklist: {
    id: string;
    label: string;
    description: string;
    passed: boolean;
    impact: "critical" | "high" | "medium" | "low";
    dilly_fix?: string;
    potential_pts?: number;
  }[];
  issues: {
    id: string;
    severity: "critical" | "info" | "warning";
    title: string;
    detail: string;
    quote: string | null;
    dilly_insight: string;
    dilly_action: string;
    potential_pts: number;
  }[];
  quick_fixes: {
    id: string;
    original: string;
    rewritten: string;
    reason: string;
    reason_type: "placeholder" | "acronym" | "verb" | "quantification" | "header";
  }[];
  keyword_placement_pct: number;
  keywords: {
    keyword: string;
    count: number;
    in_context: number;
    bare_list: number;
  }[];
  keyword_stats: {
    total: number;
    in_context: number;
    bare_list: number;
  };
  vendors: {
    name: "Workday" | "Greenhouse" | "iCIMS" | "Lever";
    score: number;
    status: "will_parse" | "risky" | "fail";
    companies: string[];
  }[];
  dilly_score_commentary: string;
  dilly_trend_commentary: string;
  dilly_keyword_commentary: string;
  dilly_vendor_commentary: string;
}

