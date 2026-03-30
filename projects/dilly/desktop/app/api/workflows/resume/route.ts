/**
 * API route to trigger the resume-upgrade workflow and handle approval.
 * Uses start() from workflow/api to register the run and get a runId.
 */

import { start } from "workflow/api";
import { resumeUpgradeWorkflow, approvalHook } from "@/app/workflows/resume-upgrade/workflow";

export async function POST(req: Request) {
  const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!authToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = (body as Record<string, unknown>).action;

  // Approve or skip rewrites
  if (action === "approve" || action === "skip") {
    const token = String((body as Record<string, unknown>).token || "");
    if (!token) return new Response("Missing token", { status: 400 });

    await approvalHook.resume(token, {
      decision: action === "approve" ? "apply" : "skip",
      notes: String((body as Record<string, unknown>).notes || ""),
    });

    console.log(`[workflow:resume-upgrade] Approval resumed: ${action}`);
    return Response.json({ resumed: true });
  }

  // Start new workflow run (registered with WDK, returns runId)
  console.log("[workflow:resume-upgrade] Starting new run");
  const { runId } = await start(resumeUpgradeWorkflow, [authToken]);

  return Response.json({ runId, status: "started" });
}
