import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Finds the workspace root (the directory holding `pnpm-workspace.yaml`) above `from`. */
export function findRepoRoot(from: string = process.cwd()): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

/** Loads the repo-root `.env` (one per worktree) into `process.env` if present. */
export function loadRootEnv(): void {
  const root = findRepoRoot();
  const file = root && join(root, ".env");
  if (file && existsSync(file)) process.loadEnvFile(file);
}
