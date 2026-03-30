/**
 * Resume Upgrade Workflow
 *
 * A durable, multi-step workflow that:
 * 1. Triggers a resume audit
 * 2. Identifies weak bullets (below threshold)
 * 3. Rewrites them with AI
 * 4. Runs ATS compatibility check
 * 5. Returns a full upgrade report
 *
 * Survives crashes/deploys — each step is retryable and observable.
 */

import { defineHook } from "workflow";
import { generateText } from "ai";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Hook for human approval before applying rewrites
const approvalHook = defineHook<{
  decision: "apply" | "skip";
  notes?: string;
}>();

export { approvalHook };

export async function resumeUpgradeWorkflow(authToken: string) {
  "use workflow";

  // Step 1: Trigger audit
  const auditResult = await triggerAudit(authToken);

  // Step 2: Identify weak bullets
  const weakBullets = await identifyWeakBullets(authToken, auditResult);

  if (weakBullets.length === 0) {
    return {
      status: "no_changes_needed",
      message: "All bullets score above threshold. Resume looks strong.",
      audit: auditResult,
    };
  }

  // Step 3: Generate rewrites with AI
  const rewrites = await generateRewrites(weakBullets);

  // Step 4: Wait for human approval
  const events = approvalHook.create({ token: `resume-${Date.now()}` });
  let approved = false;

  for await (const event of events) {
    approved = event.decision === "apply";
    break;
  }

  if (!approved) {
    return {
      status: "skipped",
      message: "Rewrites were not applied.",
      rewrites,
    };
  }

  // Step 5: Apply rewrites
  const applied = await applyRewrites(authToken, rewrites);

  // Step 6: Run ATS check
  const atsResult = await runAtsCheck(authToken);

  return {
    status: "completed",
    audit: auditResult,
    bullets_rewritten: applied.length,
    ats_score: atsResult.score,
    ats_issues: atsResult.issues,
    rewrites: applied,
  };
}

// --- Steps ---

async function triggerAudit(authToken: string) {
  "use step";

  const res = await fetch(`${API_BASE}/audit/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source: "editor" }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`Audit failed: ${res.status}`);
  return res.json();
}

async function identifyWeakBullets(
  authToken: string,
  auditResult: Record<string, unknown>,
) {
  "use step";

  // Fetch resume from editor
  const res = await fetch(`${API_BASE}/resume/editor`, {
    headers: { Authorization: `Bearer ${authToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) return [];
  const resume = await res.json();

  // Extract bullets and their scores from the audit
  const bullets: Array<{ text: string; score: number; section: string }> = [];
  const sections = (resume as Record<string, unknown>).sections;

  if (Array.isArray(sections)) {
    for (const section of sections) {
      const s = section as Record<string, unknown>;
      const sectionName = String(s.title || s.name || "");
      const items = Array.isArray(s.bullets) ? s.bullets : [];
      for (const bullet of items) {
        const b = bullet as Record<string, unknown>;
        const text = String(b.text || b.content || "");
        const score = Number(b.score ?? b.bullet_score ?? 50);
        if (text && score < 60) {
          bullets.push({ text, score, section: sectionName });
        }
      }
    }
  }

  return bullets;
}

async function generateRewrites(
  weakBullets: Array<{ text: string; score: number; section: string }>,
) {
  "use step";

  const rewrites: Array<{
    original: string;
    rewritten: string;
    section: string;
    original_score: number;
  }> = [];

  for (const bullet of weakBullets.slice(0, 5)) {
    const { text } = await generateText({
      model: "anthropic/claude-sonnet-4.6",
      prompt: `Rewrite this resume bullet to score higher. Add specific metrics, numbers, and impact. Keep it to one line (under 120 characters).

Original (score ${bullet.score}/100): "${bullet.text}"

Return ONLY the rewritten bullet, nothing else.`,
    });

    rewrites.push({
      original: bullet.text,
      rewritten: text.trim(),
      section: bullet.section,
      original_score: bullet.score,
    });
  }

  return rewrites;
}

async function applyRewrites(
  authToken: string,
  rewrites: Array<{ original: string; rewritten: string; section: string }>,
) {
  "use step";

  const applied: typeof rewrites = [];

  for (const rw of rewrites) {
    try {
      const res = await fetch(`${API_BASE}/voice/execute-action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "SAVE_BULLET_REWRITE",
          data: {
            original: rw.original,
            rewritten: rw.rewritten,
            section: rw.section,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) applied.push(rw);
    } catch {
      // Continue with remaining rewrites
    }
  }

  return applied;
}

async function runAtsCheck(authToken: string) {
  "use step";

  const res = await fetch(`${API_BASE}/ats/scan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source: "editor" }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) return { score: null, issues: ["ATS check unavailable"] };
  return res.json();
}
