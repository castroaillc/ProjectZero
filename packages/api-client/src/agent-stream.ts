import { AgentEventSchema, type AgentEvent, type RunAgent } from "@projectzero/shared";
import { ApiError, apiRequest, readBody } from "./fetcher";

/**
 * Parses a `text/event-stream` body into agent events. Handles events split across network
 * chunks; skips comments and payloads that aren't valid AgentEvents.
 */
export async function* parseAgentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AgentEvent> {
  // TextDecoder in streaming mode rather than TextDecoderStream, which Hermes (mobile) lacks.
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = done ? "" : (blocks.pop() ?? "");
      for (const block of blocks) {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const parsed = AgentEventSchema.safeParse(json);
        if (parsed.success) yield parsed.data;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Sends a message (or an approval decision) to an agent thread and yields the streamed events.
 * Throws ApiError if the request is rejected (e.g. 401, 404, 400) before streaming starts.
 *
 * React Native's built-in fetch can't stream; pass `fetch` from `expo/fetch` to
 * configureApiClient on mobile.
 */
export async function* streamAgentRun(
  threadId: string,
  body: RunAgent,
  { signal }: { signal?: AbortSignal } = {},
): AsyncGenerator<AgentEvent> {
  const res = await apiRequest(`/v1/agent/threads/${encodeURIComponent(threadId)}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, await readBody(res));
  if (!res.body) throw new ApiError(res.status, "Response has no body to stream");
  yield* parseAgentEvents(res.body);
}
