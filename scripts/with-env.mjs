#!/usr/bin/env node
// Runs a command with the worktree's root .env loaded, expanding $VARS in its arguments.
//   "dev": "node ../../scripts/with-env.mjs next dev --port \\$WEB_PORT"   (escaped so npm's shell leaves it)
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envFile = join(dirname(dirname(fileURLToPath(import.meta.url))), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [cmd, ...args] = process.argv
  .slice(2)
  .map((a) => a.replace(/\$([A-Z0-9_]+)/g, (_, k) => process.env[k] ?? ""));
if (!cmd) {
  console.error("usage: with-env <command> [args...]");
  process.exit(1);
}
const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) =>
  signal ? process.kill(process.pid, signal) : process.exit(code ?? 0),
);
