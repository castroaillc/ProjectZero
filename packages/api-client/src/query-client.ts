import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./fetcher";

/** A QueryClient that doesn't retry client errors (4xx); they won't succeed on retry. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
          failureCount < 3,
      },
    },
  });
}
