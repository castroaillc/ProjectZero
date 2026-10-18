import { z } from "zod";

/** How agents refer to a credential: as a field value or as `${NAME}` inside env vars and headers. */
export const CredentialNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE, e.g. GITHUB_TOKEN.");

/** A secret (API key, token) stored encrypted for one user. The value is never returned. */
export const CredentialSchema = z
  .object({
    id: z.uuid().describe("Unique identifier of the credential."),
    name: CredentialNameSchema.describe("Name agents use to refer to it, unique per user."),
    description: z.string().describe("What the credential is for."),
    hint: z.string().describe("Last few characters of the value, to tell credentials apart."),
    createdAt: z.iso.datetime().describe("When the credential was created (ISO 8601)."),
    updatedAt: z.iso.datetime().describe("When the value or description last changed (ISO 8601)."),
  })
  .describe("A stored secret. Only its name, description and hint are ever returned.");

export const CreateCredentialSchema = z
  .object({
    name: CredentialNameSchema.describe("Name agents use to refer to it, unique per user."),
    value: z.string().min(1).max(20_000).describe("The secret. Stored encrypted; write-only."),
    description: z.string().max(500).default("").describe("What the credential is for."),
  })
  .describe("Fields for storing a credential.");

/** The name is fixed because agents refer to credentials by it. */
export const UpdateCredentialSchema = z
  .object({
    value: z.string().min(1).max(20_000).optional().describe("New secret value."),
    description: z.string().max(500).optional().describe("New description."),
  })
  .describe("Replace a credential's value or description.");

const REF = /\$\{([A-Z][A-Z0-9_]*)\}/g;

/** Credential names referenced as `${NAME}` in a string. */
export function credentialRefs(text: string): string[] {
  return [...text.matchAll(REF)].map((m) => m[1]!);
}

export type Credential = z.infer<typeof CredentialSchema>;
export type CreateCredential = z.infer<typeof CreateCredentialSchema>;
export type UpdateCredential = z.infer<typeof UpdateCredentialSchema>;
