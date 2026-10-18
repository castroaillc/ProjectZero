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
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Origins of the clients that may call the API in this environment. */
export function trustedOrigins(env: Env): string[] {
  return [
    `http://localhost:${env.WEB_PORT}`,
    `http://localhost:${env.DESKTOP_RENDERER_PORT}`,
    ...env.TRUSTED_ORIGINS,
  ];
}
