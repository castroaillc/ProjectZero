import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createOrg, createTestApp, setActiveOrg, signUp, testUsers } from "./helpers";

const users = testUsers("orgs");
let app: INestApplication;
let http: ReturnType<typeof request>;
const as = (token: string) => (r: request.Test) => r.set("authorization", `Bearer ${token}`);

const agent = (name: string) => ({
  name,
  identity: "autonomous",
  model: { provider: "ollama", model: "gpt-oss:20b" },
  sandbox: { image: "node:24-bookworm" },
});

beforeAll(async () => {
  app = await createTestApp();
  http = request(app.getHttpServer());
});

afterAll(async () => {
  await users.cleanup();
  await app?.close();
});

describe("organizations", () => {
  it("gives every new user a personal workspace and makes it active", async () => {
    const dana = await signUp(app, users.email("dana"));
    const session = await as(dana.token)(http.get("/api/auth/get-session")).expect(200);
    const orgs = await as(dana.token)(http.get("/api/auth/organization/list")).expect(200);
    expect(orgs.body).toHaveLength(1);
    expect(orgs.body[0]).toMatchObject({ name: expect.stringMatching(/'s workspace$/) });
    expect(session.body.session.activeOrganizationId).toBe(orgs.body[0].id);
    // Usable straight away, no setup needed.
    await as(dana.token)(http.post("/v1/coding-agents")).send(agent("solo")).expect(201);
  });

  it("shares agents with members and scopes them to the active organization", async () => {
    const erin = await signUp(app, users.email("erin"));
    const frank = await signUp(app, users.email("frank"));
    const team = await createOrg(app, erin.token, "Acme");
    await addMember(team.id, frank.token, "member");

    const { body: created } = await as(erin.token)(http.post("/v1/coding-agents"))
      .send(agent("shared-bot"))
      .expect(201);

    // Frank sees nothing until he switches to the team.
    const before = await as(frank.token)(http.get("/v1/coding-agents")).expect(200);
    expect(before.body.map((a: { id: string }) => a.id)).not.toContain(created.id);
    await setActiveOrg(app, frank.token, team.id);
    const after = await as(frank.token)(http.get("/v1/coding-agents")).expect(200);
    expect(after.body.map((a: { id: string }) => a.id)).toContain(created.id);
    await as(frank.token)(http.patch(`/v1/coding-agents/${created.id}`))
      .send({ description: "Edited by a member" })
      .expect(200);

    // Names are unique per organization, not globally.
    await as(frank.token)(http.post("/v1/coding-agents")).send(agent("shared-bot")).expect(409);
  });

  it("refuses an organization the caller doesn't belong to", async () => {
    const gina = await signUp(app, users.email("gina"));
    const hank = await signUp(app, users.email("hank"));
    const theirs = await createOrg(app, gina.token, "Private");
    await as(hank.token)(http.post("/api/auth/organization/set-active"))
      .send({ organizationId: theirs.id })
      .expect(403);
  });
});
