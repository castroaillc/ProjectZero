import { createSign } from "node:crypto";

/** Server-side settings for the ProjectZero GitHub App. */
export interface GitHubAppConfig {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret?: string;
  /** https://github.com, or a GitHub Enterprise Server URL. */
  webUrl: string;
  apiUrl: string;
}

/** The parts of GitHub's installation object the harness uses. */
export interface GitHubInstallationPayload {
  id: number;
  account: { login: string; id: number; type: "Organization" | "User" };
  repository_selection: "all" | "selected";
  permissions: Record<string, string>;
  suspended_at: string | null;
}

export interface InstallationToken {
  token: string;
  expiresAt: Date;
}

interface RepoPayload {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  clone_url: string;
}

const base64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

/** Thrown for non-2xx GitHub responses, with GitHub's message when it sent one. */
export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

/** Minimal GitHub REST client for the app's own calls. `fetch` is injectable for tests. */
export class GitHubApi {
  constructor(
    private readonly config: GitHubAppConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** A JWT signed with the app's private key, valid for 9 minutes (GitHub allows 10). */
  appJwt(now = Date.now()): string {
    const iat = Math.floor(now / 1000) - 60; // allow for clock drift
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(JSON.stringify({ iat, exp: iat + 600, iss: this.config.clientId }));
    const signature = createSign("RSA-SHA256")
      .update(`${header}.${payload}`)
      .sign(this.config.privateKey);
    return `${header}.${payload}.${base64url(signature)}`;
  }

  getInstallation(id: number): Promise<GitHubInstallationPayload> {
    return this.request(`/app/installations/${id}`, { auth: `Bearer ${this.appJwt()}` });
  }

  /** A token scoped to the installation, optionally narrowed to some repositories. */
  async createInstallationToken(
    id: number,
    options: { repositories?: string[] } = {},
  ): Promise<InstallationToken> {
    const body = options.repositories ? { repositories: options.repositories } : undefined;
    const res = await this.request<{ token: string; expires_at: string }>(
      `/app/installations/${id}/access_tokens`,
      { method: "POST", auth: `Bearer ${this.appJwt()}`, body },
    );
    return { token: res.token, expiresAt: new Date(res.expires_at) };
  }

  /** Repositories an installation token can reach (first 1,000). */
  async listInstallationRepositories(token: string): Promise<RepoPayload[]> {
    const repos: RepoPayload[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await this.request<{ repositories: RepoPayload[]; total_count: number }>(
        `/installation/repositories?per_page=100&page=${page}`,
        { auth: `token ${token}` },
      );
      repos.push(...res.repositories);
      if (repos.length >= res.total_count || res.repositories.length === 0) break;
    }
    return repos;
  }

  /** Exchanges the OAuth code GitHub sends after installation for a user access token. */
  async exchangeCode(code: string): Promise<string> {
    const res = await this.fetchImpl(`${this.config.webUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      error_description?: string;
    };
    if (!res.ok || !body.access_token)
      throw new GitHubApiError(res.status, body.error_description ?? "GitHub rejected the code");
    return body.access_token;
  }

  /** IDs of the app's installations the user can access (first 1,000). */
  async userInstallationIds(userToken: string): Promise<number[]> {
    const ids: number[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await this.request<{ installations: { id: number }[]; total_count: number }>(
        `/user/installations?per_page=100&page=${page}`,
        { auth: `Bearer ${userToken}` },
      );
      ids.push(...res.installations.map((i) => i.id));
      if (ids.length >= res.total_count || res.installations.length === 0) break;
    }
    return ids;
  }

  /** The app's bot user, whose ID GitHub uses in the bot's noreply email. */
  getBotUser(): Promise<{ id: number; login: string }> {
    return this.request(`/users/${encodeURIComponent(`${this.config.slug}[bot]`)}`, {});
  }

  private async request<T>(
    path: string,
    { method = "GET", auth, body }: { method?: string; auth?: string; body?: unknown },
  ): Promise<T> {
    const res = await this.fetchImpl(`${this.config.apiUrl}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": `${this.config.slug}-harness`,
        ...(auth && { authorization: auth }),
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => undefined)) as { message?: string } | undefined;
    if (!res.ok)
      throw new GitHubApiError(res.status, json?.message ?? `GitHub returned ${res.status}`);
    return json as T;
  }
}
