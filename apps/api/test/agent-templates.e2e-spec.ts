import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, signUp, testUsers } from "./helpers";

const users = testUsers("agent-templates");
let app: INestApplication;
let http: ReturnType<typeof request>;
let alice: Awaited<ReturnType<typeof signUp>>;
const asAlice = (r: request.Test) => r.set("authorization", `Bearer ${alice.token}`);

beforeAll(async () => {
  app = await createTestApp();
  http = request(app.getHttpServer());
  alice = await signUp(app, users.email("alice"));
});

afterAll(async () => {
  await users.cleanup();
  await app?.close();
});

describe("agent templates", () => {
  it("requires a session", async () => {
    await http.get("/v1/agent-templates").expect(401);
  });

  it("lists the project manager template with defaults filled in", async () => {
    const { body } = await asAlice(http.get("/v1/agent-templates")).expect(200);
    const pm = body.find((t: { id: string }) => t.id === "project-manager");
    expect(pm).toMatchObject({
      name: "Project manager",
      recommendedIdentity: "autonomous",
      credentials: [{ name: "GITHUB_TOKEN" }],
      config: {
        persona: { avatar: "📋" },
        sandbox: { workdir: "/workspace", setupCommands: [] },
        mcpServers: [
          {
            name: "github",
            transport: "http",
            approval: "ask",
            autoApprove: expect.arrayContaining(["projects_list", "issue_read"]),
          },
        ],
      },
    });
    expect(pm.config).not.toHaveProperty("identity");
    expect(pm.config.skills.map((s: { name: string }) => s.name)).toEqual(
      expect.arrayContaining(["sprint-planning", "standup-report", "release-notes"]),
    );
    await asAlice(http.get("/v1/agent-templates/project-manager")).expect(200);
    await asAlice(http.get("/v1/agent-templates/nope")).expect(404);
  });

  it("creates an agent from a template and records where it came from", async () => {
    const { body: pm } = await asAlice(http.get("/v1/agent-templates/project-manager"));
    const { body } = await asAlice(http.post("/v1/coding-agents"))
      .send({ ...pm.config, identity: "assistant", templateId: pm.id })
      .expect(201);
    expect(body).toMatchObject({
      templateId: "project-manager",
      identity: "assistant",
      requiredCredentials: ["GITHUB_TOKEN"],
      systemPrompt: pm.config.systemPrompt,
    });

    const scratch = await asAlice(http.post("/v1/coding-agents"))
      .send({ ...pm.config, name: "from-scratch", identity: "assistant" })
      .expect(201);
    expect(scratch.body).not.toHaveProperty("templateId");

    await asAlice(http.post("/v1/coding-agents"))
      .send({ ...pm.config, name: "bogus", identity: "assistant", templateId: "nope" })
      .expect(400);
  });
});
