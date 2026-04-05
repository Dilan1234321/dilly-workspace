/**
 * Streaming AI chat route for the Dilly coach.
 * AI SDK v6 with AI Gateway for streaming + tool calling.
 */

import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { fetchRichContext } from "@/lib/ai/context";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { buildTools } from "@/lib/ai/tools";

export const maxDuration = 60;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function POST(req: Request) {
  const authToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!authToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const { messages, mode = "coaching" } = body as {
    messages: Parameters<typeof convertToModelMessages>[0];
    mode?: "coaching" | "practice";
  };

  if (!messages?.length) {
    return new Response("No messages provided", { status: 400 });
  }

  const richContext = await fetchRichContext(authToken);

  // When context loading fails, inject a notice so the model knows responses may be less personalized.
  const contextFailed = !richContext || !!(richContext as unknown as Record<string, unknown>)?._contextError;
  const contextNotice = contextFailed
    ? "\n\nNote: Could not load your full profile. Responses may be less personalized."
    : "";

  const system = buildSystemPrompt(
    mode,
    contextFailed ? null : richContext,
    richContext?.dilly_narrative ?? undefined,
  ) + contextNotice;

  const tools = buildTools(authToken);

  // AI Gateway model string (resolves to same model as claude-sonnet-4-20250514 in the API).
  // Run `vercel link && vercel env pull` for OIDC credentials.
  const model = "anthropic/claude-sonnet-4-6";

  const result = streamText({
    model,
    system,
    messages: (await convertToModelMessages(messages)).slice(-30),
    tools,
    stopWhen: stepCountIs(5),
    onFinish: async ({ toolCalls }) => {
      // Save conversation for memory extraction
      try {
        const convId = req.headers.get("x-conversation-id") || crypto.randomUUID();
        await fetch(`${API_BASE}/ai/conversations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversation_id: convId,
            messages: messages
              .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
              .slice(-40),
            mode,
          }),
          signal: AbortSignal.timeout(5_000),
        });
      } catch {
        // Non-critical
      }

      if (toolCalls?.length) {
        console.log(`[ai-coach] ${toolCalls.length} tool(s):`, toolCalls.map((tc) => tc.toolName));
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
