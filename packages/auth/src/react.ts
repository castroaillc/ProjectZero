import { createAuthClient } from "better-auth/react";
import { AUTH_BASE_PATH } from "./constants";

export { AUTH_BASE_PATH };

export interface ReactAuthClientOptions {
  /** API origin. Omit when auth is served from the page's own origin (e.g. a dev proxy). */
  baseURL?: string;
}

/**
 * Better Auth client for React apps (web, desktop renderer). Exposes `signIn`, `signUp`,
 * `signOut` and the `useSession()` hook. Browser-only: never imports server code.
 */
export function createReactAuthClient({ baseURL }: ReactAuthClientOptions = {}) {
  return createAuthClient({ baseURL, basePath: AUTH_BASE_PATH });
}

export type ReactAuthClient = ReturnType<typeof createReactAuthClient>;
