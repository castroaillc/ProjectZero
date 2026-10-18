import {
  DEFAULT_AGENT_PERSONA,
  type AgentIdentity,
  type AgentPersona,
  type McpServerConfig,
  type ModelConfig,
  type SandboxConfig,
  type Skill,
  type ToolConfig,
} from "@projectzero/shared";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/**
 * Saved coding-agent configurations, owned by an organization and shared by its members. Each
 * section is validated by its zod schema in @projectzero/shared before it's written, so the
 * JSONB columns hold well-formed config.
 */
export const codingAgents = pgTable(
  "coding_agents",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Member who created it; kept for attribution, cleared if they're deleted. */
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    name: text().notNull(),
    description: text().notNull().default(""),
    systemPrompt: text().notNull().default(""),
    /** "assistant" or "autonomous"; never changes after insert. */
    identity: text().$type<AgentIdentity>().notNull(),
    persona: jsonb().$type<AgentPersona>().notNull().default(DEFAULT_AGENT_PERSONA),
    model: jsonb().$type<ModelConfig>().notNull(),
    sandbox: jsonb().$type<SandboxConfig>().notNull(),
    tools: jsonb().$type<ToolConfig[]>().notNull(),
    mcpServers: jsonb().$type<McpServerConfig[]>().notNull(),
    skills: jsonb().$type<Skill[]>().notNull(),
    /** Built-in template the agent was created from (provenance only; no foreign key). */
    templateId: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique().on(t.organizationId, t.name),
    index().on(t.organizationId, t.createdAt),
    check("coding_agents_identity_check", sql`${t.identity} in ('assistant', 'autonomous')`),
  ],
);
