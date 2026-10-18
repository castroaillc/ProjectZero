import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GitHubAppConfig } from "../src/github/github-api";
import { GITHUB_APP_CONFIG, GITHUB_FETCH, GitHubService } from "../src/github/github.service";
import { addMember, createOrg, createTestApp, setActiveOrg, signUp, testUsers } from "./helpers";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config: GitHubAppConfig = {
  appId: "123",
  slug: "test-app",
  clientId: "Iv1.test",
  clientSecret: "client-secret",
  privateKey: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
  webhookSecret: "webhook-secret",
  webUrl: "https://github.test",
  apiUrl: "https://api.github.test",
};

/** A tiny fake of the GitHub endpoints the app calls. Installation 42 is on "acme-gh". */
const calls: string[] = [];
function verifyAppJwt(auth: string | null) {
  const [header, payload, signature] = (auth ?? "").replace(/^Bearer /, "").split(".");
  const ok = createVerify("RSA-SHA256")
    .update(`${header}.${payload}`)
    .verify(publicKey, Buffer.from(signature ?? "", "base64url"));
  const claims = JSON.parse(Buffer.from(payload ?? "", "base64url").toString());
  return ok && claims.iss === config.clientId && claims.exp - claims.iat <= 600;
}
const installation = {
  id: 42,
  account: { login: "acme-gh", id: 7, type: "Organization" },
  repository_selection: "selected",
  permissions: { contents: "write", pull_requests: "write", metadata: "read" },
  suspended_at: null,
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fakeGitHub: typeof fetch = async (input, init) => {
  const url = String(input);
  const auth = new Headers(init?.headers).get("authorization");
  const route = `${init?.method ?? "GET"} ${url.replace(/\?.*$/, "")}`;
  calls.push(route);
  switch (route) {
    case "POST https://github.test/login/oauth/access_token": {
      const { code } = JSON.parse(String(init?.body));
      return code === "good-code"
        ? json(200, { access_token: "user-token" })
        : json(200, { error_description: "bad code" });
    }
    case "GET https://api.github.test/user/installations":
      return auth === "Bearer user-token"
        ? json(200, { total_count: 1, installations: [{ id: 42 }] })
        : json(401, { message: "Bad credentials" });
    case "GET https://api.github.test/app/installations/42":
      return verifyAppJwt(auth) ? json(200, installation) : json(401, { message: "Bad JWT" });
    case "POST https://api.github.test/app/installations/42/access_tokens":
      return verifyAppJwt(auth)
        ? json(201, {
            token: `ghs_${calls.length}`,
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
          })
        : json(401, { message: "Bad JWT" });
    case "GET https://api.github.test/installation/repositories":
      return json(200, {
        total_count: 1,
        repositories: [
          {
            id: 1,
            full_name: "acme-gh/web",
            private: true,
            default_branch: "main",
            clone_url: "https://github.test/acme-gh/web.git",
          },
        ],
      });
    case "GET https://api.github.test/users/test-app%5Bbot%5D":
      return json(200, { id: 999, login: "test-app[bot]" });
    default:
      return json(404, { message: `fake GitHub has no ${route}` });
  }
};

const users = testUsers("github");
let app: INestApplication;
let http: ReturnType<typeof request>;
let owner: Awaited<ReturnType<typeof signUp>>;
let memberUser: Awaited<ReturnType<typeof signUp>>;
let team: { id: string };
const as = (token: string) => (r: request.Test) => r.set("authorization", `Bearer ${token}`);
const stateFrom = (url: string) => new URL(url).searchParams.get("state")!;
const sign = (body: string) =>
  `sha256=${createHmac("sha256", config.webhookSecret!).update(body).digest("hex")}`;

beforeAll(async () => {
  app = await createTestApp((b) =>
    b
      .overrideProvider(GITHUB_APP_CONFIG)
      .useValue(config)
      .overrideProvider(GITHUB_FETCH)
      .useValue(fakeGitHub),
  );
  http = request(app.getHttpServer());
  owner = await signUp(app, users.email("owner"));
  memberUser = await signUp(app, users.email("member"));
  team = await createOrg(app, owner.token, "Acme");
  await addMember(team.id, memberUser.token, "member");
  await setActiveOrg(app, memberUser.token, team.id);
});

afterAll(async () => {
  await users.cleanup();
  await app?.close();
});

describe("GitHub App", () => {
  it("describes the app and its bot's git identity", async () => {
    const { body } = await as(owner.token)(http.get("/v1/github/app")).expect(200);
    expect(body).toEqual({
      configured: true,
      slug: "test-app",
      htmlUrl: "https://github.test/apps/test-app",
      bot: { name: "test-app[bot]", email: "999+test-app[bot]@users.noreply.github.com" },
    });
  });

  it("lets only admins start an install", async () => {
    await as(memberUser.token)(http.post("/v1/github/installations")).expect(403);
    const { body } = await as(owner.token)(http.post("/v1/github/installations")).expect(201);
    expect(body.url).toMatch(/^https:\/\/github\.test\/apps\/test-app\/installations\/new\?state=/);
  });

  it("rejects callbacks with a bad state, a bad code or someone else's installation", async () => {
    const { body } = await as(owner.token)(http.post("/v1/github/installations"));
    const state = stateFrom(body.url);
    const cases = [
      { installation_id: 42, code: "good-code", state: `${state}x` },
      { installation_id: 42, code: "bad-code", state },
      { installation_id: 43, code: "good-code", state },
    ];
    for (const query of cases) {
      const res = await as(owner.token)(http.get("/v1/github/installations/callback").query(query));
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^\/agents\?github=error&message=/);
    }
    // A state started by the owner can't be completed by another member.
    const stolen = await as(memberUser.token)(
      http
        .get("/v1/github/installations/callback")
        .query({ installation_id: 42, code: "good-code", state }),
    );
    expect(stolen.headers.location).toMatch(/github=error/);
    expect((await as(owner.token)(http.get("/v1/github/installations"))).body).toEqual([]);
  });

  it("links an installation the admin can access and lists its repositories", async () => {
    const { body } = await as(owner.token)(http.post("/v1/github/installations"));
    const res = await as(owner.token)(
      http.get("/v1/github/installations/callback").query({
        installation_id: 42,
        code: "good-code",
        state: stateFrom(body.url),
        setup_action: "install",
      }),
    ).expect(302);
    expect(res.headers.location).toBe("/agents?github=connected");

    const list = await as(memberUser.token)(http.get("/v1/github/installations")).expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        id: 42,
        accountLogin: "acme-gh",
        accountType: "Organization",
        repositorySelection: "selected",
        suspended: false,
        manageUrl: "https://github.test/organizations/acme-gh/settings/installations/42",
      }),
    ]);
    const repos = await as(memberUser.token)(
      http.get("/v1/github/installations/42/repositories"),
    ).expect(200);
    expect(repos.body).toEqual([
      expect.objectContaining({ fullName: "acme-gh/web", cloneUrl: expect.any(String) }),
    ]);
  });

  it("won't link one installation to two workspaces", async () => {
    const other = await signUp(app, users.email("other"));
    const { body } = await as(other.token)(http.post("/v1/github/installations")).expect(201);
    const res = await as(other.token)(
      http
        .get("/v1/github/installations/callback")
        .query({ installation_id: 42, code: "good-code", state: stateFrom(body.url) }),
    );
    expect(decodeURIComponent(res.headers.location)).toMatch(
      /already connected to another workspace/,
    );
  });

  it("mints installation tokens for the organization's agents and caches them", async () => {
    const github = app.get(GitHubService);
    const before = calls.filter((c) => c.endsWith("/access_tokens")).length;
    const first = await github.tokenForOrganization(team.id, { owner: "ACME-GH" });
    const second = await github.tokenForOrganization(team.id);
    expect(first.token).toMatch(/^ghs_/);
    expect(second).toEqual(first);
    // The repositories call earlier already minted one; nothing new was minted here.
    expect(calls.filter((c) => c.endsWith("/access_tokens")).length).toBe(before);
    await expect(github.tokenForOrganization(team.id, { owner: "elsewhere" })).rejects.toThrow(
      /isn't installed on elsewhere/,
    );
  });

  it("verifies webhook signatures and applies installation events", async () => {
    const deliver = (event: string, payload: object, signature?: string) => {
      const body = JSON.stringify(payload);
      return http
        .post("/v1/github/webhooks")
        .set("content-type", "application/json")
        .set("x-github-event", event)
        .set("x-hub-signature-256", signature ?? sign(body))
        .send(body);
    };
    await deliver(
      "installation",
      { action: "suspend", installation: { id: 42 } },
      "sha256=nope",
    ).expect(403);

    await deliver("installation", { action: "suspend", installation: { id: 42 } }).expect(202);
    const suspended = await as(owner.token)(http.get("/v1/github/installations"));
    expect(suspended.body[0].suspended).toBe(true);
    await expect(app.get(GitHubService).tokenForOrganization(team.id)).rejects.toThrow(
      /isn't installed/,
    );

    await deliver("installation", { action: "unsuspend", installation: { id: 42 } }).expect(202);
    await deliver("installation_repositories", {
      action: "added",
      installation: { id: 42, repository_selection: "all" },
    }).expect(202);
    const back = await as(owner.token)(http.get("/v1/github/installations"));
    expect(back.body[0]).toMatchObject({ suspended: false, repositorySelection: "all" });

    await deliver("installation", { action: "deleted", installation: { id: 42 } }).expect(202);
    expect((await as(owner.token)(http.get("/v1/github/installations"))).body).toEqual([]);
  });

  it("lets only admins disconnect", async () => {
    const { body } = await as(owner.token)(http.post("/v1/github/installations"));
    await as(owner.token)(
      http
        .get("/v1/github/installations/callback")
        .query({ installation_id: 42, code: "good-code", state: stateFrom(body.url) }),
    ).expect(302);
    await as(memberUser.token)(http.delete("/v1/github/installations/42")).expect(403);
    await as(owner.token)(http.delete("/v1/github/installations/42")).expect(204);
    expect((await as(owner.token)(http.get("/v1/github/installations"))).body).toEqual([]);
  });
});

describe("GitHub App when not configured", () => {
  let bare: INestApplication;
  beforeAll(async () => {
    bare = await createTestApp((b) => b.overrideProvider(GITHUB_APP_CONFIG).useValue(null));
  });
  afterAll(() => bare?.close());

  it("says so instead of failing", async () => {
    const someone = await signUp(bare, users.email("bare"));
    const res = await as(someone.token)(request(bare.getHttpServer()).get("/v1/github/app")).expect(
      200,
    );
    expect(res.body).toEqual({ configured: false });
    await as(someone.token)(request(bare.getHttpServer()).post("/v1/github/installations")).expect(
      503,
    );
  });
});
