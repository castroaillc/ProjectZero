import {
  ApiError,
  getListGitHubInstallationsQueryKey,
  useDisconnectGitHubInstallation,
  useGetGitHubApp,
  useListGitHubInstallations,
  useListGitHubRepositories,
  useStartGitHubInstall,
  type GitHubInstallationDtoOutput,
} from "@projectzero/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, GitBranch, GitPullRequest, Lock } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/button";
import { Card } from "../components/card";

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong.";

function Repositories({ installationId }: { installationId: number }) {
  const repos = useListGitHubRepositories(installationId);
  if (repos.isPending) return <p className="text-xs text-muted">Loading repositories…</p>;
  if (repos.error)
    return (
      <p role="alert" className="text-xs text-danger">
        {errorText(repos.error)}
      </p>
    );
  if (!repos.data?.length) return <p className="text-xs text-muted">No repositories selected.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {repos.data.map((repo) => (
        <li key={repo.id} className="flex items-center gap-2 text-xs">
          {repo.private ? (
            <Lock className="size-3 text-muted" aria-label="Private" />
          ) : (
            <GitBranch className="size-3 text-muted" aria-hidden />
          )}
          <span className="font-mono">{repo.fullName}</span>
          <span className="text-muted">{repo.defaultBranch}</span>
        </li>
      ))}
    </ul>
  );
}

function InstallationRow({
  installation,
  isAdmin,
}: {
  installation: GitHubInstallationDtoOutput;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const disconnect = useDisconnectGitHubInstallation();
  const [open, setOpen] = useState(false);

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center gap-3">
        <GitPullRequest className="size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {installation.accountLogin}
            {installation.suspended && (
              <span className="ml-2 rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger">
                Suspended
              </span>
            )}
          </p>
          <p className="text-xs text-muted">
            {installation.accountType === "Organization" ? "Organization" : "User"} ·{" "}
            {installation.repositorySelection === "all"
              ? "All repositories"
              : "Selected repositories"}
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide repos" : "Repos"}
        </Button>
        <a
          href={installation.manageUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm text-muted hover:bg-border/50 hover:text-fg"
        >
          Manage <ExternalLink className="size-3.5" aria-hidden />
        </a>
        {isAdmin && (
          <Button
            type="button"
            variant="danger"
            disabled={disconnect.isPending}
            onClick={async () => {
              await disconnect.mutateAsync({ id: installation.id });
              await queryClient.invalidateQueries({
                queryKey: getListGitHubInstallationsQueryKey(),
              });
            }}
          >
            Disconnect
          </Button>
        )}
      </div>
      {open && (
        <div className="pl-8">
          <Repositories installationId={installation.id} />
        </div>
      )}
      {disconnect.error && (
        <p role="alert" className="pl-8 text-sm text-danger">
          {errorText(disconnect.error)}
        </p>
      )}
    </li>
  );
}

/**
 * The organization's GitHub App installations. Installing the app on a GitHub org or account lets
 * this organization's agents clone, push and open PRs there with short-lived tokens.
 */
export function GitHubPanel({
  isAdmin,
  notice,
  openUrl = (url) => window.location.assign(url),
}: {
  isAdmin: boolean;
  /** Result of returning from GitHub's install flow, if any. */
  notice?: { kind: "connected" | "error"; message?: string } | null;
  /** How to send the user to GitHub; the desktop app opens the system browser. */
  openUrl?: (url: string) => void;
}) {
  const app = useGetGitHubApp();
  const installations = useListGitHubInstallations({
    query: { enabled: app.data?.configured === true },
  });
  const start = useStartGitHubInstall();

  return (
    <Card className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-base font-semibold">GitHub</h2>
        <p className="text-sm text-muted">
          Install the GitHub App on the GitHub organization or account whose repositories your
          agents work on. Agents then clone, push and open pull requests as the app&apos;s bot, with
          short-lived tokens. Nobody has to share a personal token.
        </p>
      </div>

      {notice?.kind === "connected" && (
        <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          GitHub connected.
        </p>
      )}
      {notice?.kind === "error" && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {notice.message ?? "Connecting GitHub failed."}
        </p>
      )}

      {app.isPending && <p className="text-sm text-muted">Loading…</p>}
      {app.data && !app.data.configured && (
        <p className="text-sm text-muted">
          This server has no GitHub App yet. Run <code>pnpm github:app</code> (add{" "}
          <code>--org &lt;github-org&gt;</code> for a team), then restart the API.
        </p>
      )}

      {app.data?.configured && (
        <>
          <ul className="divide-y divide-border">
            {installations.isSuccess && installations.data.length === 0 && (
              <li className="py-3 text-sm text-muted">Not installed anywhere yet.</li>
            )}
            {(installations.data ?? []).map((installation) => (
              <InstallationRow
                key={installation.id}
                installation={installation}
                isAdmin={isAdmin}
              />
            ))}
          </ul>
          {isAdmin ? (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                disabled={start.isPending}
                onClick={async () => openUrl((await start.mutateAsync()).url)}
              >
                <GitPullRequest className="size-4" aria-hidden /> Install on GitHub
              </Button>
              {app.data.htmlUrl && (
                <a
                  href={app.data.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-muted hover:underline"
                >
                  About {app.data.slug}
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Ask an organization owner or admin to install it.</p>
          )}
          {start.error && (
            <p role="alert" className="text-sm text-danger">
              {errorText(start.error)}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
