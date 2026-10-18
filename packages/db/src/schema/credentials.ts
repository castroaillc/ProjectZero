import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Secrets agents use (API keys, tokens), one set per user. `ciphertext` is AES-256-GCM sealed by
 * the API; the plaintext never touches the database. `hint` is the last few characters, shown
 * so users can tell credentials apart.
 */
export const credentials = pgTable(
  "credentials",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
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
  // The unique (user_id, name) index also serves lookups by user.
  (t) => [unique().on(t.userId, t.name)],
);
