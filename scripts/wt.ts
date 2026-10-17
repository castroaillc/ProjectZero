/**
 * Worktree helper: one git worktree per increment, each with its own ports and database
 * so several can run `pnpm dev` side by side.
 *
 *   pnpm wt new <name> [--branch <branch>]   create ../project0.worktrees/<name> on feat/<name>
 *   pnpm wt rm <name> [--force]              drop its database and remove the worktree
 *   pnpm wt ls                               list worktrees with their port offsets
 */
import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const PORT_KEYS = ["API_PORT", "WEB_PORT", "DOCS_PORT", "DESKTOP_RENDERER_PORT"] as const;
const OFFSET_STEP = 10;

function run(cmd: string, args: string[], opts: ExecFileSyncOptions = {}): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...opts,
  })
    .toString()
    .trim();
}

const mainRoot = dirname(run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
const worktreesDir = resolve(mainRoot, "..", `${basename(mainRoot)}.worktrees`);

function parseEnv(text: string): Map<string, string> {
  const env = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) env.set(m[1]!, m[2]!);
  }
  return env;
}

function setEnv(text: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*$`, "m");
  return re.test(text)
    ? text.replace(re, `${key}=${value}`)
    : `${text.trimEnd()}\n${key}=${value}\n`;
}

function listWorktrees(): { path: string; branch: string }[] {
  const out = run("git", ["worktree", "list", "--porcelain"]);
  return out
    .split("\n\n")
    .map((block) => ({
      path: /^worktree (.+)$/m.exec(block)?.[1] ?? "",
      branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? "(detached)",
    }))
    .filter((w) => w.path);
}

function offsetOf(path: string): number {
  const envFile = join(path, ".env");
  if (!existsSync(envFile)) return 0;
  return Number(parseEnv(readFileSync(envFile, "utf8")).get("WT_PORT_OFFSET") ?? 0);
}

function dbName(name: string): string {
  return `projectzero_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function psql(sql: string): void {
  run(
    "docker",
    [
      "compose",
      "-f",
      join(mainRoot, "docker-compose.yml"),
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-c",
      sql,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
}

function cmdNew(name: string, branch: string): void {
  const path = join(worktreesDir, name);
  if (existsSync(path)) throw new Error(`${path} already exists`);

  const used = new Set(listWorktrees().map((w) => offsetOf(w.path)));
  let offset = OFFSET_STEP;
  while (used.has(offset)) offset += OFFSET_STEP;

  const branchExists = run("git", ["branch", "--list", branch]) !== "";
  run("git", ["worktree", "add", path, ...(branchExists ? [branch] : ["-b", branch, "main"])], {
    stdio: ["ignore", "inherit", "inherit"],
  });

  const baseEnvFile = existsSync(join(mainRoot, ".env")) ? ".env" : ".env.example";
  const base = readFileSync(join(mainRoot, baseEnvFile), "utf8");
  const baseEnv = parseEnv(base);
  let env = setEnv(base, "WT_PORT_OFFSET", String(offset));
  for (const key of PORT_KEYS) {
    const port = Number(baseEnv.get(key));
    if (port) env = setEnv(env, key, String(port + offset));
  }
  const db = dbName(name);
  const dbUrl = baseEnv.get("DATABASE_URL");
  if (dbUrl) env = setEnv(env, "DATABASE_URL", dbUrl.replace(/\/[^/?]+(\?|$)/, `/${db}$1`));
  const apiPort = Number(baseEnv.get("API_PORT")) + offset;
  env = setEnv(env, "BETTER_AUTH_URL", `http://localhost:${apiPort}`);
  env = setEnv(env, "LANGSMITH_PROJECT", `projectzero-wt-${name}`);
  writeFileSync(join(path, ".env"), env);

  try {
    psql(`CREATE DATABASE ${db}`);
  } catch {
    console.warn(`! Could not create database ${db} (is \`docker compose up -d\` running?)`);
  }

  run("pnpm", ["install", "--prefer-offline"], { cwd: path, stdio: "inherit" });
  if (existsSync(join(path, "packages", "db"))) {
    run("pnpm", ["db:migrate"], { cwd: path, stdio: "inherit" });
  }
  console.log(`\n✓ ${path} on ${branch} (port offset +${offset}, db ${db})`);
}

function cmdRm(name: string, force: boolean): void {
  const path = join(worktreesDir, name);
  try {
    psql(`DROP DATABASE IF EXISTS ${dbName(name)} WITH (FORCE)`);
  } catch {
    console.warn(`! Could not drop database ${dbName(name)}`);
  }
  run("git", ["worktree", "remove", ...(force ? ["--force"] : []), path], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  console.log(`✓ removed ${path} (branch kept; delete with \`git branch -d\` once merged)`);
}

function cmdLs(): void {
  for (const w of listWorktrees()) {
    console.log(`${w.path}\t${w.branch}\t+${offsetOf(w.path)}`);
  }
}

const [cmd, name, ...rest] = process.argv.slice(2);
const flag = (f: string) => rest.includes(f);
const branchIdx = rest.indexOf("--branch");

try {
  if (cmd === "ls") cmdLs();
  else if (cmd === "new" && name)
    cmdNew(name, branchIdx >= 0 ? rest[branchIdx + 1]! : `feat/${name}`);
  else if (cmd === "rm" && name) cmdRm(name, flag("--force"));
  else {
    console.error("usage: pnpm wt <new|rm> <name> | pnpm wt ls");
    process.exit(1);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
