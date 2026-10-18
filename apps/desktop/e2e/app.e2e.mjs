// End-to-end test of the packaged desktop app (out/, served from app://projectzero) against a
// real API and the worktree's database. Run `pnpm build` first.
//
// Uses a throwaway profile and Chromium's mock keychain so it never touches the user's real
// app data or triggers macOS keychain prompts.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, user } from "@projectzero/db";
import { eq } from "drizzle-orm";
import { _electron as electron } from "playwright-core";

const apiUrl = `http://localhost:${process.env.API_PORT}`;
const email = `desktop-${Date.now().toString(36)}@e2e.test`;
const password = "correct-horse-battery";
const profile = mkdtempSync(join(tmpdir(), "projectzero-desktop-e2e-"));

const api = spawn("node", ["dist/main.js"], { cwd: "../api", stdio: "ignore", env: process.env });

async function waitForApi() {
  for (let i = 0; i < 60; i++) {
    if (
      await fetch(`${apiUrl}/v1/health`).then(
        (r) => r.ok,
        () => false,
      )
    )
      return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API did not start on ${apiUrl}`);
}

function launch() {
  return electron.launch({
    args: [".", "--use-mock-keychain"],
    env: { ...process.env, PROJECTZERO_USER_DATA_DIR: profile },
  });
}

const step = (name) => console.log(`✓ ${name}`);

try {
  await waitForApi();

  let app = await launch();
  let page = await app.firstWindow();
  assert.match(page.url(), /^app:\/\/projectzero\//);
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  step("packaged renderer loads from app://projectzero and shows sign-in");

  await page.getByRole("button", { name: "Create one" }).click();
  await page.getByLabel("Name").fill("Desktop E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("heading", { name: "Todos" }).waitFor();
  step("sign-up via bearer auth lands on todos");

  await page.getByLabel("New todo").fill("from desktop");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByText("from desktop").waitFor();
  step("todo created through the generated API client");

  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByText("from desktop").waitFor();
  step("session token survives a relaunch (safeStorage)");

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  step("sign-out clears the stored token");

  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.reload();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  assert.deepEqual(errors, []);
  step("no console errors (CSP allows everything the app needs)");
  await app.close();
} finally {
  api.kill();
  rmSync(profile, { recursive: true, force: true });
  const db = createDb(process.env.DATABASE_URL, { max: 1 });
  await db.delete(user).where(eq(user.email, email));
  await db.$client.end();
}
