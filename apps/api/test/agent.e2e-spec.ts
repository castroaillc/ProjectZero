import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { ScriptedChatModel, toolCall } from "@projectzero/agent/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAT_MODEL } from "../src/agent/agent.providers";
import { createTestApp, signUp, sseEvents, testUsers } from "./helpers";

// The real graph, checkpointer (Postgres) and API, with a scripted model instead of Ollama.
const model = new ScriptedChatModel();
const users = testUsers("agent");
let app: INestApplication;
let http: ReturnType<typeof request>;
let alice: { token: string };
let bob: { token: string };

const as = (who: { token: string }, r: request.Test) =>
  r.set("authorization", `Bearer ${who.token}`);
const runOn = (who: { token: string }, id: string, body: object) =>
  as(who, http.post(`/v1/agent/threads/${id}/runs`))
    .send(body)
    .buffer(true);

beforeAll(async () => {
  app = await createTestApp((b) => b.overrideProvider(CHAT_MODEL).useValue(model));
  http = request(app.getHttpServer());
  alice = await signUp(app, users.email("alice"));
  bob = await signUp(app, users.email("bob"));
});

afterAll(async () => {
  await users.cleanup();
  await app?.close();
});

describe("agent threads", () => {
  let threadId: string;

  it("creates and lists threads", async () => {
    const { body } = await as(alice, http.post("/v1/agent/threads")).send({}).expect(201);
    threadId = body.id;
    expect(body.title).toBe("New conversation");
    const list = await as(alice, http.get("/v1/agent/threads")).expect(200);
    expect(list.body.map((t: { id: string }) => t.id)).toContain(threadId);
  });

  it("streams a run that pauses for approval", async () => {
    model.enqueue(toolCall("create_todo", { title: "Call mom" }), "Added it.");
    const res = await runOn(alice, threadId, { message: "remind me to call mom" }).expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);

    const events = sseEvents(res.text);
    expect(events.map((e) => e.type)).toEqual(["tool_call", "approval_required", "done"]);
    expect(events[1]).toMatchObject({
      approval: { action: "create_todo", summary: 'Add todo "Call mom"' },
    });

    const state = await as(alice, http.get(`/v1/agent/threads/${threadId}`)).expect(200);
    expect(state.body.pendingApprovals).toHaveLength(1);
    const list = await as(alice, http.get("/v1/agent/threads")).expect(200);
    expect(list.body.find((t: { id: string }) => t.id === threadId).title).toBe(
      "remind me to call mom",
    );
  });

  it("runs the change for the right user once approved", async () => {
    const res = await runOn(alice, threadId, { resume: { approved: true } }).expect(200);
    const events = sseEvents(res.text);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "tool_result", name: "create_todo" }),
    );
    expect(events).toContainEqual({ type: "token", text: "Added it." });

    const todos = await as(alice, http.get("/v1/todos")).expect(200);
    expect(todos.body.map((t: { title: string }) => t.title)).toContain("Call mom");
    expect((await as(bob, http.get("/v1/todos")).expect(200)).body).toEqual([]);

    const state = await as(alice, http.get(`/v1/agent/threads/${threadId}`)).expect(200);
    expect(state.body.pendingApprovals).toEqual([]);
    expect(state.body.messages.map((m: { role: string }) => m.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
  });

  it("reports a resume with nothing pending as an error event", async () => {
    const res = await runOn(alice, threadId, { resume: { approved: true } }).expect(200);
    expect(sseEvents(res.text)).toEqual([
      { type: "error", message: expect.stringMatching(/Nothing is waiting/) },
    ]);
  });

  it("validates the run body", async () => {
    await runOn(alice, threadId, { message: "hi", resume: { approved: true } }).expect(400);
    await runOn(alice, threadId, {}).expect(400);
  });

  it("hides threads from other users", async () => {
    await as(bob, http.get(`/v1/agent/threads/${threadId}`)).expect(404);
    await runOn(bob, threadId, { message: "hi" }).expect(404);
    await as(bob, http.delete(`/v1/agent/threads/${threadId}`)).expect(404);
    expect((await as(bob, http.get("/v1/agent/threads")).expect(200)).body).toEqual([]);
  });

  it("deletes a thread and its history", async () => {
    await as(alice, http.delete(`/v1/agent/threads/${threadId}`)).expect(204);
    await as(alice, http.get(`/v1/agent/threads/${threadId}`)).expect(404);
  });
});
