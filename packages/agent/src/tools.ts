import { tool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { interrupt } from "@langchain/langgraph";
import type { ApprovalRequest, CreateTodo, Todo, UpdateTodo } from "@projectzero/shared";
import { z } from "zod";

/** The todo operations the agent may perform; the API backs this with TodosService. */
export interface TodoBackend {
  list(userId: string): Promise<Todo[]>;
  /** Throws if the todo doesn't exist or isn't the user's. */
  get(userId: string, id: string): Promise<Todo>;
  create(userId: string, input: CreateTodo): Promise<Todo>;
  update(userId: string, id: string, input: UpdateTodo): Promise<Todo>;
  remove(userId: string, id: string): Promise<void>;
}

export interface ApprovalDecision {
  approved: boolean;
}

/** The signed-in user comes from the run config, never from model output. */
/** What the model sees of a todo; IDs, owner and timestamps beyond this are noise. */
const brief = ({ id, title, completed }: Todo) => ({ id, title, completed });

function userIdFrom(config: RunnableConfig): string {
  const userId = config.configurable?.userId;
  if (typeof userId !== "string" || !userId)
    throw new Error("Agent run is missing configurable.userId");
  return userId;
}

/** Pauses the run until the user approves or declines the change. */
function requestApproval(request: Omit<ApprovalRequest, "id">): boolean {
  const decision = interrupt<Omit<ApprovalRequest, "id">, ApprovalDecision | undefined>(request);
  return decision?.approved === true;
}

const declined = "The user declined this change. Nothing was changed. Do not retry it.";

/** Looks up the todo a tool call refers to, so approvals can name it by title. */
async function findTodo(backend: TodoBackend, userId: string, id: string): Promise<Todo | null> {
  try {
    return await backend.get(userId, id);
  } catch {
    return null;
  }
}

const notFound = (id: string) => `No todo with id ${id}. Call list_todos to get valid ids.`;

export function createTodoTools(backend: TodoBackend) {
  const listTodos = tool(
    async (_input, config) => JSON.stringify((await backend.list(userIdFrom(config))).map(brief)),
    {
      name: "list_todos",
      description: "List the user's todos (id, title, completed), newest first.",
      schema: z.object({}),
    },
  );

  const createTodo = tool(
    async ({ title }, config) => {
      const userId = userIdFrom(config);
      if (
        !requestApproval({ action: "create_todo", args: { title }, summary: `Add todo "${title}"` })
      )
        return declined;
      const created = await backend.create(userId, { title });
      return `Approved and done: created ${JSON.stringify(brief(created))}.`;
    },
    {
      name: "create_todo",
      description: "Create a todo for the user.",
      schema: z.object({ title: z.string().min(1).max(500).describe("What needs doing.") }),
    },
  );

  const updateTodo = tool(
    async ({ id, title, completed }, config) => {
      const userId = userIdFrom(config);
      // Code before interrupt() re-runs on resume, so this read happens twice; it's harmless.
      const current = await findTodo(backend, userId, id);
      if (!current) return notFound(id);
      const rename = title !== undefined && title !== current.title ? title : undefined;
      const toggle =
        completed !== undefined && completed !== current.completed ? completed : undefined;
      if (rename === undefined && toggle === undefined)
        return `Nothing to change: ${JSON.stringify(brief(current))}.`;
      const changes = [
        rename !== undefined && `rename to "${rename}"`,
        toggle !== undefined && (toggle ? "mark done" : "mark not done"),
      ].filter(Boolean);
      const summary = `"${current.title}": ${changes.join(", ")}`;
      if (
        !requestApproval({
          action: "update_todo",
          args: { id, title: rename, completed: toggle },
          summary,
        })
      )
        return declined;
      const updated = await backend.update(userId, id, { title: rename, completed: toggle });
      return `Approved and done: updated ${JSON.stringify(brief(updated))}.`;
    },
    {
      name: "update_todo",
      description: "Rename a todo or mark it done / not done.",
      schema: z.object({
        id: z.string().describe("ID from list_todos."),
        title: z.string().min(1).max(500).optional().describe("New title."),
        completed: z.boolean().optional().describe("New completion state."),
      }),
    },
  );

  const deleteTodo = tool(
    async ({ id }, config) => {
      const userId = userIdFrom(config);
      const current = await findTodo(backend, userId, id);
      if (!current) return notFound(id);
      if (
        !requestApproval({
          action: "delete_todo",
          args: { id },
          summary: `Delete "${current.title}"`,
        })
      )
        return declined;
      await backend.remove(userId, id);
      return `Approved and done: deleted "${current.title}".`;
    },
    {
      name: "delete_todo",
      description: "Delete a todo permanently.",
      schema: z.object({ id: z.string().describe("ID from list_todos.") }),
    },
  );

  return [listTodos, createTodo, updateTodo, deleteTodo];
}
