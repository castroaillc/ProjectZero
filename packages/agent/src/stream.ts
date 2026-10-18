import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { Command, INTERRUPT } from "@langchain/langgraph";
import type {
  AgentEvent,
  AgentMessage,
  AgentThreadState,
  ApprovalRequest,
} from "@projectzero/shared";
import type { TodoAgent } from "./graph";

export interface RunConfig {
  threadId: string;
  userId: string;
  signal?: AbortSignal;
}

type Input = { message: string } | { resume: { approved: boolean } };

function textOf(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
    .join("");
}

function toApproval(interrupt: { id?: string; value?: unknown }): ApprovalRequest {
  return { id: interrupt.id ?? "", ...(interrupt.value as Omit<ApprovalRequest, "id">) };
}

function configFor({ threadId, userId, signal }: RunConfig) {
  // runName/metadata label traces in LangSmith when tracing is enabled.
  return {
    configurable: { thread_id: threadId, userId },
    runName: "todo-agent",
    metadata: { userId, threadId },
    signal,
  };
}

/** Pending approvals on a thread (interrupts raised by mutating tools). */
export async function pendingApprovals(
  agent: TodoAgent,
  run: RunConfig,
): Promise<ApprovalRequest[]> {
  const state = await agent.getState(configFor(run));
  return state.tasks.flatMap((task) => task.interrupts.map(toApproval));
}

/**
 * Runs the agent and yields events for the client: streamed tokens, tool calls and results,
 * approval requests, then `done`. A `resume` input answers every pending approval at once.
 */
export async function* streamAgentRun(
  agent: TodoAgent,
  input: Input,
  run: RunConfig,
): AsyncGenerator<AgentEvent> {
  const options = {
    ...configFor(run),
    streamMode: ["messages", "updates"] as ("messages" | "updates")[],
  };
  let stream;
  if ("resume" in input) {
    const pending = await pendingApprovals(agent, run);
    if (pending.length === 0) throw new Error("Nothing is waiting for approval on this thread");
    const resume = Object.fromEntries(pending.map((p) => [p.id, input.resume]));
    stream = await agent.stream(new Command({ resume }), options);
  } else {
    stream = await agent.stream({ messages: [new HumanMessage(input.message)] }, options);
  }

  for await (const [mode, chunk] of stream) {
    if (mode === "messages") {
      const [message, metadata] = chunk as [BaseMessage, { langgraph_node?: string }];
      // Streaming models emit chunks; non-streaming ones emit the whole message once.
      const fromModel = AIMessageChunk.isInstance(message) || AIMessage.isInstance(message);
      if (metadata.langgraph_node === "agent" && fromModel) {
        const text = textOf(message.content);
        if (text) yield { type: "token", text };
      }
      continue;
    }

    const update = chunk as Record<
      string,
      { messages?: BaseMessage[] } | { id?: string; value?: unknown }[]
    >;
    const interrupts = update[INTERRUPT];
    if (Array.isArray(interrupts)) {
      for (const interrupt of interrupts)
        yield { type: "approval_required", approval: toApproval(interrupt) };
    }
    for (const [node, value] of Object.entries(update)) {
      if (node === INTERRUPT || Array.isArray(value)) continue;
      for (const message of value?.messages ?? []) {
        if (AIMessage.isInstance(message)) {
          for (const call of message.tool_calls ?? []) {
            yield { type: "tool_call", id: call.id ?? "", name: call.name, args: call.args };
          }
        } else if (ToolMessage.isInstance(message)) {
          yield {
            type: "tool_result",
            id: message.tool_call_id,
            name: message.name ?? "",
            content: textOf(message.content),
          };
        }
      }
    }
  }
  yield { type: "done" };
}

/** Thread history for display: user, assistant and tool messages plus pending approvals. */
export async function threadState(agent: TodoAgent, run: RunConfig): Promise<AgentThreadState> {
  const state = await agent.getState(configFor(run));
  const messages: AgentMessage[] = ((state.values.messages ?? []) as BaseMessage[]).flatMap(
    (m): AgentMessage[] => {
      const id = m.id ?? "";
      if (AIMessage.isInstance(m)) {
        const toolCalls = (m.tool_calls ?? []).map((c) => ({
          id: c.id ?? "",
          name: c.name,
          args: c.args,
        }));
        return [
          {
            id,
            role: "assistant",
            content: textOf(m.content),
            ...(toolCalls.length && { toolCalls }),
          },
        ];
      }
      if (ToolMessage.isInstance(m))
        return [{ id, role: "tool", content: textOf(m.content), toolName: m.name }];
      if (m.getType() === "human") return [{ id, role: "user", content: textOf(m.content) }];
      return [];
    },
  );
  return { messages, pendingApprovals: state.tasks.flatMap((t) => t.interrupts.map(toApproval)) };
}
