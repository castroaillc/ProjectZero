import { bigint, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/**
 * Installations of the ProjectZero GitHub App, each linked to the organization that installed
 * it. Agents in that organization get short-lived installation tokens to read and push to the
 * repositories the installation covers. Rows are kept in sync by the app's webhooks.
 */
export const githubInstallations = pgTable(
  "github_installations",
  {
    /** GitHub's installation ID. One ProjectZero organization per installation. */
    id: bigint({ mode: "number" }).primaryKey(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** GitHub account (org or user) the app is installed on. */
    accountLogin: text().notNull(),
    accountType: text().$type<"Organization" | "User">().notNull(),
    accountId: bigint({ mode: "number" }).notNull(),
    /** "all" repositories of the account, or only "selected" ones. */
    repositorySelection: text().$type<"all" | "selected">().notNull(),
    permissions: jsonb().$type<Record<string, string>>().notNull(),
    suspendedAt: timestamp(),
    installedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.organizationId)],
);
