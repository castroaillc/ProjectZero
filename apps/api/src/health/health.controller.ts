import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthCheck, HealthCheckService, HealthIndicatorService } from "@nestjs/terminus";
import type { Db } from "@projectzero/db";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { sql } from "drizzle-orm";
import { DB } from "../db/db.module";

@ApiTags("health")
@AllowAnonymous()
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    @Inject(DB) private readonly db: Db,
  ) {}

  @ApiOperation({
    operationId: "checkHealth",
    summary: "Report whether the API is up and can reach the database.",
  })
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => {
        const db = this.indicator.check("database");
        try {
          await this.db.execute(sql`select 1`);
          return db.up();
        } catch (err) {
          return db.down({ message: err instanceof Error ? err.message : String(err) });
        }
      },
    ]);
  }
}
