import { z } from "zod";

/** The ProjectZero GitHub App as this deployment is configured. */
export const GitHubAppInfoSchema = z
  .object({
    configured: z.boolean().describe("Whether the server has GitHub App credentials."),
    slug: z.string().optional().describe("App slug, e.g. projectzero."),
    htmlUrl: z.string().optional().describe("The app's page on GitHub."),
    bot: z
      .object({
        name: z.string().describe("Commit author name for the app's bot, e.g. projectzero[bot]."),
        email: z.string().describe("Noreply email GitHub links to the bot account."),
      })
      .optional()
      .describe("Git identity that attributes agents' commits to the app's bot."),
  })
  .describe("GitHub App configuration for this deployment.");

/** An installation of the GitHub App, linked to an organization. */
export const GitHubInstallationSchema = z
  .object({
    id: z.number().describe("GitHub's installation ID."),
    accountLogin: z.string().describe("GitHub org or user the app is installed on."),
    accountType: z.enum(["Organization", "User"]).describe("Kind of GitHub account."),
    repositorySelection: z
      .enum(["all", "selected"])
      .describe("Whether the app can reach all of the account's repositories or selected ones."),
    permissions: z.record(z.string(), z.string()).describe("Permissions granted to the app."),
    suspended: z.boolean().describe("Suspended installations can't mint tokens."),
    manageUrl: z.string().describe("Where to change repositories or uninstall on GitHub."),
    createdAt: z.iso.datetime().describe("When it was connected (ISO 8601)."),
  })
  .describe("A GitHub App installation agents in this organization can use.");

export const GitHubRepositorySchema = z
  .object({
    id: z.number(),
    fullName: z.string().describe("owner/name"),
    private: z.boolean(),
    defaultBranch: z.string(),
    cloneUrl: z.string().describe("HTTPS clone URL, for an agent's sandbox repository."),
  })
  .describe("A repository an installation can reach.");

export const StartGitHubInstallSchema = z
  .object({ url: z.string().describe("Send the user here to install the app on GitHub.") })
  .describe("Where to install the GitHub App.");

export type GitHubAppInfo = z.infer<typeof GitHubAppInfoSchema>;
export type GitHubInstallation = z.infer<typeof GitHubInstallationSchema>;
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;
