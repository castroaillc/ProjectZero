import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * Agent conversations and who owns them. Message history lives in LangGraph's checkpoint
 * tables (Postgres schema "agent", keyed by thread_id = id); this table is the ownership check.
 */
export const agentThreads = pgTable(
  "agent_threads",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
);
