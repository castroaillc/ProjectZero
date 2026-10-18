import { defineConfig } from "orval";

// Generates typed fetchers + TanStack Query hooks for the Nest routes. Auth endpoints are
// excluded: clients use the Better Auth client for those.
export default defineConfig({
  api: {
    input: {
      target: "../../apps/api/openapi.json",
      filters: {
        tags: ["todos", "health", "agent", "coding-agents", "credentials", "agent-templates"],
      },
    },
    output: {
      mode: "tags-split",
      target: "src/generated",
      schemas: "src/generated/model",
      client: "react-query",
      httpClient: "fetch",
      clean: true,
      formatter: "prettier",
      override: {
        mutator: { path: "src/fetcher.ts", name: "apiFetch" },
        // Return the response body directly; apiFetch throws ApiError on non-2xx.
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
});
