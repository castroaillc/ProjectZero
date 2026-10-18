import { z } from "zod";
import { CredentialNameSchema, credentialRefs } from "./credential";

// A coding agent is a saved configuration: whose credentials it acts with (identity), how it
// presents itself (persona), which model it runs on, the Docker sandbox it works in, which
// built-in tools it may use, the MCP servers it can reach and the skills it can load. Running one
// is a separate step; these schemas only describe and validate the configuration.

/** Lowercase identifier used for MCP server and skill names (also how the model refers to them). */
const slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Use lowercase letters, digits, - and _.");

const envName = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Must be a valid environment variable name.");

/** Plain environment variables. Values may insert a credential as `${NAME}`. */
const envVars = z
  .record(envName, z.string().max(4000))
  .describe("Environment variables. Use `${NAME}` to insert a credential instead of a secret.");

/** Rejects arrays where two items share a name, pointing the error at the duplicate. */
function uniqueNames<T extends { name: string }>(items: T[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.name))
      ctx.addIssue({
        code: "custom",
        path: [i, "name"],
        message: `Duplicate name "${item.name}".`,
      });
    seen.add(item.name);
  });
}

export const MODEL_PROVIDERS = ["ollama", "anthropic", "openai"] as const;

export const ModelConfigSchema = z
  .object({
    provider: z.enum(MODEL_PROVIDERS).describe("Who serves the model."),
    model: z.string().min(1).max(200).describe("Model ID or Ollama tag, e.g. gpt-oss:20b."),
    baseUrl: z
      .url()
      .optional()
      .describe("Server URL. Ollama defaults to the API's OLLAMA_BASE_URL; others to the vendor."),
    apiKeyCredential: CredentialNameSchema.optional().describe(
      "Name of the credential holding the API key.",
    ),
    temperature: z.number().min(0).max(2).optional().describe("Sampling temperature."),
    maxTokens: z.int().min(1).max(200_000).optional().describe("Max output tokens per turn."),
  })
  .superRefine((model, ctx) => {
    if (model.provider !== "ollama" && !model.apiKeyCredential)
      ctx.addIssue({
        code: "custom",
        path: ["apiKeyCredential"],
        message: `${model.provider} needs the credential that holds its API key.`,
      });
  })
  .describe("The chat model the agent runs on. It must support tool calling.");

export const SandboxConfigSchema = z
  .object({
    image: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[\w][\w.\-/:@]*$/, "Must be a Docker image reference, e.g. node:24-bookworm.")
      .describe("Docker image the sandbox container starts from."),
    workdir: z
      .string()
      .regex(/^\/[^\0]*$/, "Must be an absolute path.")
      .default("/workspace")
      .describe("Working directory inside the container; the repo is cloned here."),
    repo: z
      .object({
        url: z.url().describe("Git URL to clone."),
        ref: z.string().min(1).max(255).optional().describe("Branch, tag or commit to check out."),
      })
      .optional()
      .describe("Repository to clone into the workdir before the agent starts."),
    setupCommands: z
      .array(z.string().min(1).max(2000))
      .max(20)
      .default([])
      .describe("Shell commands run in the workdir after cloning, e.g. `pnpm install`."),
    network: z
      .enum(["none", "bridge"])
      .default("bridge")
      .describe("`none` cuts the container off from the network; `bridge` allows outbound."),
    cpus: z.number().min(0.25).max(16).default(2).describe("CPU limit."),
    memoryMb: z.int().min(256).max(65_536).default(4096).describe("Memory limit in MiB."),
    timeoutSeconds: z
      .int()
      .min(60)
      .max(86_400)
      .default(3600)
      .describe("The container is stopped after this long."),
    env: envVars.default({}),
  })
  .describe("The Docker container the agent's tools run in.");

/**
 * Whose credentials the agent acts with. Fixed once the agent is created, because switching
 * would silently change whose accounts its actions land in.
 */
export const AGENT_IDENTITIES = ["assistant", "autonomous"] as const;

