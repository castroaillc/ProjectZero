import { z } from "zod";

/** Treats `NAME=` (empty) in .env the same as leaving the variable out. */
function emptyAsUndefined<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema);
}

const csv = z
  .string()
  .default("")
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );

/** Environment variables the API reads; validated once at boot. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_PORT: z.coerce.number().int().default(3000),
  DESKTOP_RENDERER_PORT: z.coerce.number().int().default(5173),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  /** Extra comma-separated origins allowed by CORS and Better Auth. */
  TRUSTED_ORIGINS: csv,
  /** Ollama model the agent runs on; must support tool calling. */
  AGENT_MODEL: z.string().default("gpt-oss:20b"),
  OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),
  /**
   * Base64 32-byte key that encrypts stored credentials. Defaults to one derived from
   * BETTER_AUTH_SECRET; set it in production so rotating the auth secret doesn't lock them.
   */
  CREDENTIALS_KEY: emptyAsUndefined(
    z
      .base64()
      .refine((s) => Buffer.from(s, "base64").length === 32, "Must be 32 bytes, base64-encoded.")
      .optional(),
  ),
  /**
   * The ProjectZero GitHub App (create it with `pnpm github:app`). All optional: without them the
   * GitHub endpoints report the app as not configured.
   */
  GITHUB_APP_ID: emptyAsUndefined(z.string().regex(/^\d+$/).optional()),
  GITHUB_APP_SLUG: emptyAsUndefined(z.string().optional()),
  GITHUB_APP_CLIENT_ID: emptyAsUndefined(z.string().optional()),
  GITHUB_APP_CLIENT_SECRET: emptyAsUndefined(z.string().optional()),
  /** PEM private key. `\n` escapes are accepted so it fits on one .env line. */
  GITHUB_APP_PRIVATE_KEY: emptyAsUndefined(
    z
      .string()
      .transform((s) => s.replace(/\\n/g, "\n"))
      .optional(),
  ),
  GITHUB_APP_WEBHOOK_SECRET: emptyAsUndefined(z.string().optional()),
  /** Override for GitHub Enterprise Server; defaults to github.com. */
  GITHUB_URL: z.url().default("https://github.com"),
  GITHUB_API_URL: z.url().default("https://api.github.com"),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Origin of the packaged desktop renderer (served from a custom scheme, not file://). */
export const DESKTOP_APP_ORIGIN = "app://projectzero";

/** Origins of the clients that may call the API in this environment. */
export function trustedOrigins(env: Env): string[] {
  return [
    `http://localhost:${env.WEB_PORT}`,
    `http://localhost:${env.DESKTOP_RENDERER_PORT}`,
    DESKTOP_APP_ORIGIN,
    ...env.TRUSTED_ORIGINS,
  ];
}
