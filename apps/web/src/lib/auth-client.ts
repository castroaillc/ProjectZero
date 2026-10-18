import { createReactAuthClient } from "@projectzero/auth/react";

// Same-origin: next.config.ts proxies /api/auth/* to the API.
export const authClient = createReactAuthClient();