export const AgentIdentitySchema = z
  .enum(AGENT_IDENTITIES, {
    error: "Choose whether this agent is a person's assistant or runs on its own.",
  })
  .describe(
    "`assistant`: a human's assistant; each person chatting with it uses their own credentials. " +
      "`autonomous`: runs on its own with credentials its owner connects. Can't be changed later.",
  );

export const DEFAULT_AGENT_PERSONA = {
  avatar: "🤖",
  role: "",
  git: { name: "ProjectZero Agent", email: "agent@projectzero.local" },
};

export const AgentPersonaSchema = z
  .object({
    avatar: z
      .string()
      .trim()
      .min(1)
      .max(16)
      .describe("Emoji shown next to the agent's messages.")
      .default(DEFAULT_AGENT_PERSONA.avatar),
    role: z
      .string()
      .trim()
      .max(200)
      .describe("Who the agent is, e.g. 'Senior TypeScript engineer'. Opens its system prompt.")
      .default(DEFAULT_AGENT_PERSONA.role),
    git: z
      .object({
        name: z.string().trim().min(1).max(100).describe("Commit author name."),
        email: z.email().describe("Commit author email."),
        tokenCredential: CredentialNameSchema.optional().describe(
          "Credential with a token for pushing, e.g. a GitHub PAT.",
        ),
      })
      .describe("Who the agent's commits are attributed to inside the sandbox.")
      .default(DEFAULT_AGENT_PERSONA.git),
  })
  .describe("How the agent presents itself and who its commits are attributed to.");

/** Tools the harness provides; all of them act inside the sandbox. */
export const BUILTIN_TOOLS = {
  bash: "Run a shell command in the workdir.",
  read_file: "Read a file.",
  write_file: "Create or overwrite a file.",
  edit_file: "Replace an exact string in a file.",
  list_files: "List files matching a glob.",
  grep: "Search file contents with a regex.",
} as const;

export type BuiltinToolName = keyof typeof BUILTIN_TOOLS;
const BUILTIN_TOOL_NAMES = Object.keys(BUILTIN_TOOLS) as [BuiltinToolName, ...BuiltinToolName[]];

export const ToolConfigSchema = z
  .object({
    name: z.enum(BUILTIN_TOOL_NAMES).describe("Built-in tool."),
    approval: z
      .enum(["auto", "ask"])
      .default("auto")
      .describe("`ask` pauses the run for the user's approval before each call."),
  })
  .describe("A built-in tool the agent may use.");

const mcpBase = {
  name: slug.describe("Server name; tools are exposed to the model as <name>__<tool>."),
  approval: z
    .enum(["auto", "ask"])
    .default("ask")
    .describe("`ask` pauses the run for approval before each of this server's tool calls."),
  autoApprove: z
    .array(z.string().min(1).max(200))
    .max(200)
    .default([])
    .describe("Tools (by their name on the server) that skip approval even when it's `ask`."),
};

export const McpServerConfigSchema = z
  .discriminatedUnion("transport", [
    z.object({
      ...mcpBase,
      transport: z.literal("stdio").describe("Started as a process inside the sandbox."),
      command: z.string().min(1).max(500).describe("Executable, e.g. npx."),
      args: z.array(z.string().max(2000)).max(50).default([]).describe("Arguments."),
      env: envVars.default({}),
    }),
    z.object({
      ...mcpBase,
      transport: z.literal("http").describe("Reached over Streamable HTTP from the harness."),
      url: z.url().describe("MCP endpoint URL."),
      headers: z
        .record(z.string().min(1).max(200), z.string().max(4000))
        .default({})
        .describe("Request headers. Use `${NAME}` to insert a credential, e.g. `Bearer ${TOKEN}`."),
    }),
  ])
  .describe("An MCP server whose tools the agent can call.");

export const SkillSchema = z
  .object({
    name: slug.describe("Skill name the model uses to load it."),
    description: z
      .string()
      .min(1)
      .max(1024)
      .describe(
        "When to use the skill. The model sees this up front and loads the rest on demand.",
      ),
    instructions: z
      .string()
      .min(1)
      .max(100_000)
      .describe("Markdown body of the skill (the SKILL.md content below the frontmatter)."),
  })
  .describe("Instructions the agent loads when a task calls for them.");

