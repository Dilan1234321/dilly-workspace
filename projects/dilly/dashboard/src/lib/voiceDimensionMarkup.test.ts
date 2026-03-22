import { describe, expect, it } from "vitest";
import {
  healEmptyVoiceDimensionTags,
  inferVoiceFocusDimensionFromUserText,
  normalizeVoiceDimensionMarkup,
} from "./voiceDimensionMarkup";

const scores = { smart: 68, grit: 100, build: 72 };

describe("normalizeVoiceDimensionMarkup", () => {
  it("lowercases dimension tag names", () => {
    expect(normalizeVoiceDimensionMarkup("Hi [Build]x[/Build]")).toBe("Hi [build]x[/build]");
  });
});

describe("healEmptyVoiceDimensionTags", () => {
  it("fills empty build tags with label and score", () => {
    const out = healEmptyVoiceDimensionTags("Your [build][/build] score reflects tech readiness.", scores);
    expect(out).toContain("Build score of 72");
    expect(out).not.toMatch(/\[build\]\s*\[\/build\]/i);
  });

  it("fixes Your [dim][/dim] score without duplicating score", () => {
    const out = healEmptyVoiceDimensionTags("Your [grit][/grit] score is strong.", scores);
    expect(out).toMatch(/Your \[grit\]Grit score of 100\[\/grit\]/);
    expect(out).not.toMatch(/score score/i);
  });

  it("no-ops when scores are null", () => {
    const raw = "Your [build][/build] score";
    expect(healEmptyVoiceDimensionTags(raw, null)).toBe(raw);
  });

  it("fills **Your score** when prior user named a dimension", () => {
    const out = healEmptyVoiceDimensionTags("**Your score** is impressive.", scores, {
      priorUserContent: "what's my grit score?",
    });
    expect(out).toMatch(/\[grit\]Grit score of 100\[\/grit\]/);
  });

  it("does not rewrite **Your score** without a dimension hint in prior user text", () => {
    const raw = "**Your score** is impressive.";
    const out = healEmptyVoiceDimensionTags(raw, scores, { priorUserContent: "hey" });
    expect(out).toBe(raw.replace(/[ \t]{2,}/g, " "));
  });

  it("heals tags with extra whitespace inside brackets", () => {
    const out = healEmptyVoiceDimensionTags("Your [ grit ][/ grit ] score is strong.", scores);
    expect(out).toContain("Grit score of 100");
  });
});

describe("inferVoiceFocusDimensionFromUserText", () => {
  it("returns first-mentioned dimension", () => {
    expect(inferVoiceFocusDimensionFromUserText("smart vs grit?")).toBe("smart");
    expect(inferVoiceFocusDimensionFromUserText("what's my grit score")).toBe("grit");
  });
});
