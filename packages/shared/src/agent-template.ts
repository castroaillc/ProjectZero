import { z } from "zod";
import { AgentIdentitySchema, CreateCodingAgentSchema } from "./coding-agent";
import { CredentialNameSchema } from "./credential";
import { projectManagerTemplate } from "./templates/project-manager";

/** The config a template fills in. Identity is left out: the user always picks it at setup. */
export const TemplateConfigSchema = CreateCodingAgentSchema.omit({
  identity: true,
  templateId: true,
});

/** A ready-made coding-agent configuration users start from and then adjust. */
export const AgentTemplateSchema = z
  .object({
    id: z.string().describe("Stable template ID; saved on agents created from it."),
    name: z.string().describe("Display name."),
    summary: z.string().describe("One line on what the agent does."),
    description: z
      .string()
      .describe(
        "Plain text: what it does and how to set it up. Lines starting with - are bullets.",
      ),
    recommendedIdentity: AgentIdentitySchema.describe("The identity that usually fits."),
    identityHint: z.string().describe("When to pick each identity for this template."),
    credentials: z
      .array(
        z.object({
          name: CredentialNameSchema.describe("Credential the config refers to."),
          description: z.string().describe("What to create and which permissions it needs."),
        }),
      )
      .describe("Credentials to add before the agent can run."),
    config: TemplateConfigSchema.describe("The pre-filled agent configuration."),
  })
  .describe("A pre-configured coding agent to start from.");

export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;
/** What template modules export: config in input form, so schema defaults fill the rest. */
export type AgentTemplateDefinition = Omit<AgentTemplate, "config"> & {
  config: z.input<typeof TemplateConfigSchema>;
};

/** Built-in templates, parsed once so every consumer sees defaults filled in. */
export const AGENT_TEMPLATES: AgentTemplate[] = [projectManagerTemplate].map((t) =>
  AgentTemplateSchema.parse(t),
);

export function findAgentTemplate(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((t) => t.id === id);
}
