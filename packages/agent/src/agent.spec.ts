import { MemorySaver } from "@langchain/langgraph";
import type { AgentEvent, Todo } from "@projectzero/shared";
import { describe, expect, it, vi } from "vitest";
import { createTodoAgent } from "./graph";
import { streamAgentRun, threadState } from "./stream";
import { ScriptedChatModel, toolCall } from "./testing";
import type { TodoBackend } from "./tools";

const todo = (title: string): Todo => ({
  id: "6f0d3b44-6c6a-4b5e-9a39-7d8a3f0e6a11",
  userId: "u1",
  title,
  completed: false,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
});

function setup(script: ConstructorParameters<typeof ScriptedChatModel>[0]) {
  const backend: TodoBackend = {
    list: vi.fn(async () => [todo("Buy milk")]),
    get: vi.fn(async (_u, id) => {
      if (id !== todo("").id) throw new Error("not found");
      return todo("Buy milk");
    }),
    create: vi.fn(async (_u, input) => todo(input.title)),
    update: vi.fn(async (_u, _id, input) => ({ ...todo("x"), ...input })),
    remove: vi.fn(async () => {}),
  };
  const model = new ScriptedChatModel(script);
  const agent = createTodoAgent({ model, backend, checkpointer: new MemorySaver() });
  return { agent, backend, model };
}

async function collect(gen: AsyncGenerator<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const run = { threadId: "t1", userId: "u1" };

describe("todo agent", () => {
  it("answers using read-only tools without asking for approval", async () => {
    const { agent, backend } = setup([toolCall("list_todos", {}), "You have one todo: Buy milk."]);
    const events = await collect(streamAgentRun(agent, { message: "what's on my list?" }, run));

    expect(backend.list).toHaveBeenCalledWith("u1");
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "token", "done"]);
    expect(events).toContainEqual({ type: "token", text: "You have one todo: Buy milk." });
  });

  it("pauses mutating tools for approval and runs them once approved", async () => {
    const { agent, backend } = setup([toolCall("create_todo", { title: "Call mom" }), "Added it."]);

    const first = await collect(streamAgentRun(agent, { message: "remind me to call mom" }, run));
    const approval = first.find((e) => e.type === "approval_required");
    expect(approval).toMatchObject({
      approval: {
        action: "create_todo",
        args: { title: "Call mom" },
        summary: 'Add todo "Call mom"',
      },
    });
    expect(backend.create).not.toHaveBeenCalled();
    expect((await threadState(agent, run)).pendingApprovals).toHaveLength(1);

    const second = await collect(streamAgentRun(agent, { resume: { approved: true } }, run));
    expect(backend.create).toHaveBeenCalledWith("u1", { title: "Call mom" });
    expect(second).toContainEqual({ type: "token", text: "Added it." });
    expect((await threadState(agent, run)).pendingApprovals).toEqual([]);
  });

  it("tells the model when the user declines, without changing anything", async () => {
    const { agent, backend, model } = setup([
      toolCall("delete_todo", { id: todo("").id }),
      "Okay, I left it.",
    ]);
    const first = await collect(streamAgentRun(agent, { message: "delete buy milk" }, run));
    expect(first).toContainEqual(
      expect.objectContaining({
        approval: expect.objectContaining({ summary: 'Delete "Buy milk"' }),
      }),
    );
    const events = await collect(streamAgentRun(agent, { resume: { approved: false } }, run));

    expect(backend.remove).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "tool_result",
        name: "delete_todo",
        content: expect.stringMatching(/declined/),
      }),
    );
    expect(model.calls).toHaveLength(2);
  });

  it("describes updates by title and only lists real changes", async () => {
    const { agent } = setup([
      toolCall("update_todo", { id: todo("").id, title: "Buy milk", completed: true }),
    ]);
    const events = await collect(streamAgentRun(agent, { message: "mark milk done" }, run));
    expect(events).toContainEqual(
      expect.objectContaining({
        approval: expect.objectContaining({ summary: '"Buy milk": mark done' }),
      }),
    );
  });

  it("answers unknown ids without asking for approval", async () => {
    const { agent } = setup([toolCall("delete_todo", { id: "nope" }), "I couldn't find it."]);
    const events = await collect(streamAgentRun(agent, { message: "delete nope" }, run));
    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "token", "done"]);
    expect(events[1]).toMatchObject({ content: expect.stringMatching(/No todo with id nope/) });
  });

  it("scopes tool calls to the run's user, not anything the model says", async () => {
    const { agent, backend } = setup([toolCall("list_todos", { userId: "someone-else" }), "Done."]);
    await collect(streamAgentRun(agent, { message: "list" }, { threadId: "t2", userId: "u42" }));
    expect(backend.list).toHaveBeenCalledWith("u42");
  });

  it("rejects a resume when nothing is pending", async () => {
    const { agent } = setup([]);
    await expect(
      collect(streamAgentRun(agent, { resume: { approved: true } }, run)),
    ).rejects.toThrow(/Nothing is waiting/);
  });

  it("returns readable thread history", async () => {
    const { agent } = setup([toolCall("list_todos", {}), "One todo."]);
    await collect(streamAgentRun(agent, { message: "hi" }, run));
    const { messages } = await threadState(agent, run);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(messages[1]?.toolCalls?.[0]?.name).toBe("list_todos");
    expect(messages[3]?.content).toBe("One todo.");
  });
});
