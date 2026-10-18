import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { createDb, credentials } from "@projectzero/db";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CredentialsService } from "../src/credentials/credentials.service";
import { addMember, createOrg, createTestApp, setActiveOrg, signUp, testUsers } from "./helpers";

const users = testUsers("credentials");
let app: INestApplication;
let http: ReturnType<typeof request>;
let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;
let carol: Awaited<ReturnType<typeof signUp>>;
let team: { id: string };
const as = (who: { token: string }) => (r: request.Test) =>
  r.set("authorization", `Bearer ${who.token}`);

const secret = "ghp_0123456789abcdefWXYZ";

// Alice owns "Team"; Bob is a plain member of it; Carol only has her personal workspace.
beforeAll(async () => {
  app = await createTestApp();
  http = request(app.getHttpServer());
  alice = await signUp(app, users.email("alice"));
  bob = await signUp(app, users.email("bob"));
  carol = await signUp(app, users.email("carol"));
  team = await createOrg(app, alice.token, "Team");
  await addMember(team.id, bob.token, "member");
  await setActiveOrg(app, bob.token, team.id);
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
    const created = await as(alice)(http.post("/v1/credentials"))
      .send({ scope: "shared", name: "GITHUB_TOKEN", value: secret, description: "Push access" })
      .expect(201);
    expect(created.body).toMatchObject({ scope: "shared", name: "GITHUB_TOKEN", hint: "WXYZ" });
    expect(JSON.stringify(created.body)).not.toContain(secret);

    const list = await as(alice)(http.get("/v1/credentials")).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(secret);

    const db = createDb(process.env.DATABASE_URL!, { max: 1 });
    const [row] = await db.select().from(credentials).where(eq(credentials.id, created.body.id));
    await db.$client.end();
    expect(row!.ciphertext).toMatch(/^v1:/);
    expect(row!.ciphertext).not.toContain(secret);
  });

  it("shares org credentials with members, but only admins manage them", async () => {
    const bobs = await as(bob)(http.get("/v1/credentials")).expect(200);
    const shared = bobs.body.find((c: { name: string }) => c.name === "GITHUB_TOKEN");
    expect(shared).toMatchObject({ scope: "shared" });

    await as(bob)(http.post("/v1/credentials"))
      .send({ scope: "shared", name: "NPM_TOKEN", value: "x" })
      .expect(403);
    await as(bob)(http.patch(`/v1/credentials/${shared.id}`))
      .send({ value: "y" })
      .expect(403);
    await as(bob)(http.delete(`/v1/credentials/${shared.id}`)).expect(403);
  });

  it("keeps personal credentials private to their owner", async () => {
    const mine = await as(bob)(http.post("/v1/credentials"))
      .send({ scope: "personal", name: "GITHUB_TOKEN", value: "bobs-own-token-123456" })
      .expect(201);
    expect(mine.body.scope).toBe("personal");

    const alices = (await as(alice)(http.get("/v1/credentials")).expect(200)).body;
    expect(alices.map((c: { id: string }) => c.id)).not.toContain(mine.body.id);
    await as(alice)(http.patch(`/v1/credentials/${mine.body.id}`))
      .send({ value: "z" })
      .expect(404);

    await as(bob)(http.patch(`/v1/credentials/${mine.body.id}`))
      .send({ description: "Mine" })
      .expect(200);
  });

  it("resolves shared credentials for autonomous runs and personal ones per member", async () => {
    const service = app.get(CredentialsService);
    const session = await request(app.getHttpServer())
      .get("/api/auth/get-session")
      .set("authorization", `Bearer ${bob.token}`);
    const bobId = session.body.user.id as string;
    expect(await service.resolve(team.id, { shared: true }, ["GITHUB_TOKEN", "MISSING"])).toEqual({
      GITHUB_TOKEN: secret,
    });
    expect(await service.resolve(team.id, { userId: bobId }, ["GITHUB_TOKEN"])).toEqual({
      GITHUB_TOKEN: "bobs-own-token-123456",
    });
  });

  it("replaces the value and description but keeps the name", async () => {
    const { body } = await as(alice)(http.post("/v1/credentials"))
      .send({ scope: "personal", name: "NPM_TOKEN", value: "short" })
      .expect(201);
    expect(body.hint).toBe("");
    const updated = await as(alice)(http.patch(`/v1/credentials/${body.id}`))
      .send({ value: "npm_abcdefghijklmnop1234", description: "Publish", name: "RENAMED" })
      .expect(200);
    expect(updated.body).toMatchObject({ name: "NPM_TOKEN", hint: "1234", description: "Publish" });
  });

  it("validates names, reserves harness names and keeps names unique per scope", async () => {
    const bad = await as(alice)(http.post("/v1/credentials"))
      .send({ scope: "shared", name: "github-token", value: "x" })
      .expect(400);
    expect(bad.body.errors[0].path).toEqual(["name"]);
    const reserved = await as(alice)(http.post("/v1/credentials"))
      .send({ scope: "shared", name: "GITHUB_APP_TOKEN", value: "x" })
      .expect(400);
    expect(reserved.body.errors[0].message).toMatch(/provided by the harness/);
    await as(alice)(http.post("/v1/credentials"))
      .send({ scope: "shared", name: "GITHUB_TOKEN", value: "again" })
      .expect(409);
    // The same name can exist once shared and once per member.
    await as(alice)(http.post("/v1/credentials"))
      .send({ scope: "personal", name: "GITHUB_TOKEN", value: "alices" })
      .expect(201);
  });

  it("hides one organization's credentials from another", async () => {
    const carols = (await as(carol)(http.get("/v1/credentials")).expect(200)).body;
    expect(carols).toEqual([]);
    const { body } = await as(alice)(http.post("/v1/credentials"))
      .send({ scope: "shared", name: "PRIVATE_KEY", value: "x" })
      .expect(201);
    await as(carol)(http.patch(`/v1/credentials/${body.id}`))
      .send({ value: "y" })
      .expect(404);
    await as(carol)(http.delete(`/v1/credentials/${body.id}`)).expect(404);
    await as(alice)(http.delete(`/v1/credentials/${body.id}`)).expect(204);
  });
});
