import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  AGENT_SCHEMA,
  createAgentModel,
  createTodoAgent,
  type TodoAgent,
} from "@projectzero/agent";
import { PostgresSaver as Saver } from "@langchain/langgraph-checkpoint-postgres";
import type { Provider } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { TodosService } from "../todos/todos.service";

/** Chat model token; tests override it with a scripted model. */
export const CHAT_MODEL = Symbol("CHAT_MODEL");
export const CHECKPOINTER = Symbol("CHECKPOINTER");
export const TODO_AGENT = Symbol("TODO_AGENT");

export const agentProviders: Provider[] = [
  {
    provide: CHAT_MODEL,
    inject: [ENV],
    useFactory: (env: Env): BaseChatModel =>
      createAgentModel({ model: env.AGENT_MODEL, baseUrl: env.OLLAMA_BASE_URL }),
  },
  {
    // Connects lazily; tables are created in AgentService.onApplicationBootstrap so building
    // the app (e.g. to emit openapi.json) needs no database.
    provide: CHECKPOINTER,
    inject: [ENV],
    useFactory: (env: Env): PostgresSaver =>
      Saver.fromConnString(env.DATABASE_URL, { schema: AGENT_SCHEMA }),
  },
  {
    provide: TODO_AGENT,
    inject: [CHAT_MODEL, CHECKPOINTER, TodosService],
    useFactory: (
      model: BaseChatModel,
      checkpointer: PostgresSaver,
      todos: TodosService,
    ): TodoAgent => createTodoAgent({ model, checkpointer, backend: todos }),
  },
];
