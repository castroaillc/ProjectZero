import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage } from "@langchain/core/messages";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode, toolsCondition } from "@langchain/langgraph/prebuilt";
import { SYSTEM_PROMPT } from "./prompt";
import { createTodoTools, type TodoBackend } from "./tools";

export interface CreateTodoAgentOptions {
  model: BaseChatModel;
  backend: TodoBackend;
  /** Persists threads between runs; required for interrupts/approvals to resume. */
  checkpointer?: BaseCheckpointSaver;
}

/**
 * The todo agent: a model ↔ tools loop. Mutating tools pause the run with `interrupt()` until
 * the user approves; resume with `new Command({ resume: { approved } })` on the same thread.
 */
export function createTodoAgent({ model, backend, checkpointer }: CreateTodoAgentOptions) {
  const tools = createTodoTools(backend);
  if (!model.bindTools) throw new Error("The agent model must support tool calling");
  const modelWithTools = model.bindTools(tools);

  return new StateGraph(MessagesAnnotation)
    .addNode("agent", async (state) => ({
      messages: [
        await modelWithTools.invoke([new SystemMessage(SYSTEM_PROMPT), ...state.messages]),
      ],
    }))
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", toolsCondition, ["tools", END])
    .addEdge("tools", "agent")
    .compile({ checkpointer });
}

export type TodoAgent = ReturnType<typeof createTodoAgent>;
