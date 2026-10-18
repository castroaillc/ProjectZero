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
import { user } from "./auth";

/**
 * Saved coding-agent configurations. Each section is validated by its zod schema in
 * @projectzero/shared before it's written, so the JSONB columns hold well-formed config.
 */
export const codingAgents = pgTable(
  "coding_agents",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
    unique().on(t.userId, t.name),
    index().on(t.userId, t.createdAt),
    check("coding_agents_identity_check", sql`${t.identity} in ('assistant', 'autonomous')`),
  ],
);
