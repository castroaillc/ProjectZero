import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { createDb, credentials } from "@projectzero/db";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signUp, testUsers } from "./helpers";

const users = testUsers("credentials");
let app: INestApplication;
let http: ReturnType<typeof request>;
let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;
const asAlice = (r: request.Test) => r.set("authorization", `Bearer ${alice.token}`);
const asBob = (r: request.Test) => r.set("authorization", `Bearer ${bob.token}`);

const secret = "ghp_0123456789abcdefWXYZ";

beforeAll(async () => {
  app = await createTestApp();
  http = request(app.getHttpServer());
  alice = await signUp(app, users.email("alice"));
  bob = await signUp(app, users.email("bob"));
});

afterAll(async () => {
  await users.cleanup();
  await app?.close();
});

describe("credentials", () => {
  it("rejects requests without a session", async () => {
    await http.get("/v1/credentials").expect(401);
  });

  it("stores values encrypted and never returns them", async () => {
    const created = await asAlice(http.post("/v1/credentials"))
      .send({ name: "GITHUB_TOKEN", value: secret, description: "Push access" })
      .expect(201);
    expect(created.body).toMatchObject({ name: "GITHUB_TOKEN", hint: "WXYZ" });
    expect(JSON.stringify(created.body)).not.toContain(secret);

    const list = await asAlice(http.get("/v1/credentials")).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(secret);
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(["GITHUB_TOKEN"]);

    const db = createDb(process.env.DATABASE_URL!, { max: 1 });
    const [row] = await db.select().from(credentials).where(eq(credentials.id, created.body.id));
    await db.$client.end();
    expect(row!.ciphertext).toMatch(/^v1:/);
    expect(row!.ciphertext).not.toContain(secret);
  });

  it("replaces the value and description but keeps the name", async () => {
    const { body } = await asAlice(http.post("/v1/credentials"))
      .send({ name: "NPM_TOKEN", value: "short" })
      .expect(201);
    expect(body.hint).toBe("");
    const updated = await asAlice(http.patch(`/v1/credentials/${body.id}`))
      .send({ value: "npm_abcdefghijklmnop1234", description: "Publish", name: "RENAMED" })
      .expect(200);
    expect(updated.body).toMatchObject({ name: "NPM_TOKEN", hint: "1234", description: "Publish" });
  });

  it("validates names and keeps them unique per user", async () => {
    const bad = await asAlice(http.post("/v1/credentials"))
      .send({ name: "github-token", value: "x" })
      .expect(400);
    expect(bad.body.errors[0].path).toEqual(["name"]);
    await asAlice(http.post("/v1/credentials"))
      .send({ name: "GITHUB_TOKEN", value: "again" })
      .expect(409);
    await asBob(http.post("/v1/credentials"))
      .send({ name: "GITHUB_TOKEN", value: "bobs" })
      .expect(201);
  });

  it("hides one user's credentials from another", async () => {
    const { body } = await asAlice(http.post("/v1/credentials"))
      .send({ name: "PRIVATE_KEY", value: "x" })
      .expect(201);
    const bobs = (await asBob(http.get("/v1/credentials")).expect(200)).body;
    expect(bobs.map((c: { id: string }) => c.id)).not.toContain(body.id);
    await asBob(http.patch(`/v1/credentials/${body.id}`))
      .send({ value: "y" })
      .expect(404);
    await asBob(http.delete(`/v1/credentials/${body.id}`)).expect(404);
    await asAlice(http.delete(`/v1/credentials/${body.id}`)).expect(204);
  });
});
