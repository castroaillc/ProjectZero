// Seeds a demo user (no password; sign-in comes from Better Auth) and a few todos. Idempotent.
import { eq } from "drizzle-orm";
import { createDb, loadRootEnv, todos, user } from "../src/index";

loadRootEnv();
const db = createDb(process.env.DATABASE_URL!, { max: 1 });

const demoId = "seed-demo-user";
await db
  .insert(user)
  .values({ id: demoId, name: "Demo User", email: "demo@projectzero.dev", emailVerified: true })
  .onConflictDoNothing();

const existing = await db.select({ id: todos.id }).from(todos).where(eq(todos.userId, demoId));
if (existing.length === 0) {
  await db.insert(todos).values([
    { userId: demoId, title: "Try the web app" },
    { userId: demoId, title: "Open the desktop app" },
    { userId: demoId, title: "Install the mobile app", completed: true },
  ]);
}

console.log(`Seeded ${demoId} with ${existing.length || 3} todos`);
await db.$client.end();