// Fields put .describe() and refinements before .default() so the update schema can strip
// the defaults (see withoutDefaults) and keep the rest.
const configFields = {
  name: z.string().trim().min(1).max(100).describe("Display name, unique per user."),
  description: z.string().max(500).describe("What this agent is for.").default(""),
  systemPrompt: z
    .string()
    .max(20_000)
    .describe("Extra instructions appended to the harness's base prompt.")
    .default(""),
  identity: AgentIdentitySchema,
  persona: AgentPersonaSchema.default(DEFAULT_AGENT_PERSONA),
  model: ModelConfigSchema,
  sandbox: SandboxConfigSchema,
  tools: z
    .array(ToolConfigSchema)
    .superRefine(uniqueNames)
    .describe("Built-in tools the agent may use. Defaults to all of them.")
    .default(BUILTIN_TOOL_NAMES.map((name) => ({ name, approval: "auto" as const }))),
  mcpServers: z
    .array(McpServerConfigSchema)
    .max(20)
    .superRefine(uniqueNames)
    .describe("MCP servers the agent can call.")
    .default([]),
  skills: z
    .array(SkillSchema)
    .max(50)
    .superRefine(uniqueNames)
    .describe("Skills the agent can load.")
    .default([]),
};

/** Makes every field optional without defaults, so omitted fields stay unchanged on update. */
function withoutDefaults<T extends Record<string, z.ZodType>>(fields: T) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, schema]) => [
      key,
      (schema instanceof z.ZodDefault ? (schema.unwrap() as z.ZodType) : schema).optional(),
    ]),
  ) as {
    [K in keyof T]: z.ZodOptional<T[K] extends z.ZodDefault<infer Inner> ? Inner : T[K]>;
  };
}

/** A saved coding-agent configuration owned by one user. */
export const CodingAgentSchema = z
  .object({
    id: z.uuid().describe("Unique identifier of the agent."),
    ...configFields,
    requiredCredentials: z
      .array(CredentialNameSchema)
      .describe("Credentials the agent's config refers to; a run needs all of them."),
    // Optional rather than nullable: the OpenAPI emitter renders nullable strings as arrays.
    templateId: z
      .string()
      .optional()
      .describe("Template the agent was created from, if any. Kept for provenance only."),
    createdAt: z.iso.datetime().describe("When the agent was created (ISO 8601)."),
    updatedAt: z.iso.datetime().describe("When the agent was last changed (ISO 8601)."),
  })
  .describe("A coding agent: identity, persona, model, sandbox, tools, MCP servers and skills.");

export const CreateCodingAgentSchema = z
  .object({
    ...configFields,
    templateId: slug.optional().describe("Template this agent starts from, if any."),
  })
  .describe("Fields for creating a coding agent.");

/**
 * Each top-level field replaces the stored value as a whole (no deep merge). `identity` may be
 * sent so clients can PATCH a full config back, but it must match the stored value.
 */
export const UpdateCodingAgentSchema = z
  .object(withoutDefaults(configFields))
  .describe("Fields to change on a coding agent; each replaces the stored value as a whole.");

/**
 * Every credential a config refers to, sorted and de-duplicated: the model's API key, the git
 * push token, and `${NAME}` references in sandbox env, MCP env and MCP headers.
 */
export function requiredCredentials(
  config: Pick<CreateCodingAgent, "model" | "persona" | "sandbox" | "mcpServers">,
): string[] {
  const names = [
    config.model.apiKeyCredential,
    config.persona.git.tokenCredential,
    ...Object.values(config.sandbox.env).flatMap(credentialRefs),
    ...config.mcpServers.flatMap((server) =>
      Object.values(server.transport === "stdio" ? server.env : server.headers).flatMap(
        credentialRefs,
      ),
    ),
  ];
  return [...new Set(names.filter((n): n is string => !!n))].sort();
}

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];
export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;
export type AgentPersona = z.infer<typeof AgentPersonaSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type CodingAgent = z.infer<typeof CodingAgentSchema>;
export type CreateCodingAgent = z.infer<typeof CreateCodingAgentSchema>;
export type UpdateCodingAgent = z.infer<typeof UpdateCodingAgentSchema>;
