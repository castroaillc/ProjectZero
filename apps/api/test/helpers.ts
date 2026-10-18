import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { createDb, loadRootEnv, member, organization, session, user } from "@projectzero/db";
import { eq, inArray } from "drizzle-orm";
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

/** Tracks users created by a suite so afterAll can remove them, their organizations and data. */
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
      // Organizations they belonged to go too (cascading to agents, credentials, installations).
      const ids = db.select({ id: user.id }).from(user).where(inArray(user.email, emails));
      const orgs = db
        .select({ id: member.organizationId })
        .from(member)
        .where(inArray(member.userId, ids));
      await db.delete(organization).where(inArray(organization.id, orgs));
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

/** Creates an organization as the token's user (who becomes owner) and makes it active. */
export async function createOrg(app: INestApplication, token: string, name: string) {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;
  const res = await request(app.getHttpServer())
    .post("/api/auth/organization/create")
    .set("authorization", `Bearer ${token}`)
    .send({ name, slug })
    .expect(200);
  await setActiveOrg(app, token, res.body.id);
  return res.body as { id: string; name: string; slug: string };
}

export async function setActiveOrg(app: INestApplication, token: string, organizationId: string) {
  await request(app.getHttpServer())
    .post("/api/auth/organization/set-active")
    .set("authorization", `Bearer ${token}`)
    .send({ organizationId })
    .expect(200);
}

/** Adds a user to an organization directly (stands in for the invitation flow). */
export async function addMember(organizationId: string, token: string, role: "admin" | "member") {
  const db = createDb(process.env.DATABASE_URL!, { max: 1 });
  const [row] = await db
    .select({ userId: session.userId })
    .from(session)
    .where(eq(session.token, token));
  await db.insert(member).values({
    id: randomUUID(),
    organizationId,
    userId: row!.userId,
    role,
    createdAt: new Date(),
  });
  await db.$client.end();
}
