import { z } from "zod";

/** How agents refer to a credential: as a field value or as `${NAME}` inside env vars and headers. */
export const CredentialNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE, e.g. GITHUB_TOKEN.");

/**
 * Built-in credential backed by the organization's GitHub App installation instead of a stored
 * secret. At run time it resolves to a short-lived installation token, so agents can clone, push
 * and use GitHub's API without anyone pasting a personal access token.
 */
export const GITHUB_APP_CREDENTIAL = "GITHUB_APP_TOKEN";

/** Names that can't be used for stored credentials because the harness provides them. */
export const RESERVED_CREDENTIAL_NAMES: readonly string[] = [GITHUB_APP_CREDENTIAL];

/**
 * `shared`: belongs to the organization; autonomous agents run with it; admins manage it.
 * `personal`: belongs to one member; assistant agents use it when that member chats with them.
 */
export const CREDENTIAL_SCOPES = ["shared", "personal"] as const;

const storedName = CredentialNameSchema.refine(
  (name) => !RESERVED_CREDENTIAL_NAMES.includes(name),
  {
    error: (issue) => `${String(issue.input)} is provided by the harness and can't be stored.`,
  },
);

/** A secret (API key, token) stored encrypted for an organization. The value is never returned. */
export const CredentialSchema = z
  .object({
    id: z.uuid().describe("Unique identifier of the credential."),
    scope: z.enum(CREDENTIAL_SCOPES).describe("Shared with the organization, or one member's own."),
    name: CredentialNameSchema.describe("Name agents use to refer to it, unique per scope."),
    description: z.string().describe("What the credential is for."),
    hint: z.string().describe("Last few characters of the value, to tell credentials apart."),
    createdAt: z.iso.datetime().describe("When the credential was created (ISO 8601)."),
    updatedAt: z.iso.datetime().describe("When the value or description last changed (ISO 8601)."),
  })
  .describe("A stored secret. Only its name, description and hint are ever returned.");

export const CreateCredentialSchema = z
  .object({
    scope: z
      .enum(CREDENTIAL_SCOPES)
      .describe("`shared` (admins only) for autonomous agents, `personal` for your own use."),
    name: storedName.describe("Name agents use to refer to it, unique per scope."),
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

export type CredentialScope = (typeof CREDENTIAL_SCOPES)[number];
export type Credential = z.infer<typeof CredentialSchema>;
export type CreateCredential = z.infer<typeof CreateCredentialSchema>;
export type UpdateCredential = z.infer<typeof UpdateCredentialSchema>;
