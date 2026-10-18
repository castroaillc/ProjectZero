import { member, organization as organizationTable, schema, user, type Db } from "@projectzero/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { asc, eq } from "drizzle-orm";
import { bearer, openAPI, organization } from "better-auth/plugins";

import { AUTH_BASE_PATH } from "./constants";

export { AUTH_BASE_PATH };

export interface CreateAuthOptions {
  db: Db;
  secret: string;
  /** Public URL of the API, e.g. `http://localhost:3001`. */
  baseURL: string;
  /** Origins allowed to call the auth endpoints (web, desktop renderer, …). */
  trustedOrigins: string[];
}

/**
 * Creates the Better Auth server instance.
 *
 * - Email + password sign-in.
 * - `bearer()` lets non-browser clients (desktop, mobile) send `Authorization: Bearer <token>`
 *   instead of cookies.
 * - `openAPI()` exposes the auth endpoints' OpenAPI schema so they appear in the API docs.
 * - `organization()` adds organizations (workspaces), members with owner/admin/member roles,
 *   invitations, and `session.activeOrganizationId`, which the API scopes every request to.
 *   Each session starts in the user's oldest membership, creating a personal workspace first if
 *   they have none, so there's always an active organization.
 */
export function createAuth({ db, secret, baseURL, trustedOrigins }: CreateAuthOptions) {
  return betterAuth({
    secret,
    baseURL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    plugins: [bearer(), openAPI(), organization({ creatorRole: "owner" })],
    databaseHooks: {
      session: {
        create: {
          // Every session starts in an organization: the user's oldest membership, or a personal
          // workspace created on the spot (first sign-in, or users from before organizations).
          before: async (session) => ({
            data: {
              ...session,
              activeOrganizationId: await defaultOrganization(db, session.userId),
            },
          }),
        },
      },
    },
  });
}

/**
 * The organization a new session starts in. Creates the user's personal workspace if they have
 * no memberships. IDs are derived from the user ID (matching the migration that backfilled
 * existing users) so concurrent sign-ins can't create two.
 */
async function defaultOrganization(db: Db, userId: string): Promise<string> {
  const [first] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  if (first) return first.organizationId;

  const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const organizationId = `org_${userId}`;
  await db.transaction(async (tx) => {
    await tx
      .insert(organizationTable)
      .values({
        id: organizationId,
        name: `${owner?.name ?? "My"}'s workspace`,
        slug: `personal-${userId.toLowerCase()}`,
        metadata: JSON.stringify({ personal: true }),
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    await tx
      .insert(member)
      .values({ id: `mem_${userId}`, organizationId, userId, role: "owner", createdAt: new Date() })
      .onConflictDoNothing();
  });
  return organizationId;
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];
