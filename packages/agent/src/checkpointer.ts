import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

/** Agent checkpoints live in their own Postgres schema, next to the app tables. */
export const AGENT_SCHEMA = "agent";

/** Creates the Postgres checkpointer and its tables (idempotent). */
export async function createCheckpointer(databaseUrl: string): Promise<PostgresSaver> {
  const saver = PostgresSaver.fromConnString(databaseUrl, { schema: AGENT_SCHEMA });
  await saver.setup();
  return saver;
}
