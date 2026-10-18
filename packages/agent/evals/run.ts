/**
 * Behaviour evals for the todo agent against the real model (Ollama by default).
 *
 *   pnpm --filter @projectzero/agent agent:eval [--trials 3]
 *
 * Each scenario seeds an in-memory todo list, sends the conversation turns (auto-approving any
 * change the agent proposes) and checks the final todo list and the agent's behaviour. Results
 * are printed locally; with LANGSMITH_TRACING=true and a key, every run is also traced.
 */
import { MemorySaver } from "@langchain/langgraph";
import type { Todo } from "@projectzero/shared";
import { createAgentModel, createTodoAgent, streamAgentRun, type TodoBackend } from "../src/index";

interface Scenario {
  name: string;
  seed: string[];
  turns: string[];
  /** Returns a failure message, or null if the outcome is right. */
  check(todos: Todo[], log: RunLog): string | null;
}

interface RunLog {
  tools: string[];
  approvals: number;
  replies: string[];
}

const asksForConfirmation = (text: string) =>
  /\b(would you like|shall i|should i|do you want|confirm)\b/i.test(text);

const scenarios: Scenario[] = [
  {
    name: "adds a todo without asking in chat",
    seed: [],
    turns: ["Add a todo to water the plants."],
    check: (todos, log) =>
      todos.some((t) => /water/i.test(t.title)) ? noConfirmation(log) : "todo was not created",
  },
  {
    name: "completes the right todo",
    seed: ["Buy milk", "Water the plants"],
    turns: ["Mark the plants one as done."],
    check: (todos, log) => {
      const plants = todos.find((t) => /plants/i.test(t.title));
      const milk = todos.find((t) => /milk/i.test(t.title));
      if (!plants?.completed) return "plants todo not completed";
      if (milk?.completed) return "milk todo was completed too";
      return noConfirmation(log);
    },
  },
  {
    name: "deletes by description",
    seed: ["Buy milk", "Call mom"],
    turns: ["Delete the milk todo."],
    check: (todos, log) =>
      todos.some((t) => /milk/i.test(t.title)) ? "milk todo still there" : noConfirmation(log),
  },
  {
    name: "follow-up refers to the previous todo",
    seed: [],
    turns: ["Add a todo to pay rent.", "Actually, mark it as done."],
    check: (todos, log) => {
      const rent = todos.filter((t) => /rent/i.test(t.title));
      if (rent.length !== 1) return `expected 1 rent todo, found ${rent.length}`;
      return rent[0]!.completed ? noConfirmation(log) : "rent todo not completed";
    },
  },
  {
    name: "answers questions without changing anything",
    seed: ["Buy milk", "Call mom"],
    turns: ["What's on my list?"],
    check: (_todos, log) =>
      log.approvals > 0
        ? "proposed a change for a read-only question"
        : /milk/i.test(log.replies.join(" ")) && /mom/i.test(log.replies.join(" "))
          ? null
          : "reply did not mention both todos",
  },
];

function noConfirmation(log: RunLog): string | null {
  const last = log.replies.at(-1) ?? "";
  return asksForConfirmation(last)
    ? `asked for confirmation in chat: ${JSON.stringify(last)}`
    : null;
}

function memoryBackend(seed: string[]): { backend: TodoBackend; todos: Todo[] } {
  const now = () => new Date().toISOString();
  const todos: Todo[] = seed.map((title) => ({
    id: crypto.randomUUID(),
    userId: "eval",
    title,
    completed: false,
    createdAt: now(),
    updatedAt: now(),
  }));
  const find = (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) throw new Error(`Todo ${id} not found`);
    return todo;
  };
  return {
    todos,
    backend: {
      list: async () => [...todos].reverse(),
      get: async (_u, id) => find(id),
      create: async (userId, { title }) => {
        const todo = {
          id: crypto.randomUUID(),
          userId,
          title,
          completed: false,
          createdAt: now(),
          updatedAt: now(),
        };
        todos.push(todo);
        return todo;
      },
      update: async (_u, id, input) =>
        Object.assign(
          find(id),
          Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
        ),
      remove: async (_u, id) => void todos.splice(todos.indexOf(find(id)), 1),
    },
  };
}

async function runScenario(scenario: Scenario): Promise<{ error: string | null; seconds: number }> {
  const { backend, todos } = memoryBackend(scenario.seed);
  const agent = createTodoAgent({
    model: createAgentModel({
      model: process.env.AGENT_MODEL,
      baseUrl: process.env.OLLAMA_BASE_URL,
    }),
    backend,
    checkpointer: new MemorySaver(),
  });
  const run = { threadId: crypto.randomUUID(), userId: "eval" };
  const log: RunLog = { tools: [], approvals: 0, replies: [] };
  const started = Date.now();

  for (const turn of scenario.turns) {
    let input: { message: string } | { resume: { approved: boolean } } = { message: turn };
    // Keep approving until the agent stops asking (bounded, in case it loops).
    for (let round = 0; round < 5; round++) {
      let reply = "";
      let paused = false;
      for await (const event of streamAgentRun(agent, input, run)) {
        if (event.type === "token") reply += event.text;
        if (event.type === "tool_call") log.tools.push(event.name);
        if (event.type === "approval_required") paused = true;
      }
      if (reply) log.replies.push(reply);
      if (!paused) break;
      log.approvals++;
      input = { resume: { approved: true } };
    }
  }
  const error = scenario.check(todos, log);
  const detail = `tools=[${log.tools.join(",")}] approvals=${log.approvals} last=${JSON.stringify((log.replies.at(-1) ?? "").slice(0, 100))}`;
  return { error: error && `${error} — ${detail}`, seconds: (Date.now() - started) / 1000 };
}

const trialsArg = process.argv.indexOf("--trials");
const trials = trialsArg >= 0 ? Number(process.argv[trialsArg + 1]) : 1;
let passed = 0;
let total = 0;

console.log(
  `Model: ${process.env.AGENT_MODEL || "gpt-oss:20b (default)"} · ${trials} trial(s) per scenario\n`,
);
for (const scenario of scenarios) {
  const failures: string[] = [];
  let seconds = 0;
  for (let i = 0; i < trials; i++) {
    const result = await runScenario(scenario).catch((err: unknown) => ({
      error: String(err),
      seconds: 0,
    }));
    seconds += result.seconds;
    total++;
    if (result.error) failures.push(result.error);
    else passed++;
  }
  const ok = trials - failures.length;
  console.log(
    `${ok === trials ? "✓" : "✗"} ${scenario.name}: ${ok}/${trials} (${(seconds / trials).toFixed(1)}s avg)`,
  );
  for (const f of new Set(failures)) console.log(`    - ${f}`);
}
console.log(`\n${passed}/${total} passed (${Math.round((passed / total) * 100)}%)`);
process.exitCode = passed === total ? 0 : 1;
