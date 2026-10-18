import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "../src/openapi/document";
import { createTestApp, signUp, testUsers } from "./helpers";

const users = testUsers("coding-agents");
let app: INestApplication;
let http: ReturnType<typeof request>;
let alice: Awaited<ReturnType<typeof signUp>>;
let bob: Awaited<ReturnType<typeof signUp>>;
const asAlice = (r: request.Test) => r.set("authorization", `Bearer ${alice.token}`);
const asBob = (r: request.Test) => r.set("authorization", `Bearer ${bob.token}`);

const minimal = {
  name: "reviewer",
  model: { provider: "ollama", model: "gpt-oss:20b" },
  sandbox: { image: "node:24-bookworm" },
};

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

describe("coding agents", () => {
  it("rejects requests without a session", async () => {
    await http.get("/v1/coding-agents").expect(401);
  });

  it("fills in defaults for a minimal config", async () => {
    const { body } = await asAlice(http.post("/v1/coding-agents")).send(minimal).expect(201);
    expect(body).toMatchObject({
      name: "reviewer",
      description: "",
      systemPrompt: "",
      identity: {
        avatar: "🤖",
        role: "",
        git: { name: "ProjectZero Agent", email: "agent@projectzero.local" },
      },
      sandbox: { workdir: "/workspace", network: "bridge", cpus: 2, memoryMb: 4096, env: {} },
      mcpServers: [],
      skills: [],
    });
    expect(body.tools.map((t: { name: string }) => t.name)).toEqual([
      "bash",
      "read_file",
      "write_file",
      "edit_file",
      "list_files",
      "grep",
    ]);
    expect(body).not.toHaveProperty("userId");
    await asAlice(http.delete(`/v1/coding-agents/${body.id}`)).expect(204);
  });

  it("stores the full config and replaces only the fields sent on update", async () => {
    const full = {
      name: "full-stack",
      description: "Works on the ProjectZero repo.",
      systemPrompt: "Run the tests before you finish.",
      identity: {
        avatar: "🛠️",
        role: "Senior TypeScript engineer",
        git: { name: "Repo Bot", email: "repo-bot@example.com", tokenEnv: "GITHUB_TOKEN" },
      },
      model: {
        provider: "anthropic",
        model: "claude-sonnet-5-5",
        apiKeyEnv: "ANTHROPIC_API_KEY",
        maxTokens: 8000,
      },
      sandbox: {
        image: "node:24-bookworm",
        repo: { url: "https://github.com/castroaillc/ProjectZero.git", ref: "main" },
        setupCommands: ["corepack enable", "pnpm install"],
        network: "none",
        env: { CI: "1" },
      },
      tools: [{ name: "bash", approval: "ask" }, { name: "read_file" }],
      mcpServers: [
        { name: "fs", transport: "stdio", command: "npx", args: ["-y", "@mcp/fs"] },
        {
          name: "linear",
          transport: "http",
          url: "https://mcp.linear.app/mcp",
          headers: { authorization: "Bearer ${LINEAR_TOKEN}" },
          approval: "auto",
        },
      ],
      skills: [{ name: "tdd", description: "Use when fixing bugs.", instructions: "# TDD\n..." }],
    };
    const created = await asAlice(http.post("/v1/coding-agents")).send(full).expect(201);
    const id = created.body.id as string;
    expect(created.body.tools).toEqual([
      { name: "bash", approval: "ask" },
      { name: "read_file", approval: "auto" },
    ]);
    expect(created.body.mcpServers[0]).toMatchObject({ approval: "ask", env: {} });
    expect(created.body.identity).toEqual(full.identity);

    const updated = await asAlice(http.patch(`/v1/coding-agents/${id}`))
      .send({ description: "Changed.", skills: [] })
      .expect(200);
    expect(updated.body).toMatchObject({
      description: "Changed.",
      skills: [],
      systemPrompt: full.systemPrompt,
      identity: full.identity,
      tools: created.body.tools,
      mcpServers: created.body.mcpServers,
    });
    expect(Date.parse(updated.body.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.body.updatedAt),
    );

    const list = await asAlice(http.get("/v1/coding-agents")).expect(200);
    expect(list.body.map((a: { id: string }) => a.id)).toContain(id);
    expect((await asAlice(http.get(`/v1/coding-agents/${id}`)).expect(200)).body).toEqual(
      updated.body,
    );
  });

  it("rejects invalid configs with paths to the bad fields", async () => {
    const res = await asAlice(http.post("/v1/coding-agents"))
      .send({
        ...minimal,
        model: { provider: "openai", model: "gpt-5" },
        identity: { git: { name: "Bot", email: "not-an-email" } },
        sandbox: { image: "not an image", cpus: 99 },
        skills: [
          { name: "Bad Name", description: "x", instructions: "x" },
          { name: "dup", description: "x", instructions: "x" },
          { name: "dup", description: "x", instructions: "x" },
        ],
      })
      .expect(400);
    expect(res.body.errors.map((e: { path: unknown[] }) => e.path)).toEqual(
      expect.arrayContaining([
        ["model", "apiKeyEnv"],
        ["identity", "git", "email"],
        ["sandbox", "image"],
        ["sandbox", "cpus"],
        ["skills", 0, "name"],
        ["skills", 2, "name"],
      ]),
    );
  });

  it("keeps names unique per user", async () => {
    const { body } = await asAlice(http.post("/v1/coding-agents"))
      .send({ ...minimal, name: "taken" })
      .expect(201);
    await asAlice(http.post("/v1/coding-agents"))
      .send({ ...minimal, name: "taken" })
      .expect(409);
    await asBob(http.post("/v1/coding-agents"))
      .send({ ...minimal, name: "taken" })
      .expect(201);

    const other = await asAlice(http.post("/v1/coding-agents"))
      .send({ ...minimal, name: "other" })
      .expect(201);
    await asAlice(http.patch(`/v1/coding-agents/${other.body.id}`))
      .send({ name: "taken" })
      .expect(409);
    await asAlice(http.patch(`/v1/coding-agents/${body.id}`))
      .send({})
      .expect(200);
  });

  it("hides one user's agents from another", async () => {
    const { body } = await asAlice(http.post("/v1/coding-agents"))
      .send({ ...minimal, name: "private" })
      .expect(201);
    const bobs = (await asBob(http.get("/v1/coding-agents")).expect(200)).body;
    expect(bobs.map((a: { id: string }) => a.id)).not.toContain(body.id);
    await asBob(http.get(`/v1/coding-agents/${body.id}`)).expect(404);
    await asBob(http.patch(`/v1/coding-agents/${body.id}`))
      .send({ name: "mine" })
      .expect(404);
    await asBob(http.delete(`/v1/coding-agents/${body.id}`)).expect(404);
  });

  it("is documented in the OpenAPI spec", async () => {
    const doc = await buildOpenApiDocument(app);
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(["/v1/coding-agents", "/v1/coding-agents/{id}"]),
    );
  });
});
