import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../src/openapi/document";
import { createTestApp, signUp as signUpWith, testUsers } from "./helpers";

const users = testUsers("app");
let app: INestApplication;
let http: ReturnType<typeof request>;
const signUp = (email: string) => signUpWith(app, email);

beforeAll(async () => {
  app = await createTestApp();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await users.cleanup();
  await app?.close();
});

describe("health", () => {
  it("is public and reports the database", async () => {
    const res = await http.get("/v1/health").expect(200);
    expect(res.body.info.database.status).toBe("up");
  });
});

describe("todos", () => {
  let alice: Awaited<ReturnType<typeof signUp>>;
  let bob: Awaited<ReturnType<typeof signUp>>;
  const asAlice = (r: request.Test) => r.set("authorization", `Bearer ${alice.token}`);
  const asBob = (r: request.Test) => r.set("authorization", `Bearer ${bob.token}`);

  beforeAll(async () => {
    alice = await signUp(users.email("alice"));
    bob = await signUp(users.email("bob"));
  });

  it("rejects requests without a session", async () => {
    await http.get("/v1/todos").expect(401);
  });

  it("runs the full CRUD cycle for the owner", async () => {
    const created = await asAlice(http.post("/v1/todos")).send({ title: "buy milk" }).expect(201);
    expect(created.body).toMatchObject({ title: "buy milk", completed: false });
    const id = created.body.id as string;

    const list = await asAlice(http.get("/v1/todos")).expect(200);
    expect(list.body.map((t: { id: string }) => t.id)).toContain(id);

    const updated = await asAlice(http.patch(`/v1/todos/${id}`))
      .send({ completed: true })
      .expect(200);
    expect(updated.body.completed).toBe(true);

    await asAlice(http.delete(`/v1/todos/${id}`)).expect(204);
    await asAlice(http.get(`/v1/todos/${id}`)).expect(404);
  });

  it("accepts the session cookie as well as the bearer token", async () => {
    await http.get("/v1/todos").set("cookie", alice.cookie).expect(200);
  });

  it("hides one user's todos from another", async () => {
    const { body } = await asAlice(http.post("/v1/todos")).send({ title: "private" }).expect(201);
    expect((await asBob(http.get("/v1/todos")).expect(200)).body).toEqual([]);
    await asBob(http.get(`/v1/todos/${body.id}`)).expect(404);
    await asBob(http.patch(`/v1/todos/${body.id}`))
      .send({ completed: true })
      .expect(404);
    await asBob(http.delete(`/v1/todos/${body.id}`)).expect(404);
  });

  it("validates bodies and ids", async () => {
    const res = await asAlice(http.post("/v1/todos")).send({ title: "" }).expect(400);
    expect(res.body.errors[0].path).toEqual(["title"]);
    await asAlice(http.get("/v1/todos/not-a-uuid")).expect(400);
  });
});

describe("openapi", () => {
  it("documents both the Nest routes and the Better Auth routes", async () => {
    const doc = await buildOpenApiDocument(app);
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/v1/todos",
        "/v1/todos/{id}",
        "/v1/health",
        "/api/auth/sign-in/email",
      ]),
    );
  });
});
