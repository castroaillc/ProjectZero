import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };
export * from "./schema";
export { loadRootEnv } from "./env";

/** Creates a Drizzle client for the given Postgres connection string. */
export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { max: options.max ?? 10 });
  return drizzle(client, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;
export type TodoRow = typeof schema.todos.$inferSelect;
export type NewTodoRow = typeof schema.todos.$inferInsert;
