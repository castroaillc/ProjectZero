import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AllowAnonymous, OptionalAuth, type UserSession } from "@thallesp/nestjs-better-auth";
import type { Request, Response } from "express";
import { ZodResponse } from "nestjs-zod";
import { ActiveOrg, type OrgContext } from "../orgs/active-org";
import {
  GitHubAppInfoDto,
  GitHubInstallationDto,
  GitHubRepositoryDto,
  StartGitHubInstallDto,
} from "./github.dto";
import { GitHubService, type WebhookPayload } from "./github.service";

/** Where the browser lands after installing; the web app shows the result from the query. */
const AFTER_INSTALL = "/agents";

@ApiTags("github")
@ApiBearerAuth()
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "No valid session." })
@ApiForbiddenResponse({ description: "No active organization, or not allowed." })
@Controller("github")
export class GitHubController {
  constructor(private readonly github: GitHubService) {}

  @ApiOperation({
    operationId: "getGitHubApp",
    summary: "Whether the GitHub App is configured, and its bot's git identity.",
  })
  @Get("app")
  @ZodResponse({ status: 200, type: GitHubAppInfoDto })
  app() {
    return this.github.appInfo();
  }

  @ApiOperation({
    operationId: "listGitHubInstallations",
    summary: "GitHub App installations connected to the active organization.",
  })
  @Get("installations")
  @ZodResponse({ status: 200, type: [GitHubInstallationDto] })
  list(@ActiveOrg() org: OrgContext) {
    return this.github.list(org);
  }

  @ApiOperation({
    operationId: "startGitHubInstall",
    summary: "Get the GitHub URL that installs the app for the active organization (admins).",
  })
  @Post("installations")
  @ZodResponse({ status: 201, type: StartGitHubInstallDto })
  start(@ActiveOrg() org: OrgContext) {
    return this.github.startInstall(org);
  }

  @ApiOperation({
    operationId: "listGitHubRepositories",
    summary: "Repositories an installation can reach.",
  })
  @Get("installations/:id/repositories")
  @ZodResponse({ status: 200, type: [GitHubRepositoryDto] })
  @ApiNotFoundResponse()
  repositories(@ActiveOrg() org: OrgContext, @Param("id", ParseIntPipe) id: number) {
    return this.github.repositories(org, id);
  }

  @ApiOperation({
    operationId: "disconnectGitHubInstallation",
    summary: "Disconnect an installation from the organization (admins). The app stays on GitHub.",
  })
  @Delete("installations/:id")
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  disconnect(@ActiveOrg() org: OrgContext, @Param("id", ParseIntPipe) id: number) {
    return this.github.disconnect(org, id);
  }

  /**
   * GitHub sends the browser here after installation (the app's callback URL, reached through
   * the web app's /v1 proxy so the session cookie comes along). Redirects back into the app.
   */
  @ApiExcludeEndpoint()
  @OptionalAuth()
  @Get("installations/callback")
  async callback(
    @Req() req: Request & { session?: UserSession | null },
    @Res() res: Response,
    @Query("installation_id") installationId?: string,
    @Query("code") code?: string,
    @Query("state") state?: string,
  ) {
    if (!req.session) return res.redirect(302, "/sign-in");
    try {
      await this.github.completeInstall(req.session.user.id, {
        installationId: installationId ? Number(installationId) : undefined,
        code,
        state,
      });
      res.redirect(302, `${AFTER_INSTALL}?github=connected`);
    } catch (err) {
      const message = err instanceof HttpException ? err.message : "Connecting GitHub failed.";
      res.redirect(302, `${AFTER_INSTALL}?github=error&message=${encodeURIComponent(message)}`);
    }
  }
}

/** GitHub's webhook deliveries, verified by signature instead of a session. */
@ApiTags("github-webhooks")
@Controller("github/webhooks")
export class GitHubWebhooksController {
  constructor(private readonly github: GitHubService) {}

  @ApiOperation({
    operationId: "receiveGitHubWebhook",
    summary: "GitHub App webhook endpoint (signed with X-Hub-Signature-256).",
  })
  @AllowAnonymous()
  @Post()
  @HttpCode(202)
  @ApiAcceptedResponse({ description: "Delivery accepted." })
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("x-hub-signature-256") signature?: string,
    @Headers("x-github-event") event?: string,
  ) {
    this.github.verifyWebhook(req.rawBody, signature);
    await this.github.handleWebhook(event ?? "", req.body as WebhookPayload);
    return { ok: true };
  }
}
