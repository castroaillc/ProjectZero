import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/**
 * Secrets agents use (API keys, tokens), held by an organization. Shared ones (`userId` null)
 * are what autonomous agents run with; personal ones belong to one member and are what assistant
 * agents use when that member chats with them. `ciphertext` is AES-256-GCM sealed by the API;
 * the plaintext never touches the database. `hint` is the last few characters, shown so users
 * can tell credentials apart.
 */
export const credentials = pgTable(
  "credentials",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Owner of a personal credential; null for one shared with the whole organization. */
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    description: text().notNull().default(""),
    ciphertext: text().notNull(),
    hint: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // NULLS NOT DISTINCT so shared credentials (user_id null) are unique per name too. The index
  // also serves lookups by organization.
  (t) => [unique().on(t.organizationId, t.userId, t.name).nullsNotDistinct()],
);
