import { Module } from "@nestjs/common";
import { CodingAgentsController } from "./coding-agents.controller";
import { CodingAgentsService } from "./coding-agents.service";

@Module({
  controllers: [CodingAgentsController],
  providers: [CodingAgentsService],
  exports: [CodingAgentsService],
})
export class CodingAgentsModule {}
