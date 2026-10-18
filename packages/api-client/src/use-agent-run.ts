import type { AgentEvent, ApprovalRequest, RunAgent } from "@projectzero/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { streamAgentRun } from "./agent-stream";
import { getGetAgentThreadQueryKey, getListAgentThreadsQueryKey } from "./generated/agent/agent";
import { getListTodosQueryKey } from "./generated/todos/todos";

export interface AgentRunState {
  /** True while a run is streaming. */
  streaming: boolean;
  /** Assistant text streamed so far in the current run. */
  reply: string;
  /** Tool calls and results from the current run, in order. */
  activity: Extract<AgentEvent, { type: "tool_call" | "tool_result" }>[];
  /** Changes the agent is waiting on; answer with `respond(approved)`. */
  pendingApprovals: ApprovalRequest[];
  error: string | null;
}

const idle: AgentRunState = {
  streaming: false,
  reply: "",
  activity: [],
  pendingApprovals: [],
  error: null,
};

/**
 * Drives one agent thread: `send(message)` starts a run, `respond(approved)` answers pending
 * approvals. When a run ends the thread history, thread list and todos are refetched.
 */
export function useAgentRun(threadId: string) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AgentRunState>(idle);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), [threadId]);

  const start = useCallback(
    async (body: RunAgent) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setState({ ...idle, streaming: true });
      try {
        for await (const event of streamAgentRun(threadId, body, { signal: abort.signal })) {
          setState((s) => {
            switch (event.type) {
              case "token":
                return { ...s, reply: s.reply + event.text };
              case "tool_call":
              case "tool_result":
                return { ...s, activity: [...s.activity, event] };
              case "approval_required":
                return { ...s, pendingApprovals: [...s.pendingApprovals, event.approval] };
              case "error":
                return { ...s, error: event.message };
              case "done":
                return s;
            }
          });
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Agent run failed",
          }));
        }
      } finally {
        if (abortRef.current === abort) {
          setState((s) => ({ ...s, streaming: false }));
          void queryClient.invalidateQueries({ queryKey: getGetAgentThreadQueryKey(threadId) });
          void queryClient.invalidateQueries({ queryKey: getListAgentThreadsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListTodosQueryKey() });
        }
      }
    },
    [threadId, queryClient],
  );

  const send = useCallback((message: string) => start({ message }), [start]);
  const respond = useCallback((approved: boolean) => start({ resume: { approved } }), [start]);
  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { ...state, send, respond, cancel };
}
