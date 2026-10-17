// Applies pending migrations. Uses the drizzle-orm migrator rather than `drizzle-kit migrate`,
// which swallows connection and SQL errors.
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, loadRootEnv } from "../src/index";

loadRootEnv();
const db = createDb(process.env.DATABASE_URL!, { max: 1 });
try {
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  console.log("Migrations applied");
} finally {
  await db.$client.end();
}
