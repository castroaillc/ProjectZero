import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { createDb, loadRootEnv, user } from "@projectzero/db";
import { inArray } from "drizzle-orm";
import request from "supertest";
import { AppModule } from "../src/app.module";

// e2e suites run against the worktree's own database (DATABASE_URL from the repo-root .env).
loadRootEnv();

export async function createTestApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (customize) builder = customize(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: ["error"] });
  app.setGlobalPrefix("v1");
  await app.init();
  return app;
}

/** Tracks users created by a suite so afterAll can remove them (cascades to their data). */
export function testUsers(prefix: string) {
  const run = Date.now().toString(36);
  const emails: string[] = [];
  return {
    email(name: string) {
      const email = `${prefix}-${name}-${run}@e2e.test`;
      emails.push(email);
      return email;
    },
    async cleanup() {
      if (emails.length === 0) return;
      const db = createDb(process.env.DATABASE_URL!, { max: 1 });
      await db.delete(user).where(inArray(user.email, emails));
      await db.$client.end();
    },
  };
}

export async function signUp(app: INestApplication, email: string) {
  const res = await request(app.getHttpServer())
    .post("/api/auth/sign-up/email")
    .send({ email, password: "correct-horse-battery", name: email.split("@")[0] })
    .expect(200);
  return { token: res.body.token as string, cookie: res.get("set-cookie") ?? [] };
}

/** Parses a text/event-stream body into its JSON `data:` payloads. */
export function sseEvents(body: string): { type: string; [k: string]: unknown }[] {
  return body
    .split("\n\n")
    .flatMap((block) => block.split("\n").filter((l) => l.startsWith("data: ")))
    .map((line) => JSON.parse(line.slice("data: ".length)));
}
