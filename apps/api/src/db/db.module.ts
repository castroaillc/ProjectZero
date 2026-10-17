import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { createDb, type Db } from "@projectzero/db";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

export const DB = Symbol("DB");

/** Provides one shared Drizzle client under the `DB` token and closes it on shutdown. */
@Global()
@Module({
  providers: [{ provide: DB, inject: [ENV], useFactory: (env: Env) => createDb(env.DATABASE_URL) }],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onApplicationShutdown() {
    await this.db.$client.end({ timeout: 5 });
  }
}
