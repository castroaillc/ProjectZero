import { createAuthClient } from "better-auth/react";
import { AUTH_BASE_PATH } from "./constants";

export { AUTH_BASE_PATH };

type ClientOptions = NonNullable<Parameters<typeof createAuthClient>[0]>;

export interface ReactAuthClientOptions {
  /** API origin. Omit when auth is served from the page's own origin (e.g. a dev proxy). */
  baseURL?: string;
  /** Passed to Better Auth's fetch; desktop uses it for bearer-token auth. */
  fetchOptions?: ClientOptions["fetchOptions"];
}

/**
 * Better Auth client for React apps (web, desktop renderer). Exposes `signIn`, `signUp`,
 * `signOut` and the `useSession()` hook. Browser-only: never imports server code.
 */
export function createReactAuthClient({ baseURL, fetchOptions }: ReactAuthClientOptions = {}) {
  return createAuthClient({ baseURL, basePath: AUTH_BASE_PATH, fetchOptions });
}

export type ReactAuthClient = ReturnType<typeof createReactAuthClient>;
