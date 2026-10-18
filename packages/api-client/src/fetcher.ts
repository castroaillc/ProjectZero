/**
 * The HTTP layer every generated endpoint goes through (Orval "mutator").
 *
 * Call {@link configureApiClient} once at app start-up with the API's base URL and, for
 * non-browser clients (desktop, mobile), a way to read the Better Auth bearer token.
 */

export interface ApiClientConfig {
  /** Origin of the API, e.g. `http://localhost:3001`. Paths like `/v1/todos` are appended. */
  baseUrl: string;
  /** Returns the bearer token to send, if any. Browsers can omit this and rely on cookies. */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Defaults to `"include"` so the web app's session cookie is sent cross-origin. */
  credentials?: RequestCredentials;
  /** Custom fetch implementation (tests, Electron, React Native polyfills). */
  fetch?: typeof fetch;
}

let config: ApiClientConfig = { baseUrl: "" };

/** Sets the API base URL and auth for all generated endpoints and hooks. */
export function configureApiClient(next: ApiClientConfig): void {
  config = { ...next, baseUrl: next.baseUrl.replace(/\/+$/, "") };
}

/** Thrown for any non-2xx response. `body` is the parsed JSON error body when there is one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `Request failed with status ${status}`;
    super(message);
    this.name = "ApiError";
  }
}

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  const token = await config.getToken?.();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const res = await (config.fetch ?? fetch)(`${config.baseUrl}${path}`, {
    credentials: config.credentials ?? "include",
    ...init,
    headers,
  });

  const text = await res.text();
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body: unknown = text && isJson ? JSON.parse(text) : text || undefined;

  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
};

/** Error type Orval uses for generated hooks (`TError`). */
export type ErrorType<_Error> = ApiError;
/** Body type Orval uses for generated request bodies. */
export type BodyType<Body> = Body;
