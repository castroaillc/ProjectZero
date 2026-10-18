import { createReactAuthClient } from "@projectzero/auth/react";

// Desktop authenticates with Better Auth bearer tokens instead of cookies: the token arrives
// in the `set-auth-token` response header and is kept encrypted by the main process.
let token: string | null = null;

export async function loadToken(): Promise<void> {
  token = await window.projectzero.auth.getToken();
}

export function getToken(): string | null {
  return token;
}

export async function clearToken(): Promise<void> {
  token = null;
  await window.projectzero.auth.clearToken();
}

export const authClient = createReactAuthClient({
  baseURL: __API_URL__,
  fetchOptions: {
    credentials: "omit",
    auth: { type: "Bearer", token: () => token ?? "" },
    onSuccess: async ({ response }) => {
      const next = response.headers.get("set-auth-token");
      if (next && next !== token) {
        token = next;
        await window.projectzero.auth.setToken(next);
      }
    },
  },
});
