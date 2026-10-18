// Config for `@better-auth/cli generate`: builds the auth instance with dummy credentials so the
// CLI can read the plugin set. Nothing connects to a database.
import { createDb } from "@projectzero/db";
import { createAuth } from "../src/index";

export const auth = createAuth({
  db: createDb("postgres://localhost/unused"),
  secret: "cli-only-secret-not-used-at-runtime",
  baseURL: "http://localhost",
  trustedOrigins: [],
});
