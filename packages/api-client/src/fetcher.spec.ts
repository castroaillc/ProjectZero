import { describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, configureApiClient } from "./fetcher";

function mockFetch(status: number, body?: unknown) {
  return vi.fn<typeof fetch>(async () =>
    body === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
  );
}

describe("apiFetch", () => {
  it("prefixes the base URL, sends the bearer token and includes credentials", async () => {
    const fetch = mockFetch(200, [{ id: "1" }]);
    configureApiClient({ baseUrl: "http://api.test/", getToken: async () => "tok", fetch });

    await expect(apiFetch("/v1/todos", { method: "GET" })).resolves.toEqual([{ id: "1" }]);

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://api.test/v1/todos");
    expect(new Headers(init!.headers).get("authorization")).toBe("Bearer tok");
    expect(init!.credentials).toBe("include");
  });

  it("omits the authorization header without a token", async () => {
    const fetch = mockFetch(200, {});
    configureApiClient({ baseUrl: "http://api.test", fetch });
    await apiFetch("/v1/health");
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).has("authorization")).toBe(false);
  });

  it("returns undefined for empty responses", async () => {
    configureApiClient({ baseUrl: "http://api.test", fetch: mockFetch(204) });
    await expect(apiFetch("/v1/todos/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("throws ApiError with the status and parsed body on failure", async () => {
    configureApiClient({
      baseUrl: "http://api.test",
      fetch: mockFetch(400, { statusCode: 400, message: "Validation failed" }),
    });
    const err = await apiFetch("/v1/todos", { method: "POST" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, message: "Validation failed" });
  });
});
