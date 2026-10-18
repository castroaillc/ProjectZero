import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { createAuth } from "@projectzero/auth";
import type { Db } from "@projectzero/db";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";
import { AgentModule } from "./agent/agent.module";
import { ConfigModule, ENV } from "./config/config.module";
import { trustedOrigins, type Env } from "./config/env";
import { DB, DbModule } from "./db/db.module";
import { HealthModule } from "./health/health.module";
import { TodosModule } from "./todos/todos.module";

@Module({
  imports: [
    ConfigModule,
    DbModule,
    // Mounts Better Auth at /api/auth/* and registers a global guard: every route requires a
    // session unless marked @AllowAnonymous().
    AuthModule.forRootAsync({
      inject: [ENV, DB],
      useFactory: (env: Env, db: Db) => ({
        auth: createAuth({
          db,
          secret: env.BETTER_AUTH_SECRET,
          baseURL: env.BETTER_AUTH_URL,
          trustedOrigins: trustedOrigins(env),
        }),
      }),
    }),
    HealthModule,
    TodosModule,
    AgentModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
  ],
})
export class AppModule {}
