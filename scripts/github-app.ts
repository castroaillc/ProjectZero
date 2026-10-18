/**
 * Registers the ProjectZero GitHub App with GitHub's app-manifest flow and writes its
 * credentials into this checkout's .env.
 *
 *   pnpm github:app [--name <name>] [--org <github-org>] [--public] [--webhook-url <url>]
 *
 *   --name         App name; must be unique on GitHub. Default: "ProjectZero (<your login>)".
 *   --org          Create the app under a GitHub organization (recommended for teams). Private
 *                  apps can only be installed on the account that owns them.
 *   --public       Let any GitHub account install it, e.g. to own it personally but install it
 *                  on an org.
 *   --webhook-url  Public URL GitHub can POST webhooks to (e.g. a tunnel to the API's
 *                  /v1/github/webhooks). Without it webhooks start disabled; enable them later
 *                  in the app's settings.
 *
 * It opens GitHub in the browser with the app pre-filled; you review it and click Create, GitHub
 * redirects back to a one-shot local server here, and the script exchanges the code for the
 * app's ID, private key, client secret and webhook secret.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { parseArgs } from "node:util";

// This checkout (main or a worktree): its .env gets the credentials.
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const envFile = join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values: args } = parseArgs({
  options: {
    name: { type: "string" },
    org: { type: "string" },
    public: { type: "boolean", default: false },
    "webhook-url": { type: "string" },
  },
});

const githubUrl = (process.env.GITHUB_URL || "https://github.com").replace(/\/+$/, "");
const apiUrl = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
// GitHub sends the browser back through the web app's /v1 proxy so the session cookie rides along.
const webOrigin = `http://localhost:${process.env.WEB_PORT ?? 3000}`;

function login(): string {
  try {
    return execFileSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8" }).trim();
  } catch {
    return process.env.USER ?? "dev";
  }
}

function manifest(redirectUrl: string) {
  const webhookUrl = args["webhook-url"];
  return {
    name: args.name ?? `ProjectZero (${login()})`,
    url: webOrigin,
    description: "Coding agents from ProjectZero: clone, push, open PRs and manage projects.",
    public: args.public,
    redirect_url: redirectUrl,
    // Installs come back here with an OAuth code, so the API can check who installed what.
    callback_urls: [`${webOrigin}/v1/github/installations/callback`],
    request_oauth_on_install: true,
    setup_on_update: true,
    hook_attributes: { url: webhookUrl ?? `${webOrigin}/v1/github/webhooks`, active: !!webhookUrl },
    default_permissions: {
      contents: "write", // clone and push
      pull_requests: "write",
      issues: "write",
      workflows: "write", // push changes under .github/workflows
      actions: "read",
      checks: "read",
      metadata: "read",
      organization_projects: "write", // GitHub Projects (org-owned)
    },
    default_events: ["issues", "issue_comment", "pull_request", "push", "workflow_run"],
  };
}

function setEnv(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(text) ? text.replace(re, () => line) : `${text.trimEnd()}\n${line}\n`;
}

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">${body}</body>`;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const state = randomBytes(16).toString("hex");
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const { port } = server.address() as { port: number };
  const html = (status: number, body: string) =>
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(body);

  if (url.pathname === "/") {
    const target = args.org
      ? `${githubUrl}/organizations/${encodeURIComponent(args.org)}/settings/apps/new`
      : `${githubUrl}/settings/apps/new`;
    const json = JSON.stringify(manifest(`http://127.0.0.1:${port}/created`));
    return html(
      200,
      page(
        "Create the ProjectZero GitHub App",
        `<form id="f" method="post" action="${target}?state=${state}">` +
          `<input type="hidden" name="manifest" value="${escape(json)}">` +
          `<p>Opening GitHub…</p><button>Continue to GitHub</button></form>` +
          `<script>document.getElementById("f").submit()</script>`,
      ),
    );
  }

  if (url.pathname === "/created") {
    const code = url.searchParams.get("code");
    if (url.searchParams.get("state") !== state || !code)
      return html(
        400,
        page("Error", "<p>Unexpected callback. Run <code>pnpm github:app</code> again.</p>"),
      );
    const conversion = await fetch(`${apiUrl}/app-manifests/${code}/conversions`, {
      method: "POST",
      headers: { accept: "application/vnd.github+json" },
    });
    const app = (await conversion.json()) as {
      id: number;
      slug: string;
      html_url: string;
      client_id: string;
      client_secret: string;
      webhook_secret: string | null;
      pem: string;
      message?: string;
    };
    if (!conversion.ok) {
      html(
        502,
        page("Error", `<p>GitHub refused the conversion: ${escape(app.message ?? "")}</p>`),
      );
      console.error(
        `GitHub refused the manifest conversion (${conversion.status}): ${app.message}`,
      );
      process.exit(1);
    }

    let env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
    for (const [key, value] of Object.entries({
      GITHUB_APP_ID: String(app.id),
      GITHUB_APP_SLUG: app.slug,
      GITHUB_APP_CLIENT_ID: app.client_id,
      GITHUB_APP_CLIENT_SECRET: app.client_secret,
      GITHUB_APP_PRIVATE_KEY: app.pem.trim().replace(/\n/g, "\\n"),
      GITHUB_APP_WEBHOOK_SECRET: app.webhook_secret ?? "",
    }))
      env = setEnv(env, key, value);
    writeFileSync(envFile, env);

    html(
      200,
      page(
        "GitHub App created",
        `<h1>Created ${escape(app.slug)}</h1><p>Its credentials are in <code>${escape(envFile)}</code>. ` +
          `Restart the API, then connect it from <b>Agents → GitHub</b> in the app.</p>` +
          `<p><a href="${escape(app.html_url)}">Open the app on GitHub</a></p>`,
      ),
    );
    console.log(`\n✓ Created GitHub App "${app.slug}" (${app.html_url})`);
    console.log(`  Wrote GITHUB_APP_* to ${envFile}. Restart the API to pick them up.`);
    if (!args["webhook-url"])
      console.log("  Webhooks are off; set a public URL in the app's settings to enable them.");
    server.close();
    return;
  }

  html(404, page("Not found", ""));
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address() as { port: number };
  const start = `http://127.0.0.1:${port}/`;
  console.log(`Opening ${start} to create the GitHub App (Ctrl-C to cancel)…`);
  try {
    execFileSync(process.platform === "darwin" ? "open" : "xdg-open", [start], { stdio: "ignore" });
  } catch {
    console.log(`Open ${start} in your browser to continue.`);
  }
});
