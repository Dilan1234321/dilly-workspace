/**
 * Unit tests for dillyUtils helpers.
 * Run with: npm test
 */

import { describe, it, expect } from "vitest";
import {
  scoreColor,
  toPunchyFindings,
  topPercentileHeadline,
  oneLineSummary,
  findingForDimension,
  gapToNextLevel,
  progressPercentTowardTop25Rank,
  DIMENSIONS,
  LOW_SCORE_THRESHOLD,
} from "./dillyUtils";
import type { AuditV2 } from "@/types/dilly";

function mockAudit(overrides: Partial<AuditV2> = {}): AuditV2 {
  return {
    candidate_name: "Test Student",
    detected_track: "Humanities",
    major: "English",
    scores: { smart: 70, grit: 60, build: 50 },
    final_score: 60,
    audit_findings: [],
    evidence: {},
    recommendations: [],
    raw_logs: [],
    ...overrides,
  };
}

describe("scoreColor", () => {
  it("returns Strong for score >= 80", () => {
    const r = scoreColor(80);
    expect(r.label).toBe("Strong");
    expect(r.color).toContain("34C759");
  });

  it("returns Developing for score >= 60 and < 80", () => {
    const r = scoreColor(70);
    expect(r.label).toBe("Developing");
    expect(r.color).toContain("FF9F0A");
  });

  it("returns Gap for score < 60", () => {
    const r = scoreColor(40);
    expect(r.label).toBe("Gap");
    expect(r.color).toContain("FF453A");
  });
});

describe("toPunchyFindings", () => {
  it("returns dilly_take when short (<=40 chars)", () => {
    const audit = mockAudit({ dilly_take: "Strong GPA signal." });
    const lines = toPunchyFindings(audit);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toBe("Strong GPA signal.");
  });

  it("returns Top X% when peer_percentiles present", () => {
    const audit = mockAudit({
      dilly_take: "",
      peer_percentiles: { smart: 90, grit: 80, build: 70 },
    });
    const lines = toPunchyFindings(audit);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.some((l) => l.includes("Top") && l.includes("%"))).toBe(true);
  });

  it("returns at most 2 lines", () => {
    const audit = mockAudit({ dilly_take: "Short.", peer_percentiles: { smart: 95, grit: 90, build: 85 } });
    const lines = toPunchyFindings(audit);
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});

describe("topPercentileHeadline", () => {
  it("returns null for null/undefined audit", () => {
    expect(topPercentileHeadline(null)).toBeNull();
    expect(topPercentileHeadline(undefined)).toBeNull();
  });

  it("returns null when peer_percentiles missing", () => {
    const audit = mockAudit({ peer_percentiles: undefined });
    expect(topPercentileHeadline(audit)).toBeNull();
  });

  it("returns Top X% [Dimension] in [track] when percentiles present (best = smallest top %)", () => {
    const audit = mockAudit({
      detected_track: "Pre-Med",
      peer_percentiles: { smart: 90, grit: 85, build: 80 },
    });
    const h = topPercentileHeadline(audit);
    // smart 90 → top 10%; grit 85 → top 15%; build 80 → top 20% → headline uses Smart
    expect(h).toBe("Top 10% Smart in Pre-Med");
  });

  it("uses all-students copy when peer_fallback_all (not same-track cohort)", () => {
    const audit = mockAudit({
      detected_track: "Pre-Med",
      peer_percentiles: { smart: 90, grit: 85, build: 80 },
      peer_fallback_all: true,
    });
    expect(topPercentileHeadline(audit)).toBe("Top 10% Smart among Dilly students");
  });
});

describe("oneLineSummary", () => {
  it("returns empty string for null audit", () => {
    expect(oneLineSummary(null)).toBe("");
  });

  it("returns dilly_take when present", () => {
    const audit = mockAudit({ dilly_take: "Your resume shows strong academic signal." });
    expect(oneLineSummary(audit)).toBe("Your resume shows strong academic signal.");
  });

  it("returns fallback when dilly_take empty and scores present", () => {
    const audit = mockAudit({
      dilly_take: "",
      scores: { smart: 70, grit: 65, build: 60 },
      recommendations: [{ type: "generic", title: "Add metrics", action: "Quantify impact" }],
    });
    const s = oneLineSummary(audit);
    expect(s.length).toBeGreaterThan(0);
    expect(s.includes("Humanities") || s.includes("recommendations") || s.includes("metrics")).toBe(true);
  });
});

describe("findingForDimension", () => {
  it("returns null when no finding for dimension", () => {
    const audit = mockAudit({ audit_findings: ["Grit: Some text."] });
    expect(findingForDimension(audit, "smart")).toBeNull();
  });

  it("returns finding text after dimension prefix", () => {
    const audit = mockAudit({
      audit_findings: ["Smart: Your GPA speaks volumes.", "Grit: Leadership stands out."],
    });
    const f = findingForDimension(audit, "smart");
    expect(f).toBe("Your GPA speaks volumes.");
  });
});

describe("constants", () => {
  it("DIMENSIONS has smart, grit, build", () => {
    const keys = DIMENSIONS.map((d) => d.key);
    expect(keys).toEqual(["smart", "grit", "build"]);
  });

  it("LOW_SCORE_THRESHOLD is 50", () => {
    expect(LOW_SCORE_THRESHOLD).toBe(50);
  });
});

describe("progressPercentTowardTop25Rank", () => {
  it("is 100% when already at Top 25%", () => {
    expect(progressPercentTowardTop25Rank(25)).toBe(100);
    expect(progressPercentTowardTop25Rank(10)).toBe(100);
  });

  it("matches 25/topPct (peer-rank progress, not raw score)", () => {
    expect(progressPercentTowardTop25Rank(44)).toBe(Math.round((25 / 44) * 100));
    expect(progressPercentTowardTop25Rank(81)).toBe(Math.round((25 / 81) * 100));
  });
});

describe("gapToNextLevel", () => {
  it("does not report 0 pts when score is high but peer rank is still outside Top 25%", () => {
    const audit = mockAudit({
      scores: { smart: 72, grit: 70, build: 75 },
      peer_percentiles: { smart: 19, grit: 50, build: 56 },
    });
    const gaps = gapToNextLevel(audit);
    const buildGap = gaps.find((g) => g.key === "build");
    expect(buildGap).toBeDefined();
    expect(buildGap!.pointsToTop25).toBeGreaterThanOrEqual(8);
    const smartGap = gaps.find((g) => g.key === "smart");
    expect(smartGap).toBeDefined();
    expect(smartGap!.pointsToTop25).toBeGreaterThanOrEqual(20);
  });
});
