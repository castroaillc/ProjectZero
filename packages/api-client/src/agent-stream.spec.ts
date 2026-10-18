import { describe, expect, it, vi } from "vitest";
import { parseAgentEvents, streamAgentRun } from "./agent-stream";
import { ApiError, configureApiClient } from "./fetcher";

function streamOf(...chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
}

async function collect<T>(gen: AsyncGenerator<T>) {
  const out: T[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

describe("parseAgentEvents", () => {
  it("reassembles events split across chunks", async () => {
    const events = await collect(
      parseAgentEvents(
        streamOf(
          'event: token\ndata: {"type":"tok',
          'en","text":"Hi"}\n\nevent: done\n',
          'data: {"type":"done"}\n\n',
        ),
      ),
    );
    expect(events).toEqual([{ type: "token", text: "Hi" }, { type: "done" }]);
  });

  it("skips comments, malformed JSON and unknown event shapes", async () => {
    const events = await collect(
      parseAgentEvents(
        streamOf(
          ': keep-alive\n\ndata: {oops\n\ndata: {"type":"nope"}\n\ndata: {"type":"done"}\n\n',
        ),
      ),
    );
    expect(events).toEqual([{ type: "done" }]);
  });

  it("handles CRLF line endings and a final event without a trailing blank line", async () => {
    const events = await collect(
      parseAgentEvents(streamOf('data: {"type":"token","text":"a"}\r\n\r\ndata: {"type":"done"}')),
    );
    expect(events).toEqual([{ type: "token", text: "a" }, { type: "done" }]);
  });
});

describe("streamAgentRun", () => {
  it("posts the body with auth and yields the events", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response('data: {"type":"done"}\n\n', {
          headers: { "content-type": "text/event-stream" },
        }),
    );
    configureApiClient({ baseUrl: "http://api.test", getToken: () => "tok", fetch });

    expect(await collect(streamAgentRun("t1", { message: "hi" }))).toEqual([{ type: "done" }]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://api.test/v1/agent/threads/t1/runs");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"message":"hi"}');
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok");
  });

  it("throws ApiError when the run is rejected", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response('{"message":"Thread t1 not found"}', {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    );
    configureApiClient({ baseUrl: "http://api.test", fetch });
    const err = await collect(streamAgentRun("t1", { message: "hi" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, message: "Thread t1 not found" });
  });
});
