"use client";

import { configureApiClient, createQueryClient } from "@projectzero/api-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// Same-origin: next.config.ts proxies /v1/* to the API, and the session cookie rides along.
configureApiClient({ baseUrl: "" });

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
