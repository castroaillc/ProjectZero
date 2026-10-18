import { z } from "zod";

/** A conversation between a user and the todo agent. */
export const AgentThreadSchema = z
  .object({
    id: z.uuid().describe("Thread ID; also the LangGraph thread_id."),
    title: z.string().describe("Short title, taken from the first message."),
    createdAt: z.iso.datetime().describe("When the thread was created (ISO 8601)."),
  })
  .describe("A conversation with the todo agent.");

export const CreateAgentThreadSchema = z
  .object({ title: z.string().min(1).max(200).optional().describe("Optional title.") })
  .describe("Fields for creating an agent thread.");

/** A mutating tool call waiting for the user's go-ahead. */
export const ApprovalRequestSchema = z
  .object({
    id: z.string().describe("Interrupt ID."),
    action: z
      .enum(["create_todo", "update_todo", "delete_todo"])
      .describe("Tool that wants to run."),
    args: z.record(z.string(), z.unknown()).describe("Arguments the agent wants to run it with."),
    summary: z.string().describe("Human-readable description of the change."),
  })
  .describe("A change the agent wants to make, pending approval.");

export const AgentMessageSchema = z
  .object({
    id: z.string().describe("Message ID."),
    role: z.enum(["user", "assistant", "tool"]).describe("Who produced the message."),
    content: z.string().describe("Text content."),
    toolCalls: z
      .array(
        z.object({ id: z.string(), name: z.string(), args: z.record(z.string(), z.unknown()) }),
      )
      .optional()
      .describe("Tools the assistant asked to run."),
    toolName: z.string().optional().describe("For tool messages: which tool produced it."),
  })
  .describe("One message in an agent thread.");

export const AgentThreadStateSchema = z
  .object({
    messages: z.array(AgentMessageSchema).describe("Conversation so far, oldest first."),
    pendingApprovals: z.array(ApprovalRequestSchema).describe("Changes waiting for approval."),
  })
  .describe("Messages and pending approvals of an agent thread.");

/** Body of `POST /v1/agent/threads/:id/runs`: either a new message or an approval decision. */
export const RunAgentSchema = z
  .object({
    message: z.string().min(1).max(4000).optional().describe("The user's message."),
    resume: z
      .object({ approved: z.boolean().describe("Whether to let the pending changes run.") })
      .optional()
      .describe("Decision for every pending approval."),
  })
  .refine((v) => (v.message === undefined) !== (v.resume === undefined), {
    message: "Send exactly one of `message` or `resume`.",
  })
  .describe("Start a run with a message, or resume one waiting for approval.");

/** Server-sent events emitted while an agent run streams. */
export const AgentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text: z.string() }),
  z.object({
    type: z.literal("tool_call"),
    id: z.string(),
    name: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("tool_result"),
    id: z.string(),
    name: z.string(),
    content: z.string(),
  }),
  z.object({ type: z.literal("approval_required"), approval: ApprovalRequestSchema }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type AgentThread = z.infer<typeof AgentThreadSchema>;
export type CreateAgentThread = z.infer<typeof CreateAgentThreadSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentThreadState = z.infer<typeof AgentThreadStateSchema>;
export type RunAgent = z.infer<typeof RunAgentSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
