import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { githubInstallations, member, type Db, type GithubInstallationRow } from "@projectzero/db";
import type { GitHubAppInfo, GitHubInstallation, GitHubRepository } from "@projectzero/shared";
import { and, eq, isNull } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DB } from "../db/db.module";
import { isAdminRole, requireAdmin, type OrgContext } from "../orgs/active-org";
import {
  GitHubApi,
  type GitHubAppConfig,
  type GitHubInstallationPayload,
  type InstallationToken,
} from "./github-api";
import { InstallStateSigner } from "./install-state";

export const GITHUB_APP_CONFIG = Symbol("GITHUB_APP_CONFIG");
export const GITHUB_FETCH = Symbol("GITHUB_FETCH");
export const INSTALL_STATE_SIGNER = Symbol("INSTALL_STATE_SIGNER");

/** Refresh cached installation tokens when they have less than this left (they last an hour). */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface InstallCallback {
  code?: string;
  installationId?: number;
  state?: string;
}

/**
 * The ProjectZero GitHub App: linking installations to organizations, minting the short-lived
 * installation tokens agents use to clone and push, and keeping installations in sync from
 * webhooks.
 */
@Injectable()
export class GitHubService {
  private readonly api: GitHubApi | null;
  private readonly tokens = new Map<number, InstallationToken>();
  private bot: GitHubAppInfo["bot"] | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(GITHUB_APP_CONFIG) private readonly config: GitHubAppConfig | null,
    @Inject(GITHUB_FETCH) fetchImpl: typeof fetch,
    @Inject(INSTALL_STATE_SIGNER) private readonly states: InstallStateSigner,
  ) {
    this.api = config ? new GitHubApi(config, fetchImpl) : null;
  }

  async appInfo(): Promise<GitHubAppInfo> {
    if (!this.config || !this.api) return { configured: false };
    return {
      configured: true,
      slug: this.config.slug,
      htmlUrl: `${this.config.webUrl}/apps/${this.config.slug}`,
      ...(await this.botIdentity().then((bot) => (bot ? { bot } : {}))),
    };
  }

  /** The URL that starts installing the app for the caller's organization (admins only). */
  startInstall(org: OrgContext): { url: string } {
    requireAdmin(org, "connect GitHub");
    const config = this.requireConfig();
    const state = this.states.sign({ organizationId: org.organizationId, userId: org.userId });
    return {
      url: `${config.webUrl}/apps/${config.slug}/installations/new?state=${encodeURIComponent(state)}`,
    };
  }

  /**
   * Finishes an install. GitHub redirects here with the installation ID, our signed state and an
   * OAuth code (the app requests user authorization on install). The installation ID alone could
   * be guessed, so it's only linked if the code's user can actually access that installation.
   * Returns the organization it was linked to.
   */
  async completeInstall(userId: string, callback: InstallCallback): Promise<string> {
    const api = this.requireApi();
    const state = callback.state ? this.states.verify(callback.state) : null;
    if (!state || state.userId !== userId)
      throw new BadRequestException(
        "This GitHub link expired or wasn't started by you. Try again.",
      );
    if (!callback.installationId)
      throw new BadRequestException("GitHub didn't say which installation.");
    if (!callback.code)
      throw new BadRequestException(
        'GitHub didn\'t send an authorization code. Enable "Request user authorization (OAuth) during installation" on the app.',
      );

    const [membership] = await this.db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, state.organizationId), eq(member.userId, userId)));
    if (!membership || !isAdminRole(membership.role))
      throw new ForbiddenException("Only organization owners and admins can connect GitHub.");

    const userToken = await api.exchangeCode(callback.code);
    const accessible = await api.userInstallationIds(userToken);
    if (!accessible.includes(callback.installationId))
      throw new ForbiddenException("Your GitHub account can't access that installation.");

    const installation = await api.getInstallation(callback.installationId);
    const [existing] = await this.db
      .select({ organizationId: githubInstallations.organizationId })
      .from(githubInstallations)
      .where(eq(githubInstallations.id, installation.id));
    if (existing && existing.organizationId !== state.organizationId)
      throw new ConflictException(
        `The app on ${installation.account.login} is already connected to another workspace.`,
      );

    const values = {
      ...fromPayload(installation),
      organizationId: state.organizationId,
      installedBy: userId,
    };
    await this.db
      .insert(githubInstallations)
      .values(values)
      .onConflictDoUpdate({ target: githubInstallations.id, set: values });
    this.tokens.delete(installation.id);
    return state.organizationId;
  }

  async list(org: OrgContext): Promise<GitHubInstallation[]> {
    const rows = await this.db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.organizationId, org.organizationId));
    return rows.map((row) => this.toInstallation(row));
  }

  async repositories(org: OrgContext, installationId: number): Promise<GitHubRepository[]> {
    const row = await this.owned(org, installationId);
    const { token } = await this.installationToken(row.id);
    const repos = await this.requireApi().listInstallationRepositories(token);
    return repos.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      private: r.private,
      defaultBranch: r.default_branch,
      cloneUrl: r.clone_url,
    }));
  }

  /** Unlinks an installation from the organization. The app stays installed on GitHub. */
  async disconnect(org: OrgContext, installationId: number): Promise<void> {
    requireAdmin(org, "disconnect GitHub");
    const row = await this.owned(org, installationId);
    await this.db.delete(githubInstallations).where(eq(githubInstallations.id, row.id));
    this.tokens.delete(row.id);
  }

  /**
   * An installation token for an agent run in this organization: the installation on `owner`
   * (the GitHub org or user that owns the repository), or the only one if `owner` is omitted.
   * Narrowed to `repositories` when given; otherwise cached until close to expiry.
   */
  async tokenForOrganization(
    organizationId: string,
    options: { owner?: string; repositories?: string[] } = {},
  ): Promise<InstallationToken> {
    const rows = await this.db
      .select()
      .from(githubInstallations)
      .where(
        and(
          eq(githubInstallations.organizationId, organizationId),
          isNull(githubInstallations.suspendedAt),
        ),
      );
    const candidates = options.owner
      ? rows.filter((r) => r.accountLogin.toLowerCase() === options.owner!.toLowerCase())
      : rows;
    if (candidates.length !== 1)
      throw new NotFoundException(
        candidates.length === 0
          ? `The GitHub App isn't installed${options.owner ? ` on ${options.owner}` : ""} for this workspace.`
          : "Several GitHub installations match; say which repository owner to use.",
      );
    return this.installationToken(candidates[0]!.id, options);
  }

  /** Verifies a webhook delivery's `X-Hub-Signature-256` against the raw body. */
  verifyWebhook(rawBody: Buffer | undefined, signature: string | undefined): void {
    const secret = this.config?.webhookSecret;
    if (!secret) throw new ServiceUnavailableException("GitHub webhooks aren't configured.");
    if (!rawBody || !signature) throw new ForbiddenException("Missing webhook signature.");
    const expected = Buffer.from(
      `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
    );
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given))
      throw new ForbiddenException("Invalid webhook signature.");
  }

  /** Applies installation lifecycle events. Installations not linked to a workspace are ignored. */
  async handleWebhook(event: string, payload: WebhookPayload): Promise<void> {
    const installation = payload.installation;
    if (!installation?.id) return;
    const where = eq(githubInstallations.id, installation.id);

    if (event === "installation") {
      switch (payload.action) {
        case "deleted":
          await this.db.delete(githubInstallations).where(where);
          break;
        case "suspend":
          await this.db.update(githubInstallations).set({ suspendedAt: new Date() }).where(where);
          break;
        case "unsuspend":
          await this.db.update(githubInstallations).set({ suspendedAt: null }).where(where);
          break;
        case "new_permissions_accepted":
          await this.db
            .update(githubInstallations)
            .set({ permissions: installation.permissions ?? {} })
            .where(where);
          break;
        default:
          return;
      }
      this.tokens.delete(installation.id);
    } else if (event === "installation_repositories" && installation.repository_selection) {
      await this.db
        .update(githubInstallations)
        .set({ repositorySelection: installation.repository_selection })
        .where(where);
    }
  }

  private async installationToken(
    id: number,
    options: { repositories?: string[] } = {},
  ): Promise<InstallationToken> {
    const api = this.requireApi();
    if (options.repositories) return api.createInstallationToken(id, options);
    const cached = this.tokens.get(id);
    if (cached && cached.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_MARGIN_MS) return cached;
    const fresh = await api.createInstallationToken(id);
    this.tokens.set(id, fresh);
    return fresh;
  }

  private async owned(org: OrgContext, installationId: number): Promise<GithubInstallationRow> {
    const [row] = await this.db
      .select()
      .from(githubInstallations)
      .where(
        and(
          eq(githubInstallations.id, installationId),
          eq(githubInstallations.organizationId, org.organizationId),
        ),
      );
    if (!row) throw new NotFoundException(`GitHub installation ${installationId} not found`);
    return row;
  }

  private async botIdentity(): Promise<GitHubAppInfo["bot"] | null> {
    if (this.bot) return this.bot;
    try {
      const user = await this.requireApi().getBotUser();
      this.bot = { name: user.login, email: `${user.id}+${user.login}@users.noreply.github.com` };
      return this.bot;
    } catch {
      return null; // The bot account only shows up on GitHub once the app exists; try later.
    }
  }

  private toInstallation(row: GithubInstallationRow): GitHubInstallation {
    const web = this.config?.webUrl ?? "https://github.com";
    return {
      id: row.id,
      accountLogin: row.accountLogin,
      accountType: row.accountType,
      repositorySelection: row.repositorySelection,
      permissions: row.permissions,
      suspended: row.suspendedAt !== null,
      manageUrl:
        row.accountType === "Organization"
          ? `${web}/organizations/${row.accountLogin}/settings/installations/${row.id}`
          : `${web}/settings/installations/${row.id}`,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private requireConfig(): GitHubAppConfig {
    if (!this.config)
      throw new ServiceUnavailableException(
        "The GitHub App isn't configured on this server. Run `pnpm github:app`.",
      );
    return this.config;
  }

  private requireApi(): GitHubApi {
    this.requireConfig();
    return this.api!;
  }
}

/** The fields of installation webhook payloads the harness reads. */
export interface WebhookPayload {
  action?: string;
  installation?: Partial<GitHubInstallationPayload> & { id?: number };
}

function fromPayload(installation: GitHubInstallationPayload) {
  return {
    id: installation.id,
    accountLogin: installation.account.login,
    accountType: installation.account.type,
    accountId: installation.account.id,
    repositorySelection: installation.repository_selection,
    permissions: installation.permissions,
    suspendedAt: installation.suspended_at ? new Date(installation.suspended_at) : null,
  };
}
