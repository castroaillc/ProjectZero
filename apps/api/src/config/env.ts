import { z } from "zod";

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
  CREDENTIALS_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .base64()
      .refine((s) => Buffer.from(s, "base64").length === 32, "Must be 32 bytes, base64-encoded.")
      .optional(),
  ),
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
