import { Module } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import type { GitHubAppConfig } from "./github-api";
import { GitHubController, GitHubWebhooksController } from "./github.controller";
import {
  GITHUB_APP_CONFIG,
  GITHUB_FETCH,
  GitHubService,
  INSTALL_STATE_SIGNER,
} from "./github.service";
import { InstallStateSigner } from "./install-state";

/** The app's settings, or null when any required one is missing (GitHub features then 503). */
export function githubAppConfig(env: Env): GitHubAppConfig | null {
  const {
    GITHUB_APP_ID: appId,
    GITHUB_APP_SLUG: slug,
    GITHUB_APP_CLIENT_ID: clientId,
    GITHUB_APP_CLIENT_SECRET: clientSecret,
    GITHUB_APP_PRIVATE_KEY: privateKey,
  } = env;
  if (!appId || !slug || !clientId || !clientSecret || !privateKey) return null;
  return {
    appId,
    slug,
    clientId,
    clientSecret,
    privateKey,
    webhookSecret: env.GITHUB_APP_WEBHOOK_SECRET,
    webUrl: env.GITHUB_URL.replace(/\/+$/, ""),
    apiUrl: env.GITHUB_API_URL.replace(/\/+$/, ""),
  };
}

@Module({
  controllers: [GitHubController, GitHubWebhooksController],
  providers: [
    { provide: GITHUB_APP_CONFIG, inject: [ENV], useFactory: githubAppConfig },
    // Tests swap this for a fake GitHub.
    { provide: GITHUB_FETCH, useValue: (...args: Parameters<typeof fetch>) => fetch(...args) },
    {
      provide: INSTALL_STATE_SIGNER,
      inject: [ENV],
      useFactory: (env: Env) => new InstallStateSigner(env.BETTER_AUTH_SECRET),
    },
    GitHubService,
  ],
  exports: [GitHubService],
})
export class GitHubModule {}
