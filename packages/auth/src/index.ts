import { schema, type Db } from "@projectzero/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, openAPI } from "better-auth/plugins";

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
 */
export function createAuth({ db, secret, baseURL, trustedOrigins }: CreateAuthOptions) {
  return betterAuth({
    secret,
    baseURL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    plugins: [bearer(), openAPI()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];
