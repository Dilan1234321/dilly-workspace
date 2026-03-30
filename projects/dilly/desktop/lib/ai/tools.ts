/**
 * AI SDK tool definitions for the Dilly coach.
 * Each tool maps to an existing dilly_agent action executed via the Python API.
 */

import { tool } from "ai";
import { z } from "zod";
import { executeAction } from "./context";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export function buildTools(authToken: string) {
  const exec = (action: string, data: Record<string, unknown>) =>
    executeAction(authToken, action, data);

  return {
    addDeadline: tool({
      description: "Add a deadline to the student's calendar",
      inputSchema: z.object({
        label: z.string().describe("What the deadline is for"),
        date: z.string().describe("ISO date string (YYYY-MM-DD)"),
        type: z.enum(["deadline", "interview", "career_fair", "application"]).optional(),
      }),
      execute: async ({ label, date, type }) => exec("CREATE_DEADLINE", { label, date, type }),
    }),

    trackApplication: tool({
      description: "Add a new job/internship application to the tracker",
      inputSchema: z.object({
        company: z.string().describe("Company name"),
        role: z.string().describe("Job title or role"),
        status: z.enum(["saved", "applied", "interviewing", "offer", "rejected"]).optional(),
        url: z.string().optional().describe("Application URL"),
      }),
      execute: async ({ company, role, status, url }) =>
        exec("CREATE_APPLICATION", { company, role, status: status || "applied", url }),
    }),

    updateApplicationStatus: tool({
      description: "Update the status of an existing application",
      inputSchema: z.object({
        company: z.string(),
        role: z.string(),
        new_status: z.enum(["saved", "applied", "interviewing", "offer", "rejected"]),
      }),
      execute: async ({ company, role, new_status }) =>
        exec("UPDATE_APPLICATION_STATUS", { company, role, status: new_status }),
    }),

    addTargetCompany: tool({
      description: "Add a company to the student's target list",
      inputSchema: z.object({ company: z.string() }),
      execute: async ({ company }) => exec("ADD_TARGET_COMPANY", { company_name: company }),
    }),

    createActionItem: tool({
      description: "Create a to-do action item for the student",
      inputSchema: z.object({
        text: z.string().describe("What the student should do"),
        dimension: z.enum(["smart", "grit", "build"]).optional(),
        estimated_pts: z.number().optional(),
      }),
      execute: async ({ text, dimension, estimated_pts }) =>
        exec("CREATE_ACTION_ITEM", { text, dimension, estimated_pts }),
    }),

    completeActionItem: tool({
      description: "Mark an action item as completed",
      inputSchema: z.object({ action_item_id: z.string() }),
      execute: async ({ action_item_id }) => exec("COMPLETE_ACTION_ITEM", { action_item_id }),
    }),

    triggerAudit: tool({
      description: "Trigger a new resume audit for the student",
      inputSchema: z.object({
        source: z.enum(["editor", "pdf"]).optional(),
      }),
      execute: async ({ source }) => exec("TRIGGER_AUDIT", { source: source || "editor" }),
    }),

    rewriteBullet: tool({
      description: "Save an improved resume bullet point",
      inputSchema: z.object({
        original_bullet: z.string(),
        rewritten_bullet: z.string(),
        section: z.string().optional(),
      }),
      execute: async ({ original_bullet, rewritten_bullet, section }) =>
        exec("SAVE_BULLET_REWRITE", { original: original_bullet, rewritten: rewritten_bullet, section }),
    }),

    getScoreBreakdown: tool({
      description: "Get the student's current score breakdown",
      inputSchema: z.object({}),
      execute: async () => {
        const res = await fetch(`${API_BASE}/ai/context`, {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { error: "Could not fetch score data" };
        const ctx = await res.json();
        return {
          score: ctx.current_score,
          smart: ctx.smart,
          grit: ctx.grit,
          build: ctx.build,
          cohort_bar: ctx.cohort_bar,
          gap: ctx.gap,
          weakest: ctx.weakest_dimension,
          strongest: ctx.strongest_dimension,
          days_since_audit: ctx.days_since_audit,
        };
      },
    }),

    addApplicationNote: tool({
      description: "Add a note to an existing application",
      inputSchema: z.object({
        company: z.string(),
        role: z.string(),
        note: z.string(),
      }),
      execute: async ({ company, role, note }) =>
        exec("ADD_APPLICATION_NOTE", { company, role, note }),
    }),

    updateCareerGoal: tool({
      description: "Update the student's career goal",
      inputSchema: z.object({ career_goal: z.string() }),
      execute: async ({ career_goal }) => exec("UPDATE_CAREER_GOAL", { career_goal }),
    }),

    // High-stake tools requiring approval
    deleteDeadline: tool({
      description: "Delete a deadline from the calendar",
      inputSchema: z.object({ label: z.string() }),
      needsApproval: true,
      execute: async ({ label }) => exec("DELETE_DEADLINE", { label }),
    }),

    deleteApplication: tool({
      description: "Remove an application from the tracker",
      inputSchema: z.object({ company: z.string(), role: z.string() }),
      needsApproval: true,
      execute: async ({ company, role }) => exec("DELETE_APPLICATION", { company, role }),
    }),

    removeTargetCompany: tool({
      description: "Remove a company from the target list",
      inputSchema: z.object({ company: z.string() }),
      needsApproval: true,
      execute: async ({ company }) => exec("REMOVE_TARGET_COMPANY", { company_name: company }),
    }),
  };
}
